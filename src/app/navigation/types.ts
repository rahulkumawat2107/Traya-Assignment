import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MetricType } from '@/domain/measurement/types';

export type TabParamList = {
  Dashboard: undefined;
  Debug: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** Every weight measurement: view, edit, delete. Opened from the weight screen. */
  History: undefined;
  /** No id: add a new measurement. With id: edit that one. */
  MeasurementForm: { measurementId?: string } | undefined;
  /** Chart and summary for one metric over 7 days / 30 days / 3 months. */
  MetricDetail: { metric: MetricType };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
