import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { PlaceCategory, BudgetTier, BUDGET_LABELS, BUDGET_ICONS, UserProfile } from '../../src/types';
import { CATEGORIES } from '../../src/constants/categories';
import { useMapStore, useFriendsStore, useAuthStore } from '../../src/stores';
import { FriendFilterMode } from '../../src/stores/useMapStore';
import { getDocuments } from '../../src/services/firebase/firestore';

const ALL_BUDGET_TIERS: BudgetTier[] = [1, 2, 3, 4];

export default function FilterMapModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    activeFilters, toggleFilter, setAllFilters, clearFilters,
    activeBudgetFilters, toggleBudgetFilter, setAllBudgetFilters, clearBudgetFilters,
    selectedFriendId, friendFilterMode, setFriendFilter, clearFriendFilter,
  } = useMapStore();
  const { friends, sentRequests } = useFriendsStore();
  const user = useAuthStore((s) => s.user);

  // Local draft so changes only commit on "Apply"
  const [draft, setDraft] = useState<Set<PlaceCategory>>(
    new Set(activeFilters),
  );
  const [budgetDraft, setBudgetDraft] = useState<Set<BudgetTier>>(
    new Set(activeBudgetFilters),
  );
  const [friendDraft, setFriendDraft] = useState<string | null>(selectedFriendId);
  const [modeDraft, setModeDraft] = useState<FriendFilterMode>(friendFilterMode);

  // Suggested friends (non-friends on the app)
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      setLoadingSuggestions(true);
      try {
        const allUsers = await getDocuments<UserProfile>('users', []);
        const friendUids = new Set(friends.map((f) => f.uid));
        const suggested = allUsers.filter(
          (u) =>
            (u.uid || (u as any).id) !== user.uid &&
            !friendUids.has(u.uid || (u as any).id) &&
            u.status === 'approved',
        );
        if (!cancelled) setSuggestedUsers(suggested);
      } catch (error) {
        console.error('Error fetching suggested users:', error);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid, friends.length]);

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
    setModeDraft('all');
  };

  const clearAll = () => {
    setDraft(new Set());
    setBudgetDraft(new Set());
    setFriendDraft(null);
    setModeDraft('all');
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
      setFriendFilter(friendDraft, modeDraft);
    } else {
      clearFriendFilter();
    }

    router.back();
  };

  const selectedFriendName = friendDraft
    ? friends.find((f) => f.uid === friendDraft)?.displayName
      || suggestedUsers.find((u) => (u.uid || (u as any).id) === friendDraft)?.displayName
      || 'friend'
    : null;

  // Friend search state
  const [friendSearch, setFriendSearch] = useState('');

  // Filter friends and suggested users by search text
  const filteredFriends = friendSearch
    ? friends.filter((f) =>
        f.displayName?.toLowerCase().includes(friendSearch.toLowerCase())
      )
    : friends;

  const filteredSuggestedUsers = friendSearch
    ? suggestedUsers.filter((u) =>
        u.displayName?.toLowerCase().includes(friendSearch.toLowerCase())
      )
    : suggestedUsers;

  // All people to show: friends first, then suggestions
  const allPeople = [
    ...friends.map((f) => ({ uid: f.uid, displayName: f.displayName, photoURL: f.photoURL, isFriend: true })),
    ...suggestedUsers.map((u) => ({
      uid: u.uid || (u as any).id,
      displayName: u.displayName,
      photoURL: u.photoURL,
      isFriend: false,
    })),
  ];

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl, maxHeight: '85%' }]}>
        {/* Drag Handle + Close */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
          <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.text.secondary} />
          </Pressable>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons
              name="options-outline"
              size={20}
              color={colors.gold.primary}
            />
            <Text style={styles.title}>Filter</Text>
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
                  {/* Icon circle */}
                  <View
                    style={[
                      styles.chipIconContainer,
                      isActive
                        ? { backgroundColor: cat.color + '25' }
                        : { backgroundColor: colors.background.tertiary },
                    ]}
                  >
                    <Ionicons name={cat.icon as any} size={16} color={isActive ? cat.color : colors.text.secondary} />
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
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Friend Filter Section */}
          <View style={styles.friendSection}>
            <View style={styles.budgetHeader}>
              <Ionicons name="people-outline" size={16} color={colors.gold.primary} />
              <Text style={styles.budgetTitle}>Search by Member</Text>
            </View>
            {friendDraft && (
              <Text style={styles.subtitle}>
                {`Showing ${selectedFriendName}'s ${modeDraft === 'favorites' ? 'favorites' : 'picks'}`}
              </Text>
            )}

            {/* Mode toggle — only show when a friend is selected */}
            {friendDraft && (
              <View style={styles.modeRow}>
                <Pressable
                  style={[styles.modePill, modeDraft === 'all' && styles.modePillActive]}
                  onPress={() => setModeDraft('all')}
                >
                  <Ionicons
                    name="bookmark-outline"
                    size={14}
                    color={modeDraft === 'all' ? colors.gold.primary : colors.text.tertiary}
                  />
                  <Text style={[styles.modePillText, modeDraft === 'all' && styles.modePillTextActive]}>
                    All Picks
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modePill, modeDraft === 'favorites' && styles.modePillActive]}
                  onPress={() => setModeDraft('favorites')}
                >
                  <Ionicons
                    name="star-outline"
                    size={14}
                    color={modeDraft === 'favorites' ? colors.gold.primary : colors.text.tertiary}
                  />
                  <Text style={[styles.modePillText, modeDraft === 'favorites' && styles.modePillTextActive]}>
                    Favorites
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Friend Search Bar */}
            <View style={styles.friendSearchContainer}>
              <Ionicons name="search-outline" size={16} color={colors.text.tertiary} style={styles.friendSearchIcon} />
              <TextInput
                style={styles.friendSearchInput}
                placeholder="Search members..."
                placeholderTextColor={colors.text.tertiary}
                value={friendSearch}
                onChangeText={setFriendSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {friendSearch.length > 0 && (
                <Pressable onPress={() => setFriendSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
                </Pressable>
              )}
            </View>

            {/* Friends */}
            {filteredFriends.length > 0 && (
              <>
                <Text style={styles.friendSectionLabel}>FRIENDS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.friendScroll}>
                  {filteredFriends.map((friend) => {
                    const isActive = friendDraft === friend.uid;
                    return (
                      <Pressable
                        key={friend.uid}
                        onPress={() => {
                          setFriendDraft(isActive ? null : friend.uid);
                          if (isActive) setModeDraft('all');
                        }}
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
              </>
            )}

            {/* Suggested People */}
            {filteredSuggestedUsers.length > 0 && (
              <>
                <Text style={[styles.friendSectionLabel, { marginTop: spacing.md }]}>OTHERS</Text>
                {loadingSuggestions ? (
                  <ActivityIndicator size="small" color={colors.gold.primary} style={{ marginVertical: spacing.md }} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.friendScroll}>
                    {filteredSuggestedUsers.slice(0, 12).map((u) => {
                      const uid = u.uid || (u as any).id;
                      const isActive = friendDraft === uid;
                      return (
                        <Pressable
                          key={uid}
                          onPress={() => {
                            setFriendDraft(isActive ? null : uid);
                            if (isActive) setModeDraft('all');
                          }}
                          style={[
                            styles.friendChip,
                            isActive && styles.friendChipActive,
                          ]}
                        >
                          {u.photoURL ? (
                            <Image source={{ uri: u.photoURL }} style={styles.friendChipAvatar} />
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
                            {u.displayName?.split(' ')[0] || 'User'}
                          </Text>
                          {isActive && (
                            <Ionicons name="checkmark-circle" size={14} color={colors.gold.primary} />
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}
          </View>
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
    position: 'relative',
  },
  handle: {
    width: 32,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.gold.muted + '50',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderWidth: 1.5,
    borderColor: colors.ui.border,
    gap: spacing.sm,
  },
  chipIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1.5,
    borderColor: colors.ui.border,
    gap: 4,
  },
  budgetChipActive: {
    backgroundColor: colors.gold.primary + '25',
    borderColor: colors.gold.primary,
    borderWidth: 1.5,
  },
  budgetIcon: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 16,
    color: colors.text.secondary,
    letterSpacing: 1,
  },
  budgetIconActive: {
    color: colors.gold.primary,
  },
  budgetLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },
  budgetLabelActive: {
    color: colors.gold.light,
  },
  starChipIcons: {
    flexDirection: 'row',
    gap: 1,
  },

  /* Friend Filter */
  friendSection: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  friendSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ui.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  friendSearchIcon: {
    marginRight: spacing.sm,
  },
  friendSearchInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    padding: 0,
  },
  friendSectionLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
    marginBottom: spacing.sm,
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

  /* Mode toggle */
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.ui.border,
    backgroundColor: colors.ui.cardBg,
  },
  modePillActive: {
    borderColor: colors.gold.primary + '55',
    backgroundColor: colors.gold.primary + '18',
  },
  modePillText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  modePillTextActive: {
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
