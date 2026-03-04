import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  FlatList,
  Platform,
  Image,
  Animated,
  Dimensions,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { PlaceCategory, Place } from '../../src/types';
import { usePlacesStore, useMapStore, useFriendsStore } from '../../src/stores';
import { useLocation } from '../../src/hooks';
import { CUSTOM_MAP_STYLE, CLUSTER_RADIUS } from '../../src/constants/mapConfig';
import {
  getPlaceDetails,
  searchPlaces,
  searchNearby,
  mapGoogleTypesToCategory,
  type GooglePlaceDetails,
  type GooglePlaceSearchResult,
} from '../../src/services/googlePlaces';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;

// ---------------------------------------------------------------------------
// Category visuals
// ---------------------------------------------------------------------------

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

const categoryEmojis: Record<PlaceCategory, string> = {
  restaurant: '🍽️',
  hotel: '🏨',
  bar: '🍸',
  cafe: '☕',
  nature: '🌿',
  culture: '🏛️',
  shopping: '🛍️',
  nightlife: '🌙',
  services: '🔧',
};

const categoryLabels: Record<PlaceCategory, string> = {
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  bar: 'Bar',
  cafe: 'Cafe',
  nature: 'Nature',
  culture: 'Culture',
  shopping: 'Shopping',
  nightlife: 'Nightlife',
  services: 'Services',
};

// ---------------------------------------------------------------------------
// Custom marker bubble
// ---------------------------------------------------------------------------

