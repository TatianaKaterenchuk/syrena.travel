import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { usePlacesStore } from '../../src/stores';
import { Place, PlaceCategory } from '../../src/types';

// ---------------------------------------------------------------------------
// Category display-name mapping
// ---------------------------------------------------------------------------

const categoryLabels: Record<PlaceCategory, { title: string; subtitle: string }> = {
  restaurant: { title: 'Fine Dining', subtitle: 'Unforgettable culinary experiences' },
  hotel: { title: 'Luxury Hotels', subtitle: 'Where to stay in style' },
  bar: { title: 'Cocktail Bars', subtitle: 'Best spots for drinks' },
  cafe: { title: 'Charming Cafes', subtitle: 'Perfect coffee & pastries' },
  nature: { title: 'Nature Escapes', subtitle: 'Reconnect with the outdoors' },
  culture: { title: 'Culture & Arts', subtitle: 'Museums, galleries & landmarks' },
  shopping: { title: 'Shopping', subtitle: 'Retail therapy destinations' },
  nightlife: { title: 'Nightlife', subtitle: 'After dark adventures' },
  services: { title: 'Services', subtitle: 'Essential local services & more' },
};

// ---------------------------------------------------------------------------
// Guide collection type derived from store data
// ---------------------------------------------------------------------------

interface GuideCollection {
  category: PlaceCategory;
  title: string;
  subtitle: string;
  placesCount: number;
  imageURL: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuideScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { places, isLoading, fetchPlaces } = usePlacesStore();

  // Fetch places on mount
  useEffect(() => {
    fetchPlaces();
  }, []);

  // Derive guide collections by grouping places by category
  const { featured, otherGuides } = useMemo(() => {
    if (places.length === 0) {
      return { featured: null, otherGuides: [] };
    }

    // Group places by category
    const grouped = new Map<PlaceCategory, typeof places>();
    for (const place of places) {
      const existing = grouped.get(place.category);
      if (existing) {
        existing.push(place);
      } else {
        grouped.set(place.category, [place]);
      }
    }

    // Build guide collections
    const collections: GuideCollection[] = [];
    for (const [category, categoryPlaces] of grouped) {
      const labels = categoryLabels[category];
      if (!labels) continue;

      const firstImage =
        categoryPlaces[0]?.imageURLs?.[0] ||
        'https://picsum.photos/600/400?random=1';

      collections.push({
        category,
        title: labels.title,
        subtitle: labels.subtitle,
        placesCount: categoryPlaces.length,
        imageURL: firstImage,
      });
    }

    // Sort by placesCount descending so the featured guide is the biggest category
    collections.sort((a, b) => b.placesCount - a.placesCount);

    const featuredGuide = collections[0] ?? null;
    const rest = collections.slice(1);

    return { featured: featuredGuide, otherGuides: rest };
  }, [places]);

  // Selected category for inline expansion
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory | null>(null);

  // Build a lookup of places grouped by category
  const placesByCategory = useMemo(() => {
    const map = new Map<PlaceCategory, Place[]>();
    for (const place of places) {
      const existing = map.get(place.category);
      if (existing) {
        existing.push(place);
      } else {
        map.set(place.category, [place]);
      }
    }
    return map;
  }, [places]);

