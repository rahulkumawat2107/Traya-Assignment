import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/shared/theme';
import { SyncBanner } from './SyncBanner';

/** Common screen frame: background plus the sync banner under the header. */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <SyncBanner />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
