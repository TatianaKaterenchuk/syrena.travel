import { create } from 'zustand';
import { Place, UserPlace, UserProfile, FeaturedPerson, PickedUser, PickedUserWithPlaces, PlaceEditableFields, EditSuggestion, DeletionRequest } from '../types';
import { Timestamp } from 'firebase/firestore';
import { sendPushToAdmins, sendPushToFriends } from '../services/notifications';
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
// Helpers
// ---------------------------------------------------------------------------

/** Return the great-circle distance in km between two lat/lng points. */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  pickedUsers: PickedUserWithPlaces[];
  beenPlaceIds: string[];
  isLoading: boolean;
  // Infinite scroll: whether more places exist past the last fetched page,
  // and whether a next-page fetch is currently in flight.
  hasMorePlaces: boolean;
  isLoadingMore: boolean;
  // placeId → friends who've marked it visited. Powers the avatar stacks
  // on Explore cards (social proof at browse time, not just on detail).
  friendsVisits: Record<string, { uid: string; displayName: string; photoURL: string }[]>;
}

interface PlacesActions {
  fetchPlaces: (force?: boolean) => Promise<void>;
  fetchMorePlaces: () => Promise<void>;
  fetchUserPlaces: (force?: boolean) => Promise<void>;
  fetchFriendsPicks: () => Promise<void>;
  fetchFriendsPlaces: (friendUids: string[]) => Promise<void>;
  fetchFeaturedPerson: () => Promise<void>;
  setFeaturedPerson: (person: Omit<FeaturedPerson, 'id'>) => Promise<void>;
  fetchFeaturedPicks: () => Promise<void>;
  updateFeaturedPersonPicks: (picks: string[]) => Promise<void>;
  fetchPickedUsers: () => Promise<void>;
  addPickedUser: (user: Omit<PickedUser, 'id'>) => Promise<void>;
  removePickedUser: (id: string) => Promise<void>;
  addPlace: (place: Place) => Promise<string | null>;
  savePlace: (userPlace: UserPlace) => Promise<void>;
  removePlace: (placeId: string) => Promise<void>;
  toggleFavorite: (userPlaceId: string) => Promise<void>;
  toggleGoldStar: (userPlaceId: string) => Promise<void>;
  updatePersonalNote: (userPlaceId: string, note: string) => Promise<void>;
  fetchFriendsVisits: () => Promise<void>;
  searchPlaces: (query: string) => Place[];
  getPopularTags: (limit?: number) => string[];
  searchPlacesWithMatchedTags: (query: string, lat?: number, lng?: number) => Array<Place & { matchedTags: string[] }>;
  updatePlace: (placeId: string, changes: PlaceEditableFields) => Promise<void>;
  submitEditSuggestion: (suggestion: Omit<EditSuggestion, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  fetchPendingEditSuggestions: () => Promise<EditSuggestion[]>;
  approveEditSuggestion: (suggestion: EditSuggestion) => Promise<void>;
  rejectEditSuggestion: (suggestionId: string) => Promise<void>;
  requestDeletion: (placeId: string, placeName: string, reason: string) => Promise<void>;
  fetchPendingDeletionRequests: () => Promise<DeletionRequest[]>;
  approveDeletion: (request: DeletionRequest) => Promise<void>;
  rejectDeletion: (requestId: string) => Promise<void>;
  fetchBeenPlaces: () => Promise<void>;
  toggleBeen: (placeId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

// TTL cache for collection fetches — screens refetch on focus, so without
// this every tab switch cost a full Firestore round trip + re-render.
const FETCH_TTL_MS = 60_000;
const lastFetch = { places: 0, userPlaces: 0, beenPlaces: 0, friendsVisits: 0 };

// Page size + cursor for the Explore infinite scroll. The cursor is the raw
// Firestore snapshot of the last doc on the current page (needed for
// startAfter); kept module-level because it isn't serializable state.
const PLACES_PAGE_SIZE = 30;
let placesCursor: import('firebase/firestore').QueryDocumentSnapshot | null = null;

export const usePlacesStore = create<PlacesState & PlacesActions>((set, get) => ({
  // State
  places: [],
  userPlaces: [],
  friendsPlaces: [],
  friendsPicks: [],
  recentDiscoveries: [],
  featuredPerson: null,
  featuredPicks: [],
  pickedUsers: [],
  beenPlaceIds: [],
  isLoading: false,
  hasMorePlaces: true,
  isLoadingMore: false,
  friendsVisits: {},

  // Actions

  fetchFriendsVisits: async () => {
    // One pass per session (TTL) — a query per friend, all in parallel.
    if (Date.now() - lastFetch.friendsVisits < FETCH_TTL_MS * 5) return;
    lastFetch.friendsVisits = Date.now();
    try {
      const { useFriendsStore } = await import('./useFriendsStore');
      const friends = useFriendsStore
        .getState()
        .friends.filter((f: any) => f.status === 'accepted')
        .slice(0, 25); // sanity cap on parallel queries
      if (friends.length === 0) return;

      const results = await Promise.all(
        friends.map((f: any) =>
          getDocuments<{ placeId: string }>('placeVisits', [
            where('userId', '==', f.uid),
          ])
            .then((visits) => ({ friend: f, visits }))
            .catch(() => ({ friend: f, visits: [] as { placeId: string }[] })),
        ),
      );

      const map: Record<string, { uid: string; displayName: string; photoURL: string }[]> = {};
      for (const { friend, visits } of results) {
        for (const v of visits) {
          if (!map[v.placeId]) map[v.placeId] = [];
          map[v.placeId].push({
            uid: friend.uid,
            displayName: friend.displayName,
            photoURL: friend.photoURL || '',
          });
        }
      }
      set({ friendsVisits: map });
    } catch (error) {
      console.error('Error fetching friends visits:', error);
    }
  },

  fetchPlaces: async (force = false) => {
    // Staleness guard: screens re-call this on every focus. Without a TTL
    // each tab switch re-downloaded the whole collection and re-rendered
    // everything. Pull-to-refresh and writes pass force=true.
    if (
      !force &&
      get().places.length > 0 &&
      Date.now() - lastFetch.places < FETCH_TTL_MS
    ) {
      return;
    }
    set({ isLoading: true });
    try {
      // Query via the raw SDK so we can hold on to the last doc snapshot as
      // the cursor for fetchMorePlaces (infinite scroll on Explore).
      const { getDocs, query: fsQuery, collection: fsCollection } = await import('firebase/firestore');
      const { db } = await import('../services/firebase/config');
      const snap = await getDocs(
        fsQuery(
          fsCollection(db, 'places'),
          orderBy('createdAt', 'desc'),
          limit(PLACES_PAGE_SIZE),
        ),
      );
      const places = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Place[];
      placesCursor = snap.docs[snap.docs.length - 1] ?? null;
      lastFetch.places = Date.now();

      set({
        places,
        recentDiscoveries: places.slice(0, 5),
        isLoading: false,
        hasMorePlaces: snap.docs.length === PLACES_PAGE_SIZE,
      });
      // Re-derive featured picks now that places are loaded
      get().fetchFeaturedPicks();
    } catch (error) {
      console.error('Error fetching places:', error);
      set({ places: [], recentDiscoveries: [], isLoading: false });
    }
  },

  fetchMorePlaces: async () => {
    const { hasMorePlaces, isLoadingMore, places } = get();
    if (!hasMorePlaces || isLoadingMore || !placesCursor) return;
    set({ isLoadingMore: true });
    try {
      const { getDocs, query: fsQuery, collection: fsCollection, startAfter } = await import('firebase/firestore');
      const { db } = await import('../services/firebase/config');
      const snap = await getDocs(
        fsQuery(
          fsCollection(db, 'places'),
          orderBy('createdAt', 'desc'),
          startAfter(placesCursor),
          limit(PLACES_PAGE_SIZE),
        ),
      );
      const next = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Place[];
      placesCursor = snap.docs[snap.docs.length - 1] ?? placesCursor;

      // Dedupe against what's already loaded (optimistic inserts, overlap)
      const seen = new Set(places.map((p) => p.id));
      const fresh = next.filter((p) => !seen.has(p.id));

      set({
        places: [...places, ...fresh],
        hasMorePlaces: snap.docs.length === PLACES_PAGE_SIZE,
        isLoadingMore: false,
      });
    } catch (error) {
      console.error('Error fetching more places:', error);
      set({ isLoadingMore: false });
    }
  },

  fetchUserPlaces: async (force = false) => {
    if (
      !force &&
      get().userPlaces.length > 0 &&
      Date.now() - lastFetch.userPlaces < FETCH_TTL_MS
    ) {
      return;
    }
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
      lastFetch.userPlaces = Date.now();

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
      // Auto-rotate: pick a different user each day
      const allUsers = await getDocuments<UserProfile>('users', []);
      // Ensure each user has a uid (may be stored as doc id)
      const usersWithUid = allUsers.map((u) => ({
        ...u,
        uid: u.uid || (u as any).id,
      }));
      const approved = usersWithUid.filter(
        (u) => u.uid && (!u.status || u.status === 'approved'),
      );
      if (approved.length === 0) {
        set({ featuredPerson: null, featuredPicks: [] });
        return;
      }

      // Deterministic daily rotation using day-of-year
      const now = new Date();
      const dayOfYear = Math.floor(
        (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24),
      );
      const sorted = [...approved].sort((a, b) => a.uid.localeCompare(b.uid));
      const picked = sorted[dayOfYear % sorted.length];

      // Build a FeaturedPerson-shaped object from the user profile
      const featured: FeaturedPerson = {
        id: picked.uid,
        uid: picked.uid,
        displayName: picked.displayName,
        username: picked.username,
        photoURL: picked.photoURL,
        bio: picked.bio || '',
        featuredAt: Timestamp.now(),
        featuredUntil: Timestamp.now(),
        chosenBy: 'auto',
        headline: '',
        picks: [],
      };

      // Fetch only their favorites (picks) — max 10
      const userPlaceDocs = await getDocuments<UserPlace>('userPlaces', [
        where('userId', '==', picked.uid),
      ]);
      const favorites = userPlaceDocs.filter((up) => up.isFavorite);
      featured.picks = favorites.slice(0, 10).map((up) => up.placeId);

      set({ featuredPerson: featured });
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
    if (!featuredPerson) {
      set({ featuredPicks: [] });
      return;
    }

    // If manual picks exist, use those
    if (featuredPerson.picks && featuredPerson.picks.length > 0) {
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
      return;
    }

    // Fallback: show places created by the featured person
    const createdByFeatured = places.filter(
      (p) => p.createdBy === featuredPerson.uid
    );
    // Sort by newest first, limit to 10
    createdByFeatured.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    set({ featuredPicks: createdByFeatured.slice(0, 10) });
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

  // ── Picked Users ──

  fetchPickedUsers: async () => {
    try {
      const docs = await getDocuments<PickedUser>('pickedUsers', [
        orderBy('pickedAt', 'desc'),
      ]);

      // For each picked user, fetch their top 5 favorites
      const results: PickedUserWithPlaces[] = await Promise.all(
        docs.map(async (pu) => {
          try {
            const userPlaces = await getDocuments<UserPlace>('userPlaces', [
              where('userId', '==', pu.uid),
              where('isFavorite', '==', true),
            ]);
            // Sort by savedAt descending, take top 5
            userPlaces.sort((a, b) => {
              const aTime = a.savedAt?.seconds ?? 0;
              const bTime = b.savedAt?.seconds ?? 0;
              return bTime - aTime;
            });
            return { user: pu, topPlaces: userPlaces.slice(0, 5) };
          } catch {
            return { user: pu, topPlaces: [] };
          }
        }),
      );

      set({ pickedUsers: results });
    } catch (error) {
      console.error('Error fetching picked users:', error);
      set({ pickedUsers: [] });
    }
  },

  addPickedUser: async (user) => {
    try {
      await createDocument('pickedUsers', user);
      await get().fetchPickedUsers();
    } catch (error) {
      console.error('Error adding picked user:', error);
    }
  },

  removePickedUser: async (id: string) => {
    try {
      await deleteDocument('pickedUsers', id);
      set({ pickedUsers: get().pickedUsers.filter((pu) => pu.user.id !== id) });
    } catch (error) {
      console.error('Error removing picked user:', error);
    }
  },

  addPlace: async (place) => {
    try {
      // Strip the client-side `id` before sending to Firestore (it generates its own)
      const { id: _id, ...data } = place;
      const docId = await createDocument('places', data);
      // Show the new place immediately; refresh the full list in the
      // background. Awaiting a full re-fetch of every place here made
      // saving feel painfully slow.
      set((state) => ({
        places: [{ ...place, id: docId || place.id }, ...state.places],
      }));
      get().fetchPlaces(true).catch(() => {});

      // Notify friends about the new pick (fire-and-forget)
      const userId = useAuthStore.getState().user?.uid;
      const userName = useAuthStore.getState().profile?.displayName || 'Someone';
      if (userId) {
        sendPushToFriends(
          userId,
          'New Pick Added 📍',
          `${userName} added ${place.name} in ${place.city}`,
          { type: 'new-place', placeId: docId },
        ).catch(() => {});
      }

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
      // Every saved place is automatically a favorite
      data.isFavorite = true;
      const newId = await createDocument('userPlaces', data);
      // Optimistic local insert + background refresh (same reasoning as
      // addPlace — a blocking full re-fetch made saves crawl).
      set((state) => ({
        userPlaces: [
          { ...userPlace, id: newId || userPlace.id, isFavorite: true },
          ...state.userPlaces,
        ],
      }));
      get().fetchUserPlaces(true).catch(() => {});
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
      await get().fetchUserPlaces(true);
      // Also refresh picked users so their cached favorites stay current
      get().fetchPickedUsers();
    } catch (error) {
      console.error('Error removing place:', error);
      set((state) => ({
        userPlaces: state.userPlaces.filter((up) => up.placeId !== placeId),
      }));
    }
  },

  updatePersonalNote: async (userPlaceId: string, note: string) => {
    const { userPlaces } = get();
    const item = userPlaces.find((up) => up.id === userPlaceId);
    if (!item) return;
    const prev = item.personalNote;

    // Optimistic local update
    set((state) => ({
      userPlaces: state.userPlaces.map((up) =>
        up.id === userPlaceId ? { ...up, personalNote: note } : up,
      ),
    }));
    try {
      await updateDocument('userPlaces', userPlaceId, { personalNote: note });
    } catch (error) {
      console.error('Error saving note:', error);
      set((state) => ({
        userPlaces: state.userPlaces.map((up) =>
          up.id === userPlaceId ? { ...up, personalNote: prev } : up,
        ),
      }));
      throw error;
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

  searchPlacesWithMatchedTags: (query, lat?, lng?) => {
    const { places } = get();
    const lowerQuery = query.toLowerCase();
    const results = places
      .map((place) => {
        const matchedTags = place.tags.filter((tag) =>
          tag.toLowerCase().includes(lowerQuery)
        );
        const matches =
          place.name.toLowerCase().includes(lowerQuery) ||
          place.city.toLowerCase().includes(lowerQuery) ||
          place.country.toLowerCase().includes(lowerQuery) ||
          matchedTags.length > 0 ||
          place.category.toLowerCase().includes(lowerQuery) ||
          (place.subcategory && place.subcategory.toLowerCase().includes(lowerQuery)) ||
          (place.description && place.description.toLowerCase().includes(lowerQuery)) ||
          (place.address && place.address.toLowerCase().includes(lowerQuery));
        return matches ? { ...place, matchedTags } : null;
      })
      .filter(Boolean) as Array<Place & { matchedTags: string[] }>;

    // Sort by distance from user when location is available
    if (lat != null && lng != null) {
      results.sort((a, b) => {
        const distA = haversineDistance(lat, lng, a.location?.latitude ?? 0, a.location?.longitude ?? 0);
        const distB = haversineDistance(lat, lng, b.location?.latitude ?? 0, b.location?.longitude ?? 0);
        return distA - distB;
      });
    }

    return results;
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

      // Sync denormalized fields to all userPlaces referencing this place
      const userPlaceChanges: Record<string, unknown> = {};
      if (cleanChanges.category) userPlaceChanges.placeCategory = cleanChanges.category;
      if (cleanChanges.name) userPlaceChanges.placeName = cleanChanges.name;
      if (cleanChanges.city) userPlaceChanges.placeCity = cleanChanges.city;
      if (cleanChanges.country) userPlaceChanges.placeCountry = cleanChanges.country;
      if (cleanChanges.imageURLs) userPlaceChanges.placeImageURL = (cleanChanges.imageURLs as string[])[0] || '';

      if (Object.keys(userPlaceChanges).length > 0) {
        const relatedUserPlaces = await getDocuments<UserPlace>('userPlaces', [
          where('placeId', '==', placeId),
        ]);
        for (const up of relatedUserPlaces) {
          updateDocument('userPlaces', up.id, userPlaceChanges).catch(() => {});
        }
      }

      // Optimistic local update
      set((state) => ({
        places: state.places.map((p) =>
          p.id === placeId ? { ...p, ...cleanChanges } : p,
        ),
        recentDiscoveries: state.recentDiscoveries.map((p) =>
          p.id === placeId ? { ...p, ...cleanChanges } : p,
        ),
        userPlaces: state.userPlaces.map((up) =>
          up.placeId === placeId ? { ...up, ...userPlaceChanges } : up,
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
      const changes = { ...suggestion.changes } as Record<string, any>;
      if (changes.budgetTier === null) changes.budgetTier = undefined;
      set((state) => ({
        places: state.places.map((p) =>
          p.id === suggestion.placeId ? { ...p, ...changes } : p,
        ) as Place[],
        recentDiscoveries: state.recentDiscoveries.map((p) =>
          p.id === suggestion.placeId ? { ...p, ...changes } : p,
        ) as Place[],
      }));

      // Let the submitter know their edit went live (fire-and-forget)
      import('../services/notifications')
        .then(({ sendPushToUser }) =>
          sendPushToUser(
            suggestion.submittedBy,
            'Edit Approved ✅',
            `Your suggested edit to ${suggestion.placeName} is now live`,
            { type: 'edit-approved', placeId: suggestion.placeId },
          ),
        )
        .catch(() => {});
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

  // ---------------------------------------------------------------------------
  // Deletion requests
  // ---------------------------------------------------------------------------

  requestDeletion: async (placeId, placeName, reason) => {
    try {
      const user = useAuthStore.getState().user;
      const profile = useAuthStore.getState().profile;
      if (!user || !profile) throw new Error('Not signed in');

      await createDocument('deletionRequests', {
        placeId,
        placeName,
        reason,
        requestedBy: user.uid,
        requestedByName: profile.displayName,
        requestedByPhoto: profile.photoURL || '',
        status: 'pending',
      });

      sendPushToAdmins(
        'Deletion Request',
        `${profile.displayName} requested deletion of "${placeName}".`,
        { type: 'deletion_request', placeId },
      );
    } catch (error) {
      console.error('Error requesting deletion:', error);
      throw error;
    }
  },

  fetchPendingDeletionRequests: async () => {
    try {
      const requests = await getDocuments<DeletionRequest>('deletionRequests', [
        where('status', '==', 'pending'),
      ]);
      requests.sort((a, b) => {
        const aTime = a.createdAt?.seconds ?? 0;
        const bTime = b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
      return requests;
    } catch (error) {
      console.error('Error fetching deletion requests:', error);
      return [];
    }
  },

  approveDeletion: async (request) => {
    try {
      // Delete the place document
      await deleteDocument('places', request.placeId);
      // Mark request as approved
      await updateDocument('deletionRequests', request.id, {
        status: 'approved',
        reviewedBy: useAuthStore.getState().user?.uid || '',
      });

      // Clean up orphaned UserPlace documents that reference this place
      try {
        const orphaned = await getDocuments<UserPlace>('userPlaces', [
          where('placeId', '==', request.placeId),
        ]);
        await Promise.all(orphaned.map((up) => deleteDocument('userPlaces', up.id)));
      } catch (cleanupErr) {
        console.warn('Error cleaning up orphaned userPlaces:', cleanupErr);
      }

      // Remove from local state
      set((state) => ({
        places: state.places.filter((p) => p.id !== request.placeId),
        recentDiscoveries: state.recentDiscoveries.filter((p) => p.id !== request.placeId),
        userPlaces: state.userPlaces.filter((up) => up.placeId !== request.placeId),
      }));

      // Refresh picked users so deleted places don't linger in their lists
      get().fetchPickedUsers();
    } catch (error) {
      console.error('Error approving deletion:', error);
      throw error;
    }
  },

  rejectDeletion: async (requestId) => {
    try {
      await updateDocument('deletionRequests', requestId, {
        status: 'rejected',
        reviewedBy: useAuthStore.getState().user?.uid || '',
      });
    } catch (error) {
      console.error('Error rejecting deletion:', error);
      throw error;
    }
  },

  // ---------------------------------------------------------------------------
  // "Been" tracking
  // ---------------------------------------------------------------------------

  fetchBeenPlaces: async () => {
    const userId = useAuthStore.getState().user?.uid;
    if (!userId) {
      set({ beenPlaceIds: [] });
      return;
    }
    // Same TTL guard as fetchPlaces — called on every Explore/Map mount.
    if (
      get().beenPlaceIds.length > 0 &&
      Date.now() - lastFetch.beenPlaces < FETCH_TTL_MS
    ) {
      return;
    }
    lastFetch.beenPlaces = Date.now();
    try {
      const docs = await getDocuments<{ placeId: string }>('placeVisits', [
        where('userId', '==', userId),
      ]);
      set({ beenPlaceIds: docs.map((d) => d.placeId) });
    } catch (error) {
      console.error('Error fetching been places:', error);
    }
  },

  toggleBeen: async (placeId) => {
    const userId = useAuthStore.getState().user?.uid;
    if (!userId) return;

    const { beenPlaceIds, places, recentDiscoveries } = get();
    const alreadyBeen = beenPlaceIds.includes(placeId);

    if (alreadyBeen) {
      // Remove visit
      set({ beenPlaceIds: beenPlaceIds.filter((id) => id !== placeId) });

      // Decrement beenCount locally
      const updateCount = (p: Place) =>
        p.id === placeId ? { ...p, beenCount: Math.max(0, (p.beenCount || 0) - 1) } : p;
      set((state) => ({
        places: state.places.map(updateCount),
        recentDiscoveries: state.recentDiscoveries.map(updateCount),
      }));

      try {
        const matches = await getDocuments<{ id: string }>('placeVisits', [
          where('userId', '==', userId),
          where('placeId', '==', placeId),
        ]);
        if (matches.length > 0) {
          await deleteDocument('placeVisits', matches[0].id);
        }
        const place = places.find((p) => p.id === placeId);
        if (place) {
          await updateDocument('places', placeId, {
            beenCount: Math.max(0, (place.beenCount || 0) - 1),
          });
        }
      } catch (error) {
        console.error('Error removing visit:', error);
        // Revert both the id list AND the count maps that were optimistically decremented
        const restoreCount = (p: Place) =>
          p.id === placeId ? { ...p, beenCount: (p.beenCount || 0) + 1 } : p;
        set((state) => ({
          beenPlaceIds: [...beenPlaceIds],
          places: state.places.map(restoreCount),
          recentDiscoveries: state.recentDiscoveries.map(restoreCount),
        }));
      }
    } else {
      // Add visit
      set({ beenPlaceIds: [...beenPlaceIds, placeId] });

      // Increment beenCount locally
      const updateCount = (p: Place) =>
        p.id === placeId ? { ...p, beenCount: (p.beenCount || 0) + 1 } : p;
      set((state) => ({
        places: state.places.map(updateCount),
        recentDiscoveries: state.recentDiscoveries.map(updateCount),
      }));

      try {
        await createDocument('placeVisits', {
          userId,
          placeId,
        });
        const place = places.find((p) => p.id === placeId);
        if (place) {
          await updateDocument('places', placeId, {
            beenCount: (place.beenCount || 0) + 1,
          });
        }
      } catch (error) {
        console.error('Error adding visit:', error);
        // Revert both the id list AND the count maps that were optimistically incremented
        const restoreCount = (p: Place) =>
          p.id === placeId ? { ...p, beenCount: Math.max(0, (p.beenCount || 0) - 1) } : p;
        set((state) => ({
          beenPlaceIds: beenPlaceIds.filter((id) => id !== placeId),
          places: state.places.map(restoreCount),
          recentDiscoveries: state.recentDiscoveries.map(restoreCount),
        }));
      }
    }
  },
}));
