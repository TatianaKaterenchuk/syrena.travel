import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { useAuthStore } from '../../src/stores';
import { confirmAndDeleteAccount } from '../../src/utils/accountDeletion';

/**
 * Dedicated Settings screen. Exists largely so that ACCOUNT DELETION is
 * exactly where an App Store reviewer expects it (Guideline 5.1.1(v)) —
 * behind a gear icon, in an Account section, one scroll away at most.
 */
export default function SettingsModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            if (router.canGoBack()) router.back();
            setTimeout(() => router.replace('/(auth)/sign-in'), 100);
          } catch {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    confirmAndDeleteAccount(() => {
      if (router.canGoBack()) router.back();
      setTimeout(() => router.replace('/(auth)/sign-in'), 100);
    });
  };

  const Row = ({
    icon,
    label,
    onPress,
    destructive,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    destructive?: boolean;
  }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={19}
        color={destructive ? colors.ui.error : colors.gold.primary}
      />
      <Text style={[styles.rowLabel, destructive && { color: colors.ui.error }]}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={15} color={colors.text.tertiary} />
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel="Close settings"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {profile?.displayName ? (
          <Text style={styles.signedInAs}>
            Signed in as {profile.displayName}
          </Text>
        ) : null}

        <Text style={styles.sectionLabel}>PROFILE</Text>
        <View style={styles.group}>
          <Row
            icon="person-circle-outline"
            label="Edit Profile"
            onPress={() => {
              router.back();
              setTimeout(() => router.push('/modal/profile'), 250);
            }}
          />
        </View>

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.group}>
          <Row
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://syrena-travel.web.app/')}
          />
        </View>

        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.group}>
          <Row icon="log-out-outline" label="Sign Out" onPress={handleSignOut} />
          <View style={styles.divider} />
          <Row
            icon="trash-outline"
            label="Delete Account"
            onPress={handleDeleteAccount}
            destructive
          />
        </View>
        <Text style={styles.deleteHint}>
          Deleting your account permanently removes your profile, saved places,
          friendships, and messages. This cannot be undone.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    color: colors.text.primary,
  },
  signedInAs: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.gold.muted,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  group: {
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ui.border,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 15,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.sans.medium,
    fontSize: 15,
    color: colors.text.primary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.ui.border,
  },
  deleteHint: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
