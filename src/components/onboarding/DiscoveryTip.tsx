import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius, shadows } from '../../theme';

interface DiscoveryTipProps {
  /** Unique id — the tip shows once per install, keyed on this. */
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  /** Delay before sliding in, ms (lets the screen settle first). */
  delayMs?: number;
}

/**
 * A one-time bottom sheet that introduces a feature the first time the user
 * lands on a screen. Slides up, dismisses with "Got it", never shows again.
 */
export default function DiscoveryTip({ id, icon, title, text, delayMs = 900 }: DiscoveryTipProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(220)).current;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(`syrena_tip_${id}`).then((seen) => {
      if (seen || cancelled) return;
      setTimeout(() => {
        if (cancelled) return;
        setVisible(true);
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 12,
        }).start();
      }, delayMs);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    AsyncStorage.setItem(`syrena_tip_${id}`, 'true');
    Animated.timing(slideAnim, {
      toValue: 260,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.sheet,
        { bottom: insets.bottom + 84, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.iconRing}>
        <Ionicons name={icon} size={20} color={colors.gold.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>{text}</Text>
      </View>
      <Pressable style={styles.gotIt} onPress={dismiss} hitSlop={8} accessibilityRole="button">
        <Text style={styles.gotItText}>GOT IT</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold.primary + '50',
    padding: spacing.md,
    zIndex: 999,
    ...shadows.md,
  },
  iconRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.gold.primary + '60',
    justifyContent: 'center',
    alignItems: 'center',
  },
  copy: { flex: 1 },
  title: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.text.primary,
    marginBottom: 2,
  },
  text: {
    fontFamily: fonts.sans.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.text.secondary,
  },
  gotIt: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  gotItText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.gold.primary,
  },
});
