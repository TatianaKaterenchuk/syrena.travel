import { GeoPoint, Timestamp } from 'firebase/firestore';

export type PlaceCategory =
  | 'restaurant'
  | 'lodging'
  | 'bar'
  | 'cafe'
  | 'club'
  | 'culture'
  | 'nature'
  | 'shop'
  | 'services';

export type BudgetTier = 1 | 2 | 3 | 4;

export type StarRating = 1 | 2 | 3;

export const BUDGET_LABELS: Record<BudgetTier, string> = {
  1: 'Budget',
  2: 'Moderate',
  3: 'Premium',
  4: 'Luxury',
};

export const BUDGET_ICONS: Record<BudgetTier, string> = {
  1: '$',
  2: '$$',
  3: '$$$',
  4: '$$$$',
};

export const STAR_LABELS: Record<StarRating, string> = {
  1: 'Solid',
  2: 'Special',
  3: 'Mindblowing',
};

export interface Place {
  id: string;
  name: string;
  description: string;
  category: PlaceCategory;
  subcategory: string;
  location: GeoPoint;
  address: string;
  city: string;
  country: string;
  imageURLs: string[];
  createdBy: string;
  createdByName: string;
  createdByPhoto: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  rating: number;
  ratingCount: number;
  savesCount: number;
  beenCount: number;
  tags: string[];
  isPublic: boolean;
  budgetTier?: BudgetTier;
  starRating?: StarRating;
  googlePlaceId?: string;
  // Free-text list of must-try dishes (restaurants/cafes) or
  // cocktails/drinks (bars), entered by the recommender.
  mustTry?: string;
}

export interface UserPlace {
  id: string;
  userId: string;
  placeId: string;
  placeName: string;
  placeCategory: PlaceCategory;
  placeImageURL: string;
  placeLocation: GeoPoint;
  placeCity: string;
  placeCountry: string;
  savedAt: Timestamp;
  isCreator: boolean;
  personalNote: string;
  isFavorite?: boolean;
  isGoldStar?: boolean;
  placeBudgetTier?: BudgetTier;
  placeCreatedBy?: string;
  placeCreatedByName?: string;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  rating: number;
  text: string;
  createdAt: Timestamp;
}

export interface FeaturedPerson {
  id: string;
  uid: string;
  displayName: string;
  username: string;
  photoURL: string;
  bio: string;
  featuredAt: Timestamp;
  featuredUntil: Timestamp;
  chosenBy: string;
  headline: string;
  picks?: string[];
}

export interface PickedUser {
  id: string;
  uid: string;
  displayName: string;
  username: string;
  photoURL: string;
  pickedAt: Timestamp;
  pickedBy: string;
}

export interface PickedUserWithPlaces {
  user: PickedUser;
  topPlaces: UserPlace[];
}

export interface NewPlace {
  name: string;
  description: string;
  category: PlaceCategory;
  subcategory: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  country: string;
  imageURIs: string[];
  tags: string[];
  isPublic: boolean;
  budgetTier?: BudgetTier;
  starRating?: StarRating;
}

// ---------------------------------------------------------------------------
// Edit suggestions
// ---------------------------------------------------------------------------

/** The subset of Place fields that can be edited via the edit modal. */
export interface PlaceEditableFields {
  name?: string;
  description?: string;
  category?: PlaceCategory;
  subcategory?: string;
  address?: string;
  city?: string;
  country?: string;
  tags?: string[];
  budgetTier?: BudgetTier | null;
  starRating?: StarRating | null;
  mustTry?: string;
}

export type EditSuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface EditSuggestion {
  id: string;
  placeId: string;
  placeName: string;
  submittedBy: string;
  submittedByName: string;
  submittedByPhoto: string;
  status: EditSuggestionStatus;
  /** Only the fields the user actually changed. */
  changes: PlaceEditableFields;
  /** Snapshot of original values for the same keys — used for diff display. */
  originalValues: PlaceEditableFields;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  reviewedBy?: string;
}

// ---------------------------------------------------------------------------
// Deletion requests
// ---------------------------------------------------------------------------

export type DeletionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DeletionRequest {
  id: string;
  placeId: string;
  placeName: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByPhoto: string;
  status: DeletionRequestStatus;
  createdAt: Timestamp;
  reviewedBy?: string;
}

// ---------------------------------------------------------------------------
// User Lists
// ---------------------------------------------------------------------------

export interface UserList {
  id: string;
  userId: string;
  name: string;
  description: string;
  coverImageURL: string;
  placeIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
