import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { useGuidesStore, useAuthStore } from '../../src/stores';
import { avatarUrl } from '../../src/utils/placeholderAvatar';
import type { Guide } from '../../src/types';

export default function GuidesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { guides, isLoading, fetchGuides, toggleLike } = useGuidesStore();

  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchGuides();
    }, []),
  );

  // Get unique cities from guides
  const cities = useMemo(() => {
    const citySet = new Set<string>();
    guides.forEach((g) => {
      if (g.city) citySet.add(g.city);
    });
    return Array.from(citySet).sort();
  }, [guides]);

  // Filter guides by city
  const filteredGuides = useMemo(() => {
    if (!selectedCity) return guides;
    return guides.filter((g) => g.city === selectedCity);
  }, [guides, selectedCity]);

  const handleOpenLink = (url: string) => {
    let finalUrl = url.trim();
    if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    if (finalUrl) Linking.openURL(finalUrl).catch(() => {});
  };

  const renderGuideCard = useCallback(
    ({ item: guide }: { item: Guide }) => {
      const isLiked = guide.likedBy?.includes(user?.uid ?? '');
      const hasLink = !!guide.websiteURL?.trim();

      return (
        <View style={styles.guideCard}>
          {/* Photo + Info Row */}
          <View style={styles.guideTopRow}>
            {guide.photoURL ? (
              <Image source={{ uri: guide.photoURL }} style={styles.guidePhoto} />
            ) : (
              <View style={[styles.guidePhoto, styles.guidePhotoPlaceholder]}>
                <Ionicons name="person-outline" size={24} color={colors.gold.muted} />
              </View>
            )}
            <View style={styles.guideInfo}>
              <Text style={styles.guideName}>{guide.name}</Text>
              <View style={styles.guideLocationRow}>
                <Ionicons name="location" size={12} color={colors.gold.primary} />
                <Text style={styles.guideLocation}>
                  {guide.city}{guide.country ? `, ${guide.country}` : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {guide.description ? (
            <Text style={styles.guideDescription} numberOfLines={4}>
              {guide.description}
            </Text>
          ) : null}

          {/* Website Link */}
          {hasLink && (
            <Pressable style={styles.guideLinkRow} onPress={() => handleOpenLink(guide.websiteURL)}>
              <Ionicons name="globe-outline" size={14} color={colors.gold.primary} />
              <Text style={styles.guideLinkText} numberOfLines={1}>
                {guide.websiteURL.replace(/^https?:\/\/(www\.)?/, '')}
              </Text>
              <Ionicons name="open-outline" size={12} color={colors.text.tertiary} />
            </Pressable>
          )}

          {/* Footer: recommended by + actions */}
          <View style={styles.guideFooter}>
            <View style={styles.guideRecommendedBy}>
              <Image
                source={{ uri: avatarUrl(guide.userPhoto, guide.userId) }}
                style={styles.guideRecommenderAvatar}
              />
              <Text style={styles.guideRecommenderText}>
                Added by {guide.userName}
              </Text>
            </View>
            <View style={styles.guideActions}>
              <Pressable style={styles.guideActionButton} onPress={() => toggleLike(guide.id)}>
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={16}
                  color={isLiked ? colors.gold.primary : colors.text.tertiary}
                />
                {(guide.likesCount || 0) > 0 && (
                  <Text style={[styles.guideActionText, isLiked && { color: colors.gold.primary }]}>
                    {guide.likesCount}
                  </Text>
                )}
              </Pressable>
              {guide.userId === user?.uid && (
                <Pressable
                  style={styles.guideActionButton}
                  onPress={() => {
                    const { deleteGuide } = useGuidesStore.getState();
                    deleteGuide(guide.id);
                  }}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.text.tertiary} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      );
    },
    [user?.uid, toggleLike],
  );

  if (isLoading && guides.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Guides</Text>
          <Text style={styles.headerSubtitle}>RECOMMENDED TOUR GUIDES</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Guides</Text>
          <Text style={styles.headerSubtitle}>RECOMMENDED TOUR GUIDES</Text>
        </View>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/modal/write-guide' as any)}
        >
          <Ionicons name="add" size={20} color={colors.background.primary} />
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      {/* City Filter */}
      {cities.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <Pressable
            style={[styles.filterChip, !selectedCity && styles.filterChipActive]}
            onPress={() => setSelectedCity(null)}
          >
            <Text style={[styles.filterChipText, !selectedCity && styles.filterChipTextActive]}>
              All
            </Text>
          </Pressable>
          {cities.map((city) => (
            <Pressable
              key={city}
              style={[styles.filterChip, selectedCity === city && styles.filterChipActive]}
              onPress={() => setSelectedCity(selectedCity === city ? null : city)}
            >
              <Text style={[styles.filterChipText, selectedCity === city && styles.filterChipTextActive]}>
                {city}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Guides List */}
      <FlatList
        data={filteredGuides}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.guidesList}
        keyExtractor={(item) => item.id}
        renderItem={renderGuideCard}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="compass-outline" size={32} color={colors.gold.muted} />
            </View>
            <Text style={styles.emptyTitle}>No guides yet</Text>
            <Text style={styles.emptySubtitle}>
              Know a great tour guide? Add them here{'\n'}so your friends can find them too.
            </Text>
            <Pressable
              style={styles.emptyButton}
              onPress={() => router.push('/modal/write-guide' as any)}
            >
              <Text style={styles.emptyButtonText}>Add a Guide</Text>
            </Pressable>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 28,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 2,
    letterSpacing: 1.5,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gold.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  addButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.background.primary,
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Filter
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  filterChipActive: {
    backgroundColor: colors.gold.primary + '20',
    borderColor: colors.gold.primary,
  },
  filterChipText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  filterChipTextActive: {
    color: colors.gold.primary,
  },

  // Guides List
  guidesList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  // Guide Card
  guideCard: {
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    gap: spacing.md,
    ...shadows.sm,
  },
  guideTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  guidePhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background.tertiary,
  },
  guidePhotoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  guideInfo: {
    flex: 1,
    gap: 3,
  },
  guideName: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  guideLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  guideLocation: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.secondary,
  },
  guideDescription: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 21,
    letterSpacing: 0.15,
  },
  guideLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.gold.primary + '0A',
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.gold.primary + '25',
  },
  guideLinkText: {
    flex: 1,
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.gold.primary,
  },
  guideFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ui.divider,
  },
  guideRecommendedBy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  guideRecommenderAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.gold.muted,
  },
  guideRecommenderText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.2,
  },
  guideActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  guideActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    padding: 4,
  },
  guideActionText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.tertiary,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
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
  },
  emptySubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: spacing.md,
    backgroundColor: colors.gold.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  emptyButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.background.primary,
    letterSpacing: 0.5,
  },
});
