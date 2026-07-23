import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { usePlacesStore, useListsStore, useAuthStore } from '../../src/stores';
import { Place, PlaceCategory, UserPlace } from '../../src/types';
import { Timestamp } from 'firebase/firestore';
import { getCategoryColor, getCategoryIcon } from '../../src/constants/categories';
import { placeImageUri, sizedImageUri } from '../../src/utils/placeholderAvatar';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ListDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; type?: string }>();

  const { places, userPlaces, savePlace } = usePlacesStore();
  const { lists, deleteList, removePlaceFromList, addPlaceToList } = useListsStore();
  const user = useAuthStore((s) => s.user);

  const isFavorites = params.type === 'favorites';
  const listId = params.id;
  const list = listId ? lists.find((l) => l.id === listId) : null;

  // Resolve places for this list
  const listPlaces: Place[] = useMemo(() => {
    if (isFavorites) {
      // Get place IDs from user's favorites
      const favPlaceIds = userPlaces
        .filter((up) => up.isFavorite)
        .map((up) => up.placeId);
      return places.filter((p) => favPlaceIds.includes(p.id));
    }

    if (list) {
      return list.placeIds
        .map((pid) => places.find((p) => p.id === pid))
        .filter(Boolean) as Place[];
    }

    return [];
  }, [isFavorites, userPlaces, places, list]);

  const title = isFavorites ? 'My Favorites' : list?.name ?? 'List';
  const description = isFavorites ? '' : list?.description ?? '';

  // ------ Add Places Modal ------
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  const availablePlaces = useMemo(() => {
    let currentIds: Set<string>;
    if (isFavorites) {
      // Exclude EVERY saved place (not just favorites) — adding a place the
      // user had saved as non-favorite used to create a duplicate
      // userPlaces doc.
      currentIds = new Set(userPlaces.map((up) => up.placeId));
    } else {
      currentIds = new Set(list?.placeIds ?? []);
    }
    const filtered = places.filter((p) => !currentIds.has(p.id));
    if (!addSearch.trim()) return filtered.slice(0, 30);
    const q = addSearch.toLowerCase();
    return filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q),
    );
  }, [places, list?.placeIds, addSearch, isFavorites, userPlaces]);

  // Transient "Added ✓" confirmation — without it there's no feedback that
  // the tap did anything.
  const [addedToast, setAddedToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showAddedToast = useCallback((name: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAddedToast(name);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setAddedToast(null), 1400);
  }, []);

  const handleAddPlace = useCallback(
    (placeId: string) => {
      if (isFavorites) {
        // Save as favorite userPlace
        const place = places.find((p) => p.id === placeId);
        if (!place || !user) return;
        const userPlace: UserPlace = {
          id: '',
          userId: user.uid,
          placeId: place.id,
          placeName: place.name,
          placeCategory: place.category,
          placeImageURL: place.imageURLs?.[0] || '',
          placeLocation: place.location,
          placeCity: place.city,
          placeCountry: place.country,
          savedAt: Timestamp.now(),
          isCreator: false,
          personalNote: '',
          isFavorite: true,
        };
        savePlace(userPlace).catch(() => {
          Alert.alert('Error', 'Could not add the place. Please try again.');
        });
        showAddedToast(place.name);
      } else {
        if (!listId) return;
        addPlaceToList(listId, placeId);
        const place = places.find((p) => p.id === placeId);
        showAddedToast(place?.name || 'Place');
      }
    },
    [listId, addPlaceToList, isFavorites, places, user, savePlace, showAddedToast],
  );

  // ------ Handlers ------
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handlePlacePress = useCallback(
    (placeId: string) => {
      router.push({
        pathname: '/modal/place-detail',
        params: { id: placeId },
      } as any);
    },
    [router],
  );

  const handleDeleteList = useCallback(() => {
    if (!listId) return;
    Alert.alert(
      'Delete List',
      `Are you sure you want to delete "${list?.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteList(listId);
            router.back();
          },
        },
      ],
    );
  }, [listId, list, deleteList, router]);

  const handleRemovePlace = useCallback(
    (placeId: string, placeName: string) => {
      if (!listId) return;
      Alert.alert(
        'Remove Place',
        `Remove "${placeName}" from this list?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => removePlaceFromList(listId, placeId),
          },
        ],
      );
    },
    [listId, removePlaceFromList],
  );

  // ------ Render place card ------
  const renderPlaceCard = useCallback(
    ({ item: place }: { item: Place }) => {
      const catColor = getCategoryColor(place.category);
      const catIcon = getCategoryIcon(place.category);

      return (
        <Pressable
          style={({ pressed }) => [styles.placeCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          onPress={() => handlePlacePress(place.id)}
          onLongPress={
            !isFavorites
              ? () => handleRemovePlace(place.id, place.name)
              : undefined
          }
        >
          <Image
            source={{ uri: sizedImageUri(placeImageUri(place.imageURLs, place.id), 200) }}
            style={styles.placeImage}
          />
          <View style={styles.placeContent}>
            <Text style={styles.placeName} numberOfLines={1}>
              {place.name}
            </Text>
            <View style={styles.placeMeta}>
              <Ionicons
                name={catIcon as any}
                size={12}
                color={catColor}
              />
              <Text style={styles.placeCity} numberOfLines={1}>
                {place.city}
              </Text>
            </View>
            {place.rating > 0 && (
              <View style={styles.placeRating}>
                <Ionicons name="star" size={11} color={colors.gold.primary} />
                <Text style={styles.placeRatingText}>
                  {place.rating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.gold.muted}
          />
        </Pressable>
      );
    },
    [handlePlacePress, handleRemovePlace, isFavorites],
  );

  // ------ Empty state ------
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name={isFavorites ? 'star-outline' : 'list-outline'}
        size={48}
        color={colors.gold.muted}
      />
      <Text style={styles.emptyTitle}>No places yet</Text>
      <Text style={styles.emptySubtitle}>
        {isFavorites
          ? 'Mark places as favorites to see them here'
          : 'Add places from the place detail screen'}
      </Text>
    </View>
  );

  // ------ Render ------
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {description ? (
            <Text style={styles.headerDescription} numberOfLines={1}>
              {description}
            </Text>
          ) : null}
        </View>

        {/* Right actions */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setShowAddModal(true)} style={styles.headerAction}>
            <Ionicons name="add-circle-outline" size={22} color={colors.gold.primary} />
          </Pressable>
          {!isFavorites && listId ? (
            <Pressable onPress={handleDeleteList} style={styles.headerAction}>
              <Ionicons name="trash-outline" size={20} color={colors.ui.error} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.headerRule} />

      {/* Place count */}
      <View style={styles.countRow}>
        <Ionicons name="location-outline" size={13} color={colors.gold.muted} />
        <Text style={styles.countText}>
          {listPlaces.length} {listPlaces.length === 1 ? 'place' : 'places'}
        </Text>
      </View>

      {/* Places list */}
      <FlatList
        data={listPlaces}
        keyExtractor={(item) => item.id}
        renderItem={renderPlaceCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
      />

      {/* Add Places Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <View style={styles.headerAction} />
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Add Places</Text>
            </View>
            <Pressable onPress={() => { setShowAddModal(false); setAddSearch(''); }} style={styles.headerAction}>
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </Pressable>
          </View>
          <View style={styles.headerRule} />
          <View style={styles.addSearchContainer}>
            <Ionicons name="search" size={16} color={colors.text.tertiary} />
            <TextInput
              style={styles.addSearchInput}
              placeholder="Search places..."
              placeholderTextColor={colors.text.tertiary}
              value={addSearch}
              onChangeText={setAddSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={availablePlaces}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: place }) => {
              const catColor = getCategoryColor(place.category);
              const catIcon = getCategoryIcon(place.category);
              return (
                <Pressable
                  style={({ pressed }) => [styles.placeCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                  onPress={() => handleAddPlace(place.id)}
                >
                  <Image
                    source={{ uri: sizedImageUri(placeImageUri(place.imageURLs, place.id), 200) }}
                    style={styles.placeImage}
                  />
                  <View style={styles.placeContent}>
                    <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
                    <View style={styles.placeMeta}>
                      <Ionicons name={catIcon as any} size={12} color={catColor} />
                      <Text style={styles.placeCity} numberOfLines={1}>{place.city}</Text>
                    </View>
                  </View>
                  <Ionicons name="add-circle" size={24} color={colors.gold.primary} />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={36} color={colors.gold.muted} />
                <Text style={styles.emptyTitle}>
                  {addSearch ? 'No matching places' : 'No more places to add'}
                </Text>
              </View>
            }
          />

          {/* Transient "Added" confirmation */}
          {addedToast && (
            <View style={styles.addedToast} pointerEvents="none">
              <Ionicons name="checkmark-circle" size={16} color={colors.ui.success} />
              <Text style={styles.addedToastText} numberOfLines={1}>
                Added {addedToast}
              </Text>
            </View>
          )}
        </View>
      </Modal>
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
  addedToast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1,
    borderColor: colors.ui.success + '60',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    maxWidth: '80%',
    ...shadows.md,
  },
  addedToastText: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.primary,
  },

  // ─── Header ───────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  headerDescription: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.secondary,
    letterSpacing: 0.3,
  },
  headerAction: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRule: {
    height: 1,
    backgroundColor: colors.ui.divider,
    marginHorizontal: spacing.xl,
  },

  // ─── Count ────────────────────────────────────────────────────────
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  countText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.gold.muted,
    letterSpacing: 0.5,
  },

  // ─── List ─────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },

  // ─── Place Card ───────────────────────────────────────────────────
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  placeImage: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.background.tertiary,
  },
  placeContent: {
    flex: 1,
    gap: 3,
  },
  placeName: {
    fontFamily: fonts.serif.bold,
    fontSize: 15,
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  placeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  placeCity: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.secondary,
    letterSpacing: 0.3,
  },
  placeRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  placeRatingText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.primary,
    letterSpacing: 0.3,
  },

  // ─── Empty State ──────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxxl * 2,
    gap: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.secondary,
    letterSpacing: 0.5,
  },
  emptySubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
    textAlign: 'center',
    paddingHorizontal: spacing.xxxl,
  },

  // ─── Add Search ────────────────────────────────────────────────
  addSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ui.searchBg,
    borderRadius: radius.sm,
    marginHorizontal: spacing.xl,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  addSearchInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: 10,
  },
});
