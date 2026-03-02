import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { useAuthStore, useFriendsStore } from '../../src/stores';
import { Friend, FriendRequest, UserProfile } from '../../src/types';
import { getDocuments, where } from '../../src/services/firebase/firestore';

type TabKey = 'friends' | 'requests';

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuthStore();
  const {
    friends,
    requests,
    sentRequests,
    isLoading,
    fetchFriends,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
  } = useFriendsStore();

  const [activeTab, setActiveTab] = useState<TabKey>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [friendsFilter, setFriendsFilter] = useState('');

  useEffect(() => {
    if (user?.uid) {
      fetchFriends(user.uid);
    }
  }, [user?.uid]);

  // --- Search users by username ---
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Search by username (exact prefix match isn't great with Firestore,
      // so we'll fetch a batch and filter client-side)
      const allUsers = await getDocuments<UserProfile>('users', []);
      const results = allUsers.filter(
        (u) =>
          u.uid !== user?.uid &&
          (u.username?.toLowerCase().includes(q) ||
            u.displayName?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q)),
      );
      setSearchResults(results.slice(0, 10));
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, user?.uid]);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const timeout = setTimeout(handleSearch, 400);
      return () => clearTimeout(timeout);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, handleSearch]);

  const [mutualFriendsMap, setMutualFriendsMap] = useState<Record<string, Friend[]>>({});
  const { getMutualFriends } = useFriendsStore();

  // Fetch mutual friends for search results
  useEffect(() => {
    if (searchResults.length === 0) {
      setMutualFriendsMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const map: Record<string, Friend[]> = {};
      await Promise.all(
        searchResults.map(async (u) => {
          if (!isFriend(u.uid)) {
            const mutual = await getMutualFriends(u.uid);
            if (!cancelled) map[u.uid] = mutual;
          }
        }),
      );
      if (!cancelled) setMutualFriendsMap(map);
    })();
    return () => { cancelled = true; };
  }, [searchResults]);

  const isFriend = (uid: string) => friends.some((f) => f.uid === uid);
  const hasPendingRequest = (uid: string) =>
    requests.some((r) => r.fromUid === uid) ||
    sentRequests.some((r) => r.toUid === uid);

  const handleSendRequest = async (targetUser: UserProfile) => {
    if (!user || !profile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await sendRequest(
        user.uid,
        profile.displayName,
        profile.photoURL || '',
        targetUser.uid,
        targetUser.displayName,
      );
      // Button automatically switches to "REQUESTED" via sentRequests store
    } catch (error) {
      Alert.alert('Error', 'Could not send friend request. Try again.');
    }
  };

  const handleAccept = async (request: FriendRequest) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await acceptRequest(request.id, request);
      if (user?.uid) fetchFriends(user.uid);
    } catch (error) {
      Alert.alert('Error', 'Could not accept request.');
    }
  };

  const handleReject = async (request: FriendRequest) => {
    try {
      await rejectRequest(request.id);
      if (user?.uid) fetchFriends(user.uid);
    } catch (error) {
      Alert.alert('Error', 'Could not reject request.');
    }
  };

  const handleRemoveFriend = (friend: Friend) => {
    Alert.alert(
      'Remove Friend',
      `Remove ${friend.displayName} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFriend(friend.uid);
              if (user?.uid) fetchFriends(user.uid);
            } catch (error) {
              Alert.alert('Error', 'Could not remove friend.');
            }
          },
        },
      ],
    );
  };

  // --- Render search result row ---
  const renderSearchResult = ({ item }: { item: UserProfile }) => {
    const alreadyFriend = isFriend(item.uid);
    const pending = hasPendingRequest(item.uid);
    const mutual = mutualFriendsMap[item.uid] || [];

    return (
      <View style={styles.userRow}>
        <Pressable
          style={styles.userRowClickable}
          onPress={() => router.push(`/modal/user-profile?id=${item.uid}`)}
        >
          {item.photoURL ? (
            <Image source={{ uri: item.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={20} color={colors.text.tertiary} />
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.displayName}
            </Text>
            <Text style={styles.userHandle}>@{item.username || 'user'}</Text>
            {mutual.length > 0 && !alreadyFriend && (
              <View style={styles.mutualRow}>
                <View style={styles.mutualAvatars}>
                  {mutual.slice(0, 2).map((f, i) => (
                    <Image
                      key={f.uid}
                      source={{ uri: f.photoURL || 'https://i.pravatar.cc/100?img=3' }}
                      style={[styles.mutualAvatar, { marginLeft: i > 0 ? -6 : 0 }]}
                    />
                  ))}
                </View>
                <Text style={styles.mutualText}>
                  {mutual.length} in common
                </Text>
              </View>
            )}
          </View>
        </Pressable>
        {alreadyFriend ? (
          <View style={styles.friendBadge}>
            <Ionicons name="checkmark" size={14} color={colors.ui.success} />
            <Text style={styles.friendBadgeText}>FRIENDS</Text>
          </View>
        ) : pending ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>REQUESTED</Text>
          </View>
        ) : (
          <Pressable
            style={styles.addFriendButton}
            onPress={() => handleSendRequest(item)}
          >
            <Ionicons name="person-add" size={14} color={colors.gold.primary} />
            <Text style={styles.addFriendText}>ADD</Text>
          </Pressable>
        )}
      </View>
    );
  };

  // --- Render friend row ---
  const renderFriend = ({ item }: { item: Friend }) => (
    <Pressable
      style={styles.friendRow}
      onPress={() => router.push(`/modal/user-profile?id=${item.uid}`)}
      onLongPress={() => handleRemoveFriend(item)}
    >
      {item.photoURL ? (
        <Image source={{ uri: item.photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Ionicons name="person" size={20} color={colors.text.tertiary} />
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>
          {item.displayName}
        </Text>
        <Text style={styles.userHandle}>@{item.username || 'user'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
    </Pressable>
  );

  // --- Render request row ---
  const renderRequest = ({ item }: { item: FriendRequest }) => (
    <View style={styles.requestRow}>
      {item.fromPhoto ? (
        <Image source={{ uri: item.fromPhoto }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Ionicons name="person" size={20} color={colors.text.tertiary} />
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>
          {item.fromName}
        </Text>
        <Text style={styles.userHandle}>wants to be friends</Text>
      </View>
      <View style={styles.requestActions}>
        <Pressable
          style={styles.acceptButton}
          onPress={() => handleAccept(item)}
        >
          <Ionicons name="checkmark" size={18} color={colors.background.primary} />
        </Pressable>
        <Pressable
          style={styles.rejectButton}
          onPress={() => handleReject(item)}
        >
          <Ionicons name="close" size={18} color={colors.text.tertiary} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Friends</Text>
        <Pressable
          style={styles.searchToggle}
          onPress={() => {
            setShowSearch(!showSearch);
            if (showSearch) {
              setSearchQuery('');
              setSearchResults([]);
              Keyboard.dismiss();
            }
          }}
        >
          <Ionicons
            name={showSearch ? 'close' : 'person-add-outline'}
            size={20}
            color={colors.gold.primary}
          />
        </Pressable>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={styles.searchSection}>
          <View style={styles.searchBarAccent} />
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name or username..."
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
              </Pressable>
            )}
          </View>

          {isSearching ? (
            <View style={styles.searchLoading}>
              <ActivityIndicator size="small" color={colors.gold.primary} />
              <Text style={styles.searchLoadingText}>Searching...</Text>
            </View>
          ) : searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.uid}
              renderItem={renderSearchResult}
              keyboardShouldPersistTaps="handled"
              style={styles.searchResultsList}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          ) : searchQuery.length >= 2 ? (
            <View style={styles.searchEmpty}>
              <Text style={styles.searchEmptyText}>No users found</Text>
            </View>
          ) : (
            <View style={styles.searchEmpty}>
              <Text style={styles.searchEmptyText}>
                Type at least 2 characters to search
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Tab switcher */}
      {!showSearch && (
        <>
          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
              onPress={() => setActiveTab('friends')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'friends' && styles.tabTextActive,
                ]}
              >
                FRIENDS
              </Text>
              <Text
                style={[
                  styles.tabCount,
                  activeTab === 'friends' && styles.tabCountActive,
                ]}
              >
                {friends.length}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
              onPress={() => setActiveTab('requests')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'requests' && styles.tabTextActive,
                ]}
              >
                REQUESTS
              </Text>
              {requests.length > 0 && (
                <View style={styles.requestBadge}>
                  <Text style={styles.requestBadgeText}>{requests.length}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Friends filter search */}
          {activeTab === 'friends' && friends.length > 0 && (
            <View style={styles.friendsFilterBar}>
              <Ionicons name="search" size={14} color={colors.text.tertiary} />
              <TextInput
                style={styles.friendsFilterInput}
                value={friendsFilter}
                onChangeText={setFriendsFilter}
                placeholder="Search friends..."
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {friendsFilter.length > 0 && (
                <Pressable onPress={() => setFriendsFilter('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
                </Pressable>
              )}
            </View>
          )}

          {/* Content */}
          {isLoading && friends.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.gold.primary} />
            </View>
          ) : activeTab === 'friends' ? (
            <FlatList
              data={friendsFilter.trim().length > 0
                ? friends.filter((f) => {
                    const q = friendsFilter.trim().toLowerCase();
                    return (
                      f.displayName?.toLowerCase().includes(q) ||
                      f.username?.toLowerCase().includes(q)
                    );
                  })
                : friends}
              keyExtractor={(item) => item.uid}
              renderItem={renderFriend}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons
                      name="people-outline"
                      size={32}
                      color={colors.gold.muted}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>No friends yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Tap the + button to find and add friends
                  </Text>
                  <Pressable
                    style={styles.emptyButton}
                    onPress={() => setShowSearch(true)}
                  >
                    <Ionicons
                      name="person-add"
                      size={16}
                      color={colors.background.primary}
                    />
                    <Text style={styles.emptyButtonText}>Find Friends</Text>
                  </Pressable>
                </View>
              }
            />
          ) : (
            <FlatList
              data={requests}
              keyExtractor={(item) => item.id}
              renderItem={renderRequest}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons
                      name="mail-outline"
                      size={32}
                      color={colors.gold.muted}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>No pending requests</Text>
                  <Text style={styles.emptySubtitle}>
                    When someone sends you a request, it will appear here
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}
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
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 32,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  searchToggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.gold.muted,
  },

  // Search
  searchSection: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.ui.border,
    overflow: 'hidden',
    maxHeight: 400,
    ...shadows.md,
  },
  searchBarAccent: {
    height: 2,
    backgroundColor: colors.gold.primary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.primary,
    paddingVertical: 4,
  },
  searchLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  searchLoadingText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  searchResultsList: {
    maxHeight: 300,
  },
  searchEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  searchEmptyText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
  },

  // User row (search results)
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  userRowClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.gold.muted + '50',
  },
  avatarFallback: {
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontFamily: fonts.serif.bold,
    fontSize: 15,
    color: colors.text.primary,
  },
  userHandle: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  addFriendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.gold.primary,
  },
  addFriendText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.gold.primary,
    letterSpacing: 1.5,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.ui.success + '15',
  },
  friendBadgeText: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.ui.success,
    letterSpacing: 1,
  },
  mutualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  mutualAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mutualAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.background.secondary,
  },
  mutualText: {
    fontFamily: fonts.sans.regular,
    fontSize: 10,
    color: colors.gold.metallic,
    letterSpacing: 0.3,
  },
  pendingBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.gold.primary + '15',
  },
  pendingBadgeText: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.gold.muted,
    letterSpacing: 1,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.background.secondary,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.gold.primary + '12',
    borderBottomWidth: 2,
    borderBottomColor: colors.gold.primary,
  },
  tabText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 2,
  },
  tabTextActive: {
    color: colors.gold.primary,
  },
  tabCount: {
    fontFamily: fonts.serif.bold,
    fontSize: 14,
    color: colors.text.tertiary,
  },
  tabCountActive: {
    color: colors.gold.primary,
  },
  requestBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  requestBadgeText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.background.primary,
  },

  // Friends filter
  friendsFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    gap: spacing.sm,
  },
  friendsFilterInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: 2,
  },

  // Friend row
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },

  // Request row
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  acceptButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.tertiary,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // List
  list: {
    paddingBottom: 20,
  },
  separator: {
    height: 1,
    backgroundColor: colors.ui.border,
    marginLeft: spacing.lg + 44 + spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty state
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
    letterSpacing: 0.3,
  },
  emptySubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.tertiary,
    letterSpacing: 0.2,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    gap: spacing.sm,
    marginTop: spacing.xl,
    borderWidth: 0.5,
    borderColor: colors.gold.metallic,
  },
  emptyButtonText: {
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    color: colors.text.inverse,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
