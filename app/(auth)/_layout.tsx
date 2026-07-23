import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background.primary },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="pending-approval" />
    </Stack>
  );
}
