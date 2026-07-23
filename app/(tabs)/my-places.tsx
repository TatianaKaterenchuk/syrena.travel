import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { PlaceCategory, UserPlace, BudgetTier, BUDGET_ICONS } from '../../src/types';
import { usePlacesStore, useAuthStore } from '../../src/stores';
import SearchBar from '../../src/components/ui/SearchBar';
import { placeImageUri, sizedImageUri } from '../../src/utils/placeholderAvatar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DiscoveryTip from '../../src/components/onboarding/DiscoveryTip';
import { SHARED_CITY_KEY } from '../../src/components/onboarding/ActivationChecklist';
import OptionSheet from '../../src/components/ui/OptionSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.md;
const CARD_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - GRID_GAP) / 2;

const categoryColors: Record<PlaceCategory, string> = {
  restaurant: colors.category.restaurant,
  lodging: colors.category.lodging,
  bar: colors.category.bar,
  cafe: colors.category.cafe,
  club: colors.category.club,
  culture: colors.category.culture,
  nature: colors.category.nature,
  shop: colors.category.shop,
  services: colors.category.services,
};


export default function MyPlacesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');

  const { user, profile } = useAuthStore();
  const {
    places,
    userPlaces,
    isLoading,
    fetchUserPlaces,
    fetchPlaces,
    toggleFavorite,
  } = usePlacesStore();

  // Re-fetch every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchUserPlaces();
      fetchPlaces();
    }, [user?.uid])
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // force=true bypasses the fetch TTL — an explicit pull means "check now"
      await Promise.all([fetchUserPlaces(true), fetchPlaces(true)]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchUserPlaces, fetchPlaces]);

  // Build a set of valid place IDs so we can filter out orphaned UserPlaces
  const validPlaceIds = useMemo(() => new Set(places.map((p) => p.id)), [places]);

  // Show only favorites
  const filteredPlaces = useMemo(() => {
    let result = userPlaces.filter((p) => p.isFavorite);

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().replace(/^#/, '');
      result = result.filter((up) => {
        if (up.placeName.toLowerCase().includes(q)) return true;
        if (up.placeCity?.toLowerCase().includes(q)) return true;
        if (up.placeCountry?.toLowerCase().includes(q)) return true;
        if (up.placeCategory.toLowerCase().includes(q)) return true;
        const place = places.find((p) => p.id === up.placeId);
        if (place?.tags?.some((tag) => tag.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    // Filter out orphaned UserPlaces whose Place was deleted
    result = result.filter((up) => validPlaceIds.has(up.placeId));

    return result;
  }, [userPlaces, places, searchQuery, validPlaceIds]);

  // "I'm coming to Bangkok — what do you recommend?" → share a browser
  // link to your picks for that city. No app or account needed to view.
  const [showCitySheet, setShowCitySheet] = useState(false);
  const myCities = useMemo(
    () =>
      user
        ? [
            ...new Set(
              places
                .filter((p) => p.createdBy === user.uid && p.city)
                .map((p) => p.city.trim()),
            ),
          ].sort()
        : [],
    [places, user],
  );

  const handleShareCity = () => {
    if (!user) return;
    if (myCities.length === 0) {
      Alert.alert(
        'Nothing to Share Yet',
        'Add a place recommendation first, then you can share your picks for that city with friends.',
      );
      return;
    }
    setShowCitySheet(true);
  };

  const shareCity = async (city: string) => {
    if (!user) return;
    setShowCitySheet(false);
    const firstName = (profile?.displayName || '').split(' ')[0];
    const url =
      `https://syrena-travel.web.app/city?u=${user.uid}` +
      `&city=${encodeURIComponent(city)}` +
      (firstName ? `&n=${encodeURIComponent(firstName)}` : '');
    try {
      await Share.share({
        message: `My ${city} picks — restaurants, bars and more I actually vouch for:\n${url}`,
      });
      // Check off the "share a city" activation item
      AsyncStorage.setItem(SHARED_CITY_KEY, 'true').catch(() => {});
    } catch {
      // user dismissed the share sheet
    }
  };

  const handleToggleFavorite = (item: UserPlace) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFavorite(item.id);
  };

  const renderCard = ({ item }: { item: UserPlace }) => {
    const place = places.find((p) => p.id === item.placeId);

    return (
      <Pressable
        style={({ pressed }) => [styles.gridCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
        onPress={() =>
          router.push({
            pathname: '/modal/place-detail',
            params: { id: item.placeId },
          })
        }
      >
        <Image
          source={{
            uri: sizedImageUri(
              item.placeImageURL || placeImageUri(undefined, item.id),
              400,
            ),
          }}
          style={styles.gridImage}
          recyclingKey={item.id}
          transition={100}
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

        {/* Action buttons — top right */}
        <View style={styles.cardActions}>
            <Pressable
              style={styles.actionButton}
              onPress={() => handleToggleFavorite(item)}
              hitSlop={6}
            >
              <Ionicons
                name={item.isFavorite ? 'heart' : 'heart-outline'}
                size={14}
                color={item.isFavorite ? colors.gold.primary : colors.text.tertiary}
              />
            </Pressable>
          </View>

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
      <DiscoveryTip
        id="share-city"
        icon="share-social"
        title="Share your picks"
        text="Tap the share icon up top to send friends a link to your recommendations for any city — no app needed on their end."
      />
      <OptionSheet
        visible={showCitySheet}
        title="Share a City"
        subtitle="Friends get a link that opens in any browser — no app needed."
        options={myCities.map((city) => ({
          key: city,
          label: city,
          icon: 'location' as const,
        }))}
        onSelect={shareCity}
        onClose={() => setShowCitySheet(false)}
      />
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Favorites</Text>
          <Text style={styles.headerSubtitle}>The places you vouch for</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.shareCityButton}
            onPress={handleShareCity}
            hitSlop={8}
            accessibilityLabel="Share a city with a friend"
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={20} color={colors.gold.primary} />
          </Pressable>
          <Pressable
            style={styles.addButton}
            onPress={() => router.push('/modal/add-place')}
          >
            <View style={styles.addButtonInner}>
              <Ionicons name="add" size={20} color={colors.background.primary} />
            </View>
          </Pressable>
        </View>
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
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.gold.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="heart-outline" size={32} color={colors.gold.muted} />
              </View>
              <Text style={styles.emptyTitle}>No favorites yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap the heart on a place to add it to your favorites
              </Text>
              <Pressable
                style={styles.emptyButton}
                onPress={() => router.push('/modal/add-place')}
              >
                <Ionicons name="add" size={18} color={colors.background.primary} />
                <Text style={styles.emptyButtonText}>Add a Place</Text>
              </Pressable>
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
  headerSubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shareCityButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
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
    height: 34 + spacing.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.gold.muted + '60',
    gap: 5,
  },
  filterChipActive: {
    backgroundColor: colors.gold.primary,
    borderColor: colors.gold.primary,
  },
  filterChipText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.gold.light,
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
