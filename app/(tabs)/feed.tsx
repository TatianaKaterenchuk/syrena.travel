import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { useFeedStore } from '../../src/stores';
import type { FeedItem, FeedItemType } from '../../src/types';

/**
 * Converts a Firebase Timestamp (or Timestamp-like object with `seconds`) into
 * a human-readable relative string such as "2h ago" or "3d ago".
 */
function getRelativeTime(createdAt: { seconds: number }): string {
  const now = Date.now();
  const then = createdAt.seconds * 1000;
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function getFeedText(item: FeedItem): string {
  switch (item.type) {
    case 'new_place':
      return `added ${item.placeName}`;
    case 'review':
      return `reviewed ${item.placeName}`;
    case 'friend_added':
      return `became friends with ${item.targetUserName}`;
    case 'place_saved':
      return `saved ${item.placeName}`;
    default:
      return '';
  }
}

function getFeedIcon(type: FeedItemType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'new_place':
      return 'add-circle';
    case 'review':
      return 'star';
    case 'friend_added':
      return 'people';
    case 'place_saved':
      return 'heart';
    default:
      return 'ellipse';
  }
}

function FeedCard({ item }: { item: FeedItem }) {
  return (
    <Pressable style={styles.feedCard}>
      <View style={styles.feedCardAccent} />
      <View style={styles.feedCardHeader}>
        <Image source={{ uri: item.actorPhoto }} style={styles.feedAvatar} />
        <View style={styles.feedTextContainer}>
          <Text style={styles.feedText}>
            <Text style={styles.feedActorName}>{item.actorName}</Text>
            {'  '}
            {getFeedText(item)}
          </Text>
          <Text style={styles.feedTime}>{getRelativeTime(item.createdAt)}</Text>
        </View>
        <View style={styles.feedIconBadge}>
          <Ionicons
            name={getFeedIcon(item.type)}
            size={13}
            color={colors.gold.primary}
          />
        </View>
      </View>
      {item.placeImageURL ? (
        <Image source={{ uri: item.placeImageURL }} style={styles.feedImage} />
      ) : null}
    </Pressable>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { feedItems, isLoading, fetchFeed } = useFeedStore();

  useEffect(() => {
    fetchFeed();
  }, []);

  if (isLoading && feedItems.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Feed</Text>
          <Text style={styles.headerSubtitle}>Friends' Activity</Text>
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
        <Text style={styles.headerTitle}>Feed</Text>
        <Text style={styles.headerSubtitle}>Friends' Activity</Text>
      </View>

      <FlatList
        data={feedItems}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedList}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FeedCard item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name="people-outline"
                size={32}
                color={colors.gold.muted}
              />
            </View>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySubtitle}>
              Add friends to see their discoveries
            </Text>
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
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  feedList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Feed Card
  feedCard: {
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    ...shadows.sm,
  },
  feedCardAccent: {
    height: 1,
    backgroundColor: colors.gold.muted,
    opacity: 0.5,
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  feedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.gold.muted,
  },
  feedTextContainer: {
    flex: 1,
    gap: 3,
  },
  feedText: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    letterSpacing: 0.15,
  },
  feedActorName: {
    fontFamily: fonts.serif.regular,
    color: colors.text.primary,
    fontSize: 15,
  },
  feedTime: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  feedIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gold.primary + '0D',
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedImage: {
    width: '100%',
    height: 180,
    backgroundColor: colors.background.tertiary,
  },
  // Empty
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
  },
});
