import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View, Platform, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { colors, fonts } from '../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useAdminNotificationStore, useMessagingStore, useFriendsStore } from '../../src/stores';
import { registerForPushNotifications, savePushToken } from '../../src/services/notifications';
type TabIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  size: number;
  focused: boolean;
  badge?: number;
};

function TabIcon({ name, color, focused, badge }: TabIconProps) {
  return (
    <View style={styles.iconContainer}>
      <Ionicons name={name} size={20} color={color} />
      {badge != null && badge > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

// Fixed tab bar — evenly distributed
function FixedTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: Platform.OS === 'ios' ? insets.bottom : 8 }]}>
      <View style={styles.tabBarRow}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          if (options.href === null || !options.tabBarIcon) return null;

          const isFocused = state.index === index;
          const tintColor = isFocused ? colors.gold.primary : colors.text.tertiary;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable key={route.key} style={styles.tabItem} onPress={onPress}>
              {options.tabBarIcon?.({ focused: isFocused, color: tintColor, size: 20 })}
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {(options.title || route.name).toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin === true);
  const userId = useAuthStore((s) => s.user?.uid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  const unreadCount = useMessagingStore((s) => s.unreadCount);
  const requestCount = useFriendsStore((s) => s.requests.length);

  // Redirect to sign-in if user signs out while on tabs
  // Gate on isLoading so we don't redirect during the initial auth-resolution race
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/sign-in');
    }
  }, [isAuthenticated, isLoading]);

  // Subscribe to messages + friend requests in real-time for all users
  // Also register push notifications for all users
  useEffect(() => {
    if (!userId) return;

    const unsubMessages = useMessagingStore.getState().subscribeConversations(userId);
    const unsubFriends = useFriendsStore.getState().subscribeFriends(userId);

    // Register push notifications for all users (messages, friend requests)
    // Use a cancellation flag + uid recheck so a slow registration doesn't write
    // the token to a different user's doc if the user signed out / switched accounts
    // while the promise was in flight.
    let cancelled = false;
    registerForPushNotifications().then((token) => {
      if (cancelled || !token) return;
      const currentUid = useAuthStore.getState().user?.uid;
      if (currentUid === userId) {
        savePushToken(userId, token);
      }
    });

    return () => {
      cancelled = true;
      unsubMessages();
      unsubFriends();
    };
  }, [userId]);

  // Admin: start real-time badge listeners
  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = useAdminNotificationStore.getState().subscribe();

    return () => {
      unsubscribe();
      useAdminNotificationStore.getState().reset();
    };
  }, [isAdmin, userId]);

  // Handle notification taps → navigate to conversation or admin approvals
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.type === 'message' && data?.conversationId) {
          router.push(
            `/modal/conversation?conversationId=${data.conversationId}&recipientUid=${data.fromUid || ''}&recipientName=${encodeURIComponent((data.fromName as string) || '')}`,
          );
        } else if (data?.type === 'new_user' || data?.type === 'edit_suggestion') {
          router.push('/modal/admin-approvals');
        }
      },
    );

    return () => subscription.remove();
  }, [router]);

  return (
    <Tabs
      tabBar={(props) => <FixedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Cross-fade between tabs instead of a hard cut, and paint every
        // scene navy so switches never flash white.
        animation: 'fade',
        sceneStyle: { backgroundColor: colors.background.primary },
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
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'map' : 'map-outline'} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="guide"
        options={{
          title: 'Lists',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'list' : 'list-outline'} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-places"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          // The screen IS the Friends hub (friends, requests, messages) —
          // labeling it "Profile" sent people to the wrong place. Profile
          // itself is reachable from the header avatar on that screen.
          title: 'Friends',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'people' : 'people-outline'} color={color} size={size} focused={focused} badge={unreadCount + requestCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: colors.ui.tabBarBg,
    borderTopColor: colors.ui.border,
    borderTopWidth: 0.3,
    paddingTop: 6,
  },
  tabBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.text.tertiary,
    marginTop: 3,
  },
  tabLabelActive: {
    color: colors.gold.primary,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 26,
  },
  activeIndicator: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.gold.primary,
    marginTop: 2,
  },
  tabBadge: {
    position: 'absolute',
    top: -2,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 9,
    color: colors.background.primary,
  },
});
