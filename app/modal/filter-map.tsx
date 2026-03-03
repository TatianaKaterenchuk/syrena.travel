import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { PlaceCategory, BudgetTier, BUDGET_LABELS, BUDGET_ICONS } from '../../src/types';
import { CATEGORIES } from '../../src/constants/categories';
import { useMapStore, useFriendsStore } from '../../src/stores';

const ALL_BUDGET_TIERS: BudgetTier[] = [1, 2, 3, 4];

export default function FilterMapModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    activeFilters, toggleFilter, setAllFilters, clearFilters,
    activeBudgetFilters, toggleBudgetFilter, setAllBudgetFilters, clearBudgetFilters,
    selectedFriendId, setFriendFilter, clearFriendFilter,
  } = useMapStore();
  const { friends } = useFriendsStore();

  // Local draft so changes only commit on "Apply"
  const [draft, setDraft] = useState<Set<PlaceCategory>>(
    new Set(activeFilters),
  );
  const [budgetDraft, setBudgetDraft] = useState<Set<BudgetTier>>(
    new Set(activeBudgetFilters),
  );
  const [friendDraft, setFriendDraft] = useState<string | null>(selectedFriendId);

  const toggle = (key: PlaceCategory) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleBudget = (tier: BudgetTier) => {
    setBudgetDraft((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) {
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  };

  const selectAll = () => {
    setDraft(new Set(CATEGORIES.map((c) => c.key)));
    setBudgetDraft(new Set(ALL_BUDGET_TIERS));
    setFriendDraft(null);
  };

  const clearAll = () => {
    setDraft(new Set());
    setBudgetDraft(new Set());
    setFriendDraft(null);
  };

  const allSelected = draft.size === CATEGORIES.length && budgetDraft.size === ALL_BUDGET_TIERS.length && !friendDraft;
  const noneSelected = draft.size === 0;

  const handleApply = () => {
    // Sync category draft into the Zustand store
    if (draft.size === CATEGORIES.length) {
      setAllFilters();
    } else if (draft.size === 0) {
      clearFilters();
    } else {
      const current = new Set(activeFilters);
      for (const cat of CATEGORIES.map((c) => c.key)) {
        const inDraft = draft.has(cat);
        const inCurrent = current.has(cat);
        if (inDraft !== inCurrent) {
          toggleFilter(cat);
        }
      }
    }

    // Sync budget draft into the Zustand store
    if (budgetDraft.size === ALL_BUDGET_TIERS.length) {
      setAllBudgetFilters();
    } else if (budgetDraft.size === 0) {
      clearBudgetFilters();
    } else {
      const current = new Set(activeBudgetFilters);
      for (const tier of ALL_BUDGET_TIERS) {
        const inDraft = budgetDraft.has(tier);
        const inCurrent = current.has(tier);
        if (inDraft !== inCurrent) {
          toggleBudgetFilter(tier);
        }
      }
    }

    // Sync friend filter
    if (friendDraft) {
      setFriendFilter(friendDraft);
    } else {
      clearFriendFilter();
    }

    router.back();
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        {/* Drag Handle */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons
              name="options-outline"
              size={20}
              color={colors.gold.primary}
            />
            <Text style={styles.title}>Filter Places</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={selectAll}
              style={[
                styles.headerPill,
                allSelected && styles.headerPillActive,
              ]}
            >
              <Text
                style={[
                  styles.headerPillText,
                  allSelected && styles.headerPillTextActive,
                ]}
              >
                Show All
              </Text>
            </Pressable>
            <Pressable
              onPress={clearAll}
              style={[
                styles.headerPill,
                noneSelected && styles.headerPillActive,
              ]}
            >
              <Text
                style={[
                  styles.headerPillText,
                  noneSelected && styles.headerPillTextActive,
                ]}
              >
                Clear
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {draft.size === CATEGORIES.length
              ? 'Showing all categories'
              : draft.size === 0
                ? 'No categories selected'
                : `${draft.size} of ${CATEGORIES.length} selected`}
          </Text>

          {/* Filter Chips — 2-column grid */}
          <View style={styles.chipGrid}>
            {CATEGORIES.map((cat) => {
              const isActive = draft.has(cat.key);
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => toggle(cat.key)}
                  style={[
                    styles.chip,
                    isActive && {
                      backgroundColor: cat.color + '18',
                      borderColor: cat.color + '55',
                    },
                  ]}
                >
                  {/* Emoji circle */}
                  <View
                    style={[
                      styles.chipEmojiContainer,
                      isActive
                        ? { backgroundColor: cat.color + '25' }
                        : { backgroundColor: colors.background.tertiary },
                    ]}
                  >
                    <Text style={styles.chipEmoji}>{cat.emoji}</Text>
                  </View>

                  {/* Label */}
                  <Text
                    style={[
                      styles.chipLabel,
                      isActive && { color: colors.text.primary },
                    ]}
                    numberOfLines={1}
                  >
                    {cat.label}
                  </Text>

                  {/* Checkmark */}
                  <View style={styles.chipCheckArea}>
                    {isActive ? (
                      <View
                        style={[
                          styles.checkCircle,
                          { backgroundColor: cat.color },
                        ]}
                      >
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={styles.uncheckCircle} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Budget Section */}
          <View style={styles.budgetSection}>
            <View style={styles.budgetHeader}>
              <Ionicons name="wallet-outline" size={16} color={colors.gold.primary} />
              <Text style={styles.budgetTitle}>Budget</Text>
            </View>
            <Text style={styles.subtitle}>
              {budgetDraft.size === ALL_BUDGET_TIERS.length
                ? 'All budget levels'
                : budgetDraft.size === 0
                  ? 'No budget filter'
                  : `${budgetDraft.size} of ${ALL_BUDGET_TIERS.length} selected`}
            </Text>
            <View style={styles.budgetRow}>
              {ALL_BUDGET_TIERS.map((tier) => {
                const isActive = budgetDraft.has(tier);
                return (
                  <Pressable
                    key={tier}
                    onPress={() => toggleBudget(tier)}
                    style={[
                      styles.budgetChip,
                      isActive && styles.budgetChipActive,
                    ]}
                  >
                    <Text style={[styles.budgetIcon, isActive && styles.budgetIconActive]}>
                      {BUDGET_ICONS[tier]}
                    </Text>
                    <Text style={[styles.budgetLabel, isActive && styles.budgetLabelActive]}>
                      {BUDGET_LABELS[tier]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Friend Filter Section */}
          {friends.length > 0 && (
            <View style={styles.friendSection}>
              <View style={styles.budgetHeader}>
                <Ionicons name="people-outline" size={16} color={colors.gold.primary} />
                <Text style={styles.budgetTitle}>By Friend</Text>
              </View>
              <Text style={styles.subtitle}>
                {friendDraft
                  ? `Showing ${friends.find((f) => f.uid === friendDraft)?.displayName || 'friend'}'s picks`
                  : 'Show all — or tap a friend to filter'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.friendScroll}>
                {friends.map((friend) => {
                  const isActive = friendDraft === friend.uid;
                  return (
                    <Pressable
                      key={friend.uid}
                      onPress={() => setFriendDraft(isActive ? null : friend.uid)}
                      style={[
                        styles.friendChip,
                        isActive && styles.friendChipActive,
                      ]}
                    >
                      {friend.photoURL ? (
                        <Image source={{ uri: friend.photoURL }} style={styles.friendChipAvatar} />
                      ) : (
                        <View style={[styles.friendChipAvatar, styles.friendChipAvatarFallback]}>
                          <Ionicons name="person" size={14} color={colors.text.tertiary} />
                        </View>
                      )}
                      <Text
                        style={[
                          styles.friendChipName,
                          isActive && styles.friendChipNameActive,
                        ]}
                        numberOfLines={1}
                      >
                        {friend.displayName?.split(' ')[0] || 'Friend'}
                      </Text>
                      {isActive && (
                        <Ionicons name="checkmark-circle" size={14} color={colors.gold.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </ScrollView>

        {/* Apply Button */}
        <Pressable
          style={[
            styles.applyButton,
            noneSelected && styles.applyButtonDisabled,
          ]}
          onPress={handleApply}
        >
          <Ionicons
            name="map-outline"
            size={18}
            color={
              noneSelected
                ? colors.text.tertiary
                : colors.background.primary
            }
            style={{ marginRight: spacing.sm }}
          />
          <Text
            style={[
              styles.applyText,
              noneSelected && styles.applyTextDisabled,
            ]}
          >
            {noneSelected
              ? 'Select at least one category'
              : draft.size === CATEGORIES.length
                ? 'Show All Places'
                : `Show ${draft.size} ${draft.size === 1 ? 'Category' : 'Categories'}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.gold.primary + '20',
    ...shadows.lg,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  handle: {
    width: 32,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.gold.muted + '50',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.ui.border,
    backgroundColor: 'transparent',
  },
  headerPillActive: {
    borderColor: colors.gold.primary + '50',
    backgroundColor: colors.gold.primary + '12',
  },
  headerPillText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  headerPillTextActive: {
    color: colors.gold.primary,
  },

  /* Subtitle */
  subtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  /* Chip Grid */
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48.5%' as any,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1,
    borderColor: colors.ui.border,
    gap: spacing.sm,
  },
  chipEmojiContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipEmoji: {
    fontSize: 16,
  },
  chipLabel: {
    flex: 1,
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.secondary,
    letterSpacing: 0.3,
  },
  chipCheckArea: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uncheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.ui.border,
  },

  /* Budget */
  budgetSection: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  budgetTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  budgetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  budgetChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1,
    borderColor: colors.ui.border,
    gap: 4,
  },
  budgetChipActive: {
    backgroundColor: colors.gold.primary + '18',
    borderColor: colors.gold.primary + '55',
  },
  budgetIcon: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.text.tertiary,
    letterSpacing: 1,
  },
  budgetIconActive: {
    color: colors.gold.primary,
  },
  budgetLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },
  budgetLabelActive: {
    color: colors.gold.primary,
  },

  /* Friend Filter */
  friendSection: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  friendScroll: {
    flexDirection: 'row',
  },
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1,
    borderColor: colors.ui.border,
    marginRight: spacing.sm,
    gap: spacing.xs,
  },
  friendChipActive: {
    backgroundColor: colors.gold.primary + '18',
    borderColor: colors.gold.primary + '55',
  },
  friendChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  friendChipAvatarFallback: {
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendChipName: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.secondary,
    maxWidth: 80,
  },
  friendChipNameActive: {
    color: colors.gold.primary,
  },

  /* Apply Button */
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.gold.primary,
  },
  applyButtonDisabled: {
    backgroundColor: colors.background.tertiary,
  },
  applyText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.background.primary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  applyTextDisabled: {
    color: colors.text.tertiary,
  },
});
