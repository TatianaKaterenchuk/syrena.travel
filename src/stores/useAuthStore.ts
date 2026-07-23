import { create } from 'zustand';
import { User } from 'firebase/auth';
import { UserProfile } from '../types';
import {
  signIn as firebaseSignIn,
  signUp as firebaseSignUp,
  signOut as firebaseSignOut,
  subscribeToAuthState,
} from '../services/firebase/auth';
import { getDocument, getDocuments, updateDocument, deleteDocument, where } from '../services/firebase/firestore';

/**
 * Propagate identity changes (name/photo/username) to every denormalized
 * copy: friend docs on OTHER users' lists, pending requests we sent,
 * conversation participant maps, and places we created. Without this,
 * renames froze at creation time everywhere outside the profile.
 */
async function syncIdentityFanOut(uid: string, profile: UserProfile): Promise<void> {
  const name = profile.displayName || '';
  const username = profile.username || '';
  const photo = profile.photoURL || '';

  const [friendDocs, requestDocs, convoDocs, placeDocs] = await Promise.all([
    getDocuments<any>('friends', [where('uid', '==', uid)]),
    getDocuments<any>('friendRequests', [
      where('fromUid', '==', uid),
      where('status', '==', 'pending'),
    ]),
    getDocuments<any>('conversations', [
      where('participants', 'array-contains', uid),
    ]),
    getDocuments<any>('places', [where('createdBy', '==', uid)]),
  ]);

  await Promise.all([
    ...friendDocs.map((f: any) =>
      updateDocument('friends', f.id, {
        displayName: name,
        photoURL: photo,
        ...(username ? { username } : {}),
      }),
    ),
    ...requestDocs.map((r: any) =>
      updateDocument('friendRequests', r.id, { fromName: name, fromPhoto: photo }),
    ),
    ...convoDocs.map((c: any) =>
      updateDocument('conversations', c.id, {
        [`participantNames.${uid}`]: name,
        [`participantPhotos.${uid}`]: photo,
      }),
    ),
    ...placeDocs.map((p: any) =>
      updateDocument('places', p.id, {
        createdByName: name,
        createdByPhoto: photo,
      }),
    ),
  ]);
}

