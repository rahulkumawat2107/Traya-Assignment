import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type { RootStackScreenProps } from '@/app/navigation/types';
import { Screen } from '@/shared/components/Screen';
import { MeasurementForm } from './components/MeasurementForm';

export function MeasurementFormScreen({
  navigation,
  route,
}: RootStackScreenProps<'MeasurementForm'>) {
  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <MeasurementForm
            measurementId={route.params?.measurementId}
            onDone={navigation.goBack}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
