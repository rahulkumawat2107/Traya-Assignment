import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { colors, radius, spacing, typography } from '@/shared/theme';
import { formatDate } from '@/shared/utils/dates';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  maximumDate?: Date;
  testID?: string;
}

/** Keeps the time of day when only the calendar date is changed. */
function withDateOf(original: Date, picked: Date): Date {
  const next = new Date(original);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return next;
}

/** Date input. iOS shows the compact inline picker; Android opens a dialog. */
export function DateField({ value, onChange, maximumDate, testID }: Props) {
  if (Platform.OS === 'ios') {
    return (
      <View style={styles.iosRow} testID={testID}>
        <DateTimePicker
          value={value}
          mode="date"
          display="compact"
          maximumDate={maximumDate}
          onValueChange={(_event, picked) =>
            onChange(withDateOf(value, picked))
          }
        />
      </View>
    );
  }

  const open = () => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      maximumDate,
      onValueChange: (_event, picked) => onChange(withDateOf(value, picked)),
    });
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Date, ${formatDate(value.getTime())}`}
      onPress={open}
      style={styles.androidField}
    >
      <Text style={styles.androidText}>{formatDate(value.getTime())}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iosRow: { alignItems: 'flex-start' },
  androidField: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  androidText: { ...typography.body, color: colors.text },
});
