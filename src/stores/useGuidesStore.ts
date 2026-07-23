import { create } from 'zustand';
import { Guide } from '../types/guide';
import { getDocuments, createDocument, deleteDocument } from '../services/firebase/firestore';
import { useAuthStore } from './useAuthStore';
import { doc, updateDoc, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { db } from '../services/firebase/config';

interface GuidesState {
  guides: Guide[];
  isLoading: boolean;
}

interface GuidesActions {
  fetchGuides: () => Promise<void>;
  createGuide: (data: Omit<Guide, 'id' | 'createdAt' | 'updatedAt' | 'likesCount' | 'likedBy'>) => Promise<string | null>;
  deleteGuide: (guideId: string) => Promise<void>;
  toggleLike: (guideId: string) => Promise<void>;
}

export const useGuidesStore = create<GuidesState & GuidesActions>((set, get) => ({
  guides: [],
  isLoading: false,

  fetchGuides: async () => {
    set({ isLoading: true });
    try {
      const docs = await getDocuments<Guide>('guides', []);
      // Sort newest first
      docs.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      set({ guides: docs, isLoading: false });
    } catch (error) {
      console.error('Error fetching guides:', error);
      set({ isLoading: false });
    }
  },

  createGuide: async (data) => {
    try {
      const id = await createDocument('guides', {
        ...data,
        likesCount: 0,
        likedBy: [],
      });
      await get().fetchGuides();
      return id;
    } catch (error) {
      console.error('Error creating guide:', error);
      return null;
    }
  },

  deleteGuide: async (guideId) => {
    try {
      await deleteDocument('guides', guideId);
      set((state) => ({
        guides: state.guides.filter((g) => g.id !== guideId),
      }));
    } catch (error) {
      console.error('Error deleting guide:', error);
    }
  },

  toggleLike: async (guideId) => {
    const userId = useAuthStore.getState().user?.uid;
    if (!userId) return;

    const guide = get().guides.find((g) => g.id === guideId);
    if (!guide) return;

    const isLiked = guide.likedBy?.includes(userId);

    // Optimistic update
    set((state) => ({
      guides: state.guides.map((g) =>
        g.id === guideId
          ? {
              ...g,
              likedBy: isLiked
                ? g.likedBy.filter((id) => id !== userId)
                : [...(g.likedBy || []), userId],
              likesCount: isLiked ? g.likesCount - 1 : g.likesCount + 1,
            }
          : g,
      ),
    }));

    try {
      const ref = doc(db, 'guides', guideId);
      if (isLiked) {
        await updateDoc(ref, {
          likedBy: arrayRemove(userId),
          likesCount: increment(-1),
        });
      } else {
        await updateDoc(ref, {
          likedBy: arrayUnion(userId),
          likesCount: increment(1),
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      await get().fetchGuides();
    }
  },
}));
