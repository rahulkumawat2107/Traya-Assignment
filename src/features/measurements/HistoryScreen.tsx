import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '@/app/providers/ServicesProvider';
import { errorMessage } from '@/domain/errors';
import { formatMetricValue, sourceLabel } from '@/domain/measurement/format';
import { isManual, type Measurement } from '@/domain/measurement/types';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/StateViews';
import { colors, spacing } from '@/shared/theme';
import {
  MEASUREMENT_ROW_HEIGHT,
  MeasurementRow,
} from './components/MeasurementRow';
import { useMeasurementHistory } from './hooks/useMeasurementHistory';
import { useMeasurementMutations } from './hooks/useMeasurementMutations';

const keyExtractor = (item: Measurement) => item.id;

const getItemLayout = (_data: unknown, index: number) => ({
  length: MEASUREMENT_ROW_HEIGHT,
  offset: MEASUREMENT_ROW_HEIGHT * index,
  index,
});

export function HistoryScreen() {
  const navigation = useNavigation();
  const { engine } = useServices();
  const history = useMeasurementHistory('weight');
  const { remove } = useMeasurementMutations();
  const [refreshing, setRefreshing] = useState(false);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const removeMeasurement = remove.mutate;

  const openForm = useCallback(
    (measurementId?: string) =>
      navigation.navigate('MeasurementForm', { measurementId }),
    [navigation],
  );

  // Stable identity, so memoised rows are not re-rendered by this screen.
  const onPressRow = useCallback(
    (item: Measurement) => {
      if (isManual(item.source)) {
        openForm(item.id);
        return;
      }
      // Imported readings belong to the provider: removable, not editable.
      Alert.alert(
        formatMetricValue(item.metric, item.value),
        `${sourceLabel(item.source)}. Imported readings cannot be edited.`,
        [
          { text: 'Close', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => removeMeasurement(item.id),
          },
        ],
      );
    },
    [openForm, removeMeasurement],
  );

  const renderItem = useCallback(
    ({ item }: { item: Measurement }) => (
      <MeasurementRow item={item} onPress={onPressRow} />
    ),
    [onPressRow],
  );

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await engine.run({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [engine]);

  let body: React.ReactNode;
  if (history.isPending) {
    body = <LoadingState label="Loading your history…" />;
  } else if (history.isError) {
    body = (
      <ErrorState
        title="Could not load your history"
        message={errorMessage(history.error)}
        onRetry={() => history.refetch()}
      />
    );
  } else if (history.items.length === 0) {
    body = (
      <EmptyState
        testID="history-empty"
        title="No weight recorded yet"
        message="Add your first measurement, or import readings from a connected source."
        actionLabel="Add weight"
        onAction={() => openForm()}
        secondaryLabel="Connect a source"
        onSecondary={() =>
          navigation.navigate('Tabs', { screen: 'Integrations' })
        }
      />
    );
  } else {
    body = (
      <>
        <FlatList
          testID="history-list"
          data={history.items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={styles.footer} color={colors.primary} />
            ) : undefined
          }
        />
        <View style={styles.addBar}>
          <Button
            testID="add-weight"
            label="Add weight"
            onPress={() => openForm()}
          />
        </View>
      </>
    );
  }

  return <Screen>{body}</Screen>;
}

const styles = StyleSheet.create({
  footer: { paddingVertical: spacing.lg },
  addBar: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
