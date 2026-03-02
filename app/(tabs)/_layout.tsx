import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { colors, fonts } from '../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useAdminNotificationStore } from '../../src/stores';
import { registerForPushNotifications, savePushToken } from '../../src/services/notifications';

type TabIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  size: number;
  focused: boolean;
};

function TabIcon({ name, color, focused }: TabIconProps) {
  return (
    <View style={styles.iconContainer}>
      <Ionicons name={name} size={22} color={color} />
      {focused && <View style={styles.activeIndicator} />}
      {!focused && <View style={styles.indicatorSpacer} />}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin === true);
  const userId = useAuthStore((s) => s.user?.uid);

  // Admin: start real-time badge listeners + register push notifications
  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = useAdminNotificationStore.getState().subscribe();

    // Register for push notifications
    if (userId) {
      registerForPushNotifications().then((token) => {
        if (token) {
          savePushToken(userId, token);
        }
      });
    }

    return () => {
      unsubscribe();
      useAdminNotificationStore.getState().reset();
    };
  }, [isAdmin, userId]);

  // Admin: handle notification taps → navigate to admin approvals
  useEffect(() => {
    if (!isAdmin) return;

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.type === 'new_user' || data?.type === 'edit_suggestion') {
          router.push('/modal/admin-approvals');
        }
      },
    );

    return () => subscription.remove();
  }, [isAdmin, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarStyle: {
          backgroundColor: colors.ui.tabBarBg,
          borderTopColor: colors.ui.border,
          borderTopWidth: 0.3,
          height: 64 + (Platform.OS === 'ios' ? insets.bottom : 0),
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.sans.medium,
          fontSize: 9,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginTop: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'compass' : 'compass-outline'} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="guide"
        options={{
          title: 'Guide',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'book' : 'book-outline'} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-places"
        options={{
          title: 'My Places',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'heart' : 'heart-outline'} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'people' : 'people-outline'} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          href: null, // Hidden from tab bar — accessible programmatically
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          href: null, // Hidden from tab bar, navigated to programmatically
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
  },
  activeIndicator: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.gold.primary,
    marginTop: 4,
  },
  indicatorSpacer: {
    height: 2,
    marginTop: 4,
  },
});
