import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { useAuthStore, useFriendsStore, usePlacesStore } from '../../src/stores';
import { UserProfile, Friend } from '../../src/types';
import { getDocument, getDocuments, where } from '../../src/services/firebase/firestore';

export default function UserProfileModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile: myProfile } = useAuthStore();
  const { friends, sentRequests, sendRequest, removeFriend, getMutualFriends, fetchFriends } = useFriendsStore();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [mutualFriends, setMutualFriends] = useState<Friend[]>([]);
  const [placesCount, setPlacesCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const isFriend = friends.some((f) => f.uid === id);
  const isRequested = sentRequests.some((r) => r.toUid === id);
  const isMe = user?.uid === id;

  useEffect(() => {
    if (!id) return;
    loadUserProfile();
  }, [id]);

  const loadUserProfile = async () => {
    setIsLoading(true);
    try {
      const profile = await getDocument<UserProfile>('users', id!);
      setUserProfile(profile);

      // Fetch their stats
      const [theirFriends, theirPlaces] = await Promise.all([
        getDocuments<Friend>('friends', [where('userId', '==', id)]),
        getDocuments('userPlaces', [where('userId', '==', id)]),
      ]);
      setFriendsCount(theirFriends.length);
      setPlacesCount(theirPlaces.length);

      // Mutual friends
      if (!isMe && user?.uid) {
        const mutual = await getMutualFriends(id!);
        setMutualFriends(mutual);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
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
        <Pressable onPress={() => router.back()} hitSlop={12}>
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
              <Pressable style={styles.friendsButton} onPress={handleRemoveFriend}>
                <Ionicons name="checkmark-circle" size={16} color={colors.ui.success} />
                <Text style={styles.friendsButtonText}>FRIENDS</Text>
              </Pressable>
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

        {/* Mutual Friends */}
        {mutualFriends.length > 0 && (
          <View style={styles.mutualSection}>
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

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{placesCount}</Text>
            <Text style={styles.statLabel}>PLACES</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{friendsCount}</Text>
            <Text style={styles.statLabel}>FRIENDS</Text>
          </View>
        </View>
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
});
