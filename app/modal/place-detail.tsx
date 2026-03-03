import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Timestamp } from 'firebase/firestore';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { usePlacesStore, useAuthStore, useFriendsStore } from '../../src/stores';
import { PlaceCategory, Review, UserPlace, BudgetTier, BUDGET_ICONS, BUDGET_LABELS, Friend } from '../../src/types';
import { getDocuments, createDocument, updateDocument, orderBy } from '../../src/services/firebase/firestore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [reviews, setReviews] = useState<Review[]>([]);

  const { places, userPlaces, savePlace, removePlace, toggleFavorite, toggleGoldStar, requestDeletion } = usePlacesStore();
  const scrollViewRef = useRef<ScrollView>(null);
  const { user, profile } = useAuthStore();

  // Review form state
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Mutual friends
  const [mutualFriends, setMutualFriends] = useState<Friend[]>([]);
  const { getMutualFriends } = useFriendsStore();

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

  const handleToggleSave = () => {
    if (!place || !user) return;

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
      };
      savePlace(userPlace);
    }
  };

  const handleDirections = () => {
    if (!place) return;
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

      // Recalculate place rating
      const allReviews = await getDocuments<Review>(
        `places/${id}/reviews`,
        [orderBy('createdAt', 'desc')],
      );
      const avgRating =
        allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
      await updateDocument('places', id, {
        rating: Math.round(avgRating * 10) / 10,
        ratingCount: allReviews.length,
      });

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

  // Check if user already reviewed
  const hasReviewed = useMemo(
    () => reviews.some((r) => r.userId === user?.uid),
    [reviews, user],
  );

  // Loading / not found state
  if (!place) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="close" size={22} color={colors.text.primary} />
          </Pressable>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
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
      : FALLBACK_IMAGES;

  const isCreator = place?.createdBy === user?.uid;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerActions}>
          {isSaved && userPlace && (
            <Pressable
              style={styles.headerButton}
              onPress={() => toggleGoldStar(userPlace.id)}
            >
              <Ionicons
                name={userPlace.isGoldStar ? 'trophy' : 'trophy-outline'}
                size={22}
                color={userPlace.isGoldStar ? '#FFD700' : colors.text.primary}
              />
            </Pressable>
          )}
          {isSaved && userPlace && (
            <Pressable
              style={styles.headerButton}
              onPress={() => toggleFavorite(userPlace.id)}
            >
              <Ionicons
                name={userPlace.isFavorite ? 'star' : 'star-outline'}
                size={22}
                color={userPlace.isFavorite ? colors.gold.primary : colors.text.primary}
              />
            </Pressable>
          )}
          <Pressable style={styles.headerButton} onPress={handleToggleSave}>
            <Ionicons
              name={isSaved ? 'heart' : 'heart-outline'}
              size={22}
              color={isSaved ? colors.ui.error : colors.text.primary}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Image Gallery */}
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
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={styles.galleryImage} />
              )}
            />
            {/* Image Pagination */}
            <View style={styles.pagination}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.paginationDot,
                    i === activeImageIndex && styles.paginationDotActive,
                  ]}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.noImagePlaceholder}>
            <Ionicons name="image-outline" size={40} color={colors.text.tertiary + '60'} />
            <Text style={styles.noImageText}>No photos yet</Text>
          </View>
        )}

        {/* Place Info */}
        <View style={styles.infoSection}>
          <Text style={styles.placeName}>{place.name}</Text>
          <View style={styles.categoryRow}>
            <View
              style={[
                styles.categoryPill,
                { backgroundColor: categoryColor + '20' },
              ]}
            >
              <Text style={[styles.categoryText, { color: categoryColor }]}>
                {place.category}
              </Text>
            </View>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color={colors.gold.primary} />
              <Text style={styles.ratingText}>
                {place.rating} ({place.ratingCount})
              </Text>
            </View>
          </View>

          <View style={styles.locationRow}>
            <Ionicons
              name="location-outline"
              size={16}
              color={colors.text.tertiary}
            />
            <Text style={styles.locationText}>
              {place.address}, {place.city}, {place.country}
            </Text>
          </View>

          {/* Budget Tier */}
          {place.budgetTier && (
            <View style={styles.budgetRow}>
              <Text style={styles.budgetIcon}>
                {BUDGET_ICONS[place.budgetTier as BudgetTier]}
              </Text>
              <Text style={styles.budgetLabel}>
                {BUDGET_LABELS[place.budgetTier as BudgetTier]}
              </Text>
            </View>
          )}

          {/* Gold Star Badge */}
          {userPlace?.isGoldStar && (
            <View style={styles.goldStarRow}>
              <Ionicons name="trophy" size={16} color="#FFD700" />
              <Text style={styles.goldStarText}>Best on Earth</Text>
            </View>
          )}

          <Text style={styles.description}>{place.description}</Text>

          {/* Tags */}
          {place.tags && place.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.tagsLabel}>TAGS</Text>
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
                        router.dismiss();
                        setTimeout(() => {
                          router.push({
                            pathname: '/(tabs)',
                            params: { search: tag },
                          });
                        }, 100);
                      }}
                    >
                      <Ionicons
                        name="pricetag-outline"
                        size={10}
                        color={colors.gold.muted}
                      />
                      <Text style={styles.tagChipText}>{tag}</Text>
                    </Pressable>
                  ))}
              </View>
            </View>
          )}

          {/* Added By */}
          <Pressable
            style={styles.addedByRow}
            onPress={() => place.createdBy && router.push(`/modal/user-profile?id=${place.createdBy}`)}
          >
            <Image
              source={{ uri: place.createdByPhoto }}
              style={styles.addedByPhoto}
            />
            <Text style={styles.addedByText}>
              Added by{' '}
              <Text style={styles.addedByName}>{place.createdByName}</Text>
            </Text>
          </Pressable>

          {/* Friends in Common */}
          {mutualFriends.length > 0 && (
            <View style={styles.mutualFriendsRow}>
              <View style={styles.mutualAvatars}>
                {mutualFriends.slice(0, 3).map((friend, index) => (
                  <Image
                    key={friend.uid}
                    source={{ uri: friend.photoURL || 'https://i.pravatar.cc/100?img=3' }}
                    style={[
                      styles.mutualAvatar,
                      { marginLeft: index > 0 ? -8 : 0, zIndex: 3 - index },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.mutualText}>
                {mutualFriends.length} friend{mutualFriends.length !== 1 ? 's' : ''} in common
              </Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="heart" size={16} color={colors.gold.primary} />
            <Text style={styles.statText}>{place.savesCount} saves</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons
              name="chatbubble"
              size={16}
              color={colors.gold.primary}
            />
            <Text style={styles.statText}>{reviews.length} reviews</Text>
          </View>
        </View>

        {/* Reviews */}
        <View style={styles.reviewsSection}>
          <View style={styles.reviewsTitleRow}>
            <Text style={styles.reviewsTitle}>Reviews</Text>
            {user && !hasReviewed && !showReviewForm && (
              <Pressable onPress={() => setShowReviewForm(true)}>
                <Text style={styles.addReviewLink}>Write a Review</Text>
              </Pressable>
            )}
          </View>

          {/* Add Review Form */}
          {showReviewForm && (
            <View style={styles.reviewFormCard}>
              <View style={styles.reviewFormBrass} />
              <View style={styles.reviewFormContent}>
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
            </View>
          )}

          {reviews.length === 0 && !showReviewForm && (
            <Text style={styles.noReviewsText}>No reviews yet.</Text>
          )}
          {reviews.map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Image
                  source={{ uri: review.userPhoto }}
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
                  {review.createdAt
                    ? formatTimeAgo(review.createdAt)
                    : ''}
                </Text>
              </View>
              <Text style={styles.reviewText}>{review.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: insets.bottom + 80 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View
        style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}
      >
        <Pressable style={styles.saveButton} onPress={handleToggleSave}>
          <Ionicons
            name={isSaved ? 'heart' : 'heart-outline'}
            size={20}
            color={isSaved ? colors.ui.error : colors.text.primary}
          />
          <Text style={styles.saveButtonText}>
            {isSaved ? 'Saved' : 'Save'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.editButton}
          onPress={() => {
            const editMode = profile?.isAdmin ? 'edit' : 'suggest';
            router.push({
              pathname: '/modal/edit-place',
              params: { id: place.id, mode: editMode },
            });
          }}
        >
          <Ionicons name="create-outline" size={18} color={colors.gold.primary} />
          <Text style={styles.editButtonText}>
            {profile?.isAdmin ? 'Edit' : 'Suggest Edit'}
          </Text>
        </Pressable>
        {(isCreator || profile?.isAdmin) && (
          <Pressable style={styles.deleteButton} onPress={handleRequestDeletion}>
            <Ionicons name="trash-outline" size={18} color={colors.ui.error} />
          </Pressable>
        )}
        <Pressable style={styles.directionsButton} onPress={handleDirections}>
          <Ionicons
            name="navigate"
            size={18}
            color={colors.background.primary}
          />
          <Text style={styles.directionsText}>Directions</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
  },
  loadingText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },
  noReviewsText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    zIndex: 10,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.tertiary,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  // Gallery
  galleryImage: {
    width: SCREEN_WIDTH,
    height: 300,
    backgroundColor: colors.background.tertiary,
  },
  noImagePlaceholder: {
    width: SCREEN_WIDTH,
    height: 200,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  noImageText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
  },
  paginationDot: {
    width: 6,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text.tertiary + '40',
  },
  paginationDotActive: {
    backgroundColor: colors.gold.primary,
    width: 20,
  },
  // Info
  infoSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  placeName: {
    fontFamily: fonts.serif.bold,
    fontSize: 28,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: 'transparent',
  },
  categoryText: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontFamily: fonts.serif.bold,
    fontSize: 15,
    color: colors.gold.primary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold.primary + '10',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderColor: colors.gold.primary + '30',
  },
  budgetIcon: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.gold.primary,
  },
  budgetLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.metallic,
    letterSpacing: 0.5,
  },
  goldStarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFD700' + '10',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderColor: '#FFD700' + '30',
  },
  goldStarText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: '#FFD700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  description: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  tagsSection: {
    gap: spacing.sm,
  },
  tagsLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  tagChipText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.secondary,
    letterSpacing: 0.5,
  },
  addedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.ui.border,
  },
  addedByPhoto: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.gold.muted,
  },
  addedByText: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  addedByName: {
    fontFamily: fonts.serif.bold,
    color: colors.gold.primary,
    fontSize: 13,
  },
  mutualFriendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: 2,
  },
  mutualAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mutualAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.background.primary,
  },
  mutualText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.metallic,
    letterSpacing: 0.3,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xxl,
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: colors.gold.muted + '30',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statText: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.secondary,
    letterSpacing: 0.5,
  },
  // Reviews
  reviewsSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  reviewsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  reviewsTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  addReviewLink: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Review form
  reviewFormCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ui.cardBg,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '30',
  },
  reviewFormBrass: {
    height: 2,
    backgroundColor: colors.gold.primary,
    opacity: 0.4,
  },
  reviewFormContent: {
    padding: spacing.lg,
    gap: spacing.md,
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
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    minHeight: 80,
  },
  reviewFormActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  reviewCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  reviewCancelText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.text.secondary,
    letterSpacing: 2,
  },
  reviewSubmitButton: {
    flex: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    backgroundColor: colors.gold.primary,
    borderWidth: 0.5,
    borderColor: colors.gold.metallic,
  },
  reviewSubmitDisabled: {
    opacity: 0.4,
  },
  reviewSubmitText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.background.primary,
    letterSpacing: 2,
  },
  reviewCard: {
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  reviewMeta: {
    flex: 1,
    gap: 2,
  },
  reviewName: {
    fontFamily: fonts.serif.bold,
    fontSize: 14,
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
  },
  reviewText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background.primary + 'F5',
    borderTopWidth: 0.5,
    borderTopColor: colors.gold.muted + '25',
    gap: spacing.md,
  },
  saveButton: {
    flex: 0.8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    gap: spacing.sm,
  },
  saveButtonText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.text.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '40',
    gap: spacing.sm,
  },
  editButtonText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  deleteButton: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.error + '40',
  },
  directionsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.gold.primary,
    borderWidth: 0.5,
    borderColor: colors.gold.metallic,
    gap: spacing.sm,
  },
  directionsText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.background.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
