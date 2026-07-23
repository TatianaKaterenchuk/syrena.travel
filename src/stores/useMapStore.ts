import { create } from 'zustand';
import { PlaceCategory, BudgetTier, StarRating, UserPlace } from '../types';
import { getDocuments, where } from '../services/firebase/firestore';

// Region type inlined to avoid importing react-native-maps on web
interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const ALL_CATEGORIES: PlaceCategory[] = [
  'restaurant',
  'lodging',
  'bar',
  'cafe',
  'club',
  'culture',
  'nature',
  'shop',
  'services',
];

const ALL_BUDGET_TIERS: BudgetTier[] = [1, 2, 3, 4];
const ALL_STAR_RATINGS: StarRating[] = [1, 2, 3];

const DEFAULT_REGION: Region = {
  latitude: 52.2297,
  longitude: 21.0122,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export type FriendFilterMode = 'all' | 'favorites';

interface MapState {
  region: Region;
  activeFilters: PlaceCategory[];
  activeBudgetFilters: BudgetTier[];
  activeStarFilters: StarRating[];
  selectedPlaceId: string | null;
  isFilterModalVisible: boolean;
  selectedFriendId: string | null;
  friendFilterMode: FriendFilterMode;
  friendPlaceIds: string[];
}

interface MapActions {
  setRegion: (region: Region) => void;
  toggleFilter: (category: PlaceCategory) => void;
  setAllFilters: () => void;
  clearFilters: () => void;
  toggleBudgetFilter: (tier: BudgetTier) => void;
  setAllBudgetFilters: () => void;
  clearBudgetFilters: () => void;
  toggleStarFilter: (star: StarRating) => void;
  setAllStarFilters: () => void;
  clearStarFilters: () => void;
  selectPlace: (placeId: string | null) => void;
  toggleFilterModal: () => void;
  setFriendFilter: (friendUid: string, mode?: FriendFilterMode) => Promise<void>;
  clearFriendFilter: () => void;
}

export const useMapStore = create<MapState & MapActions>((set, get) => ({
  // State
  region: DEFAULT_REGION,
  activeFilters: [...ALL_CATEGORIES],
  activeBudgetFilters: [...ALL_BUDGET_TIERS],
  activeStarFilters: [...ALL_STAR_RATINGS],
  selectedPlaceId: null,
  isFilterModalVisible: false,
  selectedFriendId: null,
  friendFilterMode: 'all',
  friendPlaceIds: [],

  // Actions
  setRegion: (region) => {
    set({ region });
  },

  toggleFilter: (category) => {
    const { activeFilters } = get();
    const isActive = activeFilters.includes(category);

    if (isActive) {
      set({
        activeFilters: activeFilters.filter((f) => f !== category),
      });
    } else {
      set({
        activeFilters: [...activeFilters, category],
      });
    }
  },

  setAllFilters: () => {
    set({ activeFilters: [...ALL_CATEGORIES] });
  },

  clearFilters: () => {
    set({ activeFilters: [] });
  },

  toggleBudgetFilter: (tier) => {
    const { activeBudgetFilters } = get();
    const isActive = activeBudgetFilters.includes(tier);

    if (isActive) {
      set({
        activeBudgetFilters: activeBudgetFilters.filter((t) => t !== tier),
      });
    } else {
      set({
        activeBudgetFilters: [...activeBudgetFilters, tier],
      });
    }
  },

  setAllBudgetFilters: () => {
    set({ activeBudgetFilters: [...ALL_BUDGET_TIERS] });
  },

  clearBudgetFilters: () => {
    set({ activeBudgetFilters: [] });
  },

  toggleStarFilter: (star) => {
    const { activeStarFilters } = get();
    const isActive = activeStarFilters.includes(star);
    if (isActive) {
      set({ activeStarFilters: activeStarFilters.filter((s) => s !== star) });
    } else {
      set({ activeStarFilters: [...activeStarFilters, star] });
    }
  },

  setAllStarFilters: () => {
    set({ activeStarFilters: [...ALL_STAR_RATINGS] });
  },

  clearStarFilters: () => {
    set({ activeStarFilters: [] });
  },

  selectPlace: (placeId) => {
    set({ selectedPlaceId: placeId });
  },

  toggleFilterModal: () => {
    set((state) => ({
      isFilterModalVisible: !state.isFilterModalVisible,
    }));
  },

  setFriendFilter: async (friendUid: string, mode: FriendFilterMode = 'all') => {
    set({ selectedFriendId: friendUid, friendFilterMode: mode, friendPlaceIds: [] });
    try {
      const constraints = [where('userId', '==', friendUid)];
      if (mode === 'favorites') {
        constraints.push(where('isFavorite', '==', true));
      }
      const userPlaces = await getDocuments<UserPlace>('userPlaces', constraints);
      set({ friendPlaceIds: userPlaces.map((up) => up.placeId) });
    } catch (error) {
      console.error('Error fetching friend places:', error);
      set({ selectedFriendId: null, friendPlaceIds: [] });
    }
  },

  clearFriendFilter: () => {
    set({ selectedFriendId: null, friendFilterMode: 'all', friendPlaceIds: [] });
  },
}));
