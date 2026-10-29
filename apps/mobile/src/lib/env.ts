// Where the app is running. Expo Go (the test app) can't take cards or run GPS in the background.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const canTapToPay = Platform.OS !== 'web' && !inExpoGo;
