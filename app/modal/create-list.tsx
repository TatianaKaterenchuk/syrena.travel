import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { useListsStore } from '../../src/stores';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { createList } = useListsStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const canCreate = name.trim().length > 0;

  const handleCreate = useCallback(async () => {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    try {
      await createList(name.trim(), description.trim());
      router.back();
    } catch {
      setIsCreating(false);
    }
  }, [canCreate, isCreating, name, description, createList, router]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleCancel} style={styles.headerButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>

        <Text style={styles.headerTitle}>New List</Text>

        <Pressable
          onPress={handleCreate}
          style={[styles.headerButton, styles.headerButtonRight]}
          disabled={!canCreate || isCreating}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color={colors.gold.primary} />
          ) : (
            <Text
              style={[
                styles.createText,
                !canCreate && styles.createTextDisabled,
              ]}
            >
              Create
            </Text>
          )}
        </Pressable>
      </View>

      <View style={styles.headerRule} />

      {/* Form */}
      <View style={styles.form}>
        {/* Name input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Want to Visit, Best Brunch Spots"
            placeholderTextColor={colors.text.tertiary}
            value={name}
            onChangeText={setName}
            maxLength={50}
            autoFocus
            returnKeyType="next"
          />
        </View>

        {/* Description input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>DESCRIPTION (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Add a short description..."
            placeholderTextColor={colors.text.tertiary}
            value={description}
            onChangeText={setDescription}
            maxLength={200}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            returnKeyType="done"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },

  // ─── Header ───────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerButton: {
    minWidth: 60,
  },
  headerButtonRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  cancelText: {
    fontFamily: fonts.sans.medium,
    fontSize: 15,
    color: colors.text.secondary,
  },
  createText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 15,
    color: colors.gold.primary,
  },
  createTextDisabled: {
    color: colors.text.tertiary,
  },
  headerRule: {
    height: 1,
    backgroundColor: colors.ui.divider,
    marginHorizontal: spacing.xl,
  },

  // ─── Form ─────────────────────────────────────────────────────────
  form: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  inputGroup: {
    gap: spacing.sm,
  },
  label: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.muted,
    letterSpacing: 2,
  },
  input: {
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ui.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: spacing.md,
  },
});