function CustomMarkerView({ category }: { category: PlaceCategory }) {
  return (
    <View style={styles.markerContainer}>
      <View
        style={[
          styles.markerBubble,
          { backgroundColor: categoryColors[category] },
        ]}
      >
        <Text style={styles.markerEmoji}>{categoryEmojis[category]}</Text>
      </View>
      <View
        style={[styles.markerArrow, { borderTopColor: categoryColors[category] }]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet card shown when a marker is tapped — Michelin Guide style
// ---------------------------------------------------------------------------

function PlaceCard({
  place,
  onPress,
  onClose,
  hasBeen,
  onToggleBeen,
}: {
  place: Place;
  onPress: () => void;
  onClose: () => void;
  hasBeen: boolean;
  onToggleBeen: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [slideAnim]);

  const thumbnail = place.imageURLs?.[0];
  const hasHighRating = place.rating >= 4.5;

  return (
    <Animated.View
      style={[
        styles.cardContainer,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Gold accent line */}
      <View style={styles.cardGoldAccent} />

      <Pressable style={styles.card} onPress={onPress}>
        {/* Thumbnail */}
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Text style={{ fontSize: 24 }}>
              {categoryEmojis[place.category]}
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {place.name}
          </Text>
          <View style={styles.cardRow}>
            <View
              style={[
                styles.cardCategoryDot,
                { backgroundColor: categoryColors[place.category] },
              ]}
            />
            <Text style={styles.cardCategory}>
              {categoryLabels[place.category]}
            </Text>
          </View>
          {place.city ? (
            <View style={styles.cardRow}>
              <Ionicons
                name="location-outline"
                size={12}
                color={colors.text.tertiary}
              />
              <Text style={styles.cardCity}>
                {place.city}
                {place.country ? `, ${place.country}` : ''}
              </Text>
            </View>
          ) : null}
          {/* Rating + Been row */}
          <View style={styles.cardRow}>
            {place.rating > 0 && (
              <>
                <Ionicons
                  name="star"
                  size={12}
                  color={hasHighRating ? colors.gold.primary : colors.text.tertiary}
                />
                <Text
                  style={[
                    styles.cardRating,
                    hasHighRating && { color: colors.gold.primary },
                  ]}
                >
                  {place.rating.toFixed(1)}
                </Text>
              </>
            )}
            {(place.beenCount || 0) > 0 && (
              <>
                <Text style={styles.cardBeenDot}> · </Text>
                <Ionicons name="checkmark-circle" size={11} color={colors.text.tertiary} />
                <Text style={styles.cardBeenCount}>{place.beenCount} been</Text>
              </>
            )}
          </View>
        </View>

        {/* Been button */}
        <Pressable
          style={[styles.cardBeenButton, hasBeen && styles.cardBeenButtonActive]}
          onPress={(e) => {
            e.stopPropagation();
            onToggleBeen();
          }}
          hitSlop={4}
        >
          <Ionicons
            name={hasBeen ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={16}
            color={hasBeen ? colors.gold.primary : colors.text.tertiary}
          />
          <Text style={[styles.cardBeenText, hasBeen && styles.cardBeenTextActive]}>
            Been
          </Text>
        </Pressable>

        {/* Chevron */}
        <View style={styles.cardChevron}>
          <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
        </View>
      </Pressable>

      {/* Close */}
      <Pressable style={styles.cardClose} onPress={onClose}>
        <Ionicons name="close" size={16} color={colors.text.tertiary} />
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// POI Preview Card — shown when tapping a Google Maps POI
// ---------------------------------------------------------------------------

function PoiPreviewCard({
  details,
  isLoading,
  poiName,
  onAdd,
  onClose,
}: {
  details: GooglePlaceDetails | null;
  isLoading: boolean;
  poiName: string;
  onAdd: () => void;
  onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [slideAnim]);

  const thumbnail = details?.photos?.[0]?.url;
  const inferredCategory = details
    ? mapGoogleTypesToCategory(details.types, details.primaryType)
    : null;
  const categoryEmoji = inferredCategory
    ? categoryEmojis[inferredCategory as PlaceCategory] || '📍'
    : '📍';
  const categoryLabel = inferredCategory
    ? categoryLabels[inferredCategory as PlaceCategory] || 'Place'
    : 'Place';
  const categoryColor = inferredCategory
    ? categoryColors[inferredCategory as PlaceCategory]
    : colors.gold.primary;

  return (
    <Animated.View
      style={[
        styles.cardContainer,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Gold accent line */}
      <View style={styles.cardGoldAccent} />

      <View style={styles.card}>
        {/* Thumbnail or loading state */}
        {isLoading ? (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <ActivityIndicator size="small" color={colors.gold.primary} />
          </View>
        ) : thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Text style={{ fontSize: 24 }}>{categoryEmoji}</Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {details?.name || poiName}
          </Text>
          <View style={styles.cardRow}>
            <View
              style={[
                styles.cardCategoryDot,
                { backgroundColor: categoryColor },
              ]}
            />
            <Text style={styles.cardCategory}>{categoryLabel}</Text>
          </View>
          {(details?.city || details?.address) ? (
            <View style={styles.cardRow}>
              <Ionicons
                name="location-outline"
                size={12}
                color={colors.text.tertiary}
              />
              <Text style={styles.cardCity} numberOfLines={1}>
                {details.city
                  ? `${details.city}${details.country ? `, ${details.country}` : ''}`
                  : details.address}
              </Text>
            </View>
          ) : null}
          {details && details.rating > 0 && (
            <View style={styles.cardRow}>
              <Ionicons
                name="star"
                size={12}
                color={
                  details.rating >= 4.5
                    ? colors.gold.primary
                    : colors.text.tertiary
                }
              />
              <Text
                style={[
                  styles.cardRating,
                  details.rating >= 4.5 && { color: colors.gold.primary },
                ]}
              >
                {details.rating.toFixed(1)}
              </Text>
            </View>
          )}
        </View>

        {/* Add button */}
        <Pressable style={styles.poiAddButton} onPress={onAdd}>
          <Ionicons name="add" size={18} color={colors.background.primary} />
        </Pressable>
      </View>

      {/* Close */}
      <Pressable style={styles.cardClose} onPress={onClose}>
        <Ionicons name="close" size={16} color={colors.text.tertiary} />
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Web fallback — list view
// ---------------------------------------------------------------------------

function WebMapFallback({ places }: { places: Place[] }) {
  const router = useRouter();

  return (
    <View style={styles.webFallback}>
      <Ionicons name="map" size={64} color={colors.gold.muted} />
      <Text style={styles.webFallbackTitle}>Map View</Text>
      <Text style={styles.webFallbackText}>
        Maps are available on iOS and Android devices.
      </Text>
      <Text style={styles.webFallbackText}>
        {places.length} places pinned
      </Text>
      <View style={styles.webPlacesList}>
        {places.map((place) => (
          <Pressable
            key={place.id}
            style={styles.webPlaceItem}
            onPress={() =>
              router.push({
                pathname: '/modal/place-detail',
                params: { id: place.id },
              })
            }
          >
            <View
              style={[
                styles.webPlaceDot,
                { backgroundColor: categoryColors[place.category] },
              ]}
            >
              <Text style={{ fontSize: 12 }}>
                {categoryEmojis[place.category]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.webPlaceName}>{place.name}</Text>
              {place.city ? (
                <Text style={styles.webPlaceCity}>
                  {place.city}
                  {place.country ? `, ${place.country}` : ''}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Native map — conditionally import react-native-maps + clustering
// ---------------------------------------------------------------------------

let NativeMapView: React.ComponentType<any> | null = null;
let NativeMarker: React.ComponentType<any> | null = null;
let PROVIDER_GOOGLE: any = null;

// Detect if Google Maps is available (development build vs Expo Go)
let isGoogleMapsAvailable = false;

if (Platform.OS !== 'web') {
  try {
    const MapClustering = require('react-native-map-clustering');
    NativeMapView = MapClustering.default;
  } catch {
    // Fall back to plain MapView if clustering not available
    const Maps = require('react-native-maps');
    NativeMapView = Maps.default;
  }
  const Maps = require('react-native-maps');
  NativeMarker = Maps.Marker;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;

  // On Android, Google Maps is always bundled (even in Expo Go).
  // On iOS, Google Maps needs a custom dev build with the native SDK linked.
  // Expo Go on iOS ONLY has Apple Maps — passing PROVIDER_GOOGLE crashes.
  if (Platform.OS === 'android') {
    isGoogleMapsAvailable = true;
  } else if (Platform.OS === 'ios') {
    // Check the native module directly — most reliable way
    const { NativeModules } = require('react-native');
    isGoogleMapsAvailable = !!NativeModules.AIRGoogleMapManager;
  }
}

interface NativeMapProps {
  places: Place[];
  userLocation: { latitude: number; longitude: number } | null;
  mapRef: React.MutableRefObject<any>;
}

function NativeMap({ places, userLocation, mapRef }: NativeMapProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { beenPlaceIds, toggleBeen } = usePlacesStore();
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [tempMarker, setTempMarker] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // POI tap state
  const [poiDetails, setPoiDetails] = useState<GooglePlaceDetails | null>(null);
  const [poiName, setPoiName] = useState<string>('');
  const [isLoadingPoi, setIsLoadingPoi] = useState(false);
  const [showPoiCard, setShowPoiCard] = useState(false);

  // Search overlay state
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GooglePlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'text' | 'nearby'>('text');
  const [longPressCoordinate, setLongPressCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  // Compute initial region: user location > first place > Warsaw default
  const initialRegion = useMemo(() => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    const firstPlace = places[0];
    if (firstPlace) {
      return {
        latitude: firstPlace.location.latitude,
        longitude: firstPlace.location.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    return {
      latitude: 52.2297,
      longitude: 21.0122,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [userLocation, places]);

  if (!NativeMapView || !NativeMarker) return <WebMapFallback places={places} />;

  const MapViewComponent = NativeMapView;
  const MarkerComponent = NativeMarker;

  const dismissPoi = () => {
    setShowPoiCard(false);
    setPoiDetails(null);
    setIsLoadingPoi(false);
  };

  const handleMarkerPress = (place: Place) => {
    setSelectedPlace(place);
    setTempMarker(null);
    dismissPoi();

    mapRef.current?.animateToRegion(
      {
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      350,
    );
  };

  const handleLongPress = async (e: any) => {
    const coordinate = e.nativeEvent.coordinate;
    if (!coordinate) return;

    // Haptic feedback for premium feel
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setTempMarker(coordinate);
    setSelectedPlace(null);
    dismissPoi();

    // Show nearby suggestions instead of immediately navigating
    setLongPressCoordinate(coordinate);
    setSearchMode('nearby');
    setSearchExpanded(true);
    setIsSearching(true);
    setSearchQuery('');

    const nearbyResults = await searchNearby(
      coordinate.latitude,
      coordinate.longitude,
      200,
      8,
    );
    setSearchResults(nearbyResults);
    setIsSearching(false);
  };

  // --- Search helpers ---
  const dismissSearch = () => {
    setSearchExpanded(false);
    setSearchQuery('');
    setSearchResults([]);
    setLocalMatches([]);
    setIsSearching(false);
    setLongPressCoordinate(null);
    Keyboard.dismiss();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const handleSearchToggle = () => {
    if (searchExpanded) {
      dismissSearch();
    } else {
      setSearchExpanded(true);
      dismissPoi();
      setSelectedPlace(null);
      setTimeout(() => searchInputRef.current?.focus(), 150);
    }
  };

  // Local saved places matching the search query
  const [localMatches, setLocalMatches] = useState<Place[]>([]);

  const handleSearchQueryChange = (text: string) => {
    setSearchQuery(text);
    setSearchMode('text');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setSearchResults([]);
      setLocalMatches([]);
      setIsSearching(false);
      return;
    }

    // Immediately filter saved places by name, city, country, or tags
    const q = text.trim().toLowerCase();
    const matched = places.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.country?.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q)),
    );
    setLocalMatches(matched.slice(0, 5));

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchPlaces(
        text.trim(),
        userLocation?.latitude,
        userLocation?.longitude,
        5,
      );
      setSearchResults(results);
      setIsSearching(false);
    }, 400);
  };

  const handleSearchResultSelect = async (result: GooglePlaceSearchResult) => {
    dismissSearch();

    // Animate map to result location
    mapRef.current?.animateToRegion(
      {
        latitude: result.latitude,
        longitude: result.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      350,
    );

    // Show PoiPreviewCard with loading state
    setSelectedPlace(null);
    setTempMarker(null);
    setPoiName(result.name);
    setPoiDetails(null);
    setIsLoadingPoi(true);
    setShowPoiCard(true);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Fetch full details
    const details = await getPlaceDetails(result.placeId);
    setPoiDetails(details);
    setIsLoadingPoi(false);
  };

  const handleMapPress = async (e: any) => {
    // Dismiss cards first
    if (selectedPlace) {
      setSelectedPlace(null);
      return;
    }
    if (showPoiCard) {
      dismissPoi();
      return;
    }
    if (searchExpanded) {
      dismissSearch();
      return;
    }
    setTempMarker(null);

    // --- Apple Maps: tap-to-search nearby ---
    if (!isGoogleMapsAvailable) {
      const coordinate = e.nativeEvent?.coordinate;
      if (!coordinate) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      setSearchMode('nearby');
      setSearchExpanded(true);
      setIsSearching(true);

      const nearbyResults = await searchNearby(
        coordinate.latitude,
        coordinate.longitude,
        200,
        5,
      );
      setSearchResults(nearbyResults);
      setIsSearching(false);
    }
  };

  const handleCardPress = () => {
    if (!selectedPlace) return;
    router.push({
      pathname: '/modal/place-detail',
      params: { id: selectedPlace.id },
    });
  };

  const handleCardClose = () => {
    setSelectedPlace(null);
  };

  // --- POI tap (Google Maps built-in places) ---
  const handlePoiClick = async (e: any) => {
    const poi = e.nativeEvent;
    if (!poi?.placeId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Dismiss any existing card
    setSelectedPlace(null);
    setTempMarker(null);

    // Show card with loading state immediately
    setPoiName(poi.name || 'Place');
    setPoiDetails(null);
    setIsLoadingPoi(true);
    setShowPoiCard(true);

    // Animate to POI location
    if (poi.coordinate) {
      mapRef.current?.animateToRegion(
        {
          latitude: poi.coordinate.latitude,
          longitude: poi.coordinate.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        350,
      );
    }

    // Fetch full details from Google Places API
    const details = await getPlaceDetails(poi.placeId);
    setPoiDetails(details);
    setIsLoadingPoi(false);
  };

  const handleAddPoi = () => {
    // Navigate to add-place with all pre-filled data from the POI
    const d = poiDetails;
    const params: Record<string, string> = {};

    if (d) {
      params.latitude = d.latitude.toString();
      params.longitude = d.longitude.toString();
      params.poiName = d.name;
      params.poiAddress = d.address;
      params.poiCity = d.city;
      params.poiCountry = d.country;
      params.poiRating = d.rating.toString();
      params.poiRatingCount = d.ratingCount.toString();

      // Map Google types to our category
      const category = mapGoogleTypesToCategory(d.types, d.primaryType);
      if (category) params.poiCategory = category;

      // Send photo URLs (first 4)
      if (d.photos.length > 0) {
        params.poiPhotos = d.photos
          .slice(0, 4)
          .map((p) => p.url)
          .join('|||');
      }

      if (d.placeId) params.googlePlaceId = d.placeId;

      // Pass raw Google types for auto-tag generation
      if (d.types.length > 0) params.poiTypes = d.types.join(',');
      if (d.primaryType) params.poiPrimaryType = d.primaryType;
    } else {
      // Fallback: just send the name
      params.poiName = poiName;
    }

    setShowPoiCard(false);
    setPoiDetails(null);

    router.push({
      pathname: '/modal/add-place',
      params,
    } as any);
  };

  return (
    <>
      <MapViewComponent
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        // Use Google Maps when available (dev builds) for POI tap support
        {...(isGoogleMapsAvailable ? { provider: PROVIDER_GOOGLE } : {})}
        showsUserLocation
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        userInterfaceStyle="dark"
        customMapStyle={isGoogleMapsAvailable ? CUSTOM_MAP_STYLE : undefined}
        onLongPress={handleLongPress}
        onPress={handleMapPress}
        onPoiClick={handlePoiClick}
        clusterColor={colors.gold.primary}
        clusterTextColor={colors.background.primary}
        radius={CLUSTER_RADIUS}
        minZoomLevel={2}
        maxZoomLevel={20}
      >
        {places.map((place) => (
          <MarkerComponent
            key={place.id}
            coordinate={{
              latitude: place.location.latitude,
              longitude: place.location.longitude,
            }}
            onPress={() => handleMarkerPress(place)}
            tracksViewChanges={false}
          >
            <CustomMarkerView category={place.category} />
          </MarkerComponent>
        ))}

        {/* Temporary marker from long-press */}
        {tempMarker && (
          <MarkerComponent
            coordinate={tempMarker}
            pinColor={colors.gold.primary}
          >
            <View style={styles.tempMarkerContainer}>
              <View style={styles.tempMarkerBubble}>
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.tempMarkerArrow} />
            </View>
          </MarkerComponent>
        )}
      </MapViewComponent>

      {/* Search pill / overlay */}
      {!searchExpanded ? (
        <Pressable
          style={[styles.searchPill, { top: insets.top + 56 }]}
          onPress={handleSearchToggle}
        >
          <Ionicons name="search" size={16} color={colors.text.tertiary} />
          <Text style={styles.searchPillText}>Search places</Text>
        </Pressable>
      ) : (
        <View style={[styles.searchOverlay, { top: insets.top + 56 }]}>
          {/* Gold accent */}
          <View style={styles.searchOverlayAccent} />

          {/* Input row */}
          <View style={styles.searchInputRow}>
            <Ionicons name="search" size={18} color={colors.text.tertiary} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearchQueryChange}
              placeholder={
                searchMode === 'nearby'
                  ? 'Places nearby — or type to search'
                  : 'Search for a place…'
              }
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            <Pressable onPress={handleSearchToggle} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.text.tertiary} />
            </Pressable>
          </View>

          {/* Saved place matches */}
          {localMatches.length > 0 && searchMode === 'text' && (
            <>
              <Text style={styles.searchResultsLabel}>YOUR PLACES</Text>
              {localMatches.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.searchResultRow}
                  onPress={() => {
                    dismissSearch();
                    setSelectedPlace(p);
                    const lat = p.location?.latitude ?? 0;
                    const lng = p.location?.longitude ?? 0;
                    if (lat && lng) {
                      mapRef.current?.animateToRegion(
                        { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
                        350,
                      );
                    }
                  }}
                >
                  {p.imageURLs?.[0] ? (
                    <Image source={{ uri: p.imageURLs[0] }} style={styles.searchResultImage} />
                  ) : (
                    <View style={[styles.searchResultImage, styles.searchResultImagePlaceholder]}>
                      <Ionicons name="location" size={18} color={colors.text.tertiary} />
                    </View>
                  )}
                  <View style={styles.searchResultInfo}>
                    <Text style={styles.searchResultName} numberOfLines={1}>{p.name}</Text>
                    <View style={styles.searchResultMeta}>
                      <View style={[styles.searchResultDot, { backgroundColor: categoryColors[p.category] || colors.gold.primary }]} />
                      <Text style={styles.searchResultCategory}>{p.city || categoryLabels[p.category] || 'Place'}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </Pressable>
              ))}
              <View style={styles.searchResultSeparator} />
            </>
          )}

          {/* Results */}
          {isSearching && localMatches.length === 0 ? (
            <View style={styles.searchLoading}>
              <ActivityIndicator size="small" color={colors.gold.primary} />
              <Text style={styles.searchLoadingText}>
                {searchMode === 'nearby' ? 'Finding nearby places…' : 'Searching…'}
              </Text>
            </View>
          ) : searchResults.length > 0 ? (
            <>
              <Text style={styles.searchResultsLabel}>
                {searchMode === 'nearby' ? 'PLACES NEARBY' : 'SEARCH RESULTS'}
              </Text>
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.placeId}
                keyboardShouldPersistTaps="handled"
                style={styles.searchResultsList}
                renderItem={({ item }) => {
                  const cat = mapGoogleTypesToCategory(item.types, item.primaryType);
                  const catColor = cat
                    ? categoryColors[cat as PlaceCategory]
                    : colors.gold.primary;
                  const catLabel = cat
                    ? categoryLabels[cat as PlaceCategory] || 'Place'
                    : 'Place';
                  const thumb = item.photos[0]?.url;

                  return (
                    <Pressable
                      style={styles.searchResultRow}
                      onPress={() => handleSearchResultSelect(item)}
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.searchResultImage}
                        />
                      ) : (
                        <View
                          style={[
                            styles.searchResultImage,
                            styles.searchResultImagePlaceholder,
                          ]}
                        >
                          <Ionicons
                            name="location"
                            size={18}
                            color={colors.text.tertiary}
                          />
                        </View>
                      )}
                      <View style={styles.searchResultInfo}>
                        <Text style={styles.searchResultName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View style={styles.searchResultMeta}>
                          <View
                            style={[
                              styles.searchResultDot,
                              { backgroundColor: catColor },
                            ]}
                          />
                          <Text style={styles.searchResultCategory}>
                            {catLabel}
                          </Text>
                          {item.rating > 0 && (
                            <>
                              <Text style={styles.searchResultSep}> · </Text>
                              <Ionicons
                                name="star"
                                size={11}
                                color={
                                  item.rating >= 4.5
                                    ? colors.gold.primary
                                    : colors.text.tertiary
                                }
                              />
                              <Text style={styles.searchResultRating}>
                                {item.rating.toFixed(1)}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.text.tertiary}
                      />
                    </Pressable>
                  );
                }}
                ItemSeparatorComponent={() => (
                  <View style={styles.searchResultSeparator} />
                )}
              />
              {longPressCoordinate && (
                <Pressable
                  style={styles.addCustomPlaceBtn}
                  onPress={() => {
                    const coord = longPressCoordinate;
                    dismissSearch();
                    setTempMarker(null);
                    router.push({
                      pathname: '/modal/add-place',
                      params: {
                        latitude: coord.latitude.toString(),
                        longitude: coord.longitude.toString(),
                      },
                    } as any);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.gold.primary} />
                  <Text style={styles.addCustomPlaceText}>Add a custom place here</Text>
                </Pressable>
              )}
            </>
          ) : searchQuery.length >= 2 || searchMode === 'nearby' ? (
            <View style={styles.searchEmpty}>
              <Ionicons
                name="location-outline"
                size={24}
                color={colors.text.tertiary}
              />
              <Text style={styles.searchEmptyText}>
                No places found{searchMode === 'nearby' ? ' nearby' : ''}.{'\n'}
                {searchMode === 'nearby' ? 'Try searching by name above.' : 'Try a different search.'}
              </Text>
              {longPressCoordinate && (
                <Pressable
                  style={styles.addCustomPlaceBtnEmpty}
                  onPress={() => {
                    const coord = longPressCoordinate;
                    dismissSearch();
                    setTempMarker(null);
                    router.push({
                      pathname: '/modal/add-place',
                      params: {
                        latitude: coord.latitude.toString(),
                        longitude: coord.longitude.toString(),
                      },
                    } as any);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.gold.primary} />
                  <Text style={styles.addCustomPlaceText}>Add a custom place here</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
      )}

      {/* Bottom sheet card — existing saved place */}
      {selectedPlace && !showPoiCard && (
        <View
          style={[styles.cardWrapper, { bottom: 24 + insets.bottom }]}
          pointerEvents="box-none"
        >
          <PlaceCard
            place={selectedPlace}
            onPress={handleCardPress}
            onClose={handleCardClose}
            hasBeen={beenPlaceIds.includes(selectedPlace.id)}
            onToggleBeen={() => toggleBeen(selectedPlace.id)}
          />
        </View>
      )}

      {/* Bottom sheet card — Google Maps POI */}
      {showPoiCard && (
        <View
          style={[styles.cardWrapper, { bottom: 24 + insets.bottom }]}
          pointerEvents="box-none"
        >
          <PoiPreviewCard
            details={poiDetails}
            isLoading={isLoadingPoi}
            poiName={poiName}
            onAdd={handleAddPoi}
            onClose={dismissPoi}
          />
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);
  const [hintDismissed, setHintDismissed] = useState(false);

  const { places, beenPlaceIds, fetchPlaces, fetchBeenPlaces, toggleBeen } = usePlacesStore();
  const { activeFilters, activeBudgetFilters, selectedFriendId, friendPlaceIds, clearFriendFilter } = useMapStore();
  const { friends } = useFriendsStore();
  const { location, requestLocation } = useLocation();

  const selectedFriend = selectedFriendId
    ? friends.find((f) => f.uid === selectedFriendId)
    : null;

  useEffect(() => {
    fetchPlaces();
    fetchBeenPlaces();
  }, [fetchPlaces]);

  // Filter places by active categories, budget tiers, and friend from the map filter store
  const filteredPlaces = useMemo(() => {
    if (activeFilters.length === 0) return [];
    let result = places;
    if (activeFilters.length < 8) {
      result = result.filter((p) => activeFilters.includes(p.category));
    }
    if (activeBudgetFilters.length < 4 && activeBudgetFilters.length > 0) {
      result = result.filter((p) => !p.budgetTier || activeBudgetFilters.includes(p.budgetTier));
    }
    if (selectedFriendId) {
      if (friendPlaceIds.length === 0) return [];
      const friendSet = new Set(friendPlaceIds);
      result = result.filter((p) => friendSet.has(p.id));
    }
    return result;
  }, [places, activeFilters, activeBudgetFilters, selectedFriendId, friendPlaceIds]);

  // Whether filters are actively narrowed
  const hasActiveFilter = activeFilters.length < 8 && activeFilters.length > 0 || !!selectedFriendId;

  const goToCurrentLocation = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const coords = await requestLocation();
    if (coords && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500,
      );
    }
  }, [requestLocation]);

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <WebMapFallback places={filteredPlaces} />
      ) : (
        <NativeMap
          places={filteredPlaces}
          userLocation={location}
          mapRef={mapRef}
        />
      )}

      {/* Header Overlay */}
      <View style={[styles.headerOverlay, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Map</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={[
              styles.headerButton,
              hasActiveFilter && styles.headerButtonActive,
            ]}
            onPress={() => router.push('/modal/filter-map')}
          >
            <Ionicons
              name="options"
              size={22}
              color={hasActiveFilter ? colors.gold.primary : colors.text.primary}
            />
            {hasActiveFilter && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>
                  {activeFilters.length}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={styles.headerAvatarButton}
            onPress={() => router.push('/modal/profile')}
          >
            <View style={styles.headerAvatarPlaceholder}>
              <Ionicons name="person" size={16} color={colors.gold.primary} />
            </View>
          </Pressable>
        </View>
      </View>

      {/* Friend filter bar */}
      {selectedFriend && (
        <View style={[styles.friendFilterBar, { top: insets.top + 52 }]}>
          <Ionicons name="person" size={14} color={colors.gold.primary} />
          <Text style={styles.friendFilterText} numberOfLines={1}>
            {selectedFriend.displayName}'s picks
          </Text>
          <Pressable
            onPress={clearFriendFilter}
            hitSlop={8}
            style={styles.friendFilterClear}
          >
            <Ionicons name="close" size={14} color={colors.text.primary} />
          </Pressable>
        </View>
      )}

      {/* FABs — native only */}
      {Platform.OS !== 'web' && (
        <>
          {/* Add Place FAB */}
          <Pressable
            style={[styles.fab, { bottom: 156 + insets.bottom }]}
            onPress={() => router.push('/modal/add-place')}
          >
            <Ionicons name="add" size={24} color={colors.gold.primary} />
          </Pressable>

          {/* Location FAB */}
          <Pressable
            style={[styles.fab, { bottom: 100 + insets.bottom }]}
            onPress={goToCurrentLocation}
          >
            <Ionicons name="locate" size={22} color={colors.gold.primary} />
          </Pressable>
        </>
      )}

      {/* Long-press hint — shown only when no places exist, tap to dismiss */}
      {filteredPlaces.length === 0 && Platform.OS !== 'web' && !hintDismissed && (
        <Pressable style={styles.emptyHint} onPress={() => setHintDismissed(true)}>
          <Ionicons name="finger-print-outline" size={28} color={colors.gold.primary} />
          <Text style={styles.emptyHintTitle}>No places yet</Text>
          <Text style={styles.emptyHintText}>
            Tap any place on the map to add it, or long-press to drop a pin
          </Text>
          <Text style={styles.emptyHintDismiss}>Tap to dismiss</Text>
        </Pressable>
      )}
    </View>
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
  map: {
    flex: 1,
  },

  // Header
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.primary + 'DD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendFilterBar: {
    position: 'absolute',
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.gold.primary + '25',
    borderWidth: 1,
    borderColor: colors.gold.primary + '50',
  },
  friendFilterText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.gold.primary,
    maxWidth: 160,
  },
  friendFilterClear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.background.primary + 'AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerButtonActive: {
    borderWidth: 1.5,
    borderColor: colors.gold.primary + '60',
  },
  filterBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 9,
    color: colors.background.primary,
  },
  headerAvatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.primary + 'DD',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
  },

  // Markers
  markerContainer: {
    alignItems: 'center',
  },
  markerBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    ...shadows.sm,
  },
  markerEmoji: {
    fontSize: 18,
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },

  // Temp marker (long-press)
  tempMarkerContainer: {
    alignItems: 'center',
  },
  tempMarkerBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    ...shadows.md,
  },
  tempMarkerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.gold.primary,
    marginTop: -1,
  },

  // FABs
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background.primary + 'EE',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.ui.border,
    ...shadows.sm,
  },

  // Bottom sheet card
  cardWrapper: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  cardContainer: {
    width: CARD_WIDTH,
    maxWidth: 420,
  },
  cardGoldAccent: {
    height: 2,
    backgroundColor: colors.gold.primary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginHorizontal: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.ui.border,
    padding: spacing.sm,
    gap: spacing.md,
    ...shadows.md,
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
  },
  cardImagePlaceholder: {
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontFamily: fonts.serif.bold,
    fontSize: 16,
    color: colors.text.primary,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardCategoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardCategory: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.secondary,
  },
  cardCity: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  cardRating: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  cardBeenDot: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
  },
  cardBeenCount: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    marginLeft: 2,
  },
  cardBeenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    alignSelf: 'center',
  },
  cardBeenButtonActive: {
    borderColor: colors.gold.primary + '50',
    backgroundColor: colors.gold.primary + '10',
  },
  cardBeenText: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardBeenTextActive: {
    color: colors.gold.primary,
  },
  cardChevron: {
    paddingRight: spacing.xs,
  },
  cardClose: {
    position: 'absolute',
    top: 8,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  poiAddButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.xs,
  },

  // Search pill (collapsed)
  searchPill: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.background.secondary + 'EE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
    ...shadows.sm,
  },
  searchPillText: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.tertiary,
  },

  // Search overlay (expanded)
  searchOverlay: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.ui.border,
    overflow: 'hidden',
    maxHeight: 380,
    ...shadows.md,
  },
  searchOverlayAccent: {
    height: 2,
    backgroundColor: colors.gold.primary,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.primary,
    paddingVertical: 4,
  },
  searchLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  searchLoadingText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  searchResultsLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.gold.primary,
    letterSpacing: 2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  searchResultsList: {
    maxHeight: 280,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  searchResultImage: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
  },
  searchResultImagePlaceholder: {
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultInfo: {
    flex: 1,
    gap: 2,
  },
  searchResultName: {
    fontFamily: fonts.serif.bold,
    fontSize: 15,
    color: colors.text.primary,
  },
  searchResultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchResultDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  searchResultCategory: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.secondary,
  },
  searchResultSep: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  searchResultRating: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.tertiary,
    marginLeft: 2,
  },
  searchResultSeparator: {
    height: 1,
    backgroundColor: colors.ui.border,
    marginLeft: spacing.md + 48 + spacing.md,
  },
  searchEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  searchEmptyText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  addCustomPlaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ui.border,
  },
  addCustomPlaceBtnEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.gold.primary + '15',
    borderRadius: radius.md,
  },
  addCustomPlaceText: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.gold.primary,
  },

  // Empty hint
  emptyHint: {
    position: 'absolute',
    top: '40%',
    left: spacing.xl,
    right: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background.primary + 'CC',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold.primary + '30',
  },
  emptyHintTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
  },
  emptyHintText: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyHintDismiss: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.gold.muted,
    marginTop: spacing.xs,
  },

  // Web Fallback
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 80,
  },
  webFallbackTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 22,
    color: colors.text.primary,
    marginTop: spacing.lg,
  },
  webFallbackText: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  webPlacesList: {
    marginTop: spacing.xl,
    width: '100%',
    maxWidth: 400,
    gap: spacing.sm,
  },
  webPlaceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ui.cardBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  webPlaceDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webPlaceName: {
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    color: colors.text.primary,
  },
  webPlaceCity: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 1,
  },
});
