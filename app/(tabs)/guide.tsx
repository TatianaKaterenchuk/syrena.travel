import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { usePlacesStore, useListsStore, useAuthStore } from '../../src/stores';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.md;
const CARD_SIZE = (SCREEN_WIDTH - spacing.xl * 2 - GRID_GAP) / 2;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { userPlaces, places, fetchUserPlaces } = usePlacesStore();
  const { lists, isLoading, fetchLists } = useListsStore();

  // Fetch data on focus
  useFocusEffect(
    useCallback(() => {
      if (user?.uid) {
        fetchLists();
        fetchUserPlaces();
      }
    }, [user?.uid]),
  );

  // Derive favorites from existing userPlaces
  const favorites = useMemo(
    () => userPlaces.filter((up) => up.isFavorite),
    [userPlaces],
  );

  const favoriteCoverImage = favorites[0]?.placeImageURL || '';

  // ------ Handlers ------
  const handleFavoritesTap = useCallback(() => {
    router.push({
      pathname: '/modal/list-detail',
      params: { type: 'favorites' },
    } as any);
  }, [router]);

  const handleListTap = useCallback(
    (listId: string) => {
      router.push({
        pathname: '/modal/list-detail',
        params: { id: listId },
      } as any);
    },
    [router],
  );

  const handleNewList = useCallback(() => {
    router.push('/modal/create-list' as any);
  }, [router]);

  // ------ Build grid items ------
  // Items: [My Favorites, ...user lists, + New List]
  type GridItem =
    | { kind: 'favorites' }
    | { kind: 'list'; id: string; name: string; coverImageURL: string; placeCount: number }
    | { kind: 'new' };

  // Build a quick lookup: placeId → first image URL
  const placeImageMap = useMemo(() => {
    const map = new Map<string, string>();
    // From userPlaces (saved places)
    for (const up of userPlaces) {
      if (up.placeImageURL && !map.has(up.placeId)) {
        map.set(up.placeId, up.placeImageURL);
      }
    }
    // From all places (covers places the user hasn't saved but added to a list)
    for (const p of places) {
      if (p.imageURLs?.[0] && !map.has(p.id)) {
        map.set(p.id, p.imageURLs[0]);
      }
    }
    return map;
  }, [userPlaces, places]);

  const gridItems: GridItem[] = useMemo(() => {
    const items: GridItem[] = [{ kind: 'favorites' }];
    for (const list of lists) {
      // Use explicit cover if set; otherwise fall back to the first place's image
      let cover = list.coverImageURL || '';
      if (!cover && list.placeIds.length > 0) {
        for (const pid of list.placeIds) {
          const img = placeImageMap.get(pid);
          if (img) { cover = img; break; }
        }
      }
      items.push({
        kind: 'list',
        id: list.id,
        name: list.name,
        coverImageURL: cover,
        placeCount: list.placeIds.length,
      });
    }
    items.push({ kind: 'new' });
    return items;
  }, [lists, placeImageMap]);

  // ------ Loading state ------
  if (isLoading && lists.length === 0 && !user) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Lists</Text>
          <View style={styles.headerRule} />
          <Text style={styles.headerSubtitle}>YOUR COLLECTIONS</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold.muted} />
          <Text style={styles.loadingText}>Loading your lists...</Text>
        </View>
      </View>
    );
  }

  // ------ Render a single grid card ------
  const renderCard = (item: GridItem, index: number) => {
    const isLeft = index % 2 === 0;

    if (item.kind === 'favorites') {
      return (
        <Pressable
          key="favorites"
          style={[
            styles.card,
            isLeft ? styles.cardLeft : styles.cardRight,
          ]}
          onPress={handleFavoritesTap}
        >
          {favoriteCoverImage ? (
            <Image
              source={{ uri: favoriteCoverImage }}
              style={styles.cardImage}
            />
          ) : (
            <View style={[styles.cardImage, styles.cardPlaceholder]}>
              <Ionicons name="star" size={32} color={colors.gold.muted} />
            </View>
          )}
          <View style={styles.cardGradient} />
          <View style={styles.cardContent}>
            <Text style={styles.cardName} numberOfLines={1}>
              My Favorites
            </Text>
            <Text style={styles.cardCount}>
              {favorites.length} {favorites.length === 1 ? 'place' : 'places'}
            </Text>
          </View>
        </Pressable>
      );
    }

    if (item.kind === 'list') {
      return (
        <Pressable
          key={item.id}
          style={[
            styles.card,
            isLeft ? styles.cardLeft : styles.cardRight,
          ]}
          onPress={() => handleListTap(item.id)}
        >
          {item.coverImageURL ? (
            <Image
              source={{ uri: item.coverImageURL }}
              style={styles.cardImage}
            />
          ) : (
            <View style={[styles.cardImage, styles.cardPlaceholder]}>
              <Ionicons name="list" size={28} color={colors.gold.muted} />
            </View>
          )}
          <View style={styles.cardGradient} />
          <View style={styles.cardContent}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.cardCount}>
              {item.placeCount} {item.placeCount === 1 ? 'place' : 'places'}
            </Text>
          </View>
        </Pressable>
      );
    }

    // kind === 'new'
    return (
      <Pressable
        key="new-list"
        style={[
          styles.card,
          styles.cardNew,
          isLeft ? styles.cardLeft : styles.cardRight,
        ]}
        onPress={handleNewList}
      >
        <View style={styles.newListContent}>
          <View style={styles.newListIconCircle}>
            <Ionicons name="add" size={28} color={colors.gold.primary} />
          </View>
          <Text style={styles.newListText}>New List</Text>
        </View>
      </Pressable>
    );
  };

  // ------ Render ------
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Lists</Text>
        <View style={styles.headerRule} />
        <Text style={styles.headerSubtitle}>YOUR COLLECTIONS</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Grid */}
        <View style={styles.grid}>
          {gridItems.map((item, index) => renderCard(item, index))}
        </View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // ─── Layout ───────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 34,
    color: colors.text.primary,
    letterSpacing: 1,
  },
  headerRule: {
    width: 36,
    height: 1.5,
    backgroundColor: colors.gold.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerSubtitle: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.muted,
    letterSpacing: 3,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // ─── Loading ──────────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  loadingText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },

  // ─── Grid ─────────────────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: GRID_GAP,
    ...shadows.md,
  },
  cardLeft: {
    marginRight: GRID_GAP / 2,
  },
  cardRight: {
    marginLeft: GRID_GAP / 2,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background.tertiary,
  },
  cardPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.ui.cardBg,
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: 'transparent',
    // Simulated gradient with overlapping layers
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    // Dark overlay at the bottom
    ...(
      {
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
      } as any
    ),
    // Fallback for RN — we use a semi-transparent overlay
    // The real gradient is handled by the cardContent background
  },
  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: 'rgba(10, 14, 12, 0.75)',
  },
  cardName: {
    fontFamily: fonts.serif.bold,
    fontSize: 14,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  cardCount: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.gold.muted,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // ─── New List Card ────────────────────────────────────────────────
  cardNew: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.ui.border,
    borderStyle: 'dashed',
    shadowOpacity: 0,
    elevation: 0,
  },
  newListContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  newListIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(201, 168, 76, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gold.muted,
  },
  newListText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.gold.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
