import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { PlaceCategory } from '../../src/types';
import { usePlacesStore, useAuthStore, useAdminNotificationStore } from '../../src/stores';
import { useLocation } from '../../src/hooks';
import { CUSTOM_MAP_STYLE, DEFAULT_REGION } from '../../src/constants/mapConfig';

// Lazy-load MapView to avoid web issues (same pattern as map.tsx)
let MiniMapView: any = null;
let PROVIDER_GOOGLE: any = undefined;
let isMiniMapAvailable = false;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MiniMapView = Maps.default;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
    isMiniMapAvailable = true;

    // Google Maps detection
    if (Platform.OS === 'ios') {
      const { NativeModules } = require('react-native');
      if (!NativeModules.AIRGoogleMapManager) {
        PROVIDER_GOOGLE = undefined; // Apple Maps in Expo Go
      }
    }
  } catch {
    isMiniMapAvailable = false;
  }
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.7;

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

function AdminBadge() {
  const count = useAdminNotificationStore((s) => s.totalPendingCount);
  if (count === 0) return null;

  return (
    <View style={{
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: colors.ui.error,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: colors.background.primary,
    }}>
      <Text style={{
        fontFamily: fonts.sans.semiBold,
        fontSize: 10,
        color: '#fff',
        letterSpacing: 0,
      }}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { search: searchParam } = useLocalSearchParams<{ search?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [featuredExpanded, setFeaturedExpanded] = useState(false);

  const { location } = useLocation();
  const profile = useAuthStore((s) => s.profile);
  const {
    places,
    friendsPicks,
    recentDiscoveries,
    featuredPerson,
    featuredPicks,
    isLoading,
    fetchPlaces,
    fetchFriendsPicks,
    fetchFeaturedPerson,
    getPopularTags,
    searchPlacesWithMatchedTags,
  } = usePlacesStore();

  useEffect(() => {
    fetchPlaces();
    fetchFriendsPicks();
    fetchFeaturedPerson();
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (query.length > 1) {
        setIsSearching(true);
        setSearchResults(searchPlacesWithMatchedTags(query));
      } else {
        setIsSearching(false);
        setSearchResults([]);
      }
    },
    [searchPlacesWithMatchedTags]
  );

  // Pre-fill search when navigating from a tag tap (e.g. from place detail)
  useEffect(() => {
    if (searchParam && searchParam.length > 0) {
      handleSearch(searchParam);
    }
  }, [searchParam]);

  const popularTags = useMemo(
    () => getPopularTags(10),
    [places, getPopularTags]
  );

  const placesCount = places.length;
  const isAdmin = profile?.isAdmin === true;
  const canEditPicks =
    isAdmin ||
    (profile?.uid || (profile as any)?.id) === featuredPerson?.uid;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandText}>SYRENA</Text>
          <View style={styles.headerRight}>
            {isAdmin && (
              <Pressable
                style={styles.adminButton}
                onPress={() => router.push('/modal/admin-approvals')}
              >
                <Ionicons name="shield-checkmark" size={18} color={colors.gold.primary} />
                <AdminBadge />
              </Pressable>
            )}
            <Pressable onPress={() => router.push('/modal/profile')}>
              <View style={styles.avatarRing}>
                <Image
                  source={{ uri: profile?.photoURL || 'https://i.pravatar.cc/100?img=10' }}
                  style={styles.headerAvatar}
                />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={colors.gold.muted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search destinations..."
            placeholderTextColor={colors.text.tertiary}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
            </Pressable>
          )}
        </View>

        {/* Popular Tags */}
        {!isSearching && popularTags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.popularTagsContainer}
            style={styles.popularTagsScroll}
          >
            <Ionicons
              name="pricetags-outline"
              size={13}
              color={colors.gold.muted}
              style={{ marginRight: spacing.sm }}
            />
            {popularTags.map((tag) => (
              <Pressable
                key={tag}
                style={styles.popularTagChip}
                onPress={() => handleSearch(tag)}
              >
                <Text style={styles.popularTagText}>{tag}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Search Results */}
        {isSearching ? (
          <View style={styles.searchResults}>
            <Text style={styles.sectionTitle}>
              Results ({searchResults.length})
            </Text>
            {searchResults.map((place: any) => (
              <Pressable
                key={place.id}
                style={styles.searchResultItem}
                onPress={() => router.push({ pathname: '/modal/place-detail', params: { id: place.id } })}
              >
                <View
                  style={[
                    styles.searchDot,
                    { backgroundColor: categoryColors[place.category as PlaceCategory] },
                  ]}
                />
                <View style={styles.searchResultText}>
                  <Text style={styles.searchResultName}>{place.name}</Text>
                  <Text style={styles.searchResultLocation}>
                    {place.city}, {place.country}
                  </Text>
                  {place.matchedTags && place.matchedTags.length > 0 && (
                    <View style={styles.matchedTagsRow}>
                      {place.matchedTags.slice(0, 3).map((tag: string) => (
                        <View key={tag} style={styles.matchedTagChip}>
                          <Text style={styles.matchedTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={12} color={colors.gold.primary} />
                  <Text style={styles.ratingText}>{place.rating}</Text>
                </View>
              </Pressable>
            ))}
            {searchResults.length === 0 && (
              <Text style={styles.noResults}>No places found</Text>
            )}
          </View>
        ) : (
          <>
            {/* Map Preview */}
            <Pressable
              style={styles.mapPreview}
              onPress={() => router.push('/(tabs)/map')}
            >
              <View style={styles.mapBrassAccent} />
              {isMiniMapAvailable && MiniMapView ? (
                <View style={styles.mapViewContainer} pointerEvents="none">
                  <MiniMapView
                    style={StyleSheet.absoluteFillObject}
                    {...(PROVIDER_GOOGLE ? { provider: PROVIDER_GOOGLE } : {})}
                    initialRegion={{
                      latitude: location?.latitude ?? DEFAULT_REGION.latitude,
                      longitude: location?.longitude ?? DEFAULT_REGION.longitude,
                      latitudeDelta: 0.04,
                      longitudeDelta: 0.04,
                    }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    showsUserLocation
                    showsMyLocationButton={false}
                    showsPointsOfInterest
                    userInterfaceStyle="dark"
                    customMapStyle={PROVIDER_GOOGLE ? CUSTOM_MAP_STYLE : undefined}
                  />
                </View>
              ) : (
                <View style={styles.mapImagePlaceholder}>
                  <Ionicons name="map" size={48} color={colors.gold.muted} />
                  <Text style={styles.mapPlaceholderText}>
                    Tap to explore map
                  </Text>
                </View>
              )}
              <View style={styles.mapOverlay}>
                <View style={styles.mapBadge}>
                  <Text style={styles.mapBadgeText}>{placesCount} places</Text>
                </View>
                <View style={styles.exploreMapButton}>
                  <Ionicons
                    name="navigate"
                    size={13}
                    color={colors.background.primary}
                  />
                  <Text style={styles.exploreMapText}>Explore Map</Text>
                </View>
              </View>
            </Pressable>

            {/* Featured Person of the Week */}
            <View style={styles.sectionHeader}>
              <View style={styles.featuredTitleRow}>
                <Ionicons name="trophy" size={16} color={colors.gold.primary} />
                <Text style={styles.sectionTitle}>Featured Traveler</Text>
              </View>
              {isAdmin && (
                <Pressable onPress={() => router.push('/modal/featured-person')}>
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
              )}
            </View>
            {featuredPerson ? (
              <Pressable
                style={styles.featuredCard}
                onPress={() => setFeaturedExpanded(!featuredExpanded)}
              >
                <View style={styles.featuredBrassTop} />
                <View style={styles.featuredContent}>
                  <View style={styles.featuredLeft}>
                    <View style={styles.featuredAvatarRing}>
                      <Image
                        source={{ uri: featuredPerson.photoURL || 'https://i.pravatar.cc/100?img=8' }}
                        style={styles.featuredAvatar}
                      />
                    </View>
                    <View style={styles.featuredCrown}>
                      <Ionicons name="trophy" size={10} color={colors.gold.primary} />
                    </View>
                  </View>
                  <View style={styles.featuredInfo}>
                    <Text style={styles.featuredLabel}>PERSON OF THE MONTH</Text>
                    <Text style={styles.featuredName}>{featuredPerson.displayName}</Text>
                    <Text style={styles.featuredUsername}>@{featuredPerson.username}</Text>
                    <Text style={styles.featuredHeadline} numberOfLines={featuredExpanded ? undefined : 2}>
                      {featuredPerson.headline}
                    </Text>
                  </View>
                </View>
                {/* Expanded bio section */}
                {featuredExpanded && featuredPerson.bio ? (
                  <View style={styles.featuredBioSection}>
                    <View style={styles.featuredBioDivider} />
                    <Text style={styles.featuredBioLabel}>ABOUT</Text>
                    <Text style={styles.featuredBioText}>{featuredPerson.bio}</Text>
                  </View>
                ) : null}
                {/* Expand hint */}
                <View style={styles.featuredExpandHint}>
                  <Ionicons
                    name={featuredExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={colors.text.tertiary}
                  />
                </View>
                <View style={styles.featuredBrassBottom} />
              </Pressable>
            ) : (
              <View style={styles.featuredEmptyCard}>
                <Ionicons name="trophy-outline" size={28} color={colors.gold.muted} />
                <Text style={styles.featuredEmptyText}>
                  {isAdmin ? 'Tap Edit to choose a featured traveler' : 'Coming soon'}
                </Text>
              </View>
            )}

            {/* Traveler's Picks */}
            {featuredPerson && (
              <>
                <View style={styles.sectionHeader}>
                  <View style={styles.featuredTitleRow}>
                    <Ionicons name="star" size={16} color={colors.gold.primary} />
                    <Text style={styles.sectionTitle}>Traveler's Picks</Text>
                  </View>
                  {canEditPicks && (
                    <Pressable onPress={() => router.push('/modal/featured-picks')}>
                      <Text style={styles.editText}>Edit</Text>
                    </Pressable>
                  )}
                </View>
                {featuredPicks.length === 0 ? (
                  <View style={styles.emptySection}>
                    <View style={styles.emptyIconRingOuter}>
                      <View style={styles.emptyIconCircle}>
                        <Ionicons name="star-outline" size={26} color={colors.gold.muted} />
                      </View>
                    </View>
                    <Text style={styles.emptyTitle}>No picks yet</Text>
                    <Text style={styles.emptySubtitle}>
                      {canEditPicks
                        ? 'Tap Edit to add your top travel picks'
                        : `${featuredPerson.displayName}'s picks will appear here`}
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.cardList}
                  >
                    {featuredPicks.map((item) => (
                      <Pressable
                        key={item.id}
                        style={styles.placeCard}
                        onPress={() =>
                          router.push({
                            pathname: '/modal/place-detail',
                            params: { id: item.id },
                          })
                        }
                      >
                        <Image
                          source={{
                            uri:
                              item.imageURLs?.[0] ||
                              `https://picsum.photos/400/300?random=${item.id}`,
                          }}
                          style={styles.placeImage}
                        />
                        <View style={styles.cardBrassLine} />
                        <View style={styles.placeCardContent}>
                          <Text style={styles.placeName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <View
                            style={[
                              styles.pill,
                              {
                                backgroundColor:
                                  categoryColors[item.category] + '14',
                                borderColor:
                                  categoryColors[item.category] + '30',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.pillText,
                                { color: categoryColors[item.category] },
                              ]}
                            >
                              {item.subcategory || item.category}
                            </Text>
                          </View>
                          <View style={styles.placeLocation}>
                            <Ionicons
                              name="location-outline"
                              size={11}
                              color={colors.text.tertiary}
                            />
                            <Text style={styles.locationText}>
                              {item.city}, {item.country}
                            </Text>
                          </View>
                          <View style={styles.placeFooter}>
                            <View style={styles.ratingContainer}>
                              <Ionicons
                                name="star"
                                size={11}
                                color={colors.gold.primary}
                              />
                              <Text style={styles.ratingText}>{item.rating}</Text>
                            </View>
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {/* Loading */}
            {isLoading && places.length === 0 && (
              <ActivityIndicator
                size="large"
                color={colors.gold.primary}
                style={{ marginVertical: spacing.xxl }}
              />
            )}

            {/* Friends' Picks */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Friends' Picks</Text>
              {friendsPicks.length > 0 && (
                <Pressable>
                  <Text style={styles.seeAllText}>See All</Text>
                </Pressable>
              )}
            </View>
            {friendsPicks.length === 0 && !isLoading ? (
              <View style={styles.emptySection}>
                <View style={styles.emptyIconRingOuter}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="people-outline" size={26} color={colors.gold.muted} />
                  </View>
                </View>
                <Text style={styles.emptyTitle}>No friends' picks yet</Text>
                <Text style={styles.emptySubtitle}>
                  Places your friends save will appear here
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardList}
              >
                {friendsPicks.map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.placeCard}
                    onPress={() => router.push({ pathname: '/modal/place-detail', params: { id: item.id } })}
                  >
                    <Image
                      source={{
                        uri:
                          item.imageURLs?.[0] ||
                          `https://picsum.photos/400/300?random=${item.id}`,
                      }}
                      style={styles.placeImage}
                    />
                    <View style={styles.cardBrassLine} />
                    <View style={styles.placeCardContent}>
                      <Text style={styles.placeName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View
                        style={[
                          styles.pill,
                          {
                            backgroundColor:
                              categoryColors[item.category] + '14',
                            borderColor:
                              categoryColors[item.category] + '30',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            { color: categoryColors[item.category] },
                          ]}
                        >
                          {item.subcategory || item.category}
                        </Text>
                      </View>
                      <View style={styles.placeLocation}>
                        <Ionicons
                          name="location-outline"
                          size={11}
                          color={colors.text.tertiary}
                        />
                        <Text style={styles.locationText}>
                          {item.city}, {item.country}
                        </Text>
                      </View>
                      <View style={styles.placeFooter}>
                        <View style={styles.ratingContainer}>
                          <Ionicons
                            name="star"
                            size={11}
                            color={colors.gold.primary}
                          />
                          <Text style={styles.ratingText}>{item.rating}</Text>
                        </View>
                        {item.createdByPhoto ? (
                          <Image
                            source={{ uri: item.createdByPhoto }}
                            style={styles.friendAvatar}
                          />
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {/* Recent Discoveries */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Discoveries</Text>
              {recentDiscoveries.length > 0 && (
                <Pressable>
                  <Text style={styles.seeAllText}>See All</Text>
                </Pressable>
              )}
            </View>
            {recentDiscoveries.length === 0 && !isLoading ? (
              <View style={styles.emptySection}>
                <View style={styles.emptyIconRingOuter}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="compass-outline" size={26} color={colors.gold.muted} />
                  </View>
                </View>
                <Text style={styles.emptyTitle}>No discoveries yet</Text>
                <Text style={styles.emptySubtitle}>
                  Add your first place from the map to get started
                </Text>
                <Pressable
                  style={styles.emptyActionButton}
                  onPress={() => router.push('/(tabs)/map')}
                >
                  <Ionicons name="map-outline" size={14} color={colors.background.primary} />
                  <Text style={styles.emptyActionText}>Open Map</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardList}
              >
                {recentDiscoveries.map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.placeCard}
                    onPress={() => router.push({ pathname: '/modal/place-detail', params: { id: item.id } })}
                  >
                    <Image
                      source={{
                        uri:
                          item.imageURLs?.[0] ||
                          `https://picsum.photos/400/300?random=${item.id}`,
                      }}
                      style={styles.placeImage}
                    />
                    <View style={styles.cardBrassLine} />
                    <View style={styles.placeCardContent}>
                      <Text style={styles.placeName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View
                        style={[
                          styles.pill,
                          {
                            backgroundColor:
                              categoryColors[item.category] + '14',
                            borderColor:
                              categoryColors[item.category] + '30',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            { color: categoryColors[item.category] },
                          ]}
                        >
                          {item.subcategory || item.category}
                        </Text>
                      </View>
                      <View style={styles.placeLocation}>
                        <Ionicons
                          name="location-outline"
                          size={11}
                          color={colors.text.tertiary}
                        />
                        <Text style={styles.locationText}>
                          {item.city}, {item.country}
                        </Text>
                      </View>
                      <View style={styles.placeFooter}>
                        <View style={styles.ratingContainer}>
                          <Ionicons
                            name="star"
                            size={11}
                            color={colors.gold.primary}
                          />
                          <Text style={styles.ratingText}>{item.rating}</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={{ height: spacing.xxl }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // ─── Header ───────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  adminButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.gold.muted + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandText: {
    fontFamily: fonts.serif.bold,
    fontSize: 28,
    letterSpacing: 12,
    color: colors.gold.primary,
  },
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.gold.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
  },

  // ─── Search ───────────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontStyle: 'italic',
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: spacing.md,
  },

  // ─── Popular Tags ───────────────────────────────────────────────
  popularTagsScroll: {
    marginBottom: spacing.lg,
    maxHeight: 36,
  },
  popularTagsContainer: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  popularTagChip: {
    backgroundColor: colors.gold.primary + '14',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '30',
  },
  popularTagText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.light,
    letterSpacing: 0.5,
  },

  // ─── Search Results ───────────────────────────────────────────────
  searchResults: {
    paddingHorizontal: spacing.lg,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
    gap: spacing.md,
  },
  searchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultName: {
    fontFamily: fonts.serif.regular,
    fontSize: 15,
    color: colors.text.primary,
  },
  searchResultLocation: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  noResults: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  matchedTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  matchedTagChip: {
    backgroundColor: colors.gold.primary + '18',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '25',
  },
  matchedTagText: {
    fontFamily: fonts.sans.regular,
    fontSize: 10,
    color: colors.gold.light,
    letterSpacing: 0.3,
  },

  // ─── Map Preview ──────────────────────────────────────────────────
  mapPreview: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xxl,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ui.cardBg,
    height: 190,
    ...shadows.md,
  },
  mapBrassAccent: {
    height: 2,
    backgroundColor: colors.gold.metallic,
    opacity: 0.5,
  },
  mapViewContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  mapImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
  },
  mapPlaceholderText: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(11, 15, 14, 0.85)',
    borderTopWidth: 0.5,
    borderTopColor: colors.gold.muted + '40',
  },
  mapBadge: {
    backgroundColor: colors.gold.primary + '18',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '30',
  },
  mapBadgeText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.light,
    letterSpacing: 0.5,
  },
  exploreMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold.metallic,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.sm,
    gap: 5,
  },
  exploreMapText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.background.primary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ─── Featured Person ───────────────────────────────────────────────
  featuredTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  featuredCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xxl,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ui.cardBg,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '30',
  },
  featuredBrassTop: {
    height: 2,
    backgroundColor: colors.gold.primary,
    opacity: 0.6,
  },
  featuredBrassBottom: {
    height: 1,
    backgroundColor: colors.gold.muted,
    opacity: 0.3,
  },
  featuredContent: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  featuredLeft: {
    position: 'relative',
  },
  featuredAvatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  featuredCrown: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredInfo: {
    flex: 1,
    gap: 3,
  },
  featuredLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 9,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  featuredName: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  featuredUsername: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.gold.metallic,
  },
  featuredHeadline: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.secondary,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 2,
  },
  featuredEmptyCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xxl,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1,
    borderColor: colors.ui.border,
    borderStyle: 'dashed',
    gap: spacing.sm,
  },
  featuredEmptyText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  featuredBioSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  featuredBioDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.gold.muted + '30',
    marginBottom: spacing.xs,
  },
  featuredBioLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 9,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  featuredBioText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  featuredExpandHint: {
    alignItems: 'center',
    paddingBottom: 4,
  },

  // ─── Section Headers ──────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    letterSpacing: 1.5,
    color: colors.text.primary,
  },
  seeAllText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.gold.muted,
    textTransform: 'uppercase',
  },

  // ─── Place Cards ──────────────────────────────────────────────────
  cardList: {
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
  placeCard: {
    width: CARD_WIDTH,
    borderRadius: radius.lg,
    backgroundColor: colors.ui.cardBg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  placeImage: {
    width: '100%',
    height: 150,
    backgroundColor: colors.background.tertiary,
  },
  cardBrassLine: {
    height: 1.5,
    backgroundColor: colors.gold.metallic,
    opacity: 0.35,
  },
  placeCardContent: {
    padding: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  placeName: {
    fontFamily: fonts.serif.bold,
    fontSize: 16,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  pillText: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  placeLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  placeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.gold.primary,
  },
  friendAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.gold.muted,
  },

  // ─── Empty States ─────────────────────────────────────────────────
  emptySection: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xxl,
    borderRadius: radius.lg,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1,
    borderColor: colors.ui.border,
    borderStyle: 'dashed',
  },
  emptyIconRingOuter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: colors.gold.muted + '40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.gold.primary + '10',
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 16,
    color: colors.text.primary,
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  emptySubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    backgroundColor: colors.gold.metallic,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  emptyActionText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.background.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
