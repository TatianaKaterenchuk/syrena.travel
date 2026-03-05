import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { PlaceCategory, UserPlace, BudgetTier, BUDGET_ICONS } from '../../src/types';
import { usePlacesStore, useAuthStore } from '../../src/stores';
import { useFriendsStore } from '../../src/stores/useFriendsStore';
import SearchBar from '../../src/components/ui/SearchBar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.md;
const CARD_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - GRID_GAP) / 2;

const categoryColors: Record<PlaceCategory, string> = {
  restaurant: colors.category.restaurant,
  hotel: colors.category.hotel,
  bar: colors.category.bar,
  cafe: colors.category.cafe,
  nature: colors.category.nature,
  culture: colors.category.culture,
  shopping: colors.category.shopping,
  nightlife: colors.category.nightlife,
  services: colors.category.services,
};

type FilterType =
  | 'all'
  | 'favorites'
  | 'gold_star'
  | 'friends'
  | 'recommender'
  | 'budget_1'
  | 'budget_2'
  | 'budget_3'
  | 'budget_4'
  | PlaceCategory;

interface FilterItem {
  key: FilterType;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

const filters: FilterItem[] = [
  { key: 'all', label: 'All' },
  { key: 'favorites', label: 'Favorites', icon: 'star' },
  { key: 'gold_star', label: 'Best Ever', icon: 'trophy' },
  { key: 'friends', label: 'Friends', icon: 'people' },
  { key: 'recommender', label: 'By Person', icon: 'person' },
  { key: 'budget_1', label: '$' },
  { key: 'budget_2', label: '$$' },
  { key: 'budget_3', label: '$$$' },
  { key: 'budget_4', label: '$$$$' },
  { key: 'restaurant', label: 'Eat' },
  { key: 'hotel', label: 'Stay' },
  { key: 'bar', label: 'Bars' },
  { key: 'culture', label: 'Do' },
  { key: 'nature', label: 'Nature' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'services', label: 'Services' },
];

export default function MyPlacesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { user } = useAuthStore();
  const {
    places,
    userPlaces,
    friendsPlaces,
    isLoading,
    fetchUserPlaces,
    fetchFriendsPlaces,
    fetchPlaces,
    toggleFavorite,
    toggleGoldStar,
  } = usePlacesStore();
  const { fetchFriends } = useFriendsStore();

