import { create } from 'zustand';
import { subscribeToDocuments, where } from '../services/firebase/firestore';
import type { Unsubscribe } from '../services/firebase/firestore';
import { UserProfile } from '../types';

interface AdminNotificationState {
  pendingUsersCount: number;
  pendingEditsCount: number;
  totalPendingCount: number;
}

interface AdminNotificationActions {
  subscribe: () => () => void;
  reset: () => void;
}

export const useAdminNotificationStore = create<
  AdminNotificationState & AdminNotificationActions
>((set) => ({
  pendingUsersCount: 0,
  pendingEditsCount: 0,
  totalPendingCount: 0,

  subscribe: () => {
    const onErr = (error: Error) => console.error('[adminNotifications] listener error:', error);

    const unsubUsers = subscribeToDocuments<UserProfile>(
      'users',
      [where('status', '==', 'pending')],
      (docs) => {
        set((state) => ({
          pendingUsersCount: docs.length,
          totalPendingCount: docs.length + state.pendingEditsCount,
        }));
      },
      onErr,
    );

    const unsubEdits = subscribeToDocuments(
      'editSuggestions',
      [where('status', '==', 'pending')],
      (docs) => {
        set((state) => ({
          pendingEditsCount: docs.length,
          totalPendingCount: state.pendingUsersCount + docs.length,
        }));
      },
      onErr,
    );

    return () => {
      unsubUsers();
      unsubEdits();
    };
  },

  reset: () => {
    set({
      pendingUsersCount: 0,
      pendingEditsCount: 0,
      totalPendingCount: 0,
    });
  },
}));
