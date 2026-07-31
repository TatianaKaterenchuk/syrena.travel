import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Timestamp } from 'firebase/firestore';
import { colors, fonts, spacing, radius, shadows } from '../../src/theme';
import { useAuthStore, useFriendsStore, useMessagingStore, usePlacesStore, useAdminNotificationStore } from '../../src/stores';
import { Friend, FriendRequest, UserProfile, Conversation } from '../../src/types';
import { getDocuments, where } from '../../src/services/firebase/firestore';
import { avatarUrl } from '../../src/utils/placeholderAvatar';

type TabKey = 'friends' | 'requests' | 'messages';

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

  const {
    conversations,
    unreadCount,
    getOrCreateConversation,
  } = useMessagingStore();

  const { userPlaces, fetchUserPlaces } = usePlacesStore();
  const isAdmin = profile?.isAdmin === true;
  const adminPendingCount = useAdminNotificationStore((s) => s.totalPendingCount);

  const [activeTab, setActiveTab] = useState<TabKey>('friends');
  // Deep-link support: /(tabs)/friends?tab=messages (used by the Explore header)
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (tabParam === 'messages' || tabParam === 'requests' || tabParam === 'friends') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [friendsFilter, setFriendsFilter] = useState('');
  const [memberResults, setMemberResults] = useState<UserProfile[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      fetchFriends(user.uid);
      fetchUserPlaces();
    }
  }, [user?.uid]);

  // Note: conversations are subscribed at the (tabs) layout level. Subscribing
  // again here would double-charge Firestore reads and produce duplicate
  // setState calls.

  // Invite friends via native share sheet (contacts, email, messages, etc.)
  const handleInvite = useCallback(async () => {
    try {
      const name = profile?.displayName ? `${profile.displayName} has` : "You've been";
      await Share.share({
        message: `${name} invited you to Syrena Voyager — plan trips and explore together!\n\nDownload the app: https://apps.apple.com/app/syrena-travel/id6759737888`,
        title: 'Join me on Syrena Voyager',
      });
    } catch {}
  }, [profile?.displayName]);

  // Open conversation with a friend
  const handleOpenChat = useCallback(
    (friend: Friend) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(
        `/modal/conversation?recipientUid=${friend.uid}&recipientName=${encodeURIComponent(friend.displayName)}&recipientPhoto=${encodeURIComponent(friend.photoURL || '')}`,
      );
    },
    [router],
  );

  // Open existing conversation from messages tab
  const handleOpenConversation = useCallback(
    (convo: Conversation) => {
      if (!user?.uid) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const otherUid = convo.participants.find((p) => p !== user.uid) || '';
      const otherName = convo.participantNames?.[otherUid] || '';
      const otherPhoto = convo.participantPhotos?.[otherUid] || '';
      router.push(
        `/modal/conversation?conversationId=${convo.id}&recipientUid=${otherUid}&recipientName=${encodeURIComponent(otherName)}&recipientPhoto=${encodeURIComponent(otherPhoto)}`,
      );
    },
    [router, user?.uid],
  );

  // Format timestamp for conversation list
  const formatConvoTime = (ts: Timestamp | null | undefined) => {
    if (!ts || !ts.toDate) return '';
    const date = ts.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // --- Search users by username ---
  // ONE members download per screen mount, shared by search, the friends
  // filter, and suggestions. Previously each of the three re-downloaded the
  // entire users collection on every debounced keystroke.
  const [allUsersCache, setAllUsersCache] = useState<UserProfile[] | null>(null);
  const usersCachePromise = useRef<Promise<UserProfile[]> | null>(null);
  const getAllUsers = useCallback(async (): Promise<UserProfile[]> => {
    if (allUsersCache) return allUsersCache;
    if (!usersCachePromise.current) {
      usersCachePromise.current = getDocuments<UserProfile>('users', []).then(
        (users) => {
          setAllUsersCache(users);
          return users;
        },
      );
    }
    return usersCachePromise.current;
  }, [allUsersCache]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const allUsers = await getAllUsers();
      // Match on name/username only — matching on email leaked other
      // members' addresses to anyone who typed one.
      const results = allUsers.filter(
        (u) =>
          u.uid !== user?.uid &&
          (u.username?.toLowerCase().includes(q) ||
            u.displayName?.toLowerCase().includes(q)),
      );
      setSearchResults(results.slice(0, 10));
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, user?.uid, getAllUsers]);

  useEffect(() => {
    if (searchQuery.trim().length >= 1) {
      const timeout = setTimeout(handleSearch, 200);
      return () => clearTimeout(timeout);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, handleSearch]);

  // Search all members when typing in the friends filter
  useEffect(() => {
    const q = friendsFilter.trim().toLowerCase();
    if (q.length < 1) {
      setMemberResults([]);
      return;
    }
    setIsSearchingMembers(true);
    const timeout = setTimeout(async () => {
      try {
        const allUsers = await getAllUsers();
        const friendUids = new Set(friends.map((f) => f.uid));
        const results = allUsers.filter(
          (u) =>
            u.uid !== user?.uid &&
            !friendUids.has(u.uid) &&
            (u.displayName?.toLowerCase().includes(q) ||
              u.username?.toLowerCase().includes(q)),
        );
        setMemberResults(results.slice(0, 10));
      } catch {
        setMemberResults([]);
      } finally {
        setIsSearchingMembers(false);
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [friendsFilter, friends, user?.uid]);

  const [suggestions, setSuggestions] = useState<UserProfile[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [mutualFriendsMap, setMutualFriendsMap] = useState<Record<string, Friend[]>>({});
  const { getMutualFriends } = useFriendsStore();

  // Fetch suggestions on mount and when friends change
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      setLoadingSuggestions(true);
      try {
        const allUsers = await getAllUsers();
        const friendUids = new Set(friends.map((f) => f.uid));
        const suggested = allUsers.filter(
          (u) =>
            (u.uid || (u as any).id) !== user.uid &&
            !friendUids.has(u.uid || (u as any).id) &&
            u.status === 'approved',
        );
        // Cap the list — it used to render EVERY member unvirtualized,
        // with a mutual-friends Firestore query per row.
        if (!cancelled) setSuggestions(suggested.slice(0, 10));
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid, friends.length, sentRequests.length, requests.length]);

  // Fetch mutual friends for search results and suggestions
  const usersForMutual = searchResults.length > 0 ? searchResults : suggestions;
  useEffect(() => {
    if (usersForMutual.length === 0) {
      setMutualFriendsMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const map: Record<string, Friend[]> = {};
      await Promise.all(
        usersForMutual.map(async (u) => {
          const uid = u.uid || (u as any).id;
          if (!isFriend(uid)) {
            const mutual = await getMutualFriends(uid);
            if (!cancelled) map[uid] = mutual;
          }
        }),
      );
      if (!cancelled) setMutualFriendsMap(map);
    })();
    return () => { cancelled = true; };
  }, [usersForMutual]);

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
      await acceptRequest(request.id, request, profile?.displayName, profile?.photoURL);
      if (user?.uid) fetchFriends(user.uid);
    } catch (error) {
      Alert.alert('Error', 'Could not accept request.');
    }
  };

  const handleReject = (request: FriendRequest) => {
    Alert.alert(
      'Decline Request',
      `Decline the friend request from ${request.fromName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              await rejectRequest(request.id);
              if (user?.uid) fetchFriends(user.uid);
            } catch (error) {
              Alert.alert('Error', 'Could not reject request.');
            }
          },
        },
      ],
    );
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
          onPress={() => router.push(`/modal/user-profile?id=${item.uid || (item as any).id}`)}
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
                      source={{ uri: avatarUrl(f.photoURL, f.uid) }}
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
    <View style={styles.friendRow}>
      <Pressable
        style={styles.friendRowClickable}
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
        </View>
      </Pressable>
      <Pressable
        style={styles.chatButton}
        onPress={() => handleOpenChat(item)}
        hitSlop={13}
        accessibilityLabel={`Message ${item.displayName}`}
        accessibilityRole="button"
      >
        <Ionicons name="chatbubble-outline" size={18} color={colors.gold.primary} />
      </Pressable>
      <Pressable
        style={styles.removeButton}
        onPress={() => handleRemoveFriend(item)}
        hitSlop={12}
        accessibilityLabel={`Remove ${item.displayName} from friends`}
        accessibilityRole="button"
      >
        <Ionicons name="close-circle-outline" size={20} color={colors.text.tertiary} />
      </Pressable>
    </View>
  );

  // --- Render conversation row ---
  const renderConversation = ({ item }: { item: Conversation }) => {
    if (!user?.uid) return null;
    const otherUid = item.participants.find((p) => p !== user.uid) || '';
    const otherName = item.participantNames?.[otherUid] || 'User';
    const otherPhoto = item.participantPhotos?.[otherUid] || '';
    const isUnread = item.unreadBy?.includes(user.uid);
    const isMyMessage = item.lastMessageFromUid === user.uid;

    return (
      <Pressable style={styles.convoRow} onPress={() => handleOpenConversation(item)}>
        {otherPhoto ? (
          <Image source={{ uri: otherPhoto }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={20} color={colors.text.tertiary} />
          </View>
        )}
        <View style={styles.convoInfo}>
          <View style={styles.convoTopRow}>
            <Text style={[styles.convoName, isUnread && styles.convoNameUnread]} numberOfLines={1}>
              {otherName}
            </Text>
            <Text style={styles.convoTime}>{formatConvoTime(item.lastMessageAt)}</Text>
          </View>
          {item.lastMessage ? (
            <Text style={[styles.convoLastMessage, isUnread && styles.convoLastMessageUnread]} numberOfLines={1}>
              {isMyMessage ? 'You: ' : ''}{item.lastMessage}
            </Text>
          ) : (
            <Text style={styles.convoLastMessage}>No messages yet</Text>
          )}
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </Pressable>
    );
  };

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
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileRow}>
          <Pressable onPress={() => router.push('/modal/profile')}>
            <Image
              source={{ uri: avatarUrl(profile?.photoURL, user?.uid) }}
              style={styles.profileAvatar}
            />
          </Pressable>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.displayName || 'User'}</Text>
            <Text style={styles.profileHandle}>@{profile?.username || 'user'}</Text>
            {profile?.bio ? <Text style={styles.profileBio} numberOfLines={2}>{profile.bio}</Text> : null}
          </View>
        </View>
        <View style={styles.profileStats}>
          <Pressable style={styles.profileStat} onPress={() => router.push('/modal/profile')}>
            <Text style={styles.profileStatNumber}>{userPlaces.length}</Text>
            <Text style={styles.profileStatLabel}>PICKS</Text>
          </Pressable>
          <View style={styles.profileStatDivider} />
          <Pressable style={styles.profileStat}>
            <Text style={styles.profileStatNumber}>{friends.length}</Text>
            <Text style={styles.profileStatLabel}>FRIENDS</Text>
          </Pressable>
        </View>
        <View style={styles.profileActions}>
          <Pressable style={styles.profileActionButton} onPress={() => router.push('/modal/profile')}>
            <Ionicons name="create-outline" size={16} color={colors.gold.primary} />
            <Text style={styles.profileActionText}>EDIT PROFILE</Text>
          </Pressable>
          {isAdmin && (
            <Pressable style={styles.profileActionButton} onPress={() => router.push('/modal/admin-approvals')}>
              <Ionicons name="shield-checkmark" size={16} color={colors.gold.primary} />
              <Text style={styles.profileActionText}>ADMIN</Text>
              {adminPendingCount > 0 && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>{adminPendingCount}</Text>
                </View>
              )}
            </Pressable>
          )}
          <Pressable
            style={styles.profileActionButton}
            onPress={() => router.push('/modal/settings')}
            accessibilityLabel="Settings"
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={16} color={colors.gold.primary} />
            <Text style={styles.profileActionText}>SETTINGS</Text>
          </Pressable>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.sectionDivider} />

      {/* Friends Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Friends</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.searchToggle}
            onPress={handleInvite}
          >
            <Ionicons name="share-outline" size={20} color={colors.gold.primary} />
          </Pressable>
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
              keyExtractor={(item) => item.uid || (item as any).id}
              renderItem={renderSearchResult}
              keyboardShouldPersistTaps="handled"
              style={styles.searchResultsList}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          ) : searchQuery.length >= 1 ? (
            <View style={styles.searchEmpty}>
              <Text style={styles.searchEmptyText}>No users found</Text>
            </View>
          ) : suggestions.length > 0 ? (
            <>
              <Text style={styles.suggestionsLabel}>SUGGESTED</Text>
              <FlatList
                data={suggestions.slice(0, 8)}
                keyExtractor={(item) => item.uid || (item as any).id}
                renderItem={renderSearchResult}
                keyboardShouldPersistTaps="handled"
                style={styles.searchResultsList}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            </>
          ) : loadingSuggestions ? (
            <View style={styles.searchLoading}>
              <ActivityIndicator size="small" color={colors.gold.primary} />
            </View>
          ) : null}
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
            <Pressable
              style={[styles.tab, activeTab === 'messages' && styles.tabActive]}
              onPress={() => setActiveTab('messages')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'messages' && styles.tabTextActive,
                ]}
              >
                MESSAGES
              </Text>
              {unreadCount > 0 && (
                <View style={styles.requestBadge}>
                  <Text style={styles.requestBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Friends filter search */}
          {activeTab === 'friends' && (
            <View>
              <View style={styles.friendsFilterBar}>
                <Ionicons name="search" size={14} color={colors.text.tertiary} />
                <TextInput
                  style={styles.friendsFilterInput}
                  value={friendsFilter}
                  onChangeText={setFriendsFilter}
                  placeholder="Search friends & members..."
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
              {/* Type-ahead suggestion cards */}
              {friendsFilter.trim().length >= 1 && (
                <View style={styles.suggestionCards}>
                  {/* Matching friends */}
                  {friends
                    .filter((f) => {
                      const q = friendsFilter.trim().toLowerCase();
                      return (
                        f.displayName?.toLowerCase().includes(q) ||
                        f.username?.toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 5)
                    .map((f) => (
                      <Pressable
                        key={f.uid}
                        style={styles.suggestionCard}
                        onPress={() => router.push(`/modal/user-profile?id=${f.uid}`)}
                      >
                        {f.photoURL ? (
                          <Image source={{ uri: f.photoURL }} style={styles.suggestionCardAvatar} />
                        ) : (
                          <View style={[styles.suggestionCardAvatar, styles.avatarFallback]}>
                            <Ionicons name="person" size={16} color={colors.text.tertiary} />
                          </View>
                        )}
                        <View style={styles.suggestionCardInfo}>
                          <Text style={styles.suggestionCardName} numberOfLines={1}>
                            {f.displayName}
                          </Text>
                          <Text style={styles.suggestionCardHandle} numberOfLines={1}>
                            @{f.username || 'user'}
                          </Text>
                        </View>
                        <View style={styles.suggestionCardBadgeFriend}>
                          <Ionicons name="checkmark" size={12} color={colors.ui.success} />
                        </View>
                      </Pressable>
                    ))}
                  {/* Matching members (non-friends) */}
                  {memberResults.slice(0, 5).map((item) => {
                    const uid = item.uid || (item as any).id;
                    const pending = hasPendingRequest(uid);
                    return (
                      <Pressable
                        key={uid}
                        style={styles.suggestionCard}
                        onPress={() => router.push(`/modal/user-profile?id=${uid}`)}
                      >
                        {item.photoURL ? (
                          <Image source={{ uri: item.photoURL }} style={styles.suggestionCardAvatar} />
                        ) : (
                          <View style={[styles.suggestionCardAvatar, styles.avatarFallback]}>
                            <Ionicons name="person" size={16} color={colors.text.tertiary} />
                          </View>
                        )}
                        <View style={styles.suggestionCardInfo}>
                          <Text style={styles.suggestionCardName} numberOfLines={1}>
                            {item.displayName}
                          </Text>
                          <Text style={styles.suggestionCardHandle} numberOfLines={1}>
                            @{item.username || 'user'}
                          </Text>
                        </View>
                        {pending ? (
                          <View style={styles.suggestionCardBadgePending}>
                            <Text style={styles.suggestionCardBadgeText}>SENT</Text>
                          </View>
                        ) : (
                          <Pressable
                            style={styles.suggestionCardAdd}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleSendRequest(item);
                            }}
                            hitSlop={4}
                          >
                            <Ionicons name="person-add" size={12} color={colors.gold.primary} />
                          </Pressable>
                        )}
                      </Pressable>
                    );
                  })}
                  {isSearchingMembers && (
                    <View style={styles.suggestionCardLoading}>
                      <ActivityIndicator size="small" color={colors.gold.primary} />
                    </View>
                  )}
                  {!isSearchingMembers &&
                    friendsFilter.trim().length >= 1 &&
                    friends.filter((f) => {
                      const q = friendsFilter.trim().toLowerCase();
                      return (
                        f.displayName?.toLowerCase().includes(q) ||
                        f.username?.toLowerCase().includes(q)
                      );
                    }).length === 0 &&
                    memberResults.length === 0 && (
                      <View style={styles.suggestionCardEmpty}>
                        <Text style={styles.suggestionCardEmptyText}>No matches found</Text>
                      </View>
                    )}
                </View>
              )}
            </View>
          )}

          {/* Content */}
          {isLoading && friends.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.gold.primary} />
            </View>
          ) : activeTab === 'messages' ? (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={renderConversation}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.list, { paddingTop: spacing.sm }]}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListHeaderComponent={
                <View style={styles.messagesSectionHeader}>
                  <View style={styles.sectionDivider} />
                  <View style={styles.messagesTitleRow}>
                    <Ionicons name="chatbubbles-outline" size={16} color={colors.gold.primary} />
                    <Text style={styles.messagesSectionTitle}>MESSAGES</Text>
                    {unreadCount > 0 && (
                      <View style={styles.messagesUnreadBadge}>
                        <Text style={styles.messagesUnreadText}>{unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={32}
                      color={colors.gold.muted}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Tap the chat icon next to a friend to start a conversation
                  </Text>
                </View>
              }
            />
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
              keyExtractor={(item) => item.uid || (item as any).id}
              renderItem={renderFriend}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListHeaderComponent={
                <Pressable style={styles.inviteBanner} onPress={handleInvite}>
                  <View style={styles.inviteBannerIcon}>
                    <Ionicons name="paper-plane-outline" size={20} color={colors.gold.primary} />
                  </View>
                  <View style={styles.inviteBannerText}>
                    <Text style={styles.inviteBannerTitle}>Invite Friends to Syrena Voyager</Text>
                    <Text style={styles.inviteBannerSubtitle}>Share via messages, email, or contacts</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </Pressable>
              }
              ListFooterComponent={
                <>
                  {/* Member search results when filtering */}
                  {friendsFilter.trim().length >= 1 && memberResults.length > 0 && (
                    <View style={styles.suggestionsSection}>
                      <View style={styles.suggestionsSectionHeader}>
                        <View style={styles.suggestionsSectionAccent} />
                        <Text style={styles.suggestionsSectionTitle}>ALL MEMBERS</Text>
                      </View>
                      {memberResults.map((item) => {
                        const uid = item.uid || (item as any).id;
                        const pending = hasPendingRequest(uid);
                        return (
                          <View key={uid}>
                            <View style={styles.userRow}>
                              <Pressable
                                style={styles.userRowClickable}
                                onPress={() => router.push(`/modal/user-profile?id=${uid}`)}
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
                              </Pressable>
                              {pending ? (
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
                            <View style={styles.separator} />
                          </View>
                        );
                      })}
                    </View>
                  )}
                  {friendsFilter.trim().length >= 1 && isSearchingMembers && (
                    <View style={styles.searchLoading}>
                      <ActivityIndicator size="small" color={colors.gold.primary} />
                    </View>
                  )}
                  {/* Suggestions when not filtering */}
                  {suggestions.length > 0 && !friendsFilter.trim() && (
                    <View style={styles.suggestionsSection}>
                      <View style={styles.suggestionsSectionHeader}>
                        <View style={styles.suggestionsSectionAccent} />
                        <Text style={styles.suggestionsSectionTitle}>PEOPLE YOU MAY KNOW</Text>
                      </View>
                      {suggestions.map((item) => {
                        const uid = item.uid || (item as any).id;
                        const alreadyFriend = isFriend(uid);
                        const pending = hasPendingRequest(uid);
                        const mutual = mutualFriendsMap[uid] || [];
                        return (
                          <View key={uid}>
                            <View style={styles.userRow}>
                              <Pressable
                                style={styles.userRowClickable}
                                onPress={() => router.push(`/modal/user-profile?id=${uid}`)}
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
                                            source={{ uri: avatarUrl(f.photoURL, f.uid) }}
                                            style={[styles.mutualAvatar, { marginLeft: i > 0 ? -6 : 0 }]}
                                          />
                                        ))}
                                      </View>
                                      <Text style={styles.mutualText}>{mutual.length} in common</Text>
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
                            <View style={styles.separator} />
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              }
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
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  suggestionsLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
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
    height: 42,
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

  // Invite banner
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.gold.primary + '10',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold.muted + '40',
    gap: spacing.md,
  },
  inviteBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteBannerText: {
    flex: 1,
    gap: 2,
  },
  inviteBannerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 15,
    color: colors.text.primary,
  },
  inviteBannerSubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    letterSpacing: 0.2,
  },

  // Suggestion cards (type-ahead)
  suggestionCards: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ui.border,
    overflow: 'hidden',
    maxHeight: 320,
    ...shadows.md,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
  },
  suggestionCardAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.gold.muted + '50',
  },
  suggestionCardInfo: {
    flex: 1,
    gap: 1,
  },
  suggestionCardName: {
    fontFamily: fonts.serif.bold,
    fontSize: 14,
    color: colors.text.primary,
  },
  suggestionCardHandle: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  suggestionCardBadgeFriend: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.ui.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionCardBadgePending: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.gold.primary + '15',
  },
  suggestionCardBadgeText: {
    fontFamily: fonts.sans.medium,
    fontSize: 9,
    color: colors.gold.muted,
    letterSpacing: 1,
  },
  suggestionCardAdd: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionCardLoading: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  suggestionCardEmpty: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  suggestionCardEmptyText: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
  },

  // Friend row
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  friendRowClickable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  chatButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
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

  // Suggestions section in friends list
  suggestionsSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
  },
  suggestionsSectionHeader: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  suggestionsSectionAccent: {
    width: 24,
    height: 2,
    backgroundColor: colors.gold.primary,
    marginBottom: spacing.sm,
  },
  suggestionsSectionTitle: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
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

  // Conversation row
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  convoInfo: {
    flex: 1,
    gap: 3,
  },
  convoTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convoName: {
    fontFamily: fonts.serif.regular,
    fontSize: 15,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  convoNameUnread: {
    fontFamily: fonts.serif.bold,
  },
  convoTime: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.2,
  },
  convoLastMessage: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    letterSpacing: 0.1,
  },
  convoLastMessageUnread: {
    color: colors.text.secondary,
    fontFamily: fonts.sans.medium,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gold.primary,
  },

  // Profile Card
  profileCard: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: colors.gold.primary,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    color: colors.text.primary,
  },
  profileHandle: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  profileBio: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
    lineHeight: 16,
  },
  profileStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background.secondary + '60',
  },
  profileStat: {
    flex: 1,
    alignItems: 'center',
  },
  profileStatNumber: {
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    color: colors.gold.primary,
  },
  profileStatLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  profileStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.ui.border,
  },
  profileActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  profileActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.gold.muted + '40',
  },
  profileActionText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.gold.primary,
  },
  adminBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.ui.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  adminBadgeText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 9,
    color: '#fff',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.ui.border,
    marginHorizontal: spacing.lg,
  },
  messagesSectionHeader: {
    marginBottom: spacing.md,
  },
  messagesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  messagesSectionTitle: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.gold.primary,
    flex: 1,
  },
  messagesUnreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  messagesUnreadText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.background.primary,
  },
});
