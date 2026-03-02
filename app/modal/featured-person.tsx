import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Timestamp } from 'firebase/firestore';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { usePlacesStore, useAuthStore } from '../../src/stores';
import { UserProfile } from '../../src/types';
import { getDocuments } from '../../src/services/firebase/firestore';

export default function FeaturedPersonModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const { setFeaturedPerson, featuredPerson } = usePlacesStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check admin
  if (!profile?.isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={22} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Featured Person</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={48} color={colors.gold.muted} />
          <Text style={styles.noAccessText}>Admin access required</Text>
        </View>
      </View>
    );
  }

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const allUsers = await getDocuments<UserProfile>('users', []);
      const lower = query.toLowerCase();
      const filtered = allUsers.filter(
        (u) =>
          u.displayName?.toLowerCase().includes(lower) ||
          u.username?.toLowerCase().includes(lower) ||
          u.email?.toLowerCase().includes(lower)
      );
      setResults(filtered);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSubmit = async () => {
    if (!selectedUser || !headline.trim()) {
      Alert.alert('Missing Info', 'Please select a person and add a headline.');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = Timestamp.now();
      const oneMonth = new Timestamp(now.seconds + 30 * 24 * 60 * 60, 0);

      await setFeaturedPerson({
        uid: selectedUser.uid || (selectedUser as any).id,
        displayName: selectedUser.displayName,
        username: selectedUser.username,
        photoURL: selectedUser.photoURL || '',
        bio: bio.trim(),
        featuredAt: now,
        featuredUntil: oneMonth,
        chosenBy: profile.uid || (profile as any).id,
        headline: headline.trim(),
      } as any);

      Alert.alert('Success', `${selectedUser.displayName} is now featured!`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Could not set featured person.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Featured Person</Text>
        <Pressable onPress={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.gold.primary} />
          ) : (
            <Text style={styles.saveText}>SAVE</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Selected user preview */}
        {selectedUser && (
          <View style={styles.selectedCard}>
            <Image
              source={{ uri: selectedUser.photoURL || 'https://i.pravatar.cc/100?img=5' }}
              style={styles.selectedAvatar}
            />
            <View style={styles.selectedInfo}>
              <Text style={styles.selectedName}>{selectedUser.displayName}</Text>
              <Text style={styles.selectedUsername}>@{selectedUser.username}</Text>
            </View>
            <Pressable onPress={() => setSelectedUser(null)}>
              <Ionicons name="close-circle" size={20} color={colors.text.tertiary} />
            </Pressable>
          </View>
        )}

        {/* Headline */}
        <View style={styles.section}>
          <Text style={styles.label}>HEADLINE</Text>
          <TextInput
            style={styles.input}
            value={headline}
            onChangeText={setHeadline}
            placeholder="e.g. The globe-trotter who found hidden gems in Bali"
            placeholderTextColor={colors.text.tertiary}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* About / Bio */}
        <View style={styles.section}>
          <Text style={styles.label}>ABOUT</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="A short blurb about this traveler..."
            placeholderTextColor={colors.text.tertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Edit Picks shortcut */}
        {featuredPerson && (
          <View style={styles.section}>
            <Text style={styles.label}>TRAVELER'S PICKS</Text>
            <Pressable
              style={styles.picksButton}
              onPress={() => router.push('/modal/featured-picks')}
            >
              <Ionicons name="star-outline" size={16} color={colors.gold.primary} />
              <Text style={styles.picksButtonText}>
                Edit Picks ({featuredPerson.picks?.length || 0})
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </Pressable>
          </View>
        )}

        {/* Search */}
        <View style={styles.section}>
          <Text style={styles.label}>SEARCH USERS</Text>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={16} color={colors.gold.muted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearch}
              placeholder="Search by name or username..."
              placeholderTextColor={colors.text.tertiary}
            />
            {isSearching && <ActivityIndicator size="small" color={colors.gold.primary} />}
          </View>
        </View>

        {/* Results */}
        <View style={styles.resultsList}>
          {results.map((item) => (
            <Pressable
              key={item.uid || (item as any).id}
              style={[
                styles.userRow,
                (selectedUser?.uid || (selectedUser as any)?.id) === (item.uid || (item as any).id) && styles.userRowSelected,
              ]}
              onPress={() => setSelectedUser(item)}
            >
              <Image
                source={{ uri: item.photoURL || 'https://i.pravatar.cc/100?img=3' }}
                style={styles.userAvatar}
              />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.displayName}</Text>
                <Text style={styles.userUsername}>@{item.username}</Text>
              </View>
              {(selectedUser?.uid || (selectedUser as any)?.id) === (item.uid || (item as any).id) && (
                <Ionicons name="checkmark-circle" size={20} color={colors.gold.primary} />
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
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
  noAccessText: {
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
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
  saveText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.gold.primary,
    letterSpacing: 2,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  label: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  bioInput: {
    height: 100,
    paddingTop: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: spacing.md,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.gold.primary + '10',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.gold.primary + '30',
    gap: spacing.md,
  },
  selectedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
  },
  selectedInfo: {
    flex: 1,
  },
  selectedName: {
    fontFamily: fonts.serif.bold,
    fontSize: 16,
    color: colors.text.primary,
  },
  selectedUsername: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.gold.metallic,
  },
  resultsList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
    gap: spacing.md,
  },
  userRowSelected: {
    backgroundColor: colors.gold.primary + '08',
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 0.5,
    borderColor: colors.gold.muted,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontFamily: fonts.serif.bold,
    fontSize: 15,
    color: colors.text.primary,
  },
  userUsername: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  picksButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  picksButtonText: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
  },
});
