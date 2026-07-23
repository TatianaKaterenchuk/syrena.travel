import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { useAuthStore } from '../../src/stores';

export default function PendingApprovalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const profile = useAuthStore((s) => s.profile);
  const isApproved = useAuthStore((s) => s.isApproved);
  const signOut = useAuthStore((s) => s.signOut);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const isRejected = profile?.status === 'rejected';
  const isBanned = profile?.status === 'banned';

  // Animations
  const floatAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0.4,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const floatTranslate = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  // Redirect to tabs if approved
  useEffect(() => {
    if (isApproved) {
      router.replace('/(tabs)');
    }
  }, [isApproved]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProfile();
      // The approved case redirects via the isApproved effect. If we're
      // still pending, say so — the button used to give zero feedback.
      if (!useAuthStore.getState().isApproved) {
        Alert.alert(
          'Still Under Review',
          "Your membership hasn't been approved yet. We'll notify you as soon as it is!",
        );
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      {/* Logo */}
      <Animated.View style={[styles.logoContainer, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.logoIcon, { transform: [{ translateY: floatTranslate }] }]}>
          <Image
            source={require('../../assets/images/mermaid.png')}
            style={styles.mermaidImage}
            contentFit="contain"
          />
        </Animated.View>

        <Text style={styles.brandText}>SYRENA</Text>
        <View style={styles.diamondDivider}>
          <Animated.View style={[styles.dividerLine, { opacity: shimmerAnim }]} />
          <Text style={styles.diamond}>✦</Text>
          <Animated.View style={[styles.dividerLine, { opacity: shimmerAnim }]} />
        </View>
        <Text style={styles.subtitle}>VOYAGER</Text>
      </Animated.View>

      {/* Status Card */}
      <Animated.View style={[styles.statusCard, { opacity: fadeAnim }]}>
        <View style={styles.statusBrassTop} />

        <View style={styles.statusContent}>
          <View style={styles.statusIconRing}>
            <Ionicons
              name={isBanned ? 'ban' : isRejected ? 'close-circle' : 'hourglass'}
              size={32}
              color={isBanned || isRejected ? colors.ui.error : colors.gold.primary}
            />
          </View>

          <Text style={styles.statusTitle}>
            {isBanned ? 'Account Banned' : isRejected ? 'Account Not Approved' : 'Account Under Review'}
          </Text>

          <Text style={styles.statusMessage}>
            {isBanned
              ? 'Your account has been banned. If you believe this is a mistake, please contact the community admin.'
              : isRejected
              ? 'Unfortunately, your account was not approved. Please contact the community admin for more information.'
              : 'Your account is being reviewed by our admin. You\'ll get access once approved.'}
          </Text>

          {profile?.displayName && (
            <Text style={styles.statusUser}>
              Signed in as {profile.displayName}
            </Text>
          )}
        </View>

        <View style={styles.statusBrassBottom} />
      </Animated.View>

      {/* Actions */}
      <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
        {!isRejected && !isBanned && (
          <Pressable
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <ActivityIndicator color={colors.background.primary} />
            ) : (
              <>
                <Ionicons name="refresh" size={16} color={colors.background.primary} />
                <Text style={styles.refreshButtonText}>CHECK STATUS</Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={16} color={colors.text.secondary} />
          <Text style={styles.signOutButtonText}>SIGN OUT</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing.xxl,
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoIcon: {
    width: 140,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  mermaidImage: {
    width: 140,
    height: 150,
  },
  brandText: {
    fontFamily: fonts.serif.bold,
    fontSize: 32,
    letterSpacing: 14,
    color: colors.gold.primary,
  },
  diamondDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: 8,
  },
  dividerLine: {
    width: 40,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.gold.muted,
  },
  diamond: {
    fontSize: 8,
    color: colors.gold.metallic,
  },
  subtitle: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    letterSpacing: 8,
    color: colors.gold.muted,
  },

  // Status Card
  statusCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ui.cardBg,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '30',
    marginBottom: spacing.xxl,
  },
  statusBrassTop: {
    height: 2,
    backgroundColor: colors.gold.primary,
    opacity: 0.6,
  },
  statusBrassBottom: {
    height: 1,
    backgroundColor: colors.gold.muted,
    opacity: 0.3,
  },
  statusContent: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  statusIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: colors.gold.muted + '40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statusTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    color: colors.text.primary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  statusMessage: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  statusUser: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.gold.metallic,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },

  // Actions
  actions: {
    gap: spacing.md,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold.primary,
    borderRadius: radius.sm,
    paddingVertical: 15,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gold.metallic,
  },
  refreshButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.background.primary,
    letterSpacing: 3,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingVertical: 14,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ui.border,
  },
  signOutButtonText: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.secondary,
    letterSpacing: 2,
  },
});
