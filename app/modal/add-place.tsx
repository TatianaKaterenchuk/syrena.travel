import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Image as RNImage } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeoPoint, Timestamp } from 'firebase/firestore';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { PlaceCategory, Place, UserPlace, BudgetTier, StarRating, BUDGET_LABELS, BUDGET_ICONS, STAR_LABELS } from '../../src/types';
import { pickImage, takePhoto } from '../../src/utils/imagePicker';
import { uploadImage } from '../../src/services/firebase/storage';
import { usePlacesStore } from '../../src/stores/usePlacesStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { reverseGeocode } from '../../src/utils/geocoding';
import {
  searchPlacePhotos,
  searchPlaces as googleSearchPlaces,
  getPlaceDetails,
  mapGoogleTypesToCategory,
  PlacePhoto,
  GooglePlaceSearchResult,
} from '../../src/services/googlePlaces';
import * as Haptics from 'expo-haptics';
import { useLocation } from '../../src/hooks/useLocation';
import { generateTags, expandManualTags } from '../../src/utils/generateTags';

const CATEGORIES: { key: PlaceCategory; label: string; icon: string }[] = [
  { key: 'restaurant', label: 'Eat', icon: 'restaurant-outline' },
  { key: 'lodging', label: 'Stay', icon: 'bed-outline' },
  { key: 'bar', label: 'Bar', icon: 'wine-outline' },
  { key: 'cafe', label: 'Café', icon: 'cafe-outline' },
  { key: 'club', label: 'Club', icon: 'musical-notes-outline' },
  { key: 'culture', label: 'Culture', icon: 'color-palette-outline' },
  { key: 'nature', label: 'Nature', icon: 'leaf-outline' },
  { key: 'shop', label: 'Shop', icon: 'bag-outline' },
  { key: 'services', label: 'Services', icon: 'construct-outline' },
];

const BUDGET_TIERS: { key: BudgetTier; label: string; icon: string }[] = [
  { key: 1, label: BUDGET_LABELS[1], icon: BUDGET_ICONS[1] },
  { key: 2, label: BUDGET_LABELS[2], icon: BUDGET_ICONS[2] },
  { key: 3, label: BUDGET_LABELS[3], icon: BUDGET_ICONS[3] },
  { key: 4, label: BUDGET_LABELS[4], icon: BUDGET_ICONS[4] },
];

