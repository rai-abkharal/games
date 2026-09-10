import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  /** The vertical game feed — the app's main and initial screen (MainActivity). */
  Feed: undefined;
  Settings: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
