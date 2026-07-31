import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius } from '../../theme';
import { usePlacesStore } from '../../stores/usePlacesStore';
import { useFriendsStore } from '../../stores/useFriendsStore';
import { useAuthStore } from '../../stores/useAuthStore';

const DISMISS_KEY = 'syrena_checklist_dismissed';
const FIRST_SEEN_KEY = 'syrena_checklist_first_seen';
export const SHARED_CITY_KEY = 'syrena_has_shared_city';

// After this many days the full card collapses into a one-line progress
// pill so the first screen belongs to places, not onboarding chrome.
const COMPACT_AFTER_DAYS = 3;

interface ChecklistItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  done: boolean;
  onPress: () => void;
}

/**
 * "Get the most out of Syrena" card shown at the top of Explore until the
 * user has tried every core feature. Checkmarks are driven by real state,
 * each row deep-links to the feature, and the card can be dismissed.
 */
export default function ActivationChecklist() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const places = usePlacesStore((s) => s.places);
  const userPlaces = usePlacesStore((s) => s.userPlaces);
  const beenPlaceIds = usePlacesStore((s) => s.beenPlaceIds);
  const friends = useFriendsStore((s) => s.friends);

  const [dismissed, setDismissed] = useState(true); // hidden until storage read
  const [hasSharedCity, setHasSharedCity] = useState(false);
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState(false); // user tapped the compact pill

  useEffect(() => {
    AsyncStorage.multiGet([DISMISS_KEY, SHARED_CITY_KEY, FIRST_SEEN_KEY]).then((pairs) => {
      const map = Object.fromEntries(pairs);
      setDismissed(map[DISMISS_KEY] === 'true');
      setHasSharedCity(map[SHARED_CITY_KEY] === 'true');
      const firstSeen = Number(map[FIRST_SEEN_KEY]);
      if (!firstSeen) {
        AsyncStorage.setItem(FIRST_SEEN_KEY, String(Date.now()));
      } else if (Date.now() - firstSeen > COMPACT_AFTER_DAYS * 24 * 60 * 60 * 1000) {
        setCompact(true);
      }
    });
  }, []);

  const items: ChecklistItem[] = useMemo(() => {
    const uid = user?.uid;
    const firstPlaceId = places[0]?.id;
    return [
      {
        key: 'add',
        label: 'Add your first recommendation',
        icon: 'add-circle',
        done: !!uid && places.some((p) => p.createdBy === uid),
        onPress: () => router.push('/modal/add-place'),
      },
      {
        key: 'favorite',
        label: 'Save a place to your favorites',
        icon: 'heart',
        done: userPlaces.some((up) => up.isFavorite),
        onPress: () =>
          firstPlaceId
            ? router.push({ pathname: '/modal/place-detail', params: { id: firstPlaceId } })
            : undefined,
      },
      {
        key: 'been',
        label: "Mark somewhere you've visited",
        icon: 'checkmark-circle',
        done: beenPlaceIds.length > 0,
        onPress: () =>
          firstPlaceId
            ? router.push({ pathname: '/modal/place-detail', params: { id: firstPlaceId } })
            : undefined,
      },
      {
        key: 'friend',
        label: 'Add a friend',
        icon: 'people',
        done: friends.length > 0,
        onPress: () => router.push('/(tabs)/friends'),
      },
      {
        key: 'share',
        label: 'Share a city with a friend',
        icon: 'share-social',
        done: hasSharedCity,
        onPress: () => router.push('/(tabs)/my-places'),
      },
    ];
  }, [user?.uid, places, userPlaces, beenPlaceIds, friends, hasSharedCity, router]);

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  // Hide permanently once everything's checked off (quietly — no ceremony).
  useEffect(() => {
    if (allDone && !dismissed) {
      AsyncStorage.setItem(DISMISS_KEY, 'true');
    }
  }, [allDone, dismissed]);

  if (dismissed || allDone) return null;

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissed(true);
    AsyncStorage.setItem(DISMISS_KEY, 'true');
  };

  if (compact && !expanded) {
    return (
      <Pressable
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel={`Getting started: ${doneCount} of ${items.length} complete. Tap to expand.`}
      >
        <Text style={styles.pillText}>
          Getting started · {doneCount} of {items.length}
        </Text>
        <View style={styles.pillTrack}>
          <View
            style={[styles.pillFill, { width: `${(doneCount / items.length) * 100}%` }]}
          />
        </View>
        <Ionicons name="chevron-down" size={14} color={colors.gold.muted} />
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Get the most out of Syrena</Text>
          <Text style={styles.subtitle}>
            {doneCount} of {items.length} complete
          </Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          hitSlop={10}
          accessibilityLabel="Dismiss checklist"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={18} color={colors.text.tertiary} />
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${(doneCount / items.length) * 100}%` }]}
        />
      </View>

      {items.map((item) => (
        <Pressable
          key={item.key}
          style={({ pressed }) => [styles.row, pressed && !item.done && { opacity: 0.7 }]}
          onPress={item.done ? undefined : item.onPress}
          disabled={item.done}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <Ionicons
            name={item.done ? 'checkmark-circle' : item.icon}
            size={20}
            color={item.done ? colors.ui.success : colors.gold.primary}
          />
          <Text style={[styles.rowLabel, item.done && styles.rowLabelDone]}>
            {item.label}
          </Text>
          {!item.done && (
            <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold.primary + '35',
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif.bold,
    fontSize: 16,
    color: colors.text.primary,
  },
  subtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.gold.muted,
    marginTop: 2,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ui.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gold.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    color: colors.text.secondary,
  },
  rowLabelDone: {
    color: colors.text.tertiary,
    textDecorationLine: 'line-through',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1,
    borderColor: colors.gold.primary + '25',
  },
  pillText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.secondary,
  },
  pillTrack: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.ui.border,
    overflow: 'hidden',
  },
  pillFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.gold.primary,
  },
});
