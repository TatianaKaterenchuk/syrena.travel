import { create } from 'zustand';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { UserList } from '../types';
import { getDocuments, createDocument, updateDocument, deleteDocument, where } from '../services/firebase/firestore';
import { useAuthStore } from './useAuthStore';

interface ListsState {
  lists: UserList[];
  isLoading: boolean;
}

interface ListsActions {
  fetchLists: () => Promise<void>;
  createList: (name: string, description?: string) => Promise<string | null>;
  updateList: (listId: string, changes: Partial<Pick<UserList, 'name' | 'description' | 'coverImageURL'>>) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  addPlaceToList: (listId: string, placeId: string) => Promise<void>;
  removePlaceFromList: (listId: string, placeId: string) => Promise<void>;
}

export const useListsStore = create<ListsState & ListsActions>((set, get) => ({
  lists: [],
  isLoading: false,

  fetchLists: async () => {
    const userId = useAuthStore.getState().user?.uid;
    if (!userId) {
      set({ lists: [] });
      return;
    }
    set({ isLoading: true });
    try {
      const docs = await getDocuments<UserList>('userLists', [
        where('userId', '==', userId),
      ]);
      set({ lists: docs, isLoading: false });
    } catch (error) {
      console.error('Error fetching lists:', error);
      set({ isLoading: false });
    }
  },

  createList: async (name, description = '') => {
    const userId = useAuthStore.getState().user?.uid;
    if (!userId) return null;
    try {
      const id = await createDocument('userLists', {
        userId,
        name,
        description,
        coverImageURL: '',
        placeIds: [],
      });
      // Refresh lists
      await get().fetchLists();
      return id;
    } catch (error) {
      console.error('Error creating list:', error);
      return null;
    }
  },

  updateList: async (listId, changes) => {
    try {
      await updateDocument('userLists', listId, changes);
      set((state) => ({
        lists: state.lists.map((l) =>
          l.id === listId ? { ...l, ...changes } : l
        ),
      }));
    } catch (error) {
      console.error('Error updating list:', error);
    }
  },

  deleteList: async (listId) => {
    try {
      await deleteDocument('userLists', listId);
      set((state) => ({
        lists: state.lists.filter((l) => l.id !== listId),
      }));
    } catch (error) {
      console.error('Error deleting list:', error);
    }
  },

  addPlaceToList: async (listId, placeId) => {
    if (!listId || !placeId) return;
    // Optimistic update
    set((state) => ({
      lists: state.lists.map((l) =>
        l.id === listId && !l.placeIds.includes(placeId)
          ? { ...l, placeIds: [...l.placeIds, placeId] }
          : l
      ),
    }));
    try {
      const ref = doc(db, 'userLists', listId);
      await updateDoc(ref, { placeIds: arrayUnion(placeId) });
    } catch (error) {
      console.error('Error adding place to list:', error);
      // Revert
      set((state) => ({
        lists: state.lists.map((l) =>
          l.id === listId
            ? { ...l, placeIds: l.placeIds.filter((id) => id !== placeId) }
            : l
        ),
      }));
    }
  },

  removePlaceFromList: async (listId, placeId) => {
    if (!listId || !placeId) return;
    const { lists } = get();
    const original = lists.find((l) => l.id === listId);
    // Optimistic update
    set((state) => ({
      lists: state.lists.map((l) =>
        l.id === listId
          ? { ...l, placeIds: l.placeIds.filter((id) => id !== placeId) }
          : l
      ),
    }));
    try {
      const ref = doc(db, 'userLists', listId);
      await updateDoc(ref, { placeIds: arrayRemove(placeId) });
    } catch (error) {
      console.error('Error removing place from list:', error);
      // Revert
      if (original) {
        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === listId ? original : l
          ),
        }));
      }
    }
  },
}));
