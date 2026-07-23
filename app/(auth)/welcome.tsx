import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius } from '../../src/theme';

/**
 * Shown BEFORE the sign-up sheet: explains what Syrena Voyager is so new
 * members know what they're joining before they're asked for an email.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable
        style={styles.backButton}
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityLabel="Back to sign in"
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
      </Pressable>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          <Image
            source={require('../../assets/images/mermaid.png')}
            style={styles.mermaid}
            contentFit="contain"
          />
          <Text style={styles.brand}>SYRENA VOYAGER</Text>
          <Text style={styles.tagline}>The best of the best</Text>

          <View style={styles.divider} />

          <Text style={styles.heading}>Why this app?</Text>
          <Text style={styles.body}>
            Every time you land somewhere new, you spend hours hunting for the
            best places to stay, eat, and explore. Reviews are hit or miss. The
            best recommendations always come from friends — people with taste,
            curiosity, and a spirit of adventure.{'\n\n'}
            Syrena Voyager gathers those coveted recommendations in one place.
            Some are simply the best option for miles around. Most are places
            you can't wait to rave about to friends.
          </Text>

          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <Ionicons name="star" size={14} color={colors.gold.primary} />
              <Text style={styles.bulletText}>
                Curated picks from people you trust — no ads, no algorithms
              </Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="map" size={14} color={colors.gold.primary} />
              <Text style={styles.bulletText}>
                Restaurants, bars, hotels & hidden gems, city by city
              </Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="lock-closed" size={14} color={colors.gold.primary} />
              <Text style={styles.bulletText}>
                Invite-only — a trusted community sharing hidden gems
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Pressable
            style={styles.ctaButton}
            onPress={() => router.push('/(auth)/sign-up')}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>GET STARTED</Text>
          </Pressable>

          <Pressable
            style={styles.secondary}
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>
              Already have an account? <Text style={styles.secondaryLink}>Sign In</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: spacing.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  content: { flex: 1 },
  scroll: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: 48,
  },
  mermaid: {
    width: 110,
    height: 120,
    marginBottom: spacing.md,
  },
  brand: {
    fontFamily: fonts.serif.bold,
    fontSize: 24,
    letterSpacing: 6,
    color: colors.gold.primary,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.gold.muted,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  divider: {
    width: 60,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.gold.muted,
    marginVertical: spacing.xl,
  },
  heading: {
    fontFamily: fonts.serif.bold,
    fontSize: 19,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  bullets: {
    marginTop: spacing.xl,
    gap: spacing.md,
    alignSelf: 'stretch',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  ctaButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.gold.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    letterSpacing: 2,
    color: colors.background.primary,
  },
  secondary: {
    marginTop: spacing.lg,
    paddingVertical: 8,
  },
  secondaryText: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.tertiary,
  },
  secondaryLink: {
    color: colors.gold.primary,
    fontFamily: fonts.sans.medium,
  },
});
