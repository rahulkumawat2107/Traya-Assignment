import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { queryKeys } from '@/app/queryClient';
import { errorMessage } from '@/domain/errors';
import { Button } from '@/shared/components/Button';
import { DateField } from '@/shared/components/DateField';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/StateViews';
import { colors, radius, spacing, typography } from '@/shared/theme';
import { useMeasurementMutations } from '../hooks/useMeasurementMutations';
import { validateMeasurementInput, type FieldErrors } from '../validation';

interface Props {
  /** Omit to add a new weight. */
  measurementId?: string;
  onDone: () => void;
}

/**
 * Add / edit form. State is plain `useState` local to this component, so
 * typing re-renders only the form.
 */
export function MeasurementForm({ measurementId, onDone }: Props) {
  const { measurements, clock } = useServices();
  const { add, edit, remove } = useMeasurementMutations();
  const isEdit = measurementId !== undefined;

  const existing = useQuery({
    queryKey: queryKeys.detail(measurementId ?? 'new'),
    queryFn: () => measurements.getById(measurementId!),
    enabled: isEdit,
  });

  const [valueText, setValueText] = useState('');
  const [date, setDate] = useState(() => new Date(clock.now()));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  // Fill the form once per record; later refetches must not overwrite typing.
  useEffect(() => {
    const record = existing.data;
    if (record && prefilledFor !== record.id) {
      setValueText(String(record.value));
      setDate(new Date(record.measuredAt));
      setPrefilledFor(record.id);
    }
  }, [existing.data, prefilledFor]);

  if (isEdit && existing.isPending) {
    return <LoadingState />;
  }
  if (isEdit && existing.isError) {
    return (
      <ErrorState
        message={errorMessage(existing.error)}
        onRetry={() => existing.refetch()}
      />
    );
  }
  if (isEdit && (!existing.data || existing.data.deletedAt !== null)) {
    return (
      <EmptyState
        title="This measurement no longer exists"
        message="It may have been deleted on another device."
        actionLabel="Go back"
        onAction={onDone}
      />
    );
  }

  const saving = add.isPending || edit.isPending;

  const submit = async () => {
    const result = validateMeasurementInput({ valueText, date }, clock.now());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaveError(null);
    try {
      if (isEdit) {
        await edit.mutateAsync({
          id: measurementId,
          value: result.value,
          measuredAt: result.measuredAt,
        });
      } else {
        await add.mutateAsync({
          value: result.value,
          measuredAt: result.measuredAt,
        });
      }
      onDone();
    } catch (error) {
      setSaveError(errorMessage(error));
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete this measurement?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(measurementId!);
            onDone();
          } catch (error) {
            setSaveError(errorMessage(error));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Weight (kg)</Text>
      <TextInput
        testID="weight-input"
        accessibilityLabel="Weight in kilograms"
        value={valueText}
        onChangeText={text => {
          setValueText(text);
          if (errors.value) {
            setErrors(current => ({ ...current, value: undefined }));
          }
        }}
        keyboardType="decimal-pad"
        placeholder="72.5"
        placeholderTextColor={colors.muted}
        autoFocus={!isEdit}
        returnKeyType="done"
        style={[styles.input, errors.value ? styles.inputError : null]}
      />
      {errors.value ? (
        <Text style={styles.error} testID="weight-error">
          {errors.value}
        </Text>
      ) : null}

      <Text style={[styles.label, styles.spaced]}>Date</Text>
      <DateField
        testID="date-field"
        value={date}
        maximumDate={new Date(clock.now())}
        onChange={picked => {
          setDate(picked);
          setErrors(current => ({ ...current, date: undefined }));
        }}
      />
      {errors.date ? (
        <Text style={styles.error} testID="date-error">
          {errors.date}
        </Text>
      ) : null}

      {saveError ? (
        <Text style={[styles.error, styles.spaced]} testID="save-error">
          Could not save: {saveError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          testID="save-button"
          label={isEdit ? 'Save changes' : 'Add weight'}
          onPress={submit}
          loading={saving}
        />
        {isEdit ? (
          <Button
            testID="delete-button"
            label="Delete"
            variant="danger"
            onPress={confirmDelete}
            loading={remove.isPending}
            disabled={saving}
          />
        ) : null}
      </View>
      <Text style={styles.hint}>
        Saved on this device straight away and synced when a connection is
        available.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: spacing.lg },
  label: { ...typography.caption, fontWeight: '600', color: colors.muted },
  spaced: { marginTop: spacing.lg },
  input: {
    ...typography.title,
    color: colors.text,
    marginTop: spacing.xs,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  inputError: { borderColor: colors.danger },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  actions: { marginTop: spacing.xl, gap: spacing.md },
  hint: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
