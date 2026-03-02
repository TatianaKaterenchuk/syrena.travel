import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { where } from 'firebase/firestore';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { useAuthStore } from '../../src/stores';
import { UserProfile, EditSuggestion, PlaceEditableFields } from '../../src/types';
import { getDocuments, updateDocument } from '../../src/services/firebase/firestore';
import { usePlacesStore } from '../../src/stores/usePlacesStore';

// Friendly labels for field names
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  category: 'Category',
  subcategory: 'Subcategory',
  address: 'Address',
  city: 'City',
  country: 'Country',
  tags: 'Tags',
  budgetTier: 'Budget',
};

export default function AdminApprovalsModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const { approveEditSuggestion, rejectEditSuggestion } = usePlacesStore();

  const [activeTab, setActiveTab] = useState<'users' | 'edits' | 'history'>('users');
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [pendingEdits, setPendingEdits] = useState<EditSuggestion[]>([]);
  const [historyUsers, setHistoryUsers] = useState<UserProfile[]>([]);
  const [historyEdits, setHistoryEdits] = useState<EditSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Admin guard
  if (!profile?.isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={22} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Approvals</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={48} color={colors.gold.muted} />
          <Text style={styles.noAccessText}>Admin access required</Text>
        </View>
      </View>
    );
  }

  const fetchPending = async () => {
    setIsLoading(true);
    try {
      const users = await getDocuments<UserProfile>('users', [
        where('status', '==', 'pending'),
      ]);
      setPendingUsers(users);
    } catch (error) {
      console.error('Error fetching pending users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingEdits = async () => {
    try {
      const edits = await getDocuments<EditSuggestion>('editSuggestions', [
        where('status', '==', 'pending'),
      ]);
      // Sort client-side to avoid needing a Firestore composite index
      edits.sort((a, b) => {
        const aTime = a.createdAt?.seconds ?? 0;
        const bTime = b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
      setPendingEdits(edits);
    } catch (error) {
      console.error('Error fetching pending edit suggestions:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const [approvedUsers, rejectedUsers] = await Promise.all([
        getDocuments<UserProfile>('users', [where('status', '==', 'approved')]),
        getDocuments<UserProfile>('users', [where('status', '==', 'rejected')]),
      ]);
      const combined = [...approvedUsers, ...rejectedUsers];
      combined.sort((a, b) => {
        const aTime = (a as any).updatedAt?.seconds ?? (a as any).createdAt?.seconds ?? 0;
        const bTime = (b as any).updatedAt?.seconds ?? (b as any).createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
      setHistoryUsers(combined);
    } catch (error) {
      console.error('Error fetching user history:', error);
    }
  };

  const fetchHistoryEdits = async () => {
    try {
      const [approvedEdits, rejectedEdits] = await Promise.all([
        getDocuments<EditSuggestion>('editSuggestions', [where('status', '==', 'approved')]),
        getDocuments<EditSuggestion>('editSuggestions', [where('status', '==', 'rejected')]),
      ]);
      const combined = [...approvedEdits, ...rejectedEdits];
      combined.sort((a, b) => {
        const aTime = a.updatedAt?.seconds ?? a.createdAt?.seconds ?? 0;
        const bTime = b.updatedAt?.seconds ?? b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
      setHistoryEdits(combined);
    } catch (error) {
      console.error('Error fetching edit history:', error);
    }
  };

  const handleRefresh = () => {
    fetchPending();
    fetchPendingEdits();
    if (activeTab === 'history') {
      fetchHistory();
      fetchHistoryEdits();
    }
  };

  useEffect(() => {
    fetchPending();
    fetchPendingEdits();
  }, []);

  // Fetch history when switching to history tab
  useEffect(() => {
    if (activeTab === 'history' && historyUsers.length === 0 && historyEdits.length === 0) {
      fetchHistory();
      fetchHistoryEdits();
    }
  }, [activeTab]);

  // ── User handlers ──

  const handleApprove = async (uid: string, name: string) => {
    try {
      await updateDocument('users', uid, { status: 'approved' });
      setPendingUsers((prev) => prev.filter((u) => (u.uid || (u as any).id) !== uid));
      Alert.alert('Approved', `${name} has been approved.`);
    } catch (error) {
      Alert.alert('Error', 'Could not approve user.');
    }
  };

  const handleReject = (uid: string, name: string) => {
    Alert.alert('Reject User', `Are you sure you want to reject ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateDocument('users', uid, { status: 'rejected' });
            setPendingUsers((prev) => prev.filter((u) => (u.uid || (u as any).id) !== uid));
          } catch (error) {
            Alert.alert('Error', 'Could not reject user.');
          }
        },
      },
    ]);
  };

  // ── Edit suggestion handlers ──

  const handleApproveEdit = async (suggestion: EditSuggestion) => {
    try {
      await approveEditSuggestion(suggestion);
      setPendingEdits((prev) => prev.filter((e) => e.id !== suggestion.id));
      Alert.alert('Approved', `Edit for "${suggestion.placeName}" has been applied.`);
    } catch (error) {
      Alert.alert('Error', 'Could not approve edit suggestion.');
    }
  };

  const handleRejectEdit = (suggestion: EditSuggestion) => {
    Alert.alert(
      'Reject Edit',
      `Reject this edit suggestion for "${suggestion.placeName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await rejectEditSuggestion(suggestion.id);
              setPendingEdits((prev) => prev.filter((e) => e.id !== suggestion.id));
            } catch (error) {
              Alert.alert('Error', 'Could not reject edit suggestion.');
            }
          },
        },
      ],
    );
  };

  // ── Renderers ──

  const renderUser = ({ item }: { item: UserProfile }) => (
    <View style={styles.card}>
      <View style={styles.cardBrass} />
      <View style={styles.cardContent}>
        <View style={styles.userRow}>
          <Image
            source={{ uri: item.photoURL || 'https://i.pravatar.cc/100?img=3' }}
            style={styles.userAvatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.displayName}</Text>
            <Text style={styles.userUsername}>@{item.username}</Text>
            <Text style={styles.userEmail}>{item.email}</Text>
          </View>
        </View>
        {/* About / Bio */}
        {item.bio ? (
          <View style={styles.userDetailSection}>
            <Text style={styles.userDetailLabel}>ABOUT</Text>
            <Text style={styles.userDetailValue}>{item.bio}</Text>
          </View>
        ) : null}
        {/* Referral source */}
        {item.referralSource ? (
          <View style={styles.userDetailSection}>
            <Text style={styles.userDetailLabel}>HOW THEY FOUND US</Text>
            <Text style={styles.userDetailValue}>{item.referralSource}</Text>
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <Pressable
            style={styles.approveButton}
            onPress={() => handleApprove(item.uid || (item as any).id, item.displayName)}
          >
            <Ionicons name="checkmark" size={16} color={colors.background.primary} />
            <Text style={styles.approveText}>APPROVE</Text>
          </Pressable>
          <Pressable
            style={styles.rejectButton}
            onPress={() => handleReject(item.uid || (item as any).id, item.displayName)}
          >
            <Ionicons name="close" size={16} color="#fff" />
            <Text style={styles.rejectText}>REJECT</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const formatFieldValue = (field: string, value: any): string => {
    if (value === null || value === undefined) return '(empty)';
    if (field === 'tags' && Array.isArray(value)) return value.slice(0, 5).join(', ');
    if (field === 'budgetTier') return value ? `${'$'.repeat(Number(value))}` : '(none)';
    return String(value);
  };

  const renderEditSuggestion = ({ item }: { item: EditSuggestion }) => {
    const changedFields = Object.keys(item.changes) as (keyof PlaceEditableFields)[];

    return (
      <View style={styles.card}>
        <View style={styles.cardBrass} />
        <View style={styles.cardContent}>
          {/* Submitter + Place info */}
          <View style={styles.userRow}>
            <Image
              source={{ uri: item.submittedByPhoto || 'https://i.pravatar.cc/100?img=3' }}
              style={styles.userAvatar}
            />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{item.submittedByName}</Text>
              <Text style={styles.editPlaceName}>
                <Ionicons name="location-outline" size={11} color={colors.gold.muted} />
                {'  '}
                {item.placeName}
              </Text>
            </View>
          </View>

          {/* Changes diff */}
          <View style={styles.diffSection}>
            {changedFields.map((field) => (
              <View key={field} style={styles.diffRow}>
                <Text style={styles.diffFieldLabel}>
                  {(FIELD_LABELS[field] || field).toUpperCase()}
                </Text>
                <View style={styles.diffValues}>
                  <Text style={styles.diffOldValue} numberOfLines={2}>
                    {formatFieldValue(field, item.originalValues[field])}
                  </Text>
                  <Ionicons name="arrow-forward" size={10} color={colors.gold.muted} />
                  <Text style={styles.diffNewValue} numberOfLines={2}>
                    {formatFieldValue(field, item.changes[field])}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <Pressable
              style={styles.approveButton}
              onPress={() => handleApproveEdit(item)}
            >
              <Ionicons name="checkmark" size={16} color={colors.background.primary} />
              <Text style={styles.approveText}>APPROVE</Text>
            </Pressable>
            <Pressable
              style={styles.rejectButton}
              onPress={() => handleRejectEdit(item)}
            >
              <Ionicons name="close" size={16} color="#fff" />
              <Text style={styles.rejectText}>REJECT</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp?.seconds) return '';
    const d = new Date(timestamp.seconds * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderHistoryUser = ({ item }: { item: UserProfile }) => (
    <View style={styles.card}>
      <View style={[styles.cardBrass, { backgroundColor: item.status === 'approved' ? colors.ui.success : colors.ui.error }]} />
      <View style={styles.cardContent}>
        <View style={styles.userRow}>
          <Image
            source={{ uri: item.photoURL || 'https://i.pravatar.cc/100?img=3' }}
            style={styles.userAvatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.displayName}</Text>
            <Text style={styles.userUsername}>@{item.username}</Text>
          </View>
          <View style={[styles.statusBadge, item.status === 'approved' ? styles.statusApproved : styles.statusRejected]}>
            <Ionicons
              name={item.status === 'approved' ? 'checkmark' : 'close'}
              size={10}
              color={item.status === 'approved' ? colors.ui.success : colors.ui.error}
            />
            <Text style={[styles.statusBadgeText, { color: item.status === 'approved' ? colors.ui.success : colors.ui.error }]}>
              {item.status === 'approved' ? 'APPROVED' : 'REJECTED'}
            </Text>
          </View>
        </View>
        <Text style={styles.historyDate}>{formatDate((item as any).updatedAt || (item as any).createdAt)}</Text>
      </View>
    </View>
  );

  const renderHistoryEdit = ({ item }: { item: EditSuggestion }) => {
    const changedFields = Object.keys(item.changes) as (keyof PlaceEditableFields)[];
    return (
      <View style={styles.card}>
        <View style={[styles.cardBrass, { backgroundColor: item.status === 'approved' ? colors.ui.success : colors.ui.error }]} />
        <View style={styles.cardContent}>
          <View style={styles.userRow}>
            <Image
              source={{ uri: item.submittedByPhoto || 'https://i.pravatar.cc/100?img=3' }}
              style={styles.userAvatar}
            />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{item.submittedByName}</Text>
              <Text style={styles.editPlaceName}>
                <Ionicons name="location-outline" size={11} color={colors.gold.muted} />
                {'  '}{item.placeName}
              </Text>
            </View>
            <View style={[styles.statusBadge, item.status === 'approved' ? styles.statusApproved : styles.statusRejected]}>
              <Ionicons
                name={item.status === 'approved' ? 'checkmark' : 'close'}
                size={10}
                color={item.status === 'approved' ? colors.ui.success : colors.ui.error}
              />
              <Text style={[styles.statusBadgeText, { color: item.status === 'approved' ? colors.ui.success : colors.ui.error }]}>
                {item.status === 'approved' ? 'APPROVED' : 'REJECTED'}
              </Text>
            </View>
          </View>
          <View style={styles.diffSection}>
            {changedFields.map((field) => (
              <View key={field} style={styles.diffRow}>
                <Text style={styles.diffFieldLabel}>
                  {(FIELD_LABELS[field] || field).toUpperCase()}
                </Text>
                <View style={styles.diffValues}>
                  <Text style={styles.diffOldValue} numberOfLines={2}>
                    {formatFieldValue(field, item.originalValues[field])}
                  </Text>
                  <Ionicons name="arrow-forward" size={10} color={colors.gold.muted} />
                  <Text style={[styles.diffNewValue, item.status === 'rejected' && { color: colors.text.tertiary }]} numberOfLines={2}>
                    {formatFieldValue(field, item.changes[field])}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.historyDate}>{formatDate(item.updatedAt || item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  const renderEmpty = (message: string) => (
    <View style={styles.centered}>
      <View style={styles.emptyIconRing}>
        <Ionicons name="checkmark-circle" size={40} color={colors.ui.success} />
      </View>
      <Text style={styles.emptyTitle}>All clear</Text>
      <Text style={styles.emptySubtitle}>{message}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Approvals</Text>
        <Pressable onPress={handleRefresh}>
          <Ionicons name="refresh" size={20} color={colors.gold.primary} />
        </Pressable>
      </View>

      {/* Tab control */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
        >
          <Ionicons
            name="people-outline"
            size={14}
            color={activeTab === 'users' ? colors.gold.primary : colors.text.tertiary}
          />
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
            Users ({pendingUsers.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'edits' && styles.tabActive]}
          onPress={() => setActiveTab('edits')}
        >
          <Ionicons
            name="create-outline"
            size={14}
            color={activeTab === 'edits' ? colors.gold.primary : colors.text.tertiary}
          />
          <Text style={[styles.tabText, activeTab === 'edits' && styles.tabTextActive]}>
            Edits ({pendingEdits.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons
            name="time-outline"
            size={14}
            color={activeTab === 'history' ? colors.gold.primary : colors.text.tertiary}
          />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            History
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
        </View>
      ) : activeTab === 'users' ? (
        pendingUsers.length === 0 ? (
          renderEmpty('No pending user approvals')
        ) : (
          <FlatList
            data={pendingUsers}
            keyExtractor={(item) => item.uid || (item as any).id}
            renderItem={renderUser}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : activeTab === 'edits' ? (
        pendingEdits.length === 0 ? (
          renderEmpty('No pending edit suggestions')
        ) : (
          <FlatList
            data={pendingEdits}
            keyExtractor={(item) => item.id}
            renderItem={renderEditSuggestion}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : (
        // History tab
        historyUsers.length === 0 && historyEdits.length === 0 ? (
          renderEmpty('No history yet')
        ) : (
          <FlatList
            data={[
              ...historyUsers.map((u) => ({ ...u, _type: 'user' as const })),
              ...historyEdits.map((e) => ({ ...e, _type: 'edit' as const })),
            ].sort((a, b) => {
              const aTime = (a as any).updatedAt?.seconds ?? (a as any).createdAt?.seconds ?? 0;
              const bTime = (b as any).updatedAt?.seconds ?? (b as any).createdAt?.seconds ?? 0;
              return bTime - aTime;
            })}
            keyExtractor={(item) => (item as any).uid || (item as any).id}
            renderItem={({ item }: { item: any }) =>
              item._type === 'user'
                ? renderHistoryUser({ item })
                : renderHistoryEdit({ item })
            }
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      )}
    </View>
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

  // Header
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

  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    gap: spacing.sm,
  },
  tabActive: {
    backgroundColor: colors.gold.primary + '15',
    borderColor: colors.gold.primary,
  },
  tabText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 1,
  },
  tabTextActive: {
    color: colors.gold.primary,
  },

  // List
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },

  // Card (shared between users and edits)
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ui.cardBg,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  cardBrass: {
    height: 2,
    backgroundColor: colors.gold.primary,
    opacity: 0.4,
  },
  cardContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },

  // User info
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.gold.muted,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontFamily: fonts.serif.bold,
    fontSize: 16,
    color: colors.text.primary,
  },
  userUsername: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.gold.metallic,
  },
  userEmail: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
  },
  editPlaceName: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.gold.muted,
    marginTop: 2,
  },
  userDetailSection: {
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.ui.border,
    gap: 4,
  },
  userDetailLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 9,
    color: colors.text.tertiary,
    letterSpacing: 1.5,
  },
  userDetailValue: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },

  // Diff section
  diffSection: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.ui.border,
  },
  diffRow: {
    gap: 4,
  },
  diffFieldLabel: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 9,
    color: colors.text.tertiary,
    letterSpacing: 1.5,
  },
  diffValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  diffOldValue: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.ui.error,
    textDecorationLine: 'line-through',
  },
  diffNewValue: {
    flex: 1,
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    color: colors.gold.primary,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ui.success,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    gap: 6,
  },
  approveText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.background.primary,
    letterSpacing: 2,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ui.error,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    gap: 6,
  },
  rejectText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: '#fff',
    letterSpacing: 2,
  },

  // Empty state
  emptyIconRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: colors.ui.success + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  emptySubtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
  },

  // History
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    gap: 4,
  },
  statusApproved: {
    backgroundColor: colors.ui.success + '15',
    borderWidth: 0.5,
    borderColor: colors.ui.success + '40',
  },
  statusRejected: {
    backgroundColor: colors.ui.error + '15',
    borderWidth: 0.5,
    borderColor: colors.ui.error + '40',
  },
  statusBadgeText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  historyDate: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: -4,
  },
});
