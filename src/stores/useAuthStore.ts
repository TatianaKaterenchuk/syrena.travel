import { create } from 'zustand';
import { User } from 'firebase/auth';
import { UserProfile } from '../types';
import {
  signIn as firebaseSignIn,
  signUp as firebaseSignUp,
  signOut as firebaseSignOut,
  subscribeToAuthState,
} from '../services/firebase/auth';
import { getDocument, updateDocument } from '../services/firebase/firestore';

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
    set({
      user,
      isAuthenticated: !!user,
    });
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
