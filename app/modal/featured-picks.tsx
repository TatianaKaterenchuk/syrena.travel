import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { usePlacesStore, useAuthStore } from '../../src/stores';
import { Place, PlaceCategory } from '../../src/types';
import { placeImageUri } from '../../src/utils/placeholderAvatar';

const MAX_PICKS = 10;

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

export default function FeaturedPicksModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const {
    featuredPerson,
    places,
    featuredPicks,
    updateFeaturedPersonPicks,
  } = usePlacesStore();

  const isAdmin = profile?.isAdmin === true;
  const isFeaturedUser =
    (profile?.uid || (profile as any)?.id) === featuredPerson?.uid;

  const [selectedIds, setSelectedIds] = useState<string[]>(
    featuredPerson?.picks || []
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = useMemo(() => {
    const original = featuredPerson?.picks || [];
    if (original.length !== selectedIds.length) return true;
    return original.some((id, i) => id !== selectedIds[i]);
  }, [featuredPerson?.picks, selectedIds]);

  const filteredPlaces = useMemo(() => {
    if (searchQuery.length < 1) return places;
    const lower = searchQuery.toLowerCase();
    return places.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.city.toLowerCase().includes(lower) ||
        p.country.toLowerCase().includes(lower) ||
        p.category.toLowerCase().includes(lower)
    );
  }, [places, searchQuery]);

  // Resolve selected picks to Place objects for the top section
  const selectedPlaces = useMemo(() => {
    const map = new Map(places.map((p) => [p.id, p]));
    return selectedIds.map((id) => map.get(id)).filter((p): p is Place => !!p);
  }, [selectedIds, places]);

  const togglePick = useCallback(
    (placeId: string) => {
      setSelectedIds((prev) => {
        if (prev.includes(placeId)) {
          return prev.filter((id) => id !== placeId);
        }
        if (prev.length >= MAX_PICKS) {
          Alert.alert('Limit Reached', `You can select up to ${MAX_PICKS} picks.`);
          return prev;
        }
        return [...prev, placeId];
      });
    },
    []
  );

  const removePick = useCallback((placeId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== placeId));
  }, []);

  // Access guard — AFTER all hooks. An early return above the hooks made
  // React throw "Rendered more hooks than during the previous render"
  // whenever the async profile load flipped isAdmin/isFeaturedUser.
  if (!isAdmin && !isFeaturedUser) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={22} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Traveler's Picks</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={48} color={colors.gold.muted} />
          <Text style={styles.noAccessText}>
            Only the featured person or admins can edit picks
          </Text>
        </View>
      </View>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateFeaturedPersonPicks(selectedIds);
      Alert.alert('Saved', 'Picks updated successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Could not save picks.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderPlace = ({ item }: { item: Place }) => {
    const isSelected = selectedIds.includes(item.id);
    const catColor = categoryColors[item.category as PlaceCategory] || colors.gold.muted;

    return (
      <Pressable
        style={[styles.placeRow, isSelected && styles.placeRowSelected]}
        onPress={() => togglePick(item.id)}
      >
        <Image
          source={{ uri: placeImageUri(item.imageURLs, item.id) }}
          style={styles.placeThumb}
        />
        <View style={styles.placeInfo}>
          <Text style={styles.placeName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.placeMetaRow}>
            <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
            <Text style={styles.placeMeta}>
              {item.subcategory || item.category}
            </Text>
          </View>
          <Text style={styles.placeLocation}>
            {item.city}, {item.country}
          </Text>
        </View>
        <Ionicons
          name={isSelected ? 'checkmark-circle' : 'add-circle-outline'}
          size={24}
          color={isSelected ? colors.ui.success : colors.text.tertiary}
        />
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headerIconButton}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Traveler's Picks</Text>
        <Pressable
          onPress={handleSave}
          disabled={isSaving || !hasChanges}
          hitSlop={12}
          style={styles.headerIconButton}
          accessibilityLabel="Save"
          accessibilityRole="button"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.gold.primary} />
          ) : (
            <Text
              style={[
                styles.saveText,
                !hasChanges && styles.saveTextDisabled,
              ]}
            >
              SAVE
            </Text>
          )}
        </Pressable>
      </View>

      {/* Selected picks */}
      {selectedPlaces.length > 0 && (
        <View style={styles.selectedSection}>
          <Text style={styles.label}>
            SELECTED ({selectedPlaces.length}/{MAX_PICKS})
          </Text>
          <FlatList
            data={selectedPlaces}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.selectedList}
            renderItem={({ item }) => (
              <View style={styles.selectedChip}>
                <Image
                  source={{ uri: placeImageUri(item.imageURLs, item.id) }}
                  style={styles.selectedChipImage}
                />
                <Text style={styles.selectedChipName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Pressable
                  onPress={() => removePick(item.id)}
                  hitSlop={12}
                  accessibilityLabel="Remove pick"
                  accessibilityRole="button"
                >
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={colors.text.tertiary}
                  />
                </Pressable>
              </View>
            )}
          />
        </View>
      )}

      {/* Search */}
      <View style={styles.searchSection}>
        <Text style={styles.label}>SEARCH PLACES</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={colors.gold.muted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name, city, or category..."
            placeholderTextColor={colors.text.tertiary}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              hitSlop={12}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Place list */}
      <FlatList
        data={filteredPlaces}
        keyExtractor={(item) => item.id}
        renderItem={renderPlace}
        contentContainerStyle={styles.placeList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search" size={32} color={colors.gold.muted} />
            <Text style={styles.emptyText}>No places found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  noAccessText: {
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
  },
  headerIconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  saveText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  saveTextDisabled: {
    opacity: 0.3,
  },

  // Labels
  label: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },

  // Selected picks
  selectedSection: {
    paddingTop: spacing.lg,
    paddingLeft: spacing.lg,
  },
  selectedList: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold.primary + '12',
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.gold.primary + '30',
    paddingRight: spacing.sm,
    gap: spacing.sm,
    maxWidth: 180,
  },
  selectedChipImage: {
    width: 32,
    height: 32,
    borderRadius: radius.sm - 1,
  },
  selectedChipName: {
    flex: 1,
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.primary,
  },

  // Search
  searchSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: spacing.md,
  },

  // Place list
  placeList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
    gap: spacing.md,
  },
  placeRowSelected: {
    backgroundColor: colors.gold.primary + '08',
  },
  placeThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.background.tertiary,
  },
  placeInfo: {
    flex: 1,
    gap: 2,
  },
  placeName: {
    fontFamily: fonts.serif.bold,
    fontSize: 15,
    color: colors.text.primary,
  },
  placeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  placeMeta: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    textTransform: 'capitalize',
  },
  placeLocation: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.tertiary,
  },
});
