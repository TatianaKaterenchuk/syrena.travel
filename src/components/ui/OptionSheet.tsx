import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius } from '../../theme';

export interface SheetOption {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Shows a gold check on the right (e.g. "already in this list"). */
  checked?: boolean;
  destructive?: boolean;
}

interface OptionSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: SheetOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

/**
 * Branded bottom sheet for picking one option — replaces the system
 * Alert.alert menus that undercut the app's Michelin-guide feel.
 */
export default function OptionSheet({
  visible,
  title,
  subtitle,
  options,
  onSelect,
  onClose,
}: OptionSheetProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(400);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 70,
        friction: 13,
      }).start();
    }
  }, [visible]);

  const handleSelect = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(key);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <ScrollView style={styles.list} bounces={false}>
            {options.map((opt) => (
              <Pressable
                key={opt.key}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => handleSelect(opt.key)}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                {opt.icon ? (
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={opt.destructive ? colors.ui.error : colors.gold.primary}
                  />
                ) : null}
                <Text
                  style={[styles.rowLabel, opt.destructive && { color: colors.ui.error }]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
                {opt.checked ? (
                  <Ionicons name="checkmark" size={18} color={colors.gold.primary} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: radius.xl ?? 22,
    borderTopRightRadius: radius.xl ?? 22,
    borderTopWidth: 1.5,
    borderColor: colors.gold.primary + '60',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gold.muted + '70',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.serif.bold,
    fontSize: 19,
    color: colors.text.primary,
  },
  subtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  list: {
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ui.border,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.sans.medium,
    fontSize: 15,
    color: colors.text.primary,
  },
  cancel: {
    marginTop: spacing.sm,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  cancelText: {
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    color: colors.text.secondary,
  },
});
