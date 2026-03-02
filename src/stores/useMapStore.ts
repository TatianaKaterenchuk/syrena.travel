import { create } from 'zustand';
import { PlaceCategory, BudgetTier } from '../types';

// Region type inlined to avoid importing react-native-maps on web
interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const ALL_CATEGORIES: PlaceCategory[] = [
  'restaurant',
  'hotel',
  'bar',
  'cafe',
  'nature',
  'culture',
  'shopping',
  'nightlife',
];

const ALL_BUDGET_TIERS: BudgetTier[] = [1, 2, 3, 4];

const DEFAULT_REGION: Region = {
  latitude: 52.2297,
  longitude: 21.0122,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

interface MapState {
  region: Region;
  activeFilters: PlaceCategory[];
  activeBudgetFilters: BudgetTier[];
  selectedPlaceId: string | null;
  isFilterModalVisible: boolean;
}

interface MapActions {
  setRegion: (region: Region) => void;
  toggleFilter: (category: PlaceCategory) => void;
  setAllFilters: () => void;
  clearFilters: () => void;
  toggleBudgetFilter: (tier: BudgetTier) => void;
  setAllBudgetFilters: () => void;
  clearBudgetFilters: () => void;
  selectPlace: (placeId: string | null) => void;
  toggleFilterModal: () => void;
}

export const useMapStore = create<MapState & MapActions>((set, get) => ({
  // State
  region: DEFAULT_REGION,
  activeFilters: [...ALL_CATEGORIES],
  activeBudgetFilters: [...ALL_BUDGET_TIERS],
  selectedPlaceId: null,
  isFilterModalVisible: false,

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

  selectPlace: (placeId) => {
    set({ selectedPlaceId: placeId });
  },

  toggleFilterModal: () => {
    set((state) => ({
      isFilterModalVisible: !state.isFilterModalVisible,
    }));
  },
}));