  // Re-fetch every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchUserPlaces();
      fetchPlaces();
      if (user?.uid) {
        fetchFriends(user.uid).then(() => {
          const uids = useFriendsStore.getState().friends.map((f) => f.uid);
          if (uids.length > 0) fetchFriendsPlaces(uids);
        });
      }
    }, [user?.uid])
  );

  // Build a map of recommenders from places data
  const recommenders = useMemo(() => {
    const map = new Map<string, { name: string; photo: string; count: number }>();
    for (const up of userPlaces) {
      const place = places.find((p) => p.id === up.placeId);
      const creatorId = up.placeCreatedBy || place?.createdBy;
      const creatorName = up.placeCreatedByName || place?.createdByName || 'Unknown';
      const creatorPhoto = place?.createdByPhoto || '';
      if (creatorId) {
        const existing = map.get(creatorId);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(creatorId, { name: creatorName, photo: creatorPhoto, count: 1 });
        }
      }
    }
    return map;
  }, [userPlaces, places]);

  const [selectedRecommender, setSelectedRecommender] = useState<string | null>(null);

  const filteredPlaces = useMemo(() => {
    // Step 1: Apply filter
    let result: UserPlace[];
    if (activeFilter === 'all') result = userPlaces;
    else if (activeFilter === 'favorites') result = userPlaces.filter((p) => p.isFavorite);
    else if (activeFilter === 'gold_star') result = userPlaces.filter((p) => p.isGoldStar);
    else if (activeFilter === 'friends') result = friendsPlaces;
    else if (activeFilter === 'recommender') {
      if (!selectedRecommender) result = userPlaces;
      else result = userPlaces.filter((up) => {
        const place = places.find((p) => p.id === up.placeId);
        return (up.placeCreatedBy || place?.createdBy) === selectedRecommender;
      });
    } else if (activeFilter.startsWith('budget_')) {
      const tier = parseInt(activeFilter.split('_')[1], 10) as BudgetTier;
      result = userPlaces.filter((up) => {
        if (up.placeBudgetTier === tier) return true;
        const place = places.find((p) => p.id === up.placeId);
        return place?.budgetTier === tier;
      });
    } else {
      result = userPlaces.filter((p) => p.placeCategory === activeFilter);
    }

    // Step 2: Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().replace(/^#/, '');
      result = result.filter((up) => {
        if (up.placeName.toLowerCase().includes(q)) return true;
        if (up.placeCity?.toLowerCase().includes(q)) return true;
        if (up.placeCountry?.toLowerCase().includes(q)) return true;
        if (up.placeCategory.toLowerCase().includes(q)) return true;
        // Search tags from full Place object
        const place = places.find((p) => p.id === up.placeId);
        if (place?.tags?.some((tag) => tag.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    return result;
  }, [activeFilter, userPlaces, friendsPlaces, places, selectedRecommender, searchQuery]);

  const handleToggleFavorite = (item: UserPlace) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFavorite(item.id);
  };

  const handleToggleGoldStar = (item: UserPlace) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    toggleGoldStar(item.id);
  };

  const renderCard = ({ item }: { item: UserPlace }) => {
    const isFriendsFilter = activeFilter === 'friends';
    const place = places.find((p) => p.id === item.placeId);

    return (
      <Pressable
        style={styles.gridCard}
        onPress={() =>
          router.push({
            pathname: '/modal/place-detail',
            params: { id: item.placeId },
          })
        }
      >
        <Image
          source={{
            uri:
              item.placeImageURL ||
              `https://picsum.photos/400/400?random=${item.id}`,
          }}
          style={styles.gridImage}
        />
        {/* Category pill — top left */}
        <View style={styles.gridOverlay}>
          <View
            style={[
              styles.gridPill,
              {
                backgroundColor:
                  categoryColors[item.placeCategory] || colors.gold.primary,
              },
            ]}
          >
            <Text style={styles.gridPillText}>{item.placeCategory}</Text>
          </View>
        </View>

        {/* Gold star badge — top center (if extraordinary) */}
        {item.isGoldStar && (
          <View style={styles.goldStarBadge}>
            <Ionicons name="trophy" size={12} color="#FFD700" />
          </View>
        )}

        {/* Action buttons — top right (only on user's own places) */}
        {!isFriendsFilter && (
          <View style={styles.cardActions}>
            <Pressable
              style={styles.actionButton}
              onPress={() => handleToggleGoldStar(item)}
              hitSlop={6}
            >
              <Ionicons
                name={item.isGoldStar ? 'trophy' : 'trophy-outline'}
                size={14}
                color={item.isGoldStar ? '#FFD700' : colors.text.tertiary}
              />
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => handleToggleFavorite(item)}
              hitSlop={6}
            >
              <Ionicons
                name={item.isFavorite ? 'star' : 'star-outline'}
                size={14}
                color={item.isFavorite ? colors.gold.primary : colors.text.tertiary}
              />
            </Pressable>
          </View>
        )}

        {/* Budget tier badge */}
        {(item.placeBudgetTier || place?.budgetTier) && (
          <View style={styles.budgetBadge}>
            <Text style={styles.budgetBadgeText}>
              {BUDGET_ICONS[(item.placeBudgetTier || place?.budgetTier) as BudgetTier]}
            </Text>
          </View>
        )}

        <View style={styles.gridAccentLine} />
        <View style={styles.gridContent}>
          <Text style={styles.gridName} numberOfLines={1}>
            {item.placeName}
          </Text>
          <View style={styles.gridMeta}>
            <Ionicons
              name="location-outline"
              size={11}
              color={colors.text.tertiary}
            />
            <Text style={styles.gridCity}>{item.placeCity}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Places</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/modal/add-place')}
        >
          <View style={styles.addButtonInner}>
            <Ionicons name="add" size={20} color={colors.background.primary} />
          </View>
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search places, tags..."
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} style={styles.clearSearch}>
            <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
          </Pressable>
        )}
      </View>

      {/* Filter Bar */}
      <FlatList
        data={filters}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.filterChip,
              activeFilter === item.key && styles.filterChipActive,
            ]}
            onPress={() => {
              setActiveFilter(item.key);
              if (item.key !== 'recommender') setSelectedRecommender(null);
            }}
          >
            {item.icon && (
              <Ionicons
                name={item.icon}
                size={12}
                color={
                  activeFilter === item.key
                    ? colors.text.inverse
                    : colors.text.secondary
                }
              />
            )}
            <Text
              style={[
                styles.filterChipText,
                activeFilter === item.key && styles.filterChipTextActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        )}
      />

      {/* Recommender sub-filter */}
      {activeFilter === 'recommender' && recommenders.size > 0 && (
        <FlatList
          data={Array.from(recommenders.entries())}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recommenderBar}
          keyExtractor={([id]) => id}
          renderItem={({ item: [id, info] }) => (
            <Pressable
              style={[
                styles.recommenderChip,
                selectedRecommender === id && styles.recommenderChipActive,
              ]}
              onPress={() =>
                setSelectedRecommender(selectedRecommender === id ? null : id)
              }
            >
              {info.photo ? (
                <Image source={{ uri: info.photo }} style={styles.recommenderAvatar} />
              ) : (
                <View style={styles.recommenderAvatarPlaceholder}>
                  <Ionicons name="person" size={10} color={colors.text.tertiary} />
                </View>
              )}
              <Text
                style={[
                  styles.recommenderName,
                  selectedRecommender === id && styles.recommenderNameActive,
                ]}
                numberOfLines={1}
              >
                {info.name}
              </Text>
              <View style={styles.recommenderCount}>
                <Text style={styles.recommenderCountText}>{info.count}</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {isLoading && userPlaces.length === 0 ? (
        <ActivityIndicator
          size="large"
          color={colors.gold.primary}
          style={{ marginTop: 80 }}
        />
      ) : (
        <FlatList
          data={filteredPlaces}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons
                  name={
                    activeFilter === 'favorites'
                      ? 'star-outline'
                      : activeFilter === 'gold_star'
                      ? 'trophy-outline'
                      : activeFilter === 'friends'
                      ? 'people-outline'
                      : activeFilter === 'recommender'
                      ? 'person-outline'
                      : activeFilter.startsWith('budget_')
                      ? 'wallet-outline'
                      : 'heart-outline'
                  }
                  size={32}
                  color={colors.gold.muted}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {activeFilter === 'favorites'
                  ? 'No favorites yet'
                  : activeFilter === 'gold_star'
                  ? 'No gold star places'
                  : activeFilter === 'friends'
                  ? "No friends' places"
                  : activeFilter === 'recommender'
                  ? 'No places from this person'
                  : activeFilter.startsWith('budget_')
                  ? 'No places at this price range'
                  : 'No places yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeFilter === 'favorites'
                  ? 'Tap the star on a place to add it to favorites'
                  : activeFilter === 'gold_star'
                  ? 'Use the trophy icon to mark extraordinary places'
                  : activeFilter === 'friends'
                  ? 'Places your friends save will appear here'
                  : activeFilter.startsWith('budget_')
                  ? 'Set a price range when adding places'
                  : 'Start adding your favorite destinations'}
              </Text>
              {activeFilter === 'all' && (
                <Pressable
                  style={styles.emptyButton}
                  onPress={() => router.push('/modal/add-place')}
                >
                  <Ionicons
                    name="add"
                    size={18}
                    color={colors.background.primary}
                  />
                  <Text style={styles.emptyButtonText}>Add a Place</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 32,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gold.metallic,
  },
  addButtonInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.gold.muted,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  clearSearch: {
    position: 'absolute',
    right: spacing.lg + spacing.md,
  },
  filterBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
    borderWidth: 0.5,
    borderColor: colors.gold.muted,
    gap: 5,
  },
  filterChipActive: {
    backgroundColor: colors.gold.primary,
    borderColor: colors.gold.primary,
  },
  filterChipText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  filterChipTextActive: {
    color: colors.text.inverse,
  },

  // Recommender sub-filter
  recommenderBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  recommenderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.background.tertiary,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    gap: 6,
  },
  recommenderChipActive: {
    backgroundColor: colors.gold.primary + '18',
    borderColor: colors.gold.primary,
  },
  recommenderAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.gold.muted,
  },
  recommenderAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommenderName: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.text.secondary,
    maxWidth: 80,
  },
  recommenderNameActive: {
    color: colors.gold.primary,
  },
  recommenderCount: {
    backgroundColor: colors.gold.muted + '30',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  recommenderCountText: {
    fontFamily: fonts.sans.medium,
    fontSize: 9,
    color: colors.gold.primary,
  },

  grid: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 20,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridCard: {
    width: CARD_SIZE,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.ui.cardBg,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    ...shadows.sm,
  },
  gridImage: {
    width: '100%',
    height: CARD_SIZE,
    backgroundColor: colors.background.tertiary,
  },
  gridOverlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },
  gridPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    opacity: 0.85,
  },
  gridPillText: {
    fontFamily: fonts.sans.regular,
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  goldStarBadge: {
    position: 'absolute',
    top: spacing.sm,
    alignSelf: 'center',
    left: CARD_SIZE / 2 - 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(11, 15, 14, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  cardActions: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    gap: 4,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(11, 15, 14, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  budgetBadge: {
    position: 'absolute',
    bottom: 46,
    left: spacing.sm,
    backgroundColor: 'rgba(11, 15, 14, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  budgetBadgeText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 9,
    color: colors.gold.light,
    letterSpacing: 0.5,
  },
  gridAccentLine: {
    height: 1,
    backgroundColor: colors.gold.muted,
    opacity: 0.4,
  },
  gridContent: {
    padding: spacing.sm,
    paddingTop: spacing.sm,
    gap: 4,
  },
  gridName: {
    fontFamily: fonts.serif.regular,
    fontSize: 14,
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  gridMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  gridCity: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    gap: spacing.md,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.background.secondary,
    borderWidth: 0.5,
    borderColor: colors.gold.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.serif.regular,
    fontSize: 20,
    color: colors.text.primary,
    marginTop: spacing.md,
    letterSpacing: 0.3,
  },
  emptySubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.tertiary,
    letterSpacing: 0.2,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    gap: spacing.xs,
    marginTop: spacing.xl,
    borderWidth: 0.5,
    borderColor: colors.gold.metallic,
  },
  emptyButtonText: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.inverse,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
