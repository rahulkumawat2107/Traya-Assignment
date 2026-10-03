import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { METRIC_LABEL } from '@/domain/measurement/format';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { MetricDetailScreen } from '@/features/dashboard/MetricDetailScreen';
import { IntegrationsScreen } from '@/features/integrations/IntegrationsScreen';
import { HistoryScreen } from '@/features/measurements/HistoryScreen';
import { MeasurementFormScreen } from '@/features/measurements/MeasurementFormScreen';
import { DebugScreen } from '@/features/settings/DebugScreen';
import { colors } from '@/shared/theme';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_GLYPH: Record<keyof TabParamList, string> = {
  Dashboard: '◉',
  History: '≡',
  Integrations: '⇄',
  Debug: '⚙',
};

function tabIcon(name: keyof TabParamList) {
  return ({ color }: { color: string }) => (
    <Text style={[styles.glyph, { color }]}>{TAB_GLYPH[name]}</Text>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Today', tabBarIcon: tabIcon('Dashboard') }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'Weight history',
          tabBarLabel: 'History',
          tabBarIcon: tabIcon('History'),
        }}
      />
      <Tab.Screen
        name="Integrations"
        component={IntegrationsScreen}
        options={{
          title: 'Health sources',
          tabBarLabel: 'Sources',
          tabBarIcon: tabIcon('Integrations'),
        }}
      />
      <Tab.Screen
        name="Debug"
        component={DebugScreen}
        options={{ title: 'Debug', tabBarIcon: tabIcon('Debug') }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Tabs"
          component={Tabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MeasurementForm"
          component={MeasurementFormScreen}
          options={({ route }) => ({
            title: route.params?.measurementId ? 'Edit weight' : 'Add weight',
            presentation: 'modal',
          })}
        />
        <Stack.Screen
          name="MetricDetail"
          component={MetricDetailScreen}
          options={({ route }) => ({
            title: METRIC_LABEL[route.params.metric],
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  glyph: { fontSize: 20 },
});
