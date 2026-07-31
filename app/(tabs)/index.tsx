import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  Pressable,
  Dimensions,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { PlaceCategory, StarRating, Place } from '../../src/types';
import { usePlacesStore, useAuthStore, useFriendsStore } from '../../src/stores';
import { avatarUrl, placeImageUri, sizedImageUri } from '../../src/utils/placeholderAvatar';
import ActivationChecklist from '../../src/components/onboarding/ActivationChecklist';
import { useLocation } from '../../src/hooks';
import { CUSTOM_MAP_STYLE, DEFAULT_REGION } from '../../src/constants/mapConfig';
import { searchPlaces as googleSearchPlaces, GooglePlaceSearchResult, getPlaceDetails } from '../../src/services/googlePlaces';
import { resolveCityName } from '../../src/utils/resolveCity';

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
  lodging: colors.category.lodging,
  bar: colors.category.bar,
  cafe: colors.category.cafe,
  club: colors.category.club,
  culture: colors.category.culture,
  nature: colors.category.nature,
  shop: colors.category.shop,
  services: colors.category.services,
};

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { search: searchParam } = useLocalSearchParams<{ search?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [googleResults, setGoogleResults] = useState<GooglePlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGoogleSearching, setIsGoogleSearching] = useState(false);
  const [isNearMe, setIsNearMe] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const { location } = useLocation();
  const profile = useAuthStore((s) => s.profile);
  const {
    places,
    recentDiscoveries,
    featuredPerson,
    featuredPicks,
    pickedUsers,
    isLoading,
    fetchPlaces,
    fetchMorePlaces,
    hasMorePlaces,
    isLoadingMore,
    fetchFeaturedPerson,
    fetchPickedUsers,
    fetchBeenPlaces,
    fetchFriendsVisits,
    friendsVisits,
    searchPlacesWithMatchedTags,
  } = usePlacesStore();

  useEffect(() => {
    fetchPlaces();
    fetchFeaturedPerson();
    fetchPickedUsers();
    fetchBeenPlaces();
    // Slight delay so the friends list (subscribed at the layout level)
    // has landed before we map their visits.
    const t = setTimeout(() => fetchFriendsVisits(), 2500);
    return () => clearTimeout(t);
  }, []);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mounting a native Google MapView is one of the most expensive things on
  // this screen. Defer it until after first paint so the cards render fast.
  const [miniMapReady, setMiniMapReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMiniMapReady(true), 350);
    return () => clearTimeout(t);
  }, []);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchPlaces(true), // force bypasses the fetch TTL on explicit pull
        fetchFeaturedPerson(),
        fetchPickedUsers(),
        fetchBeenPlaces(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchPlaces, fetchFeaturedPerson, fetchPickedUsers, fetchBeenPlaces]);

  // The app explanation now lives BEFORE sign-up (app/(auth)/welcome.tsx),
  // so we no longer auto-pop the About overlay on first login. It stays
  // reachable via the "?" button in the header.

  const handleCloseAbout = () => {
    setShowAbout(false);
    AsyncStorage.setItem('syrena_about_seen', 'true');
  };

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

      if (query.length > 1) {
        setIsSearching(true);
        // Immediate local search
        setSearchResults(searchPlacesWithMatchedTags(query, location?.latitude, location?.longitude));

        // Debounced Google Places search
        setIsGoogleSearching(true);
        searchDebounceRef.current = setTimeout(async () => {
          try {
            const results = await googleSearchPlaces(
              query.trim(),
              location?.latitude,
              location?.longitude,
              5,
            );
            setGoogleResults(results);
          } catch {
            setGoogleResults([]);
          } finally {
            setIsGoogleSearching(false);
          }
        }, 400);
      } else {
        setIsSearching(false);
        setSearchResults([]);
        setGoogleResults([]);
        setIsGoogleSearching(false);
      }
    },
    [searchPlacesWithMatchedTags, location]
  );

  // Pre-fill search when navigating from a tag tap (e.g. from place detail)
  useEffect(() => {
    if (searchParam && searchParam.length > 0) {
      handleSearch(searchParam);
    }
  }, [searchParam]);

  const { userPlaces } = usePlacesStore();

  // Derive "Best of [City]" — rotate through a different city each day
  const bestOfCity = useMemo(() => {
    const cityMap = new Map<string, typeof places>();
    for (const p of places) {
      if (!p.city) continue;
      const cityName = resolveCityName(p.city);
      const existing = cityMap.get(cityName) || [];
      existing.push(p);
      cityMap.set(cityName, existing);
    }

    // Filter to cities with at least 3 places (excludes neighborhoods which tend to have fewer)
    const eligibleCities = [...cityMap.entries()]
      .filter(([, cityPlaces]) => cityPlaces.length >= 3)
      .sort(([a], [b]) => a.localeCompare(b));

    if (eligibleCities.length === 0) return null;

    // Use day-of-year as index to rotate daily
    const now = new Date();
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24),
    );
    const index = dayOfYear % eligibleCities.length;
    const [city, cityPlaces] = eligibleCities[index];

    // Sort by rating desc, take top 8
    const sorted = [...cityPlaces].sort((a, b) => b.rating - a.rating).slice(0, 8);
    return { city, places: sorted };
  }, [places]);

  // Derive user's favorites
  const myFavorites = useMemo(() => {
    const favIds = userPlaces
      .filter((up) => up.isFavorite)
      .map((up) => up.placeId);
    if (favIds.length === 0) return [];
    const favSet = new Set(favIds);
    return places.filter((p) => favSet.has(p.id)).slice(0, 8);
  }, [places, userPlaces]);

  // Derive city sections — cities with 2+ places, sorted by place count
  // NOTE: never return a fresh object from a zustand selector — the identity
  // changes every call, which forces an infinite re-render loop and a fatal
  // "Maximum update depth exceeded" crash. Select the raw array, memoize.
  const friends = useFriendsStore((s) => s.friends);
  const friendUids = useMemo(
    () => new Set(friends.filter((f) => f.status === 'accepted').map((f) => f.uid)),
    [friends],
  );

  const citySections = useMemo(() => {
    const cityMap = new Map<string, Place[]>();
    for (const p of places) {
      if (!p.city) continue;
      const cityName = resolveCityName(p.city);
      const existing = cityMap.get(cityName) || [];
      existing.push(p);
      cityMap.set(cityName, existing);
    }
    return [...cityMap.entries()]
      .filter(([, cityPlaces]) => cityPlaces.length >= 2)
      .sort(([, a], [, b]) => b.length - a.length)
      // No cap — the list is virtualized and grows as more pages load
      .map(([city, cityPlaces]) => {
        // "Your friends' Warsaw" context — how many of these places come
        // from people the user actually trusts.
        const friendRecommenders = new Set(
          cityPlaces
            .filter((p) => friendUids.has(p.createdBy))
            .map((p) => p.createdBy),
        );
        return {
          city,
          friendCount: friendRecommenders.size,
          places: cityPlaces
            .sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() ?? 0;
              const bTime = b.createdAt?.toMillis?.() ?? 0;
              return bTime - aTime;
            })
            .slice(0, 10),
          totalCount: cityPlaces.length,
        };
      });
  }, [places, friendUids]);

  // Recently added — newest first
  const recentlyAdded = useMemo(() => {
    return [...places]
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }, [places]);

  // Near Me: places sorted by distance
  const nearbyPlaces = useMemo(() => {
    if (!isNearMe || !location) return [];
    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    return places
      .filter((p) => !!p.location) // skip malformed docs missing location
      .map((p) => ({
        ...p,
        distance: getDistance(location.latitude, location.longitude, p.location.latitude, p.location.longitude),
      }))
      .filter((p) => p.distance <= 50) // within 50km
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 15);
  }, [isNearMe, location, places]);

  const handleNearMe = () => {
    if (isNearMe) {
      setIsNearMe(false);
    } else {
      setIsNearMe(true);
      setIsSearching(false);
      setSearchQuery('');
    }
  };

  const placesCount = places.length;
  const isAdmin = profile?.isAdmin === true;
  const canEditPicks =
    isAdmin ||
    (profile?.uid || (profile as any)?.id) === featuredPerson?.uid;

  // ---- Virtualized city sections (infinite scroll) ----
  const handleEndReached = useCallback(() => {
    if (!isNearMe && !isSearching) {
      fetchMorePlaces();
    }
  }, [isNearMe, isSearching, fetchMorePlaces]);

  const renderCitySection = useCallback(
    ({ item: section }: { item: { city: string; places: Place[]; friendCount: number; totalCount: number } }) => (
      <>
        <View style={styles.sectionHeader}>
          <View style={styles.featuredTitleRow}>
            <Text style={styles.sectionDiamond}>✦</Text>
            <Text style={styles.sectionTitle}>{section.city}</Text>
          </View>
          <Text style={styles.citySectionSub}>
            {section.friendCount > 0
              ? `${section.totalCount} places · ${section.friendCount} ${section.friendCount === 1 ? 'friend recommends here' : 'friends recommend here'}`
              : `${section.totalCount} places from the community`}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardList}
        >
          {section.places.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.bestOfCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={() => router.push({ pathname: '/modal/place-detail', params: { id: item.id } })}
            >
              <Image
                source={{ uri: sizedImageUri(placeImageUri(item.imageURLs, item.id), 500) }}
                recyclingKey={item.id}
                transition={100}
                style={styles.bestOfImage}
              />
              {item.starRating ? (
                <View style={styles.bestOfOverlay}>
                  <View style={styles.bestOfRating}>
                    {Array.from({ length: item.starRating }).map((_, i) => (
                      <Ionicons key={i} name="star" size={10} color={colors.gold.primary} />
                    ))}
                  </View>
                </View>
              ) : null}
              {/* Friends who've been here — social proof at browse time */}
              {friendsVisits[item.id]?.length ? (
                <View style={styles.beenStack}>
                  {friendsVisits[item.id].slice(0, 3).map((f, i) => (
                    <Image
                      key={f.uid}
                      source={{ uri: avatarUrl(f.photoURL, f.uid) }}
                      style={[styles.beenAvatar, i > 0 && { marginLeft: -7 }]}
                    />
                  ))}
                  {friendsVisits[item.id].length > 3 && (
                    <Text style={styles.beenMore}>+{friendsVisits[item.id].length - 3}</Text>
                  )}
                </View>
              ) : null}
              <View style={styles.bestOfContent}>
                <Text style={styles.bestOfName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.bestOfCategory} numberOfLines={1}>
                  {item.city}{item.country ? `, ${item.country}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </>
    ),
    [router, friendsVisits],
  );

  // Bottom-of-list loading indicator while the next page comes in
  const listFooter = (
    <View style={styles.listFooter}>
      {!isNearMe && !isSearching && isLoadingMore ? (
        <>
          <ActivityIndicator size="small" color={colors.gold.primary} />
          <Text style={styles.listFooterText}>Loading more places…</Text>
        </>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        // Virtualized: city sections render lazily as you scroll, and
        // onEndReached pages more places in from Firestore.
        data={isNearMe || isSearching ? [] : citySections}
        keyExtractor={(section) => section.city}
        renderItem={renderCitySection}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        ListFooterComponent={listFooter}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.gold.primary}
          />
        }
        ListHeaderComponent={
        <>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandText}>SYRENA VOYAGER</Text>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.aboutButton}
              onPress={() => router.push({ pathname: '/(tabs)/friends', params: { tab: 'messages' } })}
              hitSlop={8}
              accessibilityLabel="Messages"
              accessibilityRole="button"
            >
              <Ionicons name="chatbubbles-outline" size={22} color={colors.gold.primary} />
            </Pressable>
            <Pressable
              style={styles.aboutButton}
              onPress={() => setShowAbout(true)}
              hitSlop={8}
              accessibilityLabel="About Syrena Voyager"
              accessibilityRole="button"
            >
              <Ionicons name="help-circle-outline" size={22} color={colors.gold.primary} />
            </Pressable>
          </View>
        </View>

        {/* Activation checklist — helps new members discover every feature */}
        <ActivationChecklist />

        {/* Search Bar + Near Me */}
        <View style={styles.searchRow}>
          <View style={[styles.searchContainer, { flex: 1 }]}>
            <Ionicons name="search" size={16} color={colors.gold.muted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={(text) => { setIsNearMe(false); handleSearch(text); }}
              placeholder="Search cities, places, categories..."
              placeholderTextColor={colors.text.tertiary}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => { handleSearch(''); setGoogleResults([]); }}>
                <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
              </Pressable>
            )}
          </View>
          <Pressable
            style={[styles.nearMeButton, isNearMe && styles.nearMeButtonActive]}
            onPress={handleNearMe}
          >
            <Ionicons name="locate" size={16} color={isNearMe ? colors.gold.primary : colors.text.secondary} />
          </Pressable>
        </View>


        {/* Near Me Results */}
        {isNearMe ? (
          <View style={styles.searchResults}>
            <Text style={styles.sectionTitle}>Near You</Text>
            {!location ? (
              <Text style={styles.noResults}>Enable location to find nearby places</Text>
            ) : nearbyPlaces.length === 0 ? (
              <Text style={styles.noResults}>No places nearby</Text>
            ) : (
              nearbyPlaces.map((place: any) => (
                <Pressable
                  key={place.id}
                  style={({ pressed }) => [styles.searchResultItem, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
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
                  </View>
                  <Text style={styles.distanceText}>{place.distance < 1 ? `${Math.round(place.distance * 1000)}m` : `${place.distance.toFixed(1)}km`}</Text>
                </Pressable>
              ))
            )}
          </View>
        ) : /* Search Results */
        isSearching ? (
          <View style={styles.searchResults}>
            {/* Local saved places */}
            {searchResults.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Your Places</Text>
                {searchResults.map((place: any) => (
                  <Pressable
                    key={place.id}
                    style={({ pressed }) => [styles.searchResultItem, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
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
                  </Pressable>
                ))}
              </>
            )}

            {/* Google Places results */}
            {(googleResults.length > 0 || isGoogleSearching) && (
              <>
                <Text style={[styles.sectionTitle, searchResults.length > 0 && { marginTop: spacing.lg }]}>
                  Discover
                </Text>
                {isGoogleSearching && googleResults.length === 0 && (
                  <ActivityIndicator size="small" color={colors.gold.primary} style={{ marginVertical: spacing.md }} />
                )}
                {googleResults.map((result) => {
                  // Check if this Google Place already exists in our database
                  const existingPlace = places.find((p) =>
                    (p.googlePlaceId && p.googlePlaceId === result.placeId) ||
                    (p.name.toLowerCase().trim() === result.name.toLowerCase().trim() &&
                     p.address?.toLowerCase().includes(result.address?.split(',')[0]?.toLowerCase().trim() || '___'))
                  );

                  if (existingPlace) {
                    // Show as existing pick — navigate to detail
                    return (
                      <Pressable
                        key={result.placeId}
                        style={({ pressed }) => [styles.searchResultItem, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                        onPress={() => router.push({ pathname: '/modal/place-detail', params: { id: existingPlace.id } })}
                      >
                        <View style={[styles.googleResultIcon, { backgroundColor: colors.gold.primary + '20' }]}>
                          <Ionicons name="checkmark-circle" size={16} color={colors.gold.primary} />
                        </View>
                        <View style={styles.searchResultText}>
                          <Text style={styles.searchResultName}>{result.name}</Text>
                          <Text style={styles.searchResultLocation} numberOfLines={1}>
                            Already added by {existingPlace.createdByName || 'someone'}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.gold.primary} />
                      </Pressable>
                    );
                  }

                  // Not yet added — allow adding
                  return (
                    <Pressable
                      key={result.placeId}
                      style={({ pressed }) => [styles.searchResultItem, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                      onPress={async () => {
                        const details = await getPlaceDetails(result.placeId);
                        if (details) {
                          router.push({
                            pathname: '/modal/add-place',
                            params: {
                              latitude: String(details.latitude),
                              longitude: String(details.longitude),
                              poiName: details.name,
                              poiAddress: details.address,
                              poiCity: details.city,
                              poiCountry: details.country,
                              googlePlaceId: details.placeId,
                              poiRating: String(details.rating),
                              poiRatingCount: String(details.ratingCount),
                              poiPhotos: details.photos.map((p) => p.url).join('|||'),
                              poiTypes: details.types.join(','),
                              poiPrimaryType: details.primaryType || '',
                            },
                          });
                        }
                      }}
                    >
                      <View style={styles.googleResultIcon}>
                        <Ionicons name="location-outline" size={16} color={colors.gold.primary} />
                      </View>
                      <View style={styles.searchResultText}>
                        <Text style={styles.searchResultName}>{result.name}</Text>
                        <Text style={styles.searchResultLocation} numberOfLines={1}>
                          {result.address}
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={20} color={colors.gold.muted} />
                    </Pressable>
                  );
                })}
              </>
            )}

            {searchResults.length === 0 && googleResults.length === 0 && !isGoogleSearching && (
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
              {miniMapReady && isMiniMapAvailable && MiniMapView ? (
                <View style={styles.mapViewContainer} pointerEvents="none">
                  <MiniMapView
                    // Remounting the map when the user's location first
                    // resolves guarantees the initialRegion actually picks
                    // up the current-city coords instead of the default.
                    // Otherwise the map stays centered on Warsaw forever.
                    key={location ? `loc-${location.latitude.toFixed(2)}-${location.longitude.toFixed(2)}` : 'no-loc'}
                    style={StyleSheet.absoluteFillObject}
                    {...(PROVIDER_GOOGLE ? { provider: PROVIDER_GOOGLE } : {})}
                    region={{
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
                    showsPointsOfInterest={false}
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
              <View style={styles.mapOverlay} />
            </Pressable>

            {/* Featured Person — auto-rotates daily */}
            <View style={styles.sectionHeader}>
              <View style={styles.featuredTitleRow}>
                <Text style={styles.sectionTitle}>Featured</Text>
              </View>
            </View>
            {featuredPerson ? (
              <Pressable
                style={styles.featuredCard}
                onPress={() => router.push(`/modal/user-profile?id=${featuredPerson.uid}`)}
              >
                <View style={styles.featuredBrassTop} />
                <View style={styles.featuredContent}>
                  <View style={styles.featuredLeft}>
                    <View style={styles.featuredAvatarRing}>
                      <Image
                        source={{ uri: avatarUrl(featuredPerson.photoURL, featuredPerson.uid) }}
                        style={styles.featuredAvatar}
                      />
                    </View>
                  </View>
                  <View style={styles.featuredInfo}>
                    <Text style={styles.featuredName}>{featuredPerson.displayName}</Text>
                    {featuredPerson.bio ? (
                      <Text style={styles.featuredBioText} numberOfLines={3}>
                        {featuredPerson.bio}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.featuredBrassBottom} />
              </Pressable>
            ) : (
              <View style={styles.featuredEmptyCard}>
                <Text style={styles.featuredEmptyText}>
                  Each week, one member's picks take the spotlight.
                </Text>
              </View>
            )}

            {/* Traveler's Picks */}
            {featuredPerson && (
              <>
                <View style={styles.sectionHeader}>
                  <View style={styles.featuredTitleRow}>
                    <Text style={styles.sectionDiamond}>✦</Text>
                    <Text style={styles.sectionTitle}>{featuredPerson.displayName}'s Favorites</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {canEditPicks && (
                      <Pressable onPress={() => router.push('/modal/featured-picks')}>
                        <Text style={styles.editText}>Edit</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => router.push(`/modal/user-profile?id=${featuredPerson.uid}`)}>
                      <Text style={styles.viewAllText}>View All</Text>
                    </Pressable>
                  </View>
                </View>
                {featuredPicks.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Ionicons name="star-outline" size={16} color={colors.gold.muted} />
                    <Text style={styles.emptyRowText}>
                      {canEditPicks
                        ? 'No favorites yet — tap Edit to add your top picks'
                        : `${featuredPerson.displayName}'s favorites will appear here`}
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
                        style={({ pressed }) => [styles.placeCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                        onPress={() =>
                          router.push({
                            pathname: '/modal/place-detail',
                            params: { id: item.id },
                          })
                        }
                      >
                        <View>
                          <Image
                            source={{ uri: sizedImageUri(placeImageUri(item.imageURLs, item.id), 500) }}
                        recyclingKey={item.id}
                        transition={100}
                            style={styles.placeImage}
                          />
                          {item.starRating ? (
                            <View style={styles.starBadge}>
                              {Array.from({ length: item.starRating }).map((_, i) => (
                                <Ionicons key={i} name="star" size={10} color={colors.gold.primary} />
                              ))}
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.cardBrassLine} />
                        <View style={styles.placeCardContent}>
                          <Text style={styles.placeName} numberOfLines={2}>
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
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {/* Picked Users' Top 5 */}
            {pickedUsers.length > 0 && pickedUsers.map((pu) => (
              <React.Fragment key={pu.user.id}>
                <View style={styles.sectionHeader}>
                  <Pressable
                    style={styles.featuredTitleRow}
                    onPress={() => router.push(`/modal/user-profile?id=${pu.user.uid}`)}
                  >
                    <Image
                      source={{ uri: avatarUrl(pu.user.photoURL, pu.user.uid) }}
                      style={styles.pickedUserAvatar}
                    />
                    <Text style={styles.sectionTitle}>{pu.user.displayName}'s Top 5</Text>
                  </Pressable>
                </View>
                {pu.topPlaces.length === 0 ? (
                  <View style={styles.pickedUserEmpty}>
                    <Ionicons name="heart-outline" size={20} color={colors.text.tertiary} />
                    <Text style={styles.pickedUserEmptyText}>No favorites yet</Text>
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.cardList}
                  >
                    {pu.topPlaces.map((item) => (
                      <Pressable
                        key={item.id}
                        style={({ pressed }) => [styles.placeCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                        onPress={() =>
                          router.push({
                            pathname: '/modal/place-detail',
                            params: { id: item.placeId },
                          })
                        }
                      >
                        {item.placeImageURL ? (
                          <Image
                            source={{ uri: item.placeImageURL }}
                            style={styles.placeImage}
                          />
                        ) : (
                          <View style={[styles.placeImage, styles.placeImageEmpty]}>
                            <Ionicons name="image-outline" size={20} color={colors.text.tertiary} />
                          </View>
                        )}
                        <View style={styles.cardBrassLine} />
                        <View style={styles.placeCardContent}>
                          <Text style={styles.placeName} numberOfLines={2}>
                            {item.placeName}
                          </Text>
                          <View
                            style={[
                              styles.pill,
                              {
                                backgroundColor:
                                  categoryColors[item.placeCategory] + '14',
                                borderColor:
                                  categoryColors[item.placeCategory] + '30',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.pillText,
                                { color: categoryColors[item.placeCategory] },
                              ]}
                            >
                              {item.placeCategory}
                            </Text>
                          </View>
                          <View style={styles.placeLocation}>
                            <Ionicons
                              name="location-outline"
                              size={11}
                              color={colors.text.tertiary}
                            />
                            <Text style={styles.locationText}>
                              {item.placeCity}{item.placeCountry ? `, ${item.placeCountry}` : ''}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </React.Fragment>
            ))}

            {/* Best of [City] */}
            {bestOfCity && (
              <>
                <View style={styles.sectionHeader}>
                  <View style={styles.featuredTitleRow}>
                    <Text style={styles.sectionDiamond}>✦</Text>
                    <Text style={styles.sectionTitle}>Best of {bestOfCity.city}</Text>
                  </View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardList}
                >
                  {bestOfCity.places.map((item) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [styles.bestOfCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                      onPress={() =>
                        router.push({
                          pathname: '/modal/place-detail',
                          params: { id: item.id },
                        })
                      }
                    >
                      <Image
                        source={{ uri: sizedImageUri(placeImageUri(item.imageURLs, item.id), 500) }}
                        recyclingKey={item.id}
                        transition={100}
                        style={styles.bestOfImage}
                      />
                      {item.starRating ? (
                        <View style={styles.bestOfOverlay}>
                          <View style={styles.bestOfRating}>
                            {Array.from({ length: item.starRating }).map((_, i) => (
                              <Ionicons key={i} name="star" size={10} color={colors.gold.primary} />
                            ))}
                          </View>
                        </View>
                      ) : null}
                      <View style={styles.bestOfContent}>
                        <Text style={styles.bestOfName} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.bestOfCategory} numberOfLines={1}>
                          {item.city}{item.country ? `, ${item.country}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Your Favorites */}
            {myFavorites.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <View style={styles.featuredTitleRow}>
                    <Text style={styles.sectionDiamond}>✦</Text>
                    <Text style={styles.sectionTitle}>Your Favorites</Text>
                  </View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentCardList}
                >
                  {myFavorites.map((item) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [styles.recentCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                      onPress={() =>
                        router.push({
                          pathname: '/modal/place-detail',
                          params: { id: item.id },
                        })
                      }
                    >
                      <Image
                        source={{ uri: sizedImageUri(placeImageUri(item.imageURLs, item.id), 500) }}
                        recyclingKey={item.id}
                        transition={100}
                        style={styles.recentCardImage}
                      />
                      <View style={styles.recentCardOverlay}>
                        <View
                          style={[
                            styles.recentCategoryBadge,
                            { backgroundColor: categoryColors[item.category] },
                          ]}
                        >
                          <Text style={styles.recentCategoryBadgeText}>
                            {(item.subcategory || item.category).toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.recentCardContent}>
                        <Text style={styles.recentCardName} numberOfLines={2}>{item.name}</Text>
                        <View style={styles.recentCardLocation}>
                          <Ionicons name="location-outline" size={10} color={colors.text.tertiary} />
                          <Text style={styles.recentCardLocationText} numberOfLines={1}>
                            {item.city}, {item.country}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
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

            {/* Recently Added */}
            {recentlyAdded.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <View style={styles.featuredTitleRow}>
                    <Text style={styles.sectionDiamond}>✦</Text>
                    <Text style={styles.sectionTitle}>Recently Added</Text>
                  </View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardList}
                >
                  {recentlyAdded.map((item) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [styles.bestOfCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                      onPress={() => router.push({ pathname: '/modal/place-detail', params: { id: item.id } })}
                    >
                      <Image
                        source={{ uri: sizedImageUri(placeImageUri(item.imageURLs, item.id), 500) }}
                        recyclingKey={item.id}
                        transition={100}
                        style={styles.bestOfImage}
                      />
                      {item.starRating ? (
                        <View style={styles.bestOfOverlay}>
                          <View style={styles.bestOfRating}>
                            {Array.from({ length: item.starRating }).map((_, i) => (
                              <Ionicons key={i} name="star" size={10} color={colors.gold.primary} />
                            ))}
                          </View>
                        </View>
                      ) : null}
                      <View style={styles.bestOfContent}>
                        <Text style={styles.bestOfName} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.bestOfCategory} numberOfLines={1}>
                          {item.city}{item.country ? `, ${item.country}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {/* City sections render below as virtualized FlatList items */}
          </>
        )}
        </>
        }
      />

      {/* About Syrena Voyager Modal — video removed: it caused repeated
          App Store rejections on iPad where the close button was unresponsive
          because the AVPlayerLayer intercepted touches even with pointerEvents="none". */}
      <Modal
        visible={showAbout}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={handleCloseAbout}
      >
        {/* Tap-anywhere-to-close — entire backdrop is a Pressable. */}
        <Pressable style={styles.aboutOverlay} onPress={handleCloseAbout}>
          {/* Inner container with max-width so on iPad the card and X button
              stay centered together instead of the X drifting to the far edge. */}
          <View style={styles.aboutContainer} pointerEvents="box-none">
            {/* Top-right X close button — 56pt tap target, gold border. */}
            <Pressable
              onPress={handleCloseAbout}
              style={styles.aboutXButton}
              hitSlop={24}
              accessibilityLabel="Close welcome screen"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={32} color={colors.gold.primary} />
            </Pressable>

            <ScrollView
              contentContainerStyle={styles.aboutScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Card itself does NOT close on tap (so the user can read it),
                  but anything outside the card dismisses. */}
              <Pressable style={styles.aboutCard} onPress={() => {}}>
              <View style={styles.aboutFrame}>
                <View style={[styles.aboutCorner, styles.aboutCornerTL]} />
                <View style={[styles.aboutCorner, styles.aboutCornerTR]} />
                <View style={[styles.aboutCorner, styles.aboutCornerBL]} />
                <View style={[styles.aboutCorner, styles.aboutCornerBR]} />

                <Text style={styles.aboutBrand}>SYRENA VOYAGER</Text>
                <Text style={styles.aboutTagline}>Welcome to Syrena Voyager{'\n'}The best of the best</Text>
                <View style={styles.aboutDivider} />
                <Text style={styles.aboutHeading}>Why this app?</Text>
                <Text style={styles.aboutBody}>
                  Every time I land somewhere new, I end up spending hours searching for the best places to stay, eat, and explore. ChatGPT and Tripadvisor are hit or miss. The best recommendations always come from friends — people with taste, curiosity, and a spirit of adventure.{'\n\n'}
                  Syrena Voyager gathers these coveted recommendations in one place. Some are simply the best option for miles around. Most are places you can't wait to rave about to friends.{'\n\n'}
                  This app is invite-only — a trusted community of like-minded souls sharing their hidden gems.
                </Text>
                <View style={styles.aboutDivider} />
                <Pressable
                  style={styles.aboutCloseButton}
                  onPress={handleCloseAbout}
                  hitSlop={24}
                  accessibilityLabel="Close welcome screen"
                  accessibilityRole="button"
                >
                  <Text style={styles.aboutCloseText}>CLOSE</Text>
                </Pressable>
              </View>
            </Pressable>
          </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
  listFooter: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  beenStack: {
    position: 'absolute',
    left: 8,
    bottom: 62,
    flexDirection: 'row',
    alignItems: 'center',
  },
  beenAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.background.primary,
  },
  beenMore: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: '#fff',
    marginLeft: 4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  listFooterText: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
  },

  // ─── Header ───────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
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
    fontSize: 20,
    letterSpacing: 6,
    color: colors.gold.primary,
    flexShrink: 1,
  },
  sectionDiamond: {
    fontSize: 13,
    color: colors.gold.primary,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  emptyRowText: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.secondary,
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

  // ─── Concept Banner ──────────────────────────────────────────────
  conceptBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.gold.primary + '08',
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.gold.primary + '20',
  },
  conceptText: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
    letterSpacing: 0.2,
  },

  // ─── Search ───────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  nearMeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.background.tertiary,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nearMeButtonActive: {
    borderColor: colors.gold.primary + '50',
    backgroundColor: colors.gold.primary + '10',
  },
  distanceText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
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
  googleResultIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gold.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
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
  viewAllText: {
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
  featuredBioText: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
    marginTop: 2,
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
  citySectionSub: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.gold.muted,
    marginTop: 2,
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
    ...shadows.md,
  },
  placeImage: {
    width: '100%',
    height: 150,
    backgroundColor: colors.background.tertiary,
  },
  starBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 2,
    backgroundColor: colors.background.primary + 'DD',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
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

  // ─── Recent Discoveries (horizontal cards) ──────────────────────
  recentCardList: {
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
  recentCard: {
    width: 155,
    borderRadius: radius.lg,
    backgroundColor: colors.ui.cardBg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  recentCardFirst: {
    width: 175,
  },
  recentCardImage: {
    width: '100%',
    height: 110,
    backgroundColor: colors.background.tertiary,
  },
  recentCardImageEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
  },
  recentCardOverlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },
  recentCategoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recentCategoryBadgeText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 8,
    color: '#fff',
    letterSpacing: 0.8,
  },
  recentCardContent: {
    padding: spacing.sm,
    gap: 3,
  },
  recentCardName: {
    fontFamily: fonts.serif.bold,
    fontSize: 13,
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  recentCardLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  recentCardLocationText: {
    fontFamily: fonts.sans.regular,
    fontSize: 10,
    color: colors.text.tertiary,
  },

  // ─── Best of [City] cards ──────────────────────────────────────
  bestOfCard: {
    width: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.ui.cardBg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  bestOfImage: {
    width: '100%',
    height: 100,
    backgroundColor: colors.background.tertiary,
  },
  bestOfImageEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
  },
  bestOfOverlay: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  bestOfRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bestOfRatingText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.gold.primary,
  },
  bestOfContent: {
    padding: spacing.sm,
    gap: 2,
  },
  bestOfName: {
    fontFamily: fonts.serif.bold,
    fontSize: 13,
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  bestOfCategory: {
    fontFamily: fonts.sans.regular,
    fontSize: 10,
    color: colors.text.tertiary,
    textTransform: 'capitalize',
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

  // Picked Users
  pickedUserAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.gold.muted,
  },
  pickedUserEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pickedUserEmptyText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  placeImageEmpty: {
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── About Modal ──────────────────────────────────────────────────
  aboutButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.gold.muted + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aboutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(1, 9, 84, 0.97)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Centered inner container so on iPad the X button stays near the card
  // instead of drifting to the far right edge of the screen.
  aboutContainer: {
    width: '100%',
    maxWidth: 420,
    height: '100%',
    alignSelf: 'center',
    position: 'relative',
  },
  aboutVideoOverlay: {
    backgroundColor: 'rgba(1, 9, 84, 0.55)',
  },
  aboutScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    minHeight: '100%',
  },
  aboutCard: {
    backgroundColor: 'rgba(1, 9, 84, 0.82)',
    borderRadius: 4,
    width: '100%',
    maxWidth: 360,
    padding: 4,
    alignItems: 'center',
  },
  aboutFrame: {
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
    borderRadius: 2,
    paddingVertical: 32,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    position: 'relative',
  },
  aboutCorner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: colors.gold.primary,
  },
  aboutCornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
  },
  aboutCornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
  },
  aboutCornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
  },
  aboutCornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
  },
  aboutBrand: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    letterSpacing: 6,
    color: colors.gold.primary,
    marginBottom: 0,
    textAlign: 'center',
  },
  aboutTagline: {
    fontFamily: fonts.serif.regular,
    fontSize: 14,
    color: colors.gold.primary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  aboutDivider: {
    width: 50,
    height: 1,
    backgroundColor: colors.gold.muted,
    marginVertical: spacing.lg,
  },
  aboutHeading: {
    fontFamily: fonts.serif.bold,
    fontSize: 16,
    color: colors.gold.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  aboutBody: {
    fontFamily: fonts.sans.regular,
    fontSize: 13.5,
    color: colors.text.secondary,
    lineHeight: 22,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  aboutCloseButton: {
    borderWidth: 1,
    borderColor: colors.gold.primary,
    borderRadius: 2,
    paddingHorizontal: 48,
    paddingVertical: 16,
    minWidth: 160,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutCloseText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  aboutXButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  aboutDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
});
