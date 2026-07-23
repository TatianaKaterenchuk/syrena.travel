import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { useAuthStore, useFriendsStore, usePlacesStore } from '../../src/stores';
import { UserProfile, Friend, UserPlace } from '../../src/types';
import { getDocument, getDocuments, where } from '../../src/services/firebase/firestore';
import { getCategoryIcon, getCategoryColor } from '../../src/constants/categories';
import { avatarUrl, placeImageUri } from '../../src/utils/placeholderAvatar';

export default function UserProfileModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile: myProfile } = useAuthStore();
  const banUser = useAuthStore((s) => s.banUser);
  const unbanUser = useAuthStore((s) => s.unbanUser);
  const { friends, sentRequests, sendRequest, removeFriend, getMutualFriends, fetchFriends } = useFriendsStore();
  const { pickedUsers, addPickedUser, removePickedUser } = usePlacesStore();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [mutualFriends, setMutualFriends] = useState<Friend[]>([]);
  const [placesCount, setPlacesCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [theirPlaces, setTheirPlaces] = useState<UserPlace[]>([]);
  const [theirFriendsList, setTheirFriendsList] = useState<Friend[]>([]);
  const [showPlaces, setShowPlaces] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const isFriend = friends.some((f) => f.uid === id);
  const isRequested = sentRequests.some((r) => r.toUid === id);
  const isMe = user?.uid === id;
  const isAdmin = myProfile?.isAdmin === true;
  const isTargetAdmin = userProfile?.isAdmin === true;
  const isTargetBanned = userProfile?.status === 'banned';
  const pickedEntry = pickedUsers.find((pu) => pu.user.uid === id);
  const isPickedUser = !!pickedEntry;

  useEffect(() => {
    if (!id) return;
    loadUserProfile();
  }, [id]);

  const loadUserProfile = async () => {
    setIsLoading(true);
    try {
      // Kick everything off in PARALLEL and render as soon as the profile
      // doc lands. The old flow awaited profile → stats → mutual friends
      // sequentially, so slow connections stared at a spinner for the sum
      // of four round-trips.
      const profilePromise = getDocument<UserProfile>('users', id!);
      const friendsPromise = getDocuments<Friend>('friends', [where('userId', '==', id)]);
      const placesPromise = getDocuments<UserPlace>('userPlaces', [where('userId', '==', id)]);

      const profile = await profilePromise;
      setUserProfile(profile);
      setIsLoading(false); // show the screen NOW — stats stream in below

      friendsPromise
        .then((fetchedFriends) => {
          setFriendsCount(fetchedFriends.length);
          setTheirFriendsList(fetchedFriends);
        })
        .catch((e) => console.warn('[user-profile] friends fetch failed', e));
      placesPromise
        .then((fetchedPlaces) => {
          setPlacesCount(fetchedPlaces.length);
          setTheirPlaces(fetchedPlaces);
        })
        .catch((e) => console.warn('[user-profile] places fetch failed', e));

      // Mutual friends — slowest query, lowest priority
      if (!isMe && user?.uid) {
        getMutualFriends(id!)
          .then(setMutualFriends)
          .catch(() => {});
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      setIsLoading(false);
    }
  };

  const handleSendRequest = async () => {
    if (!user || !myProfile || !userProfile) return;
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await sendRequest(
        user.uid,
        myProfile.displayName,
        myProfile.photoURL || '',
        id!,
        userProfile.displayName,
      );
    } catch (error) {
      Alert.alert('Error', 'Could not send friend request.');
    } finally {
      setIsSending(false);
    }
  };

  const handleRemoveFriend = () => {
    if (!userProfile) return;
    Alert.alert(
      'Remove Friend',
      `Remove ${userProfile.displayName} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // Find the friend doc by uid
              const friendDoc = friends.find((f) => f.uid === id);
              if (friendDoc) {
                await removeFriend(friendDoc.uid);
                if (user?.uid) fetchFriends(user.uid);
              }
            } catch (error) {
              Alert.alert('Error', 'Could not remove friend.');
            }
          },
        },
      ],
    );
  };

  const handleBanUser = () => {
    if (!userProfile) return;
    Alert.alert(
      'Ban User',
      `Are you sure you want to ban ${userProfile.displayName}? This will remove their data and lock them out of the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: async () => {
            try {
              await banUser(id!);
              Alert.alert('Banned', `${userProfile.displayName} has been banned.`);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Could not ban user.');
            }
          },
        },
      ],
    );
  };

  const handleUnbanUser = () => {
    if (!userProfile) return;
    Alert.alert(
      'Unban User',
      `Restore access for ${userProfile.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unban',
          onPress: async () => {
            try {
              await unbanUser(id!);
              setUserProfile({ ...userProfile, status: 'approved' });
              Alert.alert('Unbanned', `${userProfile.displayName} has been unbanned.`);
            } catch (error) {
              Alert.alert('Error', 'Could not unban user.');
            }
          },
        },
      ],
    );
  };

  const handlePickUser = async () => {
    if (!userProfile || !user) return;
    try {
      const { Timestamp } = await import('firebase/firestore');
      await addPickedUser({
        uid: userProfile.uid || id!,
        displayName: userProfile.displayName,
        username: userProfile.username,
        photoURL: userProfile.photoURL || '',
        pickedAt: Timestamp.now(),
        pickedBy: user.uid,
      });
      Alert.alert('Picked', `${userProfile.displayName}'s top 5 will now show on the home page.`);
    } catch (error) {
      Alert.alert('Error', 'Could not pick user.');
    }
  };

  const handleUnpickUser = async () => {
    if (!pickedEntry) return;
    try {
      await removePickedUser(pickedEntry.user.id);
      Alert.alert('Removed', `${userProfile?.displayName} removed from picked users.`);
    } catch (error) {
      Alert.alert('Error', 'Could not remove picked user.');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
        </View>
      </View>
    );
  }

  if (!userProfile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="person-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.notFoundText}>User not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Profile Photo */}
        <View style={styles.photoContainer}>
          <View style={styles.photoRingOuter}>
            <View style={styles.photoRingInner}>
              {userProfile.photoURL ? (
                <Image
                  source={{ uri: userProfile.photoURL }}
                  style={styles.profilePhoto}
                />
              ) : (
                <View style={[styles.profilePhoto, styles.profilePhotoFallback]}>
                  <Ionicons name="person" size={44} color={colors.text.tertiary} />
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Name & Bio */}
        <View style={styles.infoContainer}>
          <Text style={styles.displayName}>{userProfile.displayName}</Text>
          <Text style={styles.username}>@{userProfile.username || 'user'}</Text>
          {userProfile.bio ? (
            <Text style={styles.bio}>{userProfile.bio}</Text>
          ) : null}
        </View>

        {/* Friend Action Button */}
        {!isMe && (
          <View style={styles.actionContainer}>
            {isFriend ? (
              <View style={styles.friendActionRow}>
                <Pressable style={styles.friendsButton} onPress={handleRemoveFriend}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.ui.success} />
                  <Text style={styles.friendsButtonText}>FRIENDS</Text>
                </Pressable>
                <Pressable
                  style={styles.messageButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // Use replace so we swap the modal stack instead of nesting,
                    // which prevents the back-stack from getting confused with two
                    // modals stacked on top of each other.
                    router.replace(
                      `/modal/conversation?recipientUid=${id}&recipientName=${encodeURIComponent(userProfile.displayName)}&recipientPhoto=${encodeURIComponent(userProfile.photoURL || '')}`,
                    );
                  }}
                >
                  <Ionicons name="chatbubble" size={16} color={colors.background.primary} />
                  <Text style={styles.messageButtonText}>MESSAGE</Text>
                </Pressable>
              </View>
            ) : isRequested ? (
              <View style={styles.requestedButton}>
                <Ionicons name="time-outline" size={16} color={colors.gold.muted} />
                <Text style={styles.requestedButtonText}>REQUESTED</Text>
              </View>
            ) : (
              <Pressable
                style={styles.addFriendButton}
                onPress={handleSendRequest}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={colors.background.primary} />
                ) : (
                  <>
                    <Ionicons name="person-add" size={16} color={colors.background.primary} />
                    <Text style={styles.addFriendButtonText}>ADD FRIEND</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        )}

        {/* Admin Pick / Ban Buttons */}
        {isAdmin && !isMe && !isTargetAdmin && !isTargetBanned && (
          <View style={styles.adminActionContainer}>
            {isPickedUser ? (
              <Pressable style={styles.unbanButton} onPress={handleUnpickUser}>
                <Ionicons name="star" size={16} color="#fff" />
                <Text style={styles.unbanButtonText}>UNPICK USER</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.pickButton} onPress={handlePickUser}>
                <Ionicons name="star-outline" size={16} color={colors.background.primary} />
                <Text style={styles.pickButtonText}>PICK USER</Text>
              </Pressable>
            )}
          </View>
        )}
        {isAdmin && !isMe && !isTargetAdmin && (
          <View style={styles.adminActionContainer}>
            {isTargetBanned ? (
              <Pressable style={styles.unbanButton} onPress={handleUnbanUser}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.unbanButtonText}>UNBAN USER</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.banButton} onPress={handleBanUser}>
                <Ionicons name="ban" size={16} color="#fff" />
                <Text style={styles.banButtonText}>BAN USER</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Mutual Friends */}
        {mutualFriends.length > 0 && (
          <View style={styles.mutualSection}>
            <View style={styles.mutualAvatars}>
              {mutualFriends.slice(0, 3).map((friend, index) => (
                <Image
                  key={friend.uid}
                  source={{ uri: avatarUrl(friend.photoURL, friend.uid) }}
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

        {/* Stats */}
        <View style={styles.statsRow}>
          <Pressable style={styles.statItem} onPress={() => { setShowPlaces(!showPlaces); setShowFriends(false); }}>
            <Text style={styles.statNumber}>{placesCount}</Text>
            <Text style={[styles.statLabel, showPlaces && { color: colors.gold.primary }]}>PLACES</Text>
          </Pressable>
          <View style={styles.statDivider} />
          <Pressable style={styles.statItem} onPress={() => { setShowFriends(!showFriends); setShowPlaces(false); }}>
            <Text style={styles.statNumber}>{friendsCount}</Text>
            <Text style={[styles.statLabel, showFriends && { color: colors.gold.primary }]}>FRIENDS</Text>
          </Pressable>
        </View>

        {/* Places List */}
        {showPlaces && theirPlaces.length > 0 && (
          <View style={styles.expandedSection}>
            <Text style={styles.expandedTitle}>Places</Text>
            {theirPlaces.map((up) => (
              <Pressable
                key={up.id}
                style={styles.expandedRow}
                onPress={() => router.push({ pathname: '/modal/place-detail', params: { id: up.placeId } } as any)}
              >
                <Image source={{ uri: up.placeImageURL || placeImageUri(undefined, up.placeId) }} style={styles.expandedImage} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.expandedName} numberOfLines={1}>{up.placeName}</Text>
                  <Text style={styles.expandedSub} numberOfLines={1}>
                    {up.placeCity}{up.placeCountry ? `, ${up.placeCountry}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Friends List */}
        {showFriends && theirFriendsList.length > 0 && (
          <View style={styles.expandedSection}>
            <Text style={styles.expandedTitle}>Friends</Text>
            {theirFriendsList.map((f) => (
              <Pressable
                key={f.uid || (f as any).id}
                style={styles.expandedRow}
                onPress={() => router.push({ pathname: '/modal/user-profile', params: { id: f.uid } } as any)}
              >
                <Image
                  source={{ uri: avatarUrl(f.photoURL, f.uid || (f as any).id) }}
                  style={styles.expandedAvatar}
                />
                <Text style={styles.expandedName} numberOfLines={1}>{f.displayName}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  notFoundText: {
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },

  // Photo — double-ring (same as profile.tsx)
  photoContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  photoRingOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoRingInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1.5,
    borderColor: colors.gold.muted,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profilePhoto: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  profilePhotoFallback: {
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Info
  infoContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: 6,
  },
  displayName: {
    fontFamily: fonts.serif.bold,
    fontSize: 26,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  username: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  bio: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
    letterSpacing: 0.2,
    paddingHorizontal: spacing.md,
  },

  // Action button
  actionContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  friendActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.gold.primary,
    borderWidth: 0.5,
    borderColor: colors.gold.metallic,
  },
  messageButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.background.primary,
    letterSpacing: 2,
  },
  addFriendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.gold.primary,
    borderWidth: 0.5,
    borderColor: colors.gold.metallic,
  },
  addFriendButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.background.primary,
    letterSpacing: 2,
  },
  friendsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.success + '50',
    backgroundColor: colors.ui.success + '10',
  },
  friendsButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.ui.success,
    letterSpacing: 2,
  },
  requestedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.gold.muted + '50',
    backgroundColor: colors.gold.primary + '10',
  },
  requestedButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.gold.muted,
    letterSpacing: 2,
  },

  // Admin ban/unban
  adminActionContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  banButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.ui.error,
  },
  banButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: '#fff',
    letterSpacing: 2,
  },
  unbanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.ui.success,
  },
  unbanButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: '#fff',
    letterSpacing: 2,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.gold.primary,
  },
  pickButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.background.primary,
    letterSpacing: 2,
  },

  // Mutual friends
  mutualSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  mutualAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mutualAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.background.primary,
  },
  mutualText: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.gold.metallic,
    letterSpacing: 0.3,
  },

  // Stats (same as profile.tsx)
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontFamily: fonts.serif.bold,
    fontSize: 26,
    color: colors.gold.primary,
  },
  statLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 4,
    letterSpacing: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.gold.muted + '50',
  },

  // Expanded lists
  expandedSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  expandedTitle: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ui.divider,
  },
  expandedImage: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.background.tertiary,
  },
  expandedImageEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: colors.gold.muted,
  },
  expandedName: {
    flex: 1,
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.text.primary,
  },
  expandedSub: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 1,
  },
});
