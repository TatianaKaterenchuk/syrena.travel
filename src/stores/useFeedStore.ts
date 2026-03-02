import { create } from 'zustand';
import { Timestamp } from 'firebase/firestore';
import { FeedItem, FeedItemType } from '../types';
import {
  getDocuments,
  createDocument,
  orderBy,
  limit,
} from '../services/firebase/firestore';

// Fallback data for new users so feed isn't empty
const SEED_FEED_ITEMS: FeedItem[] = [
  {
    id: 'feed_1',
    type: 'new_place' as FeedItemType,
    actorId: 'syrena_team',
    actorName: 'Syrena Team',
    actorPhoto: '',
    placeId: 'welcome',
    placeName: 'Welcome to Syrena Travel!',
    placeImageURL: '',
    createdAt: Timestamp.fromMillis(Date.now()),
    visibility: ['public'],
  },
];

interface FeedState {
  feedItems: FeedItem[];
  isLoading: boolean;
}

interface FeedActions {
  fetchFeed: () => Promise<void>;
  addFeedItem: (item: Omit<FeedItem, 'id'>) => Promise<void>;
}

export const useFeedStore = create<FeedState & FeedActions>((set) => ({
  feedItems: [],
  isLoading: false,

  fetchFeed: async () => {
    set({ isLoading: true });
    try {
      const items = await getDocuments<FeedItem>('feed', [
        orderBy('createdAt', 'desc'),
        limit(50),
      ]);
      set({
        feedItems: items.length > 0 ? items : SEED_FEED_ITEMS,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error fetching feed:', error);
      set({ feedItems: SEED_FEED_ITEMS, isLoading: false });
    }
  },

  addFeedItem: async (item) => {
    try {
      const id = await createDocument('feed', item);
      set((state) => ({
        feedItems: [{ ...item, id } as FeedItem, ...state.feedItems],
      }));
    } catch (error) {
      console.error('Error adding feed item:', error);
    }
  },
}));
