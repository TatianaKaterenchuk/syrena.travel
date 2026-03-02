import { create } from 'zustand';
import { Place, UserPlace, FeaturedPerson, PlaceEditableFields, EditSuggestion } from '../types';
import { sendPushToAdmins } from '../services/notifications';
import {
  getDocument,
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  where,
  orderBy,
  limit,
} from '../services/firebase/firestore';
import { useAuthStore } from './useAuthStore';

// ---------------------------------------------------------------------------
// Store types
// ---------------------------------------------------------------------------

interface PlacesState {
  places: Place[];
  userPlaces: UserPlace[];
  friendsPlaces: UserPlace[];
  friendsPicks: Place[];
  recentDiscoveries: Place[];
  featuredPerson: FeaturedPerson | null;
  featuredPicks: Place[];
  isLoading: boolean;
}

interface PlacesActions {
  fetchPlaces: () => Promise<void>;
  fetchUserPlaces: () => Promise<void>;
  fetchFriendsPicks: () => Promise<void>;
  fetchFriendsPlaces: (friendUids: string[]) => Promise<void>;
  fetchFeaturedPerson: () => Promise<void>;
  setFeaturedPerson: (person: Omit<FeaturedPerson, 'id'>) => Promise<void>;
  fetchFeaturedPicks: () => Promise<void>;
  updateFeaturedPersonPicks: (picks: string[]) => Promise<void>;
  addPlace: (place: Place) => Promise<string | null>;
  savePlace: (userPlace: UserPlace) => Promise<void>;
  removePlace: (placeId: string) => Promise<void>;
  toggleFavorite: (userPlaceId: string) => Promise<void>;
  toggleGoldStar: (userPlaceId: string) => Promise<void>;
  searchPlaces: (query: string) => Place[];
  getPopularTags: (limit?: number) => string[];
  searchPlacesWithMatchedTags: (query: string) => Array<Place & { matchedTags: string[] }>;
  updatePlace: (placeId: string, changes: PlaceEditableFields) => Promise<void>;
  submitEditSuggestion: (suggestion: Omit<EditSuggestion, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  fetchPendingEditSuggestions: () => Promise<EditSuggestion[]>;
  approveEditSuggestion: (suggestion: EditSuggestion) => Promise<void>;
  rejectEditSuggestion: (suggestionId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const usePlacesStore = create<PlacesState & PlacesActions>((set, get) => ({
  // State
  places: [],
  userPlaces: [],
  friendsPlaces: [],
  friendsPicks: [],
  recentDiscoveries: [],
  featuredPerson: null,
  featuredPicks: [],
  isLoading: false,

  // Actions

  fetchPlaces: async () => {
    set({ isLoading: true });
    try {
      const places = await getDocuments<Place>('places', [
        orderBy('createdAt', 'desc'),
        limit(50),
      ]);

      set({
        places,
        recentDiscoveries: places.slice(0, 5),
        isLoading: false,
      });
      // Re-derive featured picks now that places are loaded
      get().fetchFeaturedPicks();
    } catch (error) {
      console.error('Error fetching places:', error);
      set({ places: [], recentDiscoveries: [], isLoading: false });
    }
  },

  fetchUserPlaces: async () => {
    set({ isLoading: true });
    try {
      const userId = useAuthStore.getState().user?.uid;
      if (!userId) {
        set({ userPlaces: [], isLoading: false });
        return;
      }

      const userPlaces = await getDocuments<UserPlace>('userPlaces', [
        where('userId', '==', userId),
      ]);

      set({ userPlaces, isLoading: false });
    } catch (error) {
      console.error('Error fetching user places:', error);
      set({ userPlaces: [], isLoading: false });
    }
  },

  fetchFriendsPicks: async () => {
    set({ isLoading: true });
    try {
      const friendsPicks = await getDocuments<Place>('places', [
        orderBy('savesCount', 'desc'),
        limit(10),
      ]);

      set({ friendsPicks, isLoading: false });
    } catch (error) {
      console.error('Error fetching friends picks:', error);
      set({ friendsPicks: [], isLoading: false });
    }
  },

  fetchFriendsPlaces: async (friendUids: string[]) => {
    if (friendUids.length === 0) {
      set({ friendsPlaces: [] });
      return;
    }

    try {
      // Fetch saved places for each friend in parallel
      const results = await Promise.all(
        friendUids.map((uid) =>
          getDocuments<UserPlace>('userPlaces', [where('userId', '==', uid)])
        )
      );

      // Flatten and deduplicate by placeId (show each place once)
      const allPlaces = results.flat();
      const seen = new Set<string>();
      const friendsPlaces = allPlaces.filter((up) => {
        if (seen.has(up.placeId)) return false;
        seen.add(up.placeId);
        return true;
      });

      set({ friendsPlaces });
    } catch (error) {
      console.error('Error fetching friends places:', error);
      set({ friendsPlaces: [] });
    }
  },

  fetchFeaturedPerson: async () => {
    try {
      const docs = await getDocuments<FeaturedPerson>('featuredPerson', [
        orderBy('featuredAt', 'desc'),
        limit(1),
      ]);
      const person = docs.length > 0 ? docs[0] : null;
      set({ featuredPerson: person });
      // Derive resolved picks
      get().fetchFeaturedPicks();
    } catch (error) {
      console.error('Error fetching featured person:', error);
      set({ featuredPerson: null, featuredPicks: [] });
    }
  },

  setFeaturedPerson: async (person) => {
    try {
      const { id: _id, ...data } = person as any;
      await createDocument('featuredPerson', data);
      await get().fetchFeaturedPerson();
    } catch (error) {
      console.error('Error setting featured person:', error);
    }
  },

  fetchFeaturedPicks: async () => {
    const { featuredPerson, places } = get();
    if (!featuredPerson?.picks || featuredPerson.picks.length === 0) {
      set({ featuredPicks: [] });
      return;
    }

    // Resolve picks from local places, preserving order
    const pickIds = featuredPerson.picks;
    const localMap = new Map(places.map((p) => [p.id, p]));

    const resolved: Place[] = [];
    const missing: string[] = [];

    for (const id of pickIds) {
      const local = localMap.get(id);
      if (local) {
        resolved.push(local);
      } else {
        missing.push(id);
      }
    }

    // Fetch any missing places individually
    if (missing.length > 0) {
      const fetched = await Promise.all(
        missing.map((id) => getDocument<Place>('places', id))
      );
      for (const p of fetched) {
        if (p) resolved.push(p);
      }
      // Re-sort to match original pick order
      resolved.sort(
        (a, b) => pickIds.indexOf(a.id) - pickIds.indexOf(b.id)
      );
    }

    set({ featuredPicks: resolved });
  },

  updateFeaturedPersonPicks: async (picks: string[]) => {
    const { featuredPerson } = get();
    if (!featuredPerson) return;
    try {
      await updateDocument('featuredPerson', featuredPerson.id, { picks });
      set({ featuredPerson: { ...featuredPerson, picks } });
      get().fetchFeaturedPicks();
    } catch (error) {
      console.error('Error updating featured person picks:', error);
    }
  },

  addPlace: async (place) => {
    try {
      // Strip the client-side `id` before sending to Firestore (it generates its own)
      const { id: _id, ...data } = place;
      const docId = await createDocument('places', data);
      // Refresh the places list so the new place shows up
      await get().fetchPlaces();
      return docId;
    } catch (error) {
      console.error('Error adding place:', error);
      // Optimistic local fallback
      set((state) => ({
        places: [place, ...state.places],
      }));
      return null;
    }
  },

  savePlace: async (userPlace) => {
    try {
      const { id: _id, ...data } = userPlace;
      await createDocument('userPlaces', data);
      // Refresh so saved list stays in sync
      await get().fetchUserPlaces();
    } catch (error) {
      console.error('Error saving place:', error);
      // Optimistic local fallback
      set((state) => ({
        userPlaces: [userPlace, ...state.userPlaces],
      }));
    }
  },

  removePlace: async (placeId) => {
    try {
      const userId = useAuthStore.getState().user?.uid;
      if (!userId) {
        set((state) => ({
          userPlaces: state.userPlaces.filter((up) => up.placeId !== placeId),
        }));
        return;
      }

      // Find the userPlace document that matches this placeId for the current user
      const matches = await getDocuments<UserPlace>('userPlaces', [
        where('userId', '==', userId),
        where('placeId', '==', placeId),
      ]);

      if (matches.length > 0) {
        await deleteDocument('userPlaces', matches[0].id);
      }

      // Refresh to stay in sync
      await get().fetchUserPlaces();
    } catch (error) {
      console.error('Error removing place:', error);
      set((state) => ({
        userPlaces: state.userPlaces.filter((up) => up.placeId !== placeId),
      }));
    }
  },

  toggleFavorite: async (userPlaceId: string) => {
    const { userPlaces } = get();
    const item = userPlaces.find((up) => up.id === userPlaceId);
    if (!item) return;

    const newVal = !item.isFavorite;

    // Optimistic local update
    set((state) => ({
      userPlaces: state.userPlaces.map((up) =>
        up.id === userPlaceId ? { ...up, isFavorite: newVal } : up
      ),
    }));

    try {
      await updateDocument('userPlaces', userPlaceId, { isFavorite: newVal });
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Revert on failure
      set((state) => ({
        userPlaces: state.userPlaces.map((up) =>
          up.id === userPlaceId ? { ...up, isFavorite: !newVal } : up
        ),
      }));
    }
  },

  toggleGoldStar: async (userPlaceId: string) => {
    const { userPlaces } = get();
    const item = userPlaces.find((up) => up.id === userPlaceId);
    if (!item) return;

    const newVal = !item.isGoldStar;

    // Optimistic local update
    set((state) => ({
      userPlaces: state.userPlaces.map((up) =>
        up.id === userPlaceId ? { ...up, isGoldStar: newVal } : up
      ),
    }));

    try {
      await updateDocument('userPlaces', userPlaceId, { isGoldStar: newVal });
    } catch (error) {
      console.error('Error toggling gold star:', error);
      // Revert on failure
      set((state) => ({
        userPlaces: state.userPlaces.map((up) =>
          up.id === userPlaceId ? { ...up, isGoldStar: !newVal } : up
        ),
      }));
    }
  },

  searchPlaces: (query) => {
    const { places } = get();
    const lowerQuery = query.toLowerCase();
    return places.filter(
      (place) =>
        place.name.toLowerCase().includes(lowerQuery) ||
        place.city.toLowerCase().includes(lowerQuery) ||
        place.country.toLowerCase().includes(lowerQuery) ||
        place.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
        place.category.toLowerCase().includes(lowerQuery),
    );
  },

  getPopularTags: (tagLimit = 10) => {
    const { places } = get();
    const tagCounts = new Map<string, number>();

    for (const place of places) {
      // Skip tags that duplicate already-visible info (city, country, category)
      const skipSet = new Set([
        place.city.toLowerCase(),
        place.country.toLowerCase(),
        place.category.toLowerCase(),
      ]);
      for (const tag of place.tags) {
        const lower = tag.toLowerCase();
        if (skipSet.has(lower)) continue;
        tagCounts.set(lower, (tagCounts.get(lower) || 0) + 1);
      }
    }

    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, tagLimit)
      .map(([tag]) => tag);
  },

  searchPlacesWithMatchedTags: (query) => {
    const { places } = get();
    const lowerQuery = query.toLowerCase();
    return places
      .map((place) => {
        const matchedTags = place.tags.filter((tag) =>
          tag.toLowerCase().includes(lowerQuery)
        );
        const matches =
          place.name.toLowerCase().includes(lowerQuery) ||
          place.city.toLowerCase().includes(lowerQuery) ||
          place.country.toLowerCase().includes(lowerQuery) ||
          matchedTags.length > 0 ||
          place.category.toLowerCase().includes(lowerQuery);
        return matches ? { ...place, matchedTags } : null;
      })
      .filter(Boolean) as Array<Place & { matchedTags: string[] }>;
  },

  // ---------------------------------------------------------------------------
  // Place editing
  // ---------------------------------------------------------------------------

  updatePlace: async (placeId, changes) => {
    try {
      const cleanChanges = Object.fromEntries(
        Object.entries(changes).filter(([_, v]) => v !== undefined),
      );
      await updateDocument('places', placeId, cleanChanges);
      // Optimistic local update
      set((state) => ({
        places: state.places.map((p) =>
          p.id === placeId ? { ...p, ...cleanChanges } : p,
        ),
        recentDiscoveries: state.recentDiscoveries.map((p) =>
          p.id === placeId ? { ...p, ...cleanChanges } : p,
        ),
      }));
    } catch (error) {
      console.error('Error updating place:', error);
      throw error;
    }
  },

  submitEditSuggestion: async (suggestion) => {
    try {
      const docId = await createDocument('editSuggestions', suggestion);

      // Fire-and-forget push notification to admins
      sendPushToAdmins(
        'New Edit Suggestion',
        `${suggestion.submittedByName} suggested edits for "${suggestion.placeName}".`,
        { type: 'edit_suggestion', suggestionId: docId, placeId: suggestion.placeId },
      );

      return docId;
    } catch (error) {
      console.error('Error submitting edit suggestion:', error);
      throw error;
    }
  },

  fetchPendingEditSuggestions: async () => {
    try {
      const suggestions = await getDocuments<EditSuggestion>('editSuggestions', [
        where('status', '==', 'pending'),
      ]);
      // Sort client-side to avoid needing a Firestore composite index
      suggestions.sort((a, b) => {
        const aTime = a.createdAt?.seconds ?? 0;
        const bTime = b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
      return suggestions;
    } catch (error) {
      console.error('Error fetching pending edit suggestions:', error);
      return [];
    }
  },

  approveEditSuggestion: async (suggestion) => {
    try {
      // Apply the proposed changes to the place
      await updateDocument('places', suggestion.placeId, suggestion.changes);
      // Mark suggestion as approved
      await updateDocument('editSuggestions', suggestion.id, {
        status: 'approved',
        reviewedBy: useAuthStore.getState().user?.uid || '',
      });
      // Optimistic local update for places
      set((state) => ({
        places: state.places.map((p) =>
          p.id === suggestion.placeId ? { ...p, ...suggestion.changes } : p,
        ),
        recentDiscoveries: state.recentDiscoveries.map((p) =>
          p.id === suggestion.placeId ? { ...p, ...suggestion.changes } : p,
        ),
      }));
    } catch (error) {
      console.error('Error approving edit suggestion:', error);
      throw error;
    }
  },

  rejectEditSuggestion: async (suggestionId) => {
    try {
      await updateDocument('editSuggestions', suggestionId, {
        status: 'rejected',
        reviewedBy: useAuthStore.getState().user?.uid || '',
      });
    } catch (error) {
      console.error('Error rejecting edit suggestion:', error);
      throw error;
    }
  },
}));
