import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InventoryProvider } from '../state';

export default function Layout() {
  return <SafeAreaProvider><InventoryProvider><Stack screenOptions={{ headerShown: false }} /></InventoryProvider></SafeAreaProvider>;
}
