import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteUser, getAuth } from 'firebase/auth';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { useAuthStore, usePlacesStore, useFriendsStore } from '../../src/stores';
import { pickImage, takePhoto } from '../../src/utils/imagePicker';
import { uploadImage } from '../../src/services/firebase/storage';

export default function ProfileModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut, updateProfile } = useAuthStore();
  const { userPlaces, fetchUserPlaces } = usePlacesStore();
  const { friends, fetchFriends } = useFriendsStore();

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Editable fields
  const [editName, setEditName] = useState(profile?.displayName || '');
  const [editUsername, setEditUsername] = useState(profile?.username || '');
  const [editBio, setEditBio] = useState(profile?.bio || '');

  // Sync edit fields when profile loads
  useEffect(() => {
    if (profile) {
      setEditName(profile.displayName || '');
      setEditUsername(profile.username || '');
      setEditBio(profile.bio || '');
    }
  }, [profile]);

  // Fetch real data on mount
  useEffect(() => {
    fetchUserPlaces();
    if (user?.uid) {
      fetchFriends(user.uid);
    }
  }, [user?.uid]);

  // Top 3 saved places for recommendations
  const topRecommendations = userPlaces.slice(0, 3);

  const handleChangePhoto = () => {
    Alert.alert('Change Profile Photo', 'Choose a source', [
      {
        text: 'Photo Library',
        onPress: async () => {
          const uri = await pickImage();
          if (uri) await handleUploadPhoto(uri);
        },
      },
      {
        text: 'Camera',
        onPress: async () => {
          const uri = await takePhoto();
          if (uri) await handleUploadPhoto(uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleUploadPhoto = async (uri: string) => {
    if (!user?.uid) return;
    setUploadingPhoto(true);
    try {
      const storagePath = `profiles/${user.uid}/avatar.jpg`;
      const downloadURL = await uploadImage(storagePath, uri);
      await updateProfile({ photoURL: downloadURL });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to update profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleStartEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    // Reset to original values
    setEditName(profile?.displayName || '');
    setEditUsername(profile?.username || '');
    setEditBio(profile?.bio || '');
    setIsEditing(false);
    Keyboard.dismiss();
  };

  const handleSaveEdit = async () => {
    const trimName = editName.trim();
    const trimUsername = editUsername.trim().toLowerCase().replace(/\s+/g, '');
    const trimBio = editBio.trim();

    if (!trimName) {
      Alert.alert('Required', 'Display name cannot be empty.');
      return;
    }
    if (!trimUsername) {
      Alert.alert('Required', 'Username cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        displayName: trimName,
        username: trimUsername,
        bio: trimBio,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditing(false);
      Keyboard.dismiss();
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/(auth)/sign-in');
          } catch (error) {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently removed. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const auth = getAuth();
              const currentUser = auth.currentUser;
              if (currentUser) {
                await deleteUser(currentUser);
              }
              router.replace('/(auth)/sign-in');
            } catch (error: any) {
              if (error?.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Re-authentication Required',
                  'For security, please sign out, sign back in, and try again.',
                );
              } else {
                Alert.alert('Error', 'Failed to delete account. Please try again.');
              }
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => !isEditing && router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          {/* Brass Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Profile Photo — double-ring */}
            <View style={styles.photoContainer}>
              <View style={styles.photoRingOuter}>
                <View style={styles.photoRingInner}>
                  {profile?.photoURL ? (
                    <Image
                      source={{ uri: profile.photoURL }}
                      style={styles.profilePhoto}
                    />
                  ) : (
                    <View style={[styles.profilePhoto, styles.profilePhotoFallback]}>
                      <Ionicons name="person" size={44} color={colors.text.tertiary} />
                    </View>
                  )}
                </View>
              </View>
              {uploadingPhoto && (
                <View style={styles.photoLoadingOverlay}>
                  <ActivityIndicator size="small" color={colors.gold.primary} />
                </View>
              )}
              <Pressable style={styles.editPhotoBadge} onPress={handleChangePhoto}>
                <Ionicons name="camera" size={13} color={colors.gold.primary} />
              </Pressable>
            </View>

            {/* Name & Bio — editable */}
            {isEditing ? (
              <View style={styles.editContainer}>
                <Text style={styles.editLabel}>DISPLAY NAME</Text>
                <TextInput
                  style={styles.editInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Your name"
                  placeholderTextColor={colors.text.tertiary}
                  autoCapitalize="words"
                  maxLength={40}
                />

                <Text style={styles.editLabel}>USERNAME</Text>
                <View style={styles.usernameRow}>
                  <Text style={styles.usernameAt}>@</Text>
                  <TextInput
                    style={[styles.editInput, styles.usernameInput]}
                    value={editUsername}
                    onChangeText={(t) =>
                      setEditUsername(t.toLowerCase().replace(/\s+/g, ''))
                    }
                    placeholder="username"
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={24}
                  />
                </View>

                <Text style={styles.editLabel}>BIO</Text>
                <TextInput
                  style={[styles.editInput, styles.editBioInput]}
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="Tell others about yourself..."
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  maxLength={150}
                />
                <Text style={styles.charCount}>
                  {editBio.length}/150
                </Text>

                {/* Save / Cancel buttons */}
                <View style={styles.editActions}>
                  <Pressable
                    style={styles.cancelEditButton}
                    onPress={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <Text style={styles.cancelEditText}>CANCEL</Text>
                  </Pressable>
                  <Pressable
                    style={styles.saveEditButton}
                    onPress={handleSaveEdit}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={colors.background.primary} />
                    ) : (
                      <Text style={styles.saveEditText}>SAVE</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.infoContainer}>
                <Text style={styles.displayName}>
                  {profile?.displayName || 'Traveler'}
                </Text>
                <Text style={styles.username}>
                  @{profile?.username || 'user'}
                </Text>
                <Text style={styles.bio}>
                  {profile?.bio ||
                    'Tap edit to add a bio'}
                </Text>
                <Pressable style={styles.editProfileButton} onPress={handleStartEdit}>
                  <Ionicons name="pencil" size={13} color={colors.gold.primary} />
                  <Text style={styles.editProfileText}>EDIT PROFILE</Text>
                </Pressable>
              </View>
            )}

            {/* Stats */}
            <View style={styles.statsRow}>
              <Pressable style={styles.statItem}>
                <Text style={styles.statNumber}>{userPlaces.length}</Text>
                <Text style={styles.statLabel}>PLACES</Text>
              </Pressable>
              <View style={styles.statDivider} />
              <Pressable style={styles.statItem}>
                <Text style={styles.statNumber}>{friends.length}</Text>
                <Text style={styles.statLabel}>FRIENDS</Text>
              </Pressable>
            </View>

            {/* Top Recommendations — only shown when the user has saved places */}
            {topRecommendations.length > 0 && !isEditing && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Top Recommendations</Text>
                <FlatList
                  data={topRecommendations}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recsList}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Pressable style={styles.recCard}>
                      {item.placeImageURL ? (
                        <Image
                          source={{ uri: item.placeImageURL }}
                          style={styles.recImage}
                        />
                      ) : (
                        <View style={[styles.recImage, styles.recImageFallback]}>
                          <Ionicons
                            name="location"
                            size={28}
                            color={colors.text.tertiary}
                          />
                        </View>
                      )}
                      <Text style={styles.recName} numberOfLines={1}>
                        {item.placeName}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
            )}

            {/* Actions */}
            {!isEditing && (
              <View style={styles.actionsContainer}>
                <Pressable style={styles.signOutButton} onPress={handleSignOut}>
                  <Ionicons
                    name="log-out-outline"
                    size={16}
                    color={colors.text.secondary}
                  />
                  <Text style={styles.signOutText}>SIGN OUT</Text>
                </Pressable>

                <Pressable
                  style={styles.deleteButton}
                  onPress={handleDeleteAccount}
                >
                  <Text style={styles.deleteText}>Delete Account</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 12, 10, 0.65)',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderTopColor: colors.gold.muted + '30',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  handle: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.gold.muted,
  },

  // Photo — double-ring effect
  photoContainer: {
    alignItems: 'center',
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
  photoLoadingOverlay: {
    position: 'absolute',
    top: 9,
    left: '50%',
    marginLeft: -43,
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPhotoBadge: {
    position: 'absolute',
    bottom: 2,
    right: '34%',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gold.muted,
  },

  // Info — view mode
  infoContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
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
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.gold.primary,
  },
  editProfileText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.gold.primary,
    letterSpacing: 2,
  },

  // Info — edit mode
  editContainer: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  editLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  editInput: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usernameAt: {
    fontFamily: fonts.sans.medium,
    fontSize: 15,
    color: colors.gold.primary,
    marginRight: 2,
    position: 'absolute',
    left: spacing.md,
    zIndex: 1,
  },
  usernameInput: {
    flex: 1,
    paddingLeft: spacing.xl + 4,
  },
  editBioInput: {
    height: 80,
    paddingTop: spacing.md,
  },
  charCount: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    textAlign: 'right',
    marginTop: 2,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelEditButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  cancelEditText: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.text.secondary,
    letterSpacing: 2,
  },
  saveEditButton: {
    flex: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.gold.primary,
    borderWidth: 0.5,
    borderColor: colors.gold.metallic,
  },
  saveEditText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.background.primary,
    letterSpacing: 2,
  },

  // Stats
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

  // Recommendations
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 17,
    color: colors.text.primary,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    letterSpacing: 0.3,
  },
  recsList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  recCard: {
    alignItems: 'center',
    width: 80,
    gap: 6,
  },
  recImage: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  recImageFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  recName: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.text.secondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // Actions
  actionsContainer: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  signOutText: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.secondary,
    letterSpacing: 2,
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  deleteText: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.ui.error,
    opacity: 0.7,
    letterSpacing: 0.5,
  },
});