export default function AddPlaceModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addPlace = usePlacesStore((s) => s.addPlace);
  const savePlace = usePlacesStore((s) => s.savePlace);
  const allPlaces = usePlacesStore((s) => s.places);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  // ---------- Route params (from map long-press OR POI tap) ----------
  const params = useLocalSearchParams<{
    latitude?: string;
    longitude?: string;
    poiName?: string;
    poiAddress?: string;
    poiCity?: string;
    poiCountry?: string;
    poiRating?: string;
    poiRatingCount?: string;
    poiCategory?: string;
    poiPhotos?: string;
    googlePlaceId?: string;
    poiTypes?: string;
    poiPrimaryType?: string;
  }>();
  const poiGoogleTypes = params.poiTypes ? params.poiTypes.split(',') : [];
  const poiPrimaryType = params.poiPrimaryType || undefined;
  const paramLat = params.latitude ? parseFloat(params.latitude) : null;
  const paramLng = params.longitude ? parseFloat(params.longitude) : null;
  const isPoiPrefilled = !!params.poiName;

  // ---------- Fallback: current user location ----------
  const {
    location: userLocation,
    isLoading: isLocationLoading,
  } = useLocation();

  // Resolved coordinates: prefer route params, fall back to device location
  const latitude = paramLat ?? userLocation?.latitude ?? null;
  const longitude = paramLng ?? userLocation?.longitude ?? null;

  // ---------- Pre-filled POI photos (from route params) ----------
  const poiPhotoUrls = params.poiPhotos ? params.poiPhotos.split('|||') : [];

  // ---------- Form state ----------
  const [name, setName] = useState(params.poiName || '');
  const [description, setDescription] = useState('');
  const [mustTry, setMustTry] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<PlaceCategory | null>(
      (params.poiCategory as PlaceCategory) || null,
    );
  const [address, setAddress] = useState(params.poiAddress || '');
  const [city, setCity] = useState(params.poiCity || '');
  const [country, setCountry] = useState(params.poiCountry || '');
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedBudget, setSelectedBudget] = useState<BudgetTier | null>(null);
  const [selectedStars, setSelectedStars] = useState<StarRating | null>(null);
  const [photos, setPhotos] = useState<string[]>(poiPhotoUrls);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoAspects, setPhotoAspects] = useState<Record<string, number>>({});

  // Measure aspect ratio when photos change (RNImage.getSize — expo-image
  // has no getSize static; the RN one works for both remote and local URIs)
  useEffect(() => {
    photos.forEach((uri) => {
      if (!photoAspects[uri]) {
        RNImage.getSize(
          uri,
          (w: number, h: number) => {
            setPhotoAspects((prev) => ({ ...prev, [uri]: w / h }));
          },
          () => {
            // Fallback to 4:3 if can't measure
            setPhotoAspects((prev) => ({ ...prev, [uri]: 4 / 3 }));
          },
        );
      }
    });
  }, [photos]);

  // Track which photo URIs are remote URLs (Google Places) vs local files
  const [remotePhotoUrls, setRemotePhotoUrls] = useState<Set<string>>(
    new Set(poiPhotoUrls),
  );

  // ---------- Google Places autocomplete ----------
  const [placeSuggestions, setPlaceSuggestions] = useState<GooglePlaceSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [selectedGooglePlaceId, setSelectedGooglePlaceId] = useState<string | null>(
    params.googlePlaceId || null,
  );
  const [resolvedLat, setResolvedLat] = useState<number | null>(paramLat);
  const [resolvedLng, setResolvedLng] = useState<number | null>(paramLng);
  const suggestionDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleNameChange = useCallback((text: string) => {
    setName(text);
    // Clear the linked place when user edits the name
    setSelectedGooglePlaceId(null);

    // Don't search if we already have a POI or if text is too short
    if (isPoiPrefilled || text.trim().length < 3) {
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setShowSuggestions(true);
    if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
    suggestionDebounceRef.current = setTimeout(async () => {
      setIsSearchingSuggestions(true);
      try {
        const results = await googleSearchPlaces(
          text.trim(),
          latitude ?? undefined,
          longitude ?? undefined,
          5,
        );
        setPlaceSuggestions(results);
      } catch {
        setPlaceSuggestions([]);
      } finally {
        setIsSearchingSuggestions(false);
      }
    }, 400);
  }, [isPoiPrefilled, latitude, longitude]);

  const handleSelectSuggestion = useCallback(async (suggestion: GooglePlaceSearchResult) => {
    setShowSuggestions(false);
    setPlaceSuggestions([]);
    setName(suggestion.name);
    setSelectedGooglePlaceId(suggestion.placeId);

    // Set coordinates from the suggestion
    setResolvedLat(suggestion.latitude);
    setResolvedLng(suggestion.longitude);

    // Set photos from suggestion
    if (suggestion.photos.length > 0) {
      const photoUrls = suggestion.photos.map((p) => p.url);
      setPhotos(photoUrls);
      setRemotePhotoUrls(new Set(photoUrls));
    }

    // Map category from types
    const mappedCategory = mapGoogleTypesToCategory(suggestion.types, suggestion.primaryType);
    if (mappedCategory) {
      setSelectedCategory(mappedCategory as PlaceCategory);
    }

    // Fetch full details for address, city, country
    try {
      const details = await getPlaceDetails(suggestion.placeId);
      if (details) {
        setAddress(details.address || '');
        setCity(details.city || '');
        setCountry(details.country || '');
        // Get more photos from details
        if (details.photos.length > suggestion.photos.length) {
          const detailPhotoUrls = details.photos.map((p) => p.url);
          setPhotos(detailPhotoUrls);
          setRemotePhotoUrls(new Set(detailPhotoUrls));
        }
      }
    } catch {
      // Address will be filled by suggestion.address
      setAddress(suggestion.address || '');
    }
  }, []);

  // Use resolved coordinates (from suggestion or params), falling back to user location
  const finalLat = resolvedLat ?? latitude;
  const finalLng = resolvedLng ?? longitude;

  // ---------- Auto-generated tags ----------
  const autoTags = useMemo(() => {
    if (!selectedCategory) return [];
    return generateTags({
      category: selectedCategory,
      budgetTier: selectedBudget,
      city,
      country,
      googleTypes: poiGoogleTypes.length > 0 ? poiGoogleTypes : undefined,
      googlePrimaryType: poiPrimaryType,
    });
  }, [selectedCategory, selectedBudget, city, country]);

  // ---------- Tag input helpers ----------
  const handleTagInputChange = (text: string) => {
    if (text.includes(',')) {
      const parts = text.split(',');
      const newTag = parts[0].trim().toLowerCase();
      if (newTag && !manualTags.includes(newTag)) {
        setManualTags((prev) => [...prev, newTag]);
      }
      setTagInput(parts.slice(1).join(','));
    } else {
      setTagInput(text);
    }
  };

  const handleTagInputSubmit = () => {
    const trimmed = tagInput.trim().toLowerCase().replace(/,/g, '');
    if (trimmed && !manualTags.includes(trimmed)) {
      setManualTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  };

  const removeManualTag = (tag: string) => {
    setManualTags((prev) => prev.filter((t) => t !== tag));
  };

  // ---------- Reverse geocoding (skip if POI already provided address) ----------
  const [isGeocoding, setIsGeocoding] = useState(false);

  useEffect(() => {
    // Skip reverse geocoding if POI already provided city info
    if (isPoiPrefilled && params.poiCity) return;
    if (latitude == null || longitude == null) return;

    let cancelled = false;
    (async () => {
      setIsGeocoding(true);
      try {
        const result = await reverseGeocode(latitude, longitude);
        if (!cancelled && result) {
          // Only auto-fill if the user hasn't typed anything yet
          setAddress((prev) => (prev ? prev : result.address));
          setCity((prev) => (prev ? prev : result.city));
          setCountry((prev) => (prev ? prev : result.country));
        }
      } finally {
        if (!cancelled) setIsGeocoding(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, isPoiPrefilled, params.poiCity]);

  // ---------- Google Places image search ----------
  const [searchPhotos, setSearchPhotos] = useState<PlacePhoto[]>([]);
  const [selectedSearchIds, setSelectedSearchIds] = useState<Set<string>>(
    new Set(),
  );
  const [isSearchingPhotos, setIsSearchingPhotos] = useState(false);

  const handleSearchImages = useCallback(async () => {
    const query = [name.trim(), city.trim()].filter(Boolean).join(' ');
    if (!query) {
      Alert.alert(
        'Enter a Name',
        'Please enter a place name first so we can search for photos.',
      );
      return;
    }

    setIsSearchingPhotos(true);
    try {
      const results = await searchPlacePhotos(
        query,
        finalLat ?? undefined,
        finalLng ?? undefined,
      );
      setSearchPhotos(results);
      if (results.length === 0) {
        Alert.alert('No Photos', 'No photos found for this place.');
      }
    } catch {
      Alert.alert('Error', 'Could not search for photos. Please try again.');
    } finally {
      setIsSearchingPhotos(false);
    }
  }, [name, city, finalLat, finalLng]);

  const toggleSearchPhoto = useCallback(
    (photo: PlacePhoto) => {
      setSelectedSearchIds((prev) => {
        const next = new Set(prev);
        if (next.has(photo.id)) {
          // Deselect — remove from photos array and remote tracking
          next.delete(photo.id);
          setPhotos((p) => p.filter((uri) => uri !== photo.url));
          setRemotePhotoUrls((r) => {
            const updated = new Set(r);
            updated.delete(photo.url);
            return updated;
          });
        } else {
          // Select — add to photos array and mark as remote
          next.add(photo.id);
          setPhotos((p) => [...p, photo.url]);
          setRemotePhotoUrls((r) => {
            const updated = new Set(r);
            updated.add(photo.url);
            return updated;
          });
        }
        return next;
      });
    },
    [],
  );

  // ---------- Camera / Library ----------
  const showSourcePicker = (aspect: [number, number] | undefined) => {
    Alert.alert('Add Photo', 'Choose a source', [
      {
        text: 'Photo Library',
        onPress: async () => {
          const uri = await pickImage(aspect);
          if (uri) {
            setPhotos((prev) => [...prev, uri]);
          }
        },
      },
      {
        text: 'Camera',
        onPress: async () => {
          const uri = await takePhoto(aspect);
          if (uri) {
            setPhotos((prev) => [...prev, uri]);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleAddPhoto = () => {
    // One tap fewer: free-form crop by default instead of asking for an
    // aspect ratio first (that extra Alert made adding photos feel clunky).
    showSourcePicker(undefined);
  };

  const handleRemovePhoto = (index: number) => {
    const uri = photos[index];
    setPhotos((prev) => prev.filter((_, i) => i !== index));

    // If it was a remote URL, also deselect it in search results
    if (remotePhotoUrls.has(uri)) {
      setRemotePhotoUrls((prev) => {
        const updated = new Set(prev);
        updated.delete(uri);
        return updated;
      });
      // Find the matching search photo and deselect it
      const matchingPhoto = searchPhotos.find((p) => p.url === uri);
      if (matchingPhoto) {
        setSelectedSearchIds((prev) => {
          const updated = new Set(prev);
          updated.delete(matchingPhoto.id);
          return updated;
        });
      }
    }
  };

  const handleMovePhoto = (index: number, direction: 'left' | 'right') => {
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= photos.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhotos((prev) => {
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated;
    });
  };

  // ---------- Submit ----------
  const handleSubmit = async () => {
    if (!name.trim() || !selectedCategory || !city.trim()) {
      Alert.alert(
        'Missing Info',
        'Please fill in the name, category, and city.',
      );
      return;
    }

    if (!selectedGooglePlaceId && !isPoiPrefilled) {
      Alert.alert(
        'Select a Place',
        'Please search and select an actual place from the suggestions.',
      );
      return;
    }

    if (!user || !profile) {
      Alert.alert('Not Signed In', 'Please sign in to add a place.');
      return;
    }

    // Check for duplicate place
    const duplicate = allPlaces.find((p) =>
      (selectedGooglePlaceId && p.googlePlaceId === selectedGooglePlaceId) ||
      (p.name.toLowerCase().trim() === name.trim().toLowerCase() &&
       p.city.toLowerCase().trim() === city.trim().toLowerCase())
    );
    if (duplicate) {
      Alert.alert(
        'Already Added',
        `${duplicate.name} was already added by ${duplicate.createdByName || 'someone'}. You can find it in the app and save it to your favorites.`,
        [
          { text: 'View Place', onPress: () => router.replace({ pathname: '/modal/place-detail', params: { id: duplicate.id } } as any) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // No photos on the place yet? Try one last automatic Google Places lookup
      // so the place always ends up with at least one image. This kicks in when
      // the user typed the name manually and never tapped a suggestion.
      let effectivePhotos = photos;
      if (effectivePhotos.length === 0 && name.trim().length > 0) {
        try {
          const fallback = await searchPlacePhotos(
            `${name.trim()}${city ? ` ${city.trim()}` : ''}`.trim(),
            finalLat ?? undefined,
            finalLng ?? undefined,
          );
          if (fallback.length > 0) {
            effectivePhotos = fallback.slice(0, 5).map((p) => p.url);
          }
        } catch {
          // Silent — if Google fails, we just save the place with no photo.
          // The Explore tab has a placeholder fallback anyway.
        }
      }

      // For LOCAL photos (picked from the user's library) we upload to Firebase
      // Storage. For REMOTE photos (Google Places CDN URLs) we save the URL
      // as-is — they're already public, and trying to round-trip them through
      // Firebase Storage used to silently fail and leave the place with no
      // imageURLs at all. Keeping them as direct URLs is faster too.
      // Uploads run in PARALLEL — serial awaits made saving painfully slow.
      const uploadBatch = Date.now();
      const imageURLs = (
        await Promise.all(
          effectivePhotos.map(async (photoUri, i) => {
            if (remotePhotoUrls.has(photoUri) || /^https?:\/\//i.test(photoUri)) {
              return photoUri; // Remote URL — save directly
            }
            try {
              const storagePath = `places/${user.uid}/${uploadBatch}_${i}.jpg`;
              return await uploadImage(storagePath, photoUri);
            } catch (uploadErr) {
              // Don't let a single failed local upload kill the whole save —
              // skip the bad photo and keep going. The place gets the rest.
              console.warn('[add-place] failed to upload photo', i, uploadErr);
              return null;
            }
          }),
        )
      ).filter((u): u is string => !!u);

      // Merge auto-generated tags + expanded manual tags
      const expandedManual = expandManualTags(manualTags);
      const allTags = [...new Set([...autoTags, ...expandedManual])];

      const now = Timestamp.now();
      const placeId = `place_${Date.now()}`;

      const newPlace: Place = {
        id: placeId,
        name: name.trim(),
        description: description.trim(),
        category: selectedCategory,
        subcategory: '',
        location: new GeoPoint(finalLat ?? 0, finalLng ?? 0),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        imageURLs,
        createdBy: user.uid,
        createdByName: profile.displayName,
        createdByPhoto: profile.photoURL || '',
        createdAt: now,
        updatedAt: now,
        rating: 0,
        ratingCount: 0,
        savesCount: 0,
        beenCount: 0,
        tags: allTags,
        isPublic: true,
        ...(selectedBudget ? { budgetTier: selectedBudget } : {}),
        ...(selectedStars ? { starRating: selectedStars } : {}),
        ...(selectedGooglePlaceId ? { googlePlaceId: selectedGooglePlaceId } : {}),
        ...(mustTry.trim() ? { mustTry: mustTry.trim() } : {}),
      };

      const firestoreId = await addPlace(newPlace);
      const realPlaceId = firestoreId || placeId;

      // Also save to user's personal collection so it shows in My Places
      const userPlace: UserPlace = {
        id: '',
        userId: user.uid,
        placeId: realPlaceId,
        placeName: newPlace.name,
        placeCategory: newPlace.category,
        placeImageURL: imageURLs[0] || '',
        placeLocation: newPlace.location,
        placeCity: newPlace.city,
        placeCountry: newPlace.country,
        savedAt: now,
        isCreator: true,
        isFavorite: true,
        personalNote: '',
        placeCreatedBy: user.uid,
        placeCreatedByName: profile.displayName,
        ...(selectedBudget ? { placeBudgetTier: selectedBudget } : {}),
      };
      await savePlace(userPlace);

      // Success: haptic + straight back. No blocking "OK" alert.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------- Render ----------
  const hasCoordinates = finalLat != null && finalLng != null;

  const renderSearchPhoto = ({ item }: { item: PlacePhoto }) => {
    const isSelected = selectedSearchIds.has(item.id);
    return (
      <Pressable
        onPress={() => toggleSearchPhoto(item)}
        style={[
          styles.searchPhotoContainer,
          isSelected && styles.searchPhotoSelected,
        ]}
      >
        <Image source={{ uri: item.url }} style={styles.searchPhotoThumb} />
        {isSelected && (
          <View style={styles.searchPhotoCheck}>
            <Ionicons
              name="checkmark-circle"
              size={22}
              color={colors.gold.primary}
            />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} disabled={isSubmitting}>
          <Ionicons
            name="close"
            size={22}
            color={isSubmitting ? colors.text.tertiary : colors.text.secondary}
          />
        </Pressable>
        <Text style={styles.headerTitle}>Add Place</Text>
        <Pressable onPress={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.gold.primary} />
          ) : (
            <Text style={styles.saveText}>SAVE</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20 },
        ]}
      >
        {/* ---- POI Source Indicator ---- */}
        {isPoiPrefilled && (
          <View style={styles.poiSourceCard}>
            <View style={styles.poiSourceRow}>
              <Ionicons name="pin" size={14} color={colors.gold.primary} />
              <Text style={styles.poiSourceTitle}>FROM GOOGLE MAPS</Text>
            </View>
            <Text style={styles.poiSourceText}>
              {params.poiName}
              {params.poiRating && parseFloat(params.poiRating) > 0
                ? ` · ★ ${parseFloat(params.poiRating).toFixed(1)}`
                : ''}
            </Text>
          </View>
        )}

        {/* ---- Location Indicator ---- */}
        <View style={styles.locationCard}>
          <View style={styles.locationIconRow}>
            <Ionicons
              name="navigate"
              size={14}
              color={colors.gold.primary}
            />
            <Text style={styles.locationTitle}>COORDINATES</Text>
            {isGeocoding && (
              <ActivityIndicator
                size="small"
                color={colors.gold.primary}
                style={{ marginLeft: spacing.sm }}
              />
            )}
          </View>
          {hasCoordinates ? (
            <Text style={styles.locationCoords}>
              {finalLat!.toFixed(5)}, {finalLng!.toFixed(5)}
            </Text>
          ) : isLocationLoading ? (
            <View style={styles.locationLoadingRow}>
              <ActivityIndicator
                size="small"
                color={colors.text.tertiary}
              />
              <Text style={styles.locationLoadingText}>
                Getting your location...
              </Text>
            </View>
          ) : (
            <Text style={styles.locationMissing}>
              No coordinates — location will default to (0, 0)
            </Text>
          )}
        </View>

        {/* ---- Photos ---- */}
        <Text style={styles.label}>PHOTOS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoScroll}
        >
          <Pressable style={styles.addPhotoButton} onPress={handleAddPhoto}>
            <Ionicons name="camera" size={24} color={colors.gold.primary} />
            <Text style={styles.addPhotoText}>ADD</Text>
          </Pressable>
          {photos.map((uri, i) => {
            const aspect = photoAspects[uri] || 4 / 3;
            const THUMB_H = 100;
            const thumbW = Math.round(THUMB_H * Math.max(0.6, Math.min(aspect, 1.8)));
            return (
            <View key={`${uri}-${i}`} style={styles.photoContainer}>
              <Image source={{ uri }} style={[styles.photoThumb, { width: thumbW, height: THUMB_H }]} />
              <Pressable
                style={styles.removePhotoButton}
                onPress={() => handleRemovePhoto(i)}
              >
                <Ionicons
                  name="close-circle"
                  size={22}
                  color={colors.text.primary}
                />
              </Pressable>
              {photos.length > 1 && (
                <View style={styles.reorderBar}>
                  {i > 0 && (
                    <Pressable
                      style={styles.reorderArrow}
                      onPress={() => handleMovePhoto(i, 'left')}
                      hitSlop={6}
                    >
                      <Ionicons name="chevron-back" size={14} color={colors.text.primary} />
                    </Pressable>
                  )}
                  <Text style={styles.photoIndex}>{i + 1}</Text>
                  {i < photos.length - 1 && (
                    <Pressable
                      style={styles.reorderArrow}
                      onPress={() => handleMovePhoto(i, 'right')}
                      hitSlop={6}
                    >
                      <Ionicons name="chevron-forward" size={14} color={colors.text.primary} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
          })}
        </ScrollView>

        {/* ---- Search Images (Google Places) ---- */}
        <Text style={styles.sectionHeader}>Search Images</Text>
        <Pressable
          style={styles.searchImagesButton}
          onPress={handleSearchImages}
          disabled={isSearchingPhotos || isSubmitting}
        >
          {isSearchingPhotos ? (
            <ActivityIndicator size="small" color={colors.gold.primary} />
          ) : (
            <>
              <Ionicons
                name="search"
                size={16}
                color={colors.gold.primary}
              />
              <Text style={styles.searchImagesButtonText}>
                SEARCH GOOGLE PHOTOS
              </Text>
            </>
          )}
        </Pressable>
        {searchPhotos.length > 0 && (
          <FlatList
            data={searchPhotos}
            renderItem={renderSearchPhoto}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.searchPhotoList}
            contentContainerStyle={{ gap: spacing.sm }}
          />
        )}

        {/* ---- Name (with Google Places autocomplete) ---- */}
        <Text style={styles.label}>PLACE *</Text>
        <TextInput
          style={[styles.input, selectedGooglePlaceId ? styles.inputLinked : null]}
          value={name}
          onChangeText={handleNameChange}
          placeholder="Search for a place..."
          placeholderTextColor={colors.text.tertiary}
          editable={!isSubmitting && !isPoiPrefilled}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        />
        {/* Google Places suggestions */}
        {showSuggestions && (
          <View style={styles.suggestionsContainer}>
            {isSearchingSuggestions ? (
              <View style={styles.suggestionLoading}>
                <ActivityIndicator size="small" color={colors.gold.primary} />
                <Text style={styles.suggestionLoadingText}>Searching...</Text>
              </View>
            ) : placeSuggestions.length > 0 ? (
              placeSuggestions.map((s) => (
                <Pressable
                  key={s.placeId}
                  style={styles.suggestionRow}
                  onPress={() => handleSelectSuggestion(s)}
                >
                  {s.photos[0] ? (
                    <Image source={{ uri: s.photos[0].url }} style={styles.suggestionPhoto} />
                  ) : (
                    <View style={[styles.suggestionPhoto, styles.suggestionPhotoEmpty]}>
                      <Ionicons name="location" size={14} color={colors.gold.muted} />
                    </View>
                  )}
                  <View style={styles.suggestionInfo}>
                    <Text style={styles.suggestionName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.suggestionAddress} numberOfLines={1}>{s.address}</Text>
                    {s.rating > 0 && (
                      <View style={styles.suggestionRatingRow}>
                        <Ionicons name="star" size={10} color={colors.gold.primary} />
                        <Text style={styles.suggestionRating}>{s.rating.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </Pressable>
              ))
            ) : name.trim().length >= 3 ? (
              <Text style={styles.suggestionEmpty}>No places found</Text>
            ) : null}
          </View>
        )}
        {selectedGooglePlaceId || isPoiPrefilled ? (
          <View style={styles.linkedPlaceIndicator}>
            <Ionicons name="checkmark-circle" size={14} color={colors.ui.success} />
            <Text style={styles.linkedPlaceText}>Linked to Google Maps</Text>
          </View>
        ) : name.trim().length > 0 && !showSuggestions ? (
          <View style={styles.linkedPlaceIndicator}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.ui.warning} />
            <Text style={[styles.linkedPlaceText, { color: colors.ui.warning }]}>
              Select a place from the suggestions above
            </Text>
          </View>
        ) : null}

        {/* ---- Category ---- */}
        <Text style={styles.label}>CATEGORY *</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              style={[
                styles.categoryChip,
                selectedCategory === cat.key && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(cat.key)}
              disabled={isSubmitting}
            >
              <Ionicons name={cat.icon as any} size={14} color={selectedCategory === cat.key ? colors.gold.primary : colors.text.secondary} />
              <Text
                style={[
                  styles.categoryLabel,
                  selectedCategory === cat.key && styles.categoryLabelActive,
                ]}
              >
                {cat.label.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ---- Price Range ---- */}
        <Text style={styles.label}>PRICE RANGE</Text>
        <View style={styles.budgetGrid}>
          {BUDGET_TIERS.map((tier) => (
            <Pressable
              key={tier.key}
              style={[
                styles.budgetChip,
                selectedBudget === tier.key && styles.budgetChipActive,
              ]}
              onPress={() =>
                setSelectedBudget(
                  selectedBudget === tier.key ? null : tier.key,
                )
              }
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.budgetIcon,
                  selectedBudget === tier.key && styles.budgetIconActive,
                ]}
              >
                {tier.icon}
              </Text>
              <Text
                style={[
                  styles.budgetLabel,
                  selectedBudget === tier.key && styles.budgetLabelActive,
                ]}
              >
                {tier.label.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ---- Star Rating ---- */}
        <Text style={styles.label}>RATING</Text>
        <View style={styles.starGrid}>
          {([1, 2, 3] as StarRating[]).map((star) => (
            <Pressable
              key={star}
              style={[
                styles.starChip,
                selectedStars === star && styles.starChipActive,
              ]}
              onPress={() =>
                setSelectedStars(selectedStars === star ? null : star)
              }
              disabled={isSubmitting}
            >
              <View style={styles.starIcons}>
                {Array.from({ length: star }).map((_, i) => (
                  <Ionicons
                    key={i}
                    name="star"
                    size={12}
                    color={selectedStars === star ? colors.gold.primary : colors.text.tertiary}
                  />
                ))}
              </View>
              <Text
                style={[
                  styles.budgetLabel,
                  selectedStars === star && styles.budgetLabelActive,
                ]}
              >
                {STAR_LABELS[star].toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ---- Description ---- */}
        <Text style={styles.label}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Tell us about this place..."
          placeholderTextColor={colors.text.tertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!isSubmitting}
        />

        {/* ---- Must-try (food & drink places only) ---- */}
        {(selectedCategory === 'restaurant' ||
          selectedCategory === 'cafe' ||
          selectedCategory === 'bar' ||
          selectedCategory === 'club') && (
          <>
            <Text style={styles.label}>
              {selectedCategory === 'bar' || selectedCategory === 'club'
                ? 'MUST-TRY COCKTAILS / DRINKS'
                : 'MUST-TRY DISHES'}
            </Text>
            <TextInput
              style={[styles.input, styles.textArea, { minHeight: 70 }]}
              value={mustTry}
              onChangeText={setMustTry}
              placeholder={
                selectedCategory === 'bar' || selectedCategory === 'club'
                  ? 'What should people order? e.g. the mezcal negroni, their espresso martini...'
                  : 'What should people order? e.g. the truffle pasta, khinkali, tres leches...'
              }
              placeholderTextColor={colors.text.tertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!isSubmitting}
            />
          </>
        )}

        {/* ---- Address ---- */}
        <Text style={styles.label}>
          ADDRESS{isGeocoding ? ' (auto-filling...)' : ''}
        </Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Street address"
          placeholderTextColor={colors.text.tertiary}
          editable={!isSubmitting}
        />

        {/* ---- City & Country ---- */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>CITY *</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor={colors.text.tertiary}
              editable={!isSubmitting}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>COUNTRY</Text>
            <TextInput
              style={styles.input}
              value={country}
              onChangeText={setCountry}
              placeholder="Country"
              placeholderTextColor={colors.text.tertiary}
              editable={!isSubmitting}
            />
          </View>
        </View>

        {/* ---- Tags ---- */}
        <Text style={styles.label}>TAGS</Text>

        {/* Auto-generated tags (read-only, subtle) */}
        {autoTags.length > 0 && (
          <View style={styles.autoTagsRow}>
            {autoTags.map((tag) => (
              <View key={tag} style={styles.autoTagChip}>
                <Text style={styles.autoTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Manual tags — chip input */}
        <View style={styles.manualTagsContainer}>
          {manualTags.length > 0 && (
            <View style={styles.tagChipsRow}>
              {manualTags.map((tag) => (
                <View key={tag} style={styles.manualTagChip}>
                  <Text style={styles.manualTagText}>{tag}</Text>
                  <Pressable onPress={() => removeManualTag(tag)} hitSlop={4}>
                    <Ionicons name="close" size={12} color={colors.text.tertiary} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <TextInput
            style={styles.tagInput}
            value={tagInput}
            onChangeText={handleTagInputChange}
            onSubmitEditing={handleTagInputSubmit}
            placeholder={manualTags.length > 0 ? 'Add more...' : 'Add custom tags...'}
            placeholderTextColor={colors.text.tertiary}
            editable={!isSubmitting}
            returnKeyType="done"
          />
        </View>
      </ScrollView>

      {/* Full-screen loading overlay */}
      {isSubmitting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
          <Text style={styles.loadingText}>Saving place...</Text>
        </View>
      )}
    </KeyboardAvoidingView>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.ui.border,
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  saveText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  disabledText: {
    opacity: 0.4,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },

  // Location indicator — brass-bordered label
  locationCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gold.muted + '40',
    marginBottom: spacing.md,
  },
  locationIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  locationTitle: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  locationCoords: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.gold.light,
    marginLeft: 22,
    letterSpacing: 1,
  },
  locationLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 22,
  },
  locationLoadingText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  locationMissing: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    marginLeft: 22,
  },

  // Photos
  photoScroll: {
    marginBottom: spacing.md,
  },
  addPhotoButton: {
    width: 80,
    height: 100,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.gold.muted + '60',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginRight: spacing.md,
    backgroundColor: colors.background.tertiary,
  },
  addPhotoText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  photoContainer: {
    position: 'relative',
    marginRight: spacing.sm,
  },
  photoThumb: {
    borderRadius: radius.sm,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.background.primary,
    borderRadius: 11,
  },
  reorderBar: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  reorderArrow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIndex: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.primary,
    minWidth: 16,
    textAlign: 'center',
  },

  // Search Images section
  sectionHeader: {
    fontFamily: fonts.serif.bold,
    fontSize: 15,
    color: colors.text.primary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  searchImagesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.gold.muted + '50',
    marginBottom: spacing.sm,
  },
  searchImagesButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  searchPhotoList: {
    marginBottom: spacing.md,
  },
  searchPhotoContainer: {
    width: 100,
    height: 100,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  searchPhotoSelected: {
    borderColor: colors.gold.primary,
  },
  searchPhotoThumb: {
    width: '100%',
    height: '100%',
  },
  searchPhotoCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.background.primary,
    borderRadius: 11,
  },

  // Form — apothecary label style
  label: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 2,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  inputLinked: {
    borderColor: colors.ui.success + '60',
  },
  textArea: {
    height: 100,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfField: {
    flex: 1,
  },

  // Categories — apothecary label chips
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: colors.gold.primary + '15',
    borderColor: colors.gold.primary,
  },
  categoryIcon: {
    // icon size handled inline
  },
  categoryLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.text.secondary,
    letterSpacing: 1.5,
  },
  categoryLabelActive: {
    color: colors.gold.primary,
  },

  // Budget / price range
  budgetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  budgetChip: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
    gap: 4,
  },
  budgetChipActive: {
    backgroundColor: colors.gold.primary + '15',
    borderColor: colors.gold.primary,
  },
  budgetIcon: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.text.secondary,
  },
  budgetIconActive: {
    color: colors.gold.primary,
  },
  budgetLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 9,
    color: colors.text.tertiary,
    letterSpacing: 1,
  },
  budgetLabelActive: {
    color: colors.gold.primary,
  },
  starGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  starChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
    gap: 4,
  },
  starChipActive: {
    backgroundColor: colors.gold.primary + '15',
    borderColor: colors.gold.primary,
  },
  starIcons: {
    flexDirection: 'row',
    gap: 2,
  },

  // Tags
  autoTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
  },
  autoTagChip: {
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  autoTagText: {
    fontFamily: fonts.sans.regular,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  manualTagsContainer: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
    padding: spacing.sm,
  },
  tagChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
  },
  manualTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '40',
    gap: 4,
  },
  manualTagText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.light,
    letterSpacing: 0.3,
  },
  tagInput: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: 4,
    paddingHorizontal: 4,
    minHeight: 32,
  },

  // POI source indicator
  poiSourceCard: {
    backgroundColor: colors.gold.primary + '10',
    borderRadius: radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gold.primary + '30',
    marginBottom: spacing.md,
  },
  poiSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  poiSourceTitle: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  poiSourceText: {
    fontFamily: fonts.serif.regular,
    fontSize: 15,
    color: colors.text.primary,
    marginLeft: 22,
    letterSpacing: 0.3,
  },

  // Google Places autocomplete suggestions
  suggestionsContainer: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.gold.muted + '40',
    overflow: 'hidden',
    marginTop: -spacing.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
    gap: spacing.sm,
  },
  suggestionPhoto: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.background.primary,
  },
  suggestionPhotoEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  suggestionInfo: {
    flex: 1,
    gap: 2,
  },
  suggestionName: {
    fontFamily: fonts.serif.bold,
    fontSize: 14,
    color: colors.text.primary,
  },
  suggestionAddress: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
  },
  suggestionRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  suggestionRating: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.primary,
  },
  suggestionLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  suggestionLoadingText: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  suggestionEmpty: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  linkedPlaceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  linkedPlaceText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.ui.success,
    letterSpacing: 0.5,
  },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 12, 10, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    color: colors.text.primary,
    letterSpacing: 1,
  },
});
