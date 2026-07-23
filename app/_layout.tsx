import { useEffect, useState, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, Image, Animated } from 'react-native';
import { colors, fonts } from '../src/theme';
import { useAuthStore } from '../src/stores';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Initialize the auth listener at the root so it persists across all route
  // changes (otherwise unmounting `/index.tsx` after the initial redirect
  // would leave no active onAuthStateChanged subscription).
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().initialize();
    return unsubscribe;
  }, []);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          'PlayfairDisplay-Regular': require('../assets/fonts/PlayfairDisplay-Regular.ttf'),
          'PlayfairDisplay-Bold': require('../assets/fonts/PlayfairDisplay-Bold.ttf'),
          'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
          'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
          'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
        });
      } catch (e) {
        console.warn('Font loading error:', e);
      } finally {
        setFontsLoaded(true);
      }
    }
    loadFonts();

    // Safety timeout — never stay on blank screen for more than 8s
    const timeout = setTimeout(() => {
      setFontsLoaded(true);
    }, 8000);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      // Show custom splash for 4 seconds, then fade out
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }).start(() => setSplashDone(true));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [fontsLoaded]);

  if (!fontsLoaded || !splashDone) {
    return (
      <View style={styles.splashScreen}>
        <Animated.View style={[styles.splashContent, { opacity: fadeAnim }]}>
          <Image
            source={require('../assets/images/mermaid.png')}
            style={styles.splashMermaid}
            resizeMode="contain"
          />
          <Text style={styles.splashTagline}>Share your favorite places</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background.primary },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen
          name="modal/profile"
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/add-place"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/place-detail"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/filter-map"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="modal/featured-person"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/admin-approvals"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/featured-picks"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/edit-place"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/user-profile"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/list-detail"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/create-list"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/conversation"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modal/settings"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  splashScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
  splashContent: {
    alignItems: 'center',
  },
  splashMermaid: {
    width: 180,
    height: 200,
    marginBottom: 24,
  },
  splashTagline: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: colors.gold.muted,
    letterSpacing: 2,
    textTransform: 'lowercase',
  },
});