/** Compute whether a profile counts as "approved". */
function computeApproved(profile: UserProfile | null): boolean {
  if (!profile) return false;
  // Admins are always approved
  if (profile.isAdmin) return true;
  // Existing users without a status field are treated as approved (backward compat)
  if (!profile.status) return true;
  return profile.status === 'approved';
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, username: string, bio?: string, referralSource?: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  approveUser: (uid: string) => Promise<void>;
  rejectUser: (uid: string) => Promise<void>;
  banUser: (uid: string) => Promise<void>;
  unbanUser: (uid: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  // State
  user: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  isApproved: false,

  // Actions
  setUser: (user) => {
    if (!user) {
      // Clearing user must also clear derived auth-state to keep everything consistent
      set({ user: null, isAuthenticated: false, profile: null, isApproved: false });
    } else {
      set({ user, isAuthenticated: true });
    }
  },

  setProfile: (profile) => {
    set({ profile, isApproved: computeApproved(profile) });
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const user = await firebaseSignIn(email, password);
      const profile = await getDocument<UserProfile>('users', user.uid);
      set({
        user,
        profile,
        isAuthenticated: true,
        isApproved: computeApproved(profile),
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signUp: async (email, password, displayName, username, bio = '', referralSource = '') => {
    set({ isLoading: true });
    try {
      const user = await firebaseSignUp(email, password, displayName, username, bio, referralSource);
      const profile = await getDocument<UserProfile>('users', user.uid);
      set({
        user,
        profile,
        isAuthenticated: true,
        isApproved: computeApproved(profile),
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await firebaseSignOut();
      set({
        user: null,
        profile: null,
        isAuthenticated: false,
        isApproved: false,
        isLoading: false,
      });
      // Reset all per-user store data so the next user signing in on the same
      // device doesn't briefly see the previous user's friends, messages, lists, etc.
      // Use lazy require to avoid circular imports.
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useFriendsStore } = require('./useFriendsStore');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useMessagingStore } = require('./useMessagingStore');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { usePlacesStore } = require('./usePlacesStore');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useListsStore } = require('./useListsStore');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useGuidesStore } = require('./useGuidesStore');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useAdminNotificationStore } = require('./useAdminNotificationStore');

        useFriendsStore.setState({ friends: [], requests: [], sentRequests: [] });
        useMessagingStore.setState({ conversations: [], messages: {}, unreadCount: 0 });
        usePlacesStore.setState({
          userPlaces: [],
          beenPlaceIds: [],
          pickedUsers: [],
          featuredPicks: [],
        });
        useListsStore.setState({ lists: [] });
        useGuidesStore.setState({ guides: [] });
        useAdminNotificationStore.setState?.({});
      } catch (resetError) {
        // Don't fail the sign-out if a reset fails; just log it
        console.warn('[signOut] failed to reset stores:', resetError);
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  updateProfile: async (data) => {
    const { user, profile } = get();
    if (!user || !profile) return;

    try {
      await updateDocument('users', user.uid, data);
      const updated = { ...profile, ...data };
      set({
        profile: updated,
        isApproved: computeApproved(updated),
      });

      // Fan out identity changes to the denormalized copies (friends lists,
      // pending requests, conversations, places). Fire-and-forget — the
      // profile save shouldn't block on this.
      if (
        data.displayName !== undefined ||
        data.photoURL !== undefined ||
        data.username !== undefined
      ) {
        syncIdentityFanOut(user.uid, updated).catch((e) =>
          console.warn('[updateProfile] identity fan-out failed', e),
        );
      }
    } catch (error) {
      throw error;
    }
  },

  approveUser: async (uid) => {
    await updateDocument('users', uid, { status: 'approved' });
  },

  rejectUser: async (uid) => {
    await updateDocument('users', uid, { status: 'rejected' });
  },

  banUser: async (uid) => {
    // 1. Set status to banned
    await updateDocument('users', uid, { status: 'banned' });

    // 2. Clean up user data from related collections
    const collectionsToClean = [
      { collection: 'userPlaces', field: 'userId' },
      { collection: 'placeVisits', field: 'userId' },
      { collection: 'userLists', field: 'userId' },
    ];

    for (const { collection, field } of collectionsToClean) {
      try {
        const docs = await getDocuments(collection, [where(field, '==', uid)]);
        for (const doc of docs) {
          await deleteDocument(collection, (doc as any).id);
        }
      } catch (e) {
        console.warn(`Error cleaning ${collection}:`, e);
      }
    }

    // 3. Clean friends (both directions)
    try {
      const [myFriendDocs, theirFriendDocs] = await Promise.all([
        getDocuments('friends', [where('userId', '==', uid)]),
        getDocuments('friends', [where('uid', '==', uid)]),
      ]);
      for (const doc of [...myFriendDocs, ...theirFriendDocs]) {
        await deleteDocument('friends', (doc as any).id);
      }
    } catch (e) {
      console.warn('Error cleaning friends:', e);
    }

    // 4. Clean friend requests (both directions)
    try {
      const [sentReqs, recvReqs] = await Promise.all([
        getDocuments('friendRequests', [where('fromUid', '==', uid)]),
        getDocuments('friendRequests', [where('toUid', '==', uid)]),
      ]);
      for (const doc of [...sentReqs, ...recvReqs]) {
        await deleteDocument('friendRequests', (doc as any).id);
      }
    } catch (e) {
      console.warn('Error cleaning friendRequests:', e);
    }
  },

  unbanUser: async (uid) => {
    await updateDocument('users', uid, { status: 'approved' });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    try {
      const profile = await getDocument<UserProfile>('users', user.uid);
      set({ profile, isApproved: computeApproved(profile) });
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  },

  initialize: () => {
    set({ isLoading: true });

    // Admin email list — these users get isAdmin: true automatically
    const ADMIN_EMAILS = ['grotkowskaaleksandra3@gmail.com', 'mkarnow@gmail.com'];

    const unsubscribe = subscribeToAuthState(async (user) => {
      if (user) {
        try {
          const profile = await getDocument<UserProfile>('users', user.uid);

          // Auto-grant admin if email matches
          if (
            profile &&
            user.email &&
            ADMIN_EMAILS.includes(user.email.toLowerCase()) &&
            !profile.isAdmin
          ) {
            try {
              await updateDocument('users', user.uid, { isAdmin: true, status: 'approved' });
              profile.isAdmin = true;
              profile.status = 'approved';
            } catch (e) {
              console.warn('Could not set admin flag:', e);
            }
          }

          set({
            user,
            profile,
            isAuthenticated: true,
            isApproved: computeApproved(profile),
            isLoading: false,
          });
        } catch (error) {
          console.error('Error fetching user profile:', error);
          set({
            user,
            profile: null,
            isAuthenticated: true,
            isApproved: false,
            isLoading: false,
          });
        }
      } else {
        set({
          user: null,
          profile: null,
          isAuthenticated: false,
          isApproved: false,
          isLoading: false,
        });
      }
    });

    return unsubscribe;
  },
}));
