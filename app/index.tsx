import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../src/stores';
import { colors } from '../src/theme';

export default function Index() {
  // Auth subscription is initialized once in `app/_layout.tsx` so it survives
  // route changes — this screen only needs to read the current state.
  const { isAuthenticated, isApproved, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.gold.primary} />
      </View>
    );
  }

  if (isAuthenticated && isApproved) {
    return <Redirect href="/(tabs)" />;
  }

  if (isAuthenticated && !isApproved) {
    return <Redirect href="/(auth)/pending-approval" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
});