  // ------ Loading state ------
  if (isLoading && places.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Guide</Text>
          <View style={styles.headerRule} />
          <Text style={styles.headerSubtitle}>CURATED COLLECTIONS</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold.muted} />
          <Text style={styles.loadingText}>Preparing your guide...</Text>
        </View>
      </View>
    );
  }

  // ------ Handlers ------
  const handleGuidePress = useCallback((guide: GuideCollection) => {
    setSelectedCategory((prev) => (prev === guide.category ? null : guide.category));
  }, []);

  const handlePlacePress = useCallback((place: Place) => {
    router.push({
      pathname: '/modal/place-detail',
      params: { id: place.id },
    } as any);
  }, [router]);

  // Helper to render the expanded place list for a given category
  const renderExpandedPlaces = (category: PlaceCategory) => {
    if (selectedCategory !== category) return null;
    const categoryPlaces = placesByCategory.get(category) || [];
    if (categoryPlaces.length === 0) return null;

    return (
      <View style={styles.expandedContainer}>
        <View style={styles.expandedHeaderRule} />
        {categoryPlaces.map((place, index) => (
          <Pressable
            key={place.id}
            style={[
              styles.expandedPlaceCard,
              index === categoryPlaces.length - 1 && styles.expandedPlaceCardLast,
            ]}
            onPress={() => handlePlacePress(place)}
          >
            <View style={styles.expandedPlaceIndex}>
              <Text style={styles.expandedPlaceIndexText}>
                {String(index + 1).padStart(2, '0')}
              </Text>
            </View>
            <Image
              source={{ uri: place.imageURLs?.[0] || 'https://picsum.photos/200/200?random=1' }}
              style={styles.expandedPlaceImage}
            />
            <View style={styles.expandedPlaceContent}>
              <Text style={styles.expandedPlaceName} numberOfLines={1}>
                {place.name}
              </Text>
              <Text style={styles.expandedPlaceCity} numberOfLines={1}>
                {place.city}
              </Text>
              {place.rating > 0 && (
                <View style={styles.expandedPlaceRating}>
                  <Ionicons name="star" size={11} color={colors.gold.primary} />
                  <Text style={styles.expandedPlaceRatingText}>
                    {place.rating.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.gold.muted} />
          </Pressable>
        ))}
      </View>
    );
  };

  // ------ Render ------
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Guide</Text>
        <View style={styles.headerRule} />
        <Text style={styles.headerSubtitle}>CURATED COLLECTIONS</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Featured Guide */}
        {featured && (
          <>
            <Pressable
              style={styles.featuredCard}
              onPress={() => handleGuidePress(featured)}
            >
              <Image
                source={{ uri: featured.imageURL }}
                style={styles.featuredImage}
              />
              {/* Decorative brass line at top */}
              <View style={styles.featuredBrassLine} />
              <View style={styles.featuredOverlay}>
                <View style={styles.featuredBadge}>
                  <Ionicons name="star" size={10} color={colors.gold.primary} />
                  <Text style={styles.featuredBadgeText}>FEATURED</Text>
                </View>
                <View style={styles.featuredContent}>
                  <Text style={styles.featuredTitle}>{featured.title}</Text>
                  <Text style={styles.featuredSubtitle}>
                    {featured.subtitle}
                  </Text>
                  <View style={styles.featuredDivider} />
                  <View style={styles.featuredMeta}>
                    <Ionicons
                      name="location"
                      size={13}
                      color={colors.gold.light}
                    />
                    <Text style={styles.featuredMetaText}>
                      {featured.placesCount} places
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
            {renderExpandedPlaces(featured.category)}
          </>
        )}

        {/* Guide List */}
        {otherGuides.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionRuleLeft} />
              <Text style={styles.sectionTitle}>All Collections</Text>
              <View style={styles.sectionRuleRight} />
            </View>

            {otherGuides.map((guide) => (
              <React.Fragment key={guide.category}>
                <Pressable
                  style={styles.guideCard}
                  onPress={() => handleGuidePress(guide)}
                >
                  {/* Brass accent line on left edge */}
                  <View style={styles.guideAccentLine} />
                  <Image
                    source={{ uri: guide.imageURL }}
                    style={styles.guideImage}
                  />
                  <View style={styles.guideContent}>
                    <Text style={styles.guideTitle}>{guide.title}</Text>
                    <Text style={styles.guideSubtitle}>{guide.subtitle}</Text>
                    <View style={styles.guideMeta}>
                      <Ionicons
                        name="location-outline"
                        size={11}
                        color={colors.gold.muted}
                      />
                      <Text style={styles.guideMetaText}>
                        {guide.placesCount} places
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={selectedCategory === guide.category ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={selectedCategory === guide.category ? colors.gold.primary : colors.gold.muted}
                  />
                </Pressable>
                {renderExpandedPlaces(guide.category)}
              </React.Fragment>
            ))}
          </>
        )}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

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

  // ─── Featured Card ────────────────────────────────────────────────
  featuredCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    borderRadius: radius.lg,
    overflow: 'hidden',
    height: 240,
    ...shadows.lg,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background.tertiary,
  },
  featuredBrassLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: colors.gold.primary,
    zIndex: 2,
  },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 15, 14, 0.52)',
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(11, 15, 14, 0.75)',
    borderWidth: 1,
    borderColor: colors.gold.muted,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: 3,
    gap: 6,
  },
  featuredBadgeText: {
    fontFamily: fonts.sans.medium,
    fontSize: 9,
    color: colors.gold.primary,
    letterSpacing: 2.5,
  },
  featuredContent: {
    gap: 6,
  },
  featuredTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 26,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  featuredSubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.gold.light,
    letterSpacing: 0.3,
  },
  featuredDivider: {
    width: 28,
    height: 1,
    backgroundColor: colors.gold.muted,
    marginVertical: 2,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  featuredMetaText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.gold.light,
    letterSpacing: 0.5,
  },

  // ─── Section Header ───────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  sectionRuleLeft: {
    width: 20,
    height: 1,
    backgroundColor: colors.gold.muted,
  },
  sectionTitle: {
    fontFamily: fonts.serif.regular,
    fontSize: 16,
    color: colors.text.secondary,
    letterSpacing: 2,
  },
  sectionRuleRight: {
    flex: 1,
    height: 1,
    backgroundColor: colors.ui.divider,
  },

  // ─── Guide Cards ──────────────────────────────────────────────────
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.md,
    overflow: 'hidden',
    paddingVertical: spacing.md,
    paddingRight: spacing.lg,
    paddingLeft: 0,
    gap: spacing.md,
    ...shadows.sm,
  },
  guideAccentLine: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: colors.gold.muted,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
  },
  guideImage: {
    width: 68,
    height: 68,
    borderRadius: radius.sm,
    backgroundColor: colors.background.tertiary,
    marginLeft: spacing.sm,
  },
  guideContent: {
    flex: 1,
    gap: 3,
  },
  guideTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 16,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  guideSubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.secondary,
    letterSpacing: 0.2,
  },
  guideMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  guideMetaText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.gold.muted,
    letterSpacing: 0.5,
  },

  // ─── Expanded Place List ──────────────────────────────────────────
  expandedContainer: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ui.border,
  },
  expandedHeaderRule: {
    height: 1,
    backgroundColor: colors.gold.muted,
    marginHorizontal: spacing.lg,
    opacity: 0.4,
  },
  expandedPlaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ui.divider,
  },
  expandedPlaceCardLast: {
    borderBottomWidth: 0,
  },
  expandedPlaceIndex: {
    width: 22,
    alignItems: 'center',
  },
  expandedPlaceIndexText: {
    fontFamily: fonts.sans.regular,
    fontSize: 10,
    color: colors.gold.muted,
    letterSpacing: 1,
  },
  expandedPlaceImage: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.background.tertiary,
  },
  expandedPlaceContent: {
    flex: 1,
    gap: 2,
  },
  expandedPlaceName: {
    fontFamily: fonts.serif.regular,
    fontSize: 14,
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  expandedPlaceCity: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  expandedPlaceRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  expandedPlaceRatingText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.primary,
    letterSpacing: 0.3,
  },
});
