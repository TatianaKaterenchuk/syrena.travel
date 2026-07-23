import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Linking,
  Platform,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Timestamp } from 'firebase/firestore';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { usePlacesStore, useAuthStore, useFriendsStore, useListsStore } from '../../src/stores';
import { avatarUrl, placeImageUri } from '../../src/utils/placeholderAvatar';
import DiscoveryTip from '../../src/components/onboarding/DiscoveryTip';
import OptionSheet from '../../src/components/ui/OptionSheet';
import { PlaceCategory, Review, UserPlace, BudgetTier, BUDGET_ICONS, BUDGET_LABELS, StarRating, STAR_LABELS, Friend } from '../../src/types';
import { getDocuments, createDocument, updateDocument, orderBy, where } from '../../src/services/firebase/firestore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.45;

const FALLBACK_IMAGES: string[] = [];

function formatTimeAgo(timestamp: Timestamp): string {
  const now = Date.now();
  const then = timestamp.toMillis();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
}

export default function PlaceDetailModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [reviews, setReviews] = useState<Review[]>([]);

  const { places, userPlaces, beenPlaceIds, savePlace, removePlace, toggleFavorite, toggleGoldStar, toggleBeen, requestDeletion, updatePersonalNote } = usePlacesStore();
  const scrollViewRef = useRef<ScrollView>(null);
  const { user, profile } = useAuthStore();

  // Review form state
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Mutual friends
  const [mutualFriends, setMutualFriends] = useState<Friend[]>([]);
  const { getMutualFriends, friends } = useFriendsStore();

  // Friends who've been here
  const [friendsBeenHere, setFriendsBeenHere] = useState<Friend[]>([]);
  const [showFriendsBeen, setShowFriendsBeen] = useState(false);

  // Lists
  const { lists, fetchLists, addPlaceToList, removePlaceFromList } = useListsStore();

  const place = useMemo(
    () => places.find((p) => p.id === id) ?? null,
    [places, id],
  );

  const isSaved = useMemo(
    () => userPlaces.some((up) => up.placeId === id),
    [userPlaces, id],
  );

  const userPlace = useMemo(
    () => userPlaces.find((up) => up.placeId === id) ?? null,
    [userPlaces, id],
  );

  // Fetch reviews from Firestore
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        const fetched = await getDocuments<Review>(
          `places/${id}/reviews`,
          [orderBy('createdAt', 'desc')],
        );
        if (!cancelled) setReviews(fetched);
      } catch (error) {
        console.error('Error fetching reviews:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Fetch mutual friends with the place creator
  useEffect(() => {
    if (!place?.createdBy || !user?.uid || place.createdBy === user.uid) {
      setMutualFriends([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const mutual = await getMutualFriends(place.createdBy);
      if (!cancelled) setMutualFriends(mutual);
    })();
    return () => { cancelled = true; };
  }, [place?.createdBy, user?.uid]);

  // Fetch friends who've been to this place
  useEffect(() => {
    if (!id || friends.length === 0) {
      setFriendsBeenHere([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const visits = await getDocuments<{ userId: string; placeId: string }>('placeVisits', [
          where('placeId', '==', id),
        ]);
        const visitUserIds = new Set(visits.map((v) => v.userId));
        const matched = friends.filter((f) => f.status === 'accepted' && visitUserIds.has(f.uid));
        if (!cancelled) setFriendsBeenHere(matched);
      } catch (error) {
        console.error('Error fetching friends been:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [id, friends]);

  const handleToggleSave = () => {
    if (!place || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isSaved) {
      removePlace(place.id);
    } else {
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
      savePlace(userPlace);
    }
  };

  const handleDirections = () => {
    if (!place || !place.location) return;
    const lat = place.location.latitude;
    const lng = place.location.longitude;
    const label = encodeURIComponent(place.name);

    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });

    if (url) Linking.openURL(url);
  };

  const handleSubmitReview = async () => {
    if (!user || !profile || !id) return;
    if (reviewRating === 0) {
      Alert.alert('Rating Required', 'Please select a star rating.');
      return;
    }
    if (!reviewText.trim()) {
      Alert.alert('Review Required', 'Please write a short review.');
      return;
    }

    setIsSubmittingReview(true);
    try {
      await createDocument(`places/${id}/reviews`, {
        userId: user.uid,
        userName: profile.displayName || 'Anonymous',
        userPhoto: profile.photoURL || '',
        rating: reviewRating,
        text: reviewText.trim(),
      });

      const allReviews = await getDocuments<Review>(
        `places/${id}/reviews`,
        [orderBy('createdAt', 'desc')],
      );
      const avgRating =
        allReviews.length > 0
          ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
          : 0;
      await updateDocument('places', id, {
        rating: Math.round(avgRating * 10) / 10,
        ratingCount: allReviews.length,
      });

      usePlacesStore.getState().fetchPlaces();
      setReviews(allReviews);
      setReviewText('');
      setReviewRating(0);
      setShowReviewForm(false);
    } catch (error) {
      console.error('Error submitting review:', error);
      Alert.alert('Error', 'Could not submit your review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleRequestDeletion = () => {
    if (!place || !user) return;
    Alert.prompt(
      'Request Deletion',
      `Why should "${place.name}" be removed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'destructive',
          onPress: async (reason?: string) => {
            if (!reason?.trim()) {
              Alert.alert('Reason Required', 'Please provide a reason.');
              return;
            }
            try {
              await requestDeletion(place.id, place.name, reason.trim());
              Alert.alert('Submitted', 'Your deletion request has been sent to an admin for review.');
            } catch {
              Alert.alert('Error', 'Could not submit deletion request.');
            }
          },
        },
      ],
      'plain-text',
      '',
      'default',
    );
  };

  const hasBeen = useMemo(
    () => id ? beenPlaceIds.includes(id) : false,
    [beenPlaceIds, id],
  );

  useFocusEffect(
    useCallback(() => {
      if (user?.uid) fetchLists();
    }, [user?.uid])
  );

  // Branded bottom sheet instead of a system Alert menu.
  const [showListSheet, setShowListSheet] = useState(false);

  // Private note editing
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const handleSaveToList = () => {
    if (!id || !place) return;
    setShowListSheet(true);
  };

  const handleListSheetSelect = (key: string) => {
    if (!id) return;
    if (key === '__new__') {
      setShowListSheet(false);
      Alert.prompt(
        'New List',
        'Enter a name for your new list',
        async (listName) => {
          if (listName?.trim()) {
            const { createList } = useListsStore.getState();
            const newListId = await createList(listName.trim());
            if (newListId) {
              addPlaceToList(newListId, id);
            }
          }
        },
      );
      return;
    }
    const list = lists.find((l) => l.id === key);
    if (!list) return;
    if (list.placeIds.includes(id)) {
      removePlaceFromList(list.id, id);
    } else {
      addPlaceToList(list.id, id);
    }
    setShowListSheet(false);
  };

  const hasReviewed = useMemo(
    () => reviews.some((r) => r.userId === user?.uid),
    [reviews, user],
  );

  // Loading / not found state
  if (!place) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Back button so a missing/deleted place is never a dead end */}
        <Pressable
          style={styles.loadingBackButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
          <Text style={styles.loadingText}>Loading place...</Text>
        </View>
      </View>
    );
  }

  const categoryColor =
    colors.category[place.category as keyof typeof colors.category] ??
    colors.gold.primary;

  const images =
    place.imageURLs && place.imageURLs.length > 0
      ? place.imageURLs
      : [placeImageUri(undefined, place.id)];

  const isCreator = place?.createdBy === user?.uid;
  const isAdmin = profile?.isAdmin === true;

  // Star rating display
  const starRating = place.starRating as StarRating | undefined;

  // Social count: people who saved + visited
  const loveCount = (place.savesCount || 0) + (place.beenCount || 0);

  return (
    <View style={styles.container}>
      <DiscoveryTip
        id="place-actions"
        icon="sparkles"
        title="Make it yours"
        text="Favorite it, mark it Visited, save it to a list — or suggest an edit if something's off."
      />
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={true}
      >
        {/* ── Hero Image Section ─────────────────────────────────────── */}
        <View style={styles.heroContainer}>
          {images.length > 0 ? (
            <>
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const index = Math.round(
                    e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
                  );
                  setActiveImageIndex(index);
                }}
                keyExtractor={(_, i) => i.toString()}
                renderItem={({ item }) =>
                  failedImages.has(item) ? (
                    <View style={[styles.heroImage, styles.noImagePlaceholder]}>
                      <Ionicons name="image-outline" size={48} color={colors.gold.muted} />
                    </View>
                  ) : (
                    <Image
                      source={{ uri: item }}
                      style={styles.heroImage}
                      contentFit="cover"
                      onError={() => {
                        setFailedImages((prev) => new Set(prev).add(item));
                      }}
                    />
                  )
                }
              />
              {/* Image credit overlay */}
              {place.createdByName && (
                <Text style={[styles.heroCredit, { bottom: 12 + (images.length > 1 ? 20 : 0) }]}>
                  {place.name} by {place.createdByName}
                </Text>
              )}
              {/* Pagination dots */}
              {images.length > 1 && (
                <View style={styles.heroPagination}>
                  {images.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.heroDot,
                        i === activeImageIndex && styles.heroDotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
              {/* Photo count badge (grid button was a dead tap target —
                  removed until an actual gallery view exists) */}
              {images.length > 1 && (
                <View style={styles.heroGridButton}>
                  <Text style={styles.heroPhotoCount}>
                    {activeImageIndex + 1}/{images.length}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={[styles.heroImage, styles.noImagePlaceholder]}>
              <Ionicons name="image-outline" size={48} color={colors.text.tertiary + '60'} />
              <Text style={styles.noImageText}>No photos yet</Text>
            </View>
          )}

          {/* Floating header buttons — pointerEvents="box-none" so the empty
              band between buttons doesn't block image-carousel swipes. */}
          <View
            style={[styles.heroOverlay, { paddingTop: insets.top + 8 }]}
            pointerEvents="box-none"
          >
            <Pressable
              style={styles.heroButton}
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
            <View style={styles.heroActions} pointerEvents="box-none">
              <Pressable
                style={styles.heroButton}
                onPress={handleDirections}
                hitSlop={8}
                accessibilityLabel="Get directions"
                accessibilityRole="button"
              >
                <Ionicons name="map" size={20} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.heroButton}
                onPress={() => {
                  // Include the web link — a bare text share was a dead end
                  // for anyone without the app.
                  Share.share({
                    message:
                      `Check out ${place.name}${place.city ? ` in ${place.city}` : ''}${place.country ? `, ${place.country}` : ''} on Syrena Voyager!\n` +
                      `https://syrena-travel.web.app/place?id=${place.id}`,
                  });
                }}
                hitSlop={8}
                accessibilityLabel="Share place"
                accessibilityRole="button"
              >
                <Ionicons name="share-outline" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Content Section ────────────────────────────────────────── */}
        <View style={styles.contentSection}>
          {/* Star Rating */}
          {starRating && (
            <View style={styles.starRatingRow}>
              {Array.from({ length: starRating }).map((_, i) => (
                <Ionicons key={i} name="star" size={18} color={colors.gold.primary} />
              ))}
              <Text style={styles.starRatingLabel}>
                {STAR_LABELS[starRating]}
              </Text>
            </View>
          )}

          {/* Place Name */}
          <Text style={styles.placeName}>{place.name}</Text>

          {/* Address */}
          <Text style={styles.placeAddress}>
            {place.address}{place.city ? `, ${place.city}` : ''}{place.country ? `, ${place.country}` : ''}
          </Text>

          {/* Category + subcategory */}
          <View style={styles.metaRow}>
            <Text style={[styles.categoryLabel, { color: categoryColor }]}>
              {place.category.charAt(0).toUpperCase() + place.category.slice(1)}
            </Text>
            {place.subcategory ? (
              <Text style={styles.subcategoryLabel}> · {place.subcategory}</Text>
            ) : null}
            {place.budgetTier ? (
              <Text style={styles.budgetLabel}>
                {' · '}{BUDGET_ICONS[place.budgetTier as BudgetTier]}
              </Text>
            ) : null}
          </View>

          {/* ── Action Buttons Row (Michelin style) ───────────────── */}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionButton, isSaved && styles.actionButtonActive]}
              onPress={handleToggleSave}
            >
              <Ionicons
                name={isSaved ? 'heart' : 'heart-outline'}
                size={22}
                color={isSaved ? colors.gold.primary : colors.text.secondary}
              />
              <Text style={[styles.actionButtonText, isSaved && styles.actionButtonTextActive]}>
                Favorite
              </Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, lists.some((l) => l.placeIds.includes(id || '')) && styles.actionButtonActive]}
              onPress={handleSaveToList}
            >
              <Ionicons
                name={lists.some((l) => l.placeIds.includes(id || '')) ? 'bookmark' : 'bookmark-outline'}
                size={22}
                color={lists.some((l) => l.placeIds.includes(id || '')) ? colors.gold.primary : colors.text.secondary}
              />
              <Text style={[styles.actionButtonText, lists.some((l) => l.placeIds.includes(id || '')) && styles.actionButtonTextActive]}>
                Save
              </Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, hasBeen && styles.actionButtonActive]}
              onPress={() => {
                if (!id) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleBeen(id);
              }}
            >
              <Ionicons
                name={hasBeen ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={22}
                color={hasBeen ? colors.gold.primary : colors.text.secondary}
              />
              <Text style={[styles.actionButtonText, hasBeen && styles.actionButtonTextActive]}>
                Visited
              </Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => {
                // Authors and admins edit directly; everyone else files an
                // edit suggestion that an admin approves. (Matches the new
                // Firestore rules: only creator/admin may write a place.)
                const editMode = profile?.isAdmin || isCreator ? 'edit' : 'suggest';
                router.push({
                  pathname: '/modal/edit-place',
                  params: { id: place.id, mode: editMode },
                });
              }}
            >
              <Ionicons name="create-outline" size={22} color={colors.text.secondary} />
              <Text style={styles.actionButtonText}>
                {profile?.isAdmin || isCreator ? 'Edit' : 'Suggest'}
              </Text>
            </Pressable>
          </View>

          {/* ── Social Proof ──────────────────────────────────────── */}
          {(friendsBeenHere.length > 0 || loveCount > 0 || place.createdByPhoto) && (
            <View style={styles.socialSection}>
              {/* Added by + friends avatars */}
              <View style={styles.socialAvatarRow}>
                {/* Creator avatar */}
                {place.createdByPhoto && (
                  <Pressable
                    onPress={() => place.createdBy && router.push(`/modal/user-profile?id=${place.createdBy}`)}
                  >
                    <Image source={{ uri: place.createdByPhoto }} style={styles.socialAvatar} />
                  </Pressable>
                )}
                {/* Friends who've been here avatars */}
                {friendsBeenHere.slice(0, 3).map((friend, index) => (
                  <Pressable
                    key={friend.uid}
                    onPress={() => router.push(`/modal/user-profile?id=${friend.uid}`)}
                  >
                    <Image
                      source={{ uri: avatarUrl(friend.photoURL, friend.uid) }}
                      style={[styles.socialAvatar, { marginLeft: -8 }]}
                    />
                  </Pressable>
                ))}
                {/* Mutual friends */}
                {mutualFriends.filter(f => !friendsBeenHere.some(fb => fb.uid === f.uid)).slice(0, 2).map((friend) => (
                  <Pressable
                    key={friend.uid}
                    onPress={() => router.push(`/modal/user-profile?id=${friend.uid}`)}
                  >
                    <Image
                      source={{ uri: avatarUrl(friend.photoURL, friend.uid) }}
                      style={[styles.socialAvatar, { marginLeft: -8 }]}
                    />
                  </Pressable>
                ))}
              </View>

              {/* Social text */}
              <View style={styles.socialTextCol}>
                {loveCount > 0 && (
                  <Text style={styles.socialCountText}>
                    <Text style={styles.socialCountBold}>{loveCount} {loveCount === 1 ? 'person' : 'people'}</Text> love this place
                  </Text>
                )}
                {friendsBeenHere.length > 0 && (
                  <Pressable onPress={() => setShowFriendsBeen(!showFriendsBeen)}>
                    <Text style={styles.socialFriendsLink}>
                      {friendsBeenHere.length} friend{friendsBeenHere.length !== 1 ? 's' : ''} visited
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Friends been expandable list */}
          {showFriendsBeen && friendsBeenHere.length > 0 && (
            <View style={styles.friendsExpandedList}>
              {friendsBeenHere.map((friend) => (
                <Pressable
                  key={friend.uid}
                  style={styles.friendsExpandedItem}
                  onPress={() => router.push(`/modal/user-profile?id=${friend.uid}`)}
                >
                  <Image
                    source={{ uri: avatarUrl(friend.photoURL, friend.uid) }}
                    style={styles.friendsExpandedAvatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.friendsExpandedName}>{friend.displayName}</Text>
                    <Text style={styles.friendsExpandedUsername}>@{friend.username}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Description ───────────────────────────────────────── */}
          {place.description ? (
            <Text style={styles.description}>{place.description}</Text>
          ) : null}

          {/* ── Must-try dishes / drinks ──────────────────────────── */}
          {place.mustTry ? (
            <View style={styles.mustTryBox}>
              <View style={styles.mustTryHeader}>
                <Ionicons
                  name={place.category === 'bar' || place.category === 'club' ? 'wine' : 'restaurant'}
                  size={14}
                  color={colors.gold.primary}
                />
                <Text style={styles.mustTryLabel}>
                  {place.category === 'bar' || place.category === 'club'
                    ? 'MUST-TRY DRINKS'
                    : 'MUST-TRY DISHES'}
                </Text>
              </View>
              <Text style={styles.mustTryText}>{place.mustTry}</Text>
            </View>
          ) : null}

          {/* ── Private note (only when saved; visible only to you) ── */}
          {userPlace ? (
            <View style={styles.noteBox}>
              <View style={styles.mustTryHeader}>
                <Ionicons name="lock-closed" size={13} color={colors.gold.muted} />
                <Text style={styles.noteLabel}>MY PRIVATE NOTE</Text>
                {!isEditingNote && (
                  <Pressable
                    onPress={() => {
                      setNoteDraft(userPlace.personalNote || '');
                      setIsEditingNote(true);
                    }}
                    hitSlop={10}
                    style={{ marginLeft: 'auto' }}
                    accessibilityLabel="Edit note"
                    accessibilityRole="button"
                  >
                    <Ionicons name="pencil" size={15} color={colors.gold.primary} />
                  </Pressable>
                )}
              </View>
              {isEditingNote ? (
                <>
                  <TextInput
                    style={styles.noteInput}
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    placeholder="Ask for the corner table, order off-menu, go before 7…"
                    placeholderTextColor={colors.text.tertiary}
                    multiline
                    autoFocus
                  />
                  <View style={styles.noteActions}>
                    <Pressable
                      onPress={() => setIsEditingNote(false)}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text style={styles.noteCancel}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        try {
                          await updatePersonalNote(userPlace.id, noteDraft.trim());
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          setIsEditingNote(false);
                        } catch {
                          Alert.alert('Error', 'Could not save your note. Please try again.');
                        }
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text style={styles.noteSave}>Save</Text>
                    </Pressable>
                  </View>
                </>
              ) : userPlace.personalNote ? (
                <Text style={styles.noteText}>{userPlace.personalNote}</Text>
              ) : (
                <Pressable
                  onPress={() => {
                    setNoteDraft('');
                    setIsEditingNote(true);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.notePlaceholder}>
                    Add a note only you can see — the corner table, what to order, who to ask for…
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {/* ── Added By ──────────────────────────────────────────── */}
          <Pressable
            style={styles.addedByRow}
            onPress={() => place.createdBy && router.push(`/modal/user-profile?id=${place.createdBy}`)}
          >
            <Image
              source={{ uri: avatarUrl(place.createdByPhoto, place.createdBy) }}
              style={styles.addedByPhoto}
            />
            <View>
              <Text style={styles.addedByText}>
                Added by <Text style={styles.addedByName}>{place.createdByName}</Text>
              </Text>
              {mutualFriends.length > 0 && (
                <Text style={styles.mutualText}>
                  {mutualFriends.length} mutual friend{mutualFriends.length !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
          </Pressable>

          {/* ── Tags ──────────────────────────────────────────────── */}
          {place.tags && place.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <View style={styles.tagsRow}>
                {place.tags
                  .filter((tag: string) => {
                    const lower = tag.toLowerCase();
                    return (
                      lower !== place.category.toLowerCase() &&
                      lower !== place.city.toLowerCase() &&
                      lower !== place.country.toLowerCase()
                    );
                  })
                  .slice(0, 8)
                  .map((tag: string) => (
                    <Pressable
                      key={tag}
                      style={styles.tagChip}
                      onPress={() => {
                        // Dismiss all stacked modals (place-detail might be on
                        // top of user-profile or other modals). Falls back to
                        // dismiss() if dismissAll is unavailable in this expo-router version.
                        if (typeof (router as any).dismissAll === 'function') {
                          (router as any).dismissAll();
                        } else {
                          router.dismiss();
                        }
                        setTimeout(() => {
                          router.push({
                            pathname: '/(tabs)',
                            params: { search: tag },
                          });
                        }, 100);
                      }}
                    >
                      <Text style={styles.tagChipText}>{tag}</Text>
                    </Pressable>
                  ))}
              </View>
            </View>
          )}

          {/* ── Directions Card ───────────────────────────────────── */}
          <Pressable style={styles.directionsCard} onPress={handleDirections}>
            <Ionicons name="navigate" size={20} color={colors.gold.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.directionsTitle}>Get Directions</Text>
              <Text style={styles.directionsAddress} numberOfLines={1}>{place.address}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
          </Pressable>

          {/* ── Reviews ───────────────────────────────────────────── */}
          <View style={styles.reviewsSection}>
            <View style={styles.reviewsTitleRow}>
              <Text style={styles.reviewsTitle}>Reviews</Text>
              <Text style={styles.reviewsCount}>{reviews.length}</Text>
            </View>

            {user && !hasReviewed && !showReviewForm && (
              <Pressable style={styles.writeReviewButton} onPress={() => setShowReviewForm(true)}>
                <Ionicons name="create-outline" size={16} color={colors.gold.primary} />
                <Text style={styles.writeReviewText}>Write a Review</Text>
              </Pressable>
            )}

            {/* Add Review Form */}
            {showReviewForm && (
              <View style={styles.reviewFormCard}>
                <Text style={styles.reviewFormLabel}>YOUR RATING</Text>
                <View style={styles.starSelector}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Pressable key={i} onPress={() => setReviewRating(i + 1)}>
                      <Ionicons
                        name={i < reviewRating ? 'star' : 'star-outline'}
                        size={28}
                        color={colors.gold.primary}
                      />
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.reviewFormLabel}>YOUR REVIEW</Text>
                <TextInput
                  style={styles.reviewFormInput}
                  value={reviewText}
                  onChangeText={setReviewText}
                  placeholder="Share your experience..."
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  onFocus={() => {
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300);
                  }}
                />
                <View style={styles.reviewFormActions}>
                  <Pressable
                    style={styles.reviewCancelButton}
                    onPress={() => {
                      setShowReviewForm(false);
                      setReviewRating(0);
                      setReviewText('');
                    }}
                  >
                    <Text style={styles.reviewCancelText}>CANCEL</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.reviewSubmitButton,
                      (reviewRating === 0 || !reviewText.trim()) &&
                        styles.reviewSubmitDisabled,
                    ]}
                    onPress={handleSubmitReview}
                    disabled={isSubmittingReview}
                  >
                    {isSubmittingReview ? (
                      <ActivityIndicator size="small" color={colors.background.primary} />
                    ) : (
                      <Text style={styles.reviewSubmitText}>SUBMIT</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {reviews.length === 0 && !showReviewForm && (
              <Text style={styles.noReviewsText}>No reviews yet. Be the first!</Text>
            )}
            {reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <Pressable style={styles.reviewHeader} onPress={() => router.push(`/modal/user-profile?id=${review.userId}`)}>
                  <Image
                    source={{ uri: avatarUrl(review.userPhoto, review.userId) }}
                    style={styles.reviewAvatar}
                  />
                  <View style={styles.reviewMeta}>
                    <Text style={styles.reviewName}>{review.userName}</Text>
                    <View style={styles.reviewRatingStars}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Ionicons
                          key={i}
                          name={i < review.rating ? 'star' : 'star-outline'}
                          size={12}
                          color={colors.gold.primary}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.reviewTime}>
                    {review.createdAt ? formatTimeAgo(review.createdAt) : ''}
                  </Text>
                </Pressable>
                <Text style={styles.reviewText}>{review.text}</Text>
              </View>
            ))}
          </View>

          {/* Delete button for creator/admin */}
          {(isCreator || isAdmin) && (
            <Pressable style={styles.deleteRow} onPress={handleRequestDeletion}>
              <Ionicons name="trash-outline" size={16} color={colors.ui.error} />
              <Text style={styles.deleteText}>Request Deletion</Text>
            </Pressable>
          )}
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>

      <OptionSheet
        visible={showListSheet}
        title="Save to List"
        subtitle={place ? `Add "${place.name}" to a list` : undefined}
        options={[
          ...lists.map((l) => ({
            key: l.id,
            label: l.name,
            icon: 'list' as const,
            checked: !!id && l.placeIds.includes(id),
          })),
          { key: '__new__', label: 'New List', icon: 'add-circle' as const },
        ]}
        onSelect={handleListSheetSelect}
        onClose={() => setShowListSheet(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — Michelin Guide inspired
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },

  // ── Hero Image ──────────────────────────────────────────────────────
  heroContainer: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    backgroundColor: colors.background.tertiary,
    position: 'relative',
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  noImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    gap: spacing.sm,
  },
  noImageText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
  },
  heroButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroCredit: {
    position: 'absolute',
    left: spacing.md,
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.3,
  },
  heroPagination: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  heroDotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroGridButton: {
    position: 'absolute',
    bottom: 12,
    right: spacing.md,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPhotoCount: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: '#fff',
  },
  loadingBackButton: {
    position: 'absolute',
    top: 60,
    left: spacing.md,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Content Section ─────────────────────────────────────────────────
  contentSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },

  // Star rating
  starRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 2,
  },
  starRatingLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.gold.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginLeft: 6,
  },

  // Name
  placeName: {
    fontFamily: fonts.serif.bold,
    fontSize: 30,
    color: colors.text.primary,
    letterSpacing: 0.3,
    lineHeight: 36,
  },

  // Address
  placeAddress: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    letterSpacing: 0.2,
  },

  // Meta row (category + subcategory + budget)
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  categoryLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  subcategoryLabel: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.secondary,
    letterSpacing: 0.3,
  },
  budgetLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.gold.primary,
    letterSpacing: 0.3,
  },

  // ── Action Buttons (Michelin style) ─────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ui.border,
    backgroundColor: colors.background.secondary,
    gap: 4,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  actionButtonActive: {
    borderColor: colors.gold.primary + '50',
    backgroundColor: colors.gold.primary + '08',
  },
  actionButtonText: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.text.secondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actionButtonTextActive: {
    color: colors.gold.primary,
  },

  // ── Social Proof ────────────────────────────────────────────────────
  socialSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.ui.border,
  },
  socialAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socialAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.background.primary,
  },
  socialTextCol: {
    flex: 1,
    gap: 2,
  },
  socialCountText: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  socialCountBold: {
    fontFamily: fonts.sans.semiBold,
    color: colors.text.primary,
  },
  socialFriendsLink: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.gold.primary,
    textDecorationLine: 'underline',
  },

  // Friends expanded list
  friendsExpandedList: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  friendsExpandedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
  },
  friendsExpandedAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  friendsExpandedName: {
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    color: colors.text.primary,
  },
  friendsExpandedUsername: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
  },

  // ── Description ─────────────────────────────────────────────────────
  description: {
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 24,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.ui.border,
  },

  // ── Must-try ────────────────────────────────────────────────────────
  mustTryBox: {
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold.primary + '40',
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  mustTryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  mustTryLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.gold.primary,
  },
  mustTryText: {
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
  },

  // ── Private note ────────────────────────────────────────────────────
  noteBox: {
    backgroundColor: colors.ui.searchBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ui.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  noteLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.gold.muted,
  },
  noteText: {
    fontFamily: fonts.sans.regular,
    fontSize: 14.5,
    color: colors.text.secondary,
    lineHeight: 21,
  },
  notePlaceholder: {
    fontFamily: fonts.sans.regular,
    fontSize: 13.5,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  noteInput: {
    fontFamily: fonts.sans.regular,
    fontSize: 14.5,
    color: colors.text.primary,
    minHeight: 60,
    textAlignVertical: 'top',
    padding: 0,
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  noteCancel: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  noteSave: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.gold.primary,
  },

  // ── Added By ────────────────────────────────────────────────────────
  addedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.ui.border,
  },
  addedByPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.gold.muted,
  },
  addedByText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.secondary,
  },
  addedByName: {
    fontFamily: fonts.serif.bold,
    color: colors.gold.primary,
    fontSize: 14,
  },
  mutualText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 2,
  },

  // ── Tags ────────────────────────────────────────────────────────────
  tagsSection: {
    paddingVertical: spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagChip: {
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  tagChipText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.secondary,
    letterSpacing: 0.3,
  },

  // ── Directions Card ─────────────────────────────────────────────────
  directionsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    marginVertical: spacing.sm,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  directionsTitle: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  directionsAddress: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    letterSpacing: 0.2,
    marginTop: 2,
  },

  // ── Reviews ─────────────────────────────────────────────────────────
  reviewsSection: {
    paddingTop: spacing.md,
    gap: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.ui.border,
  },
  reviewsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewsTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  reviewsCount: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },
  writeReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold.primary + '40',
    backgroundColor: colors.gold.primary + '08',
  },
  writeReviewText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.gold.primary,
    letterSpacing: 0.5,
  },
  noReviewsText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  reviewFormCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  reviewFormLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
  },
  starSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reviewFormInput: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 80,
    backgroundColor: colors.background.primary,
  },
  reviewFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  reviewCancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  reviewCancelText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 1.5,
  },
  reviewSubmitButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.gold.primary,
  },
  reviewSubmitDisabled: {
    opacity: 0.4,
  },
  reviewSubmitText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.background.primary,
    letterSpacing: 1.5,
  },
  reviewCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reviewAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  reviewMeta: {
    flex: 1,
    gap: 2,
  },
  reviewName: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.text.primary,
  },
  reviewRatingStars: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewTime: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  reviewText: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 21,
  },

  // ── Delete ──────────────────────────────────────────────────────────
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.ui.border,
  },
  deleteText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.ui.error,
    letterSpacing: 0.5,
  },
});
