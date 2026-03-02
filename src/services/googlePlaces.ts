import Constants from 'expo-constants';

// ---------------------------------------------------------------------------
// Google Places API (New) — Place search + photo retrieval + POI details
// ---------------------------------------------------------------------------

const API_KEY =
  Constants.expoConfig?.extra?.googlePlacesApiKey ??
  'MISSING_GOOGLE_PLACES_API_KEY';

const BASE_URL = 'https://places.googleapis.com/v1/places';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlacePhoto {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface GooglePlaceResult {
  placeId: string;
  name: string;
  address: string;
  photos: PlacePhoto[];
}

/** Full details returned when tapping a Google Maps POI */
export interface GooglePlaceDetails {
  placeId: string;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  rating: number;
  ratingCount: number;
  types: string[];
  photos: PlacePhoto[];
  websiteUri?: string;
  phoneNumber?: string;
  primaryType?: string;
}

// ---------------------------------------------------------------------------
// Text Search — find a place by name + optional location bias
// ---------------------------------------------------------------------------

export async function searchPlace(
  query: string,
  latitude?: number,
  longitude?: number,
): Promise<GooglePlaceResult | null> {
  try {
    const body: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: 1,
      languageCode: 'en',
    };

    // Bias results toward the given location (500 m radius)
    if (latitude && longitude) {
      body.locationBias = {
        circle: {
          center: { latitude, longitude },
          radius: 500.0,
        },
      };
    }

    const res = await fetch(`${BASE_URL}:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.photos',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('Google Places search error:', res.status);
      return null;
    }

    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;

    // Build photo URLs
    const photos: PlacePhoto[] = (place.photos || [])
      .slice(0, 8)
      .map((photo: any, index: number) => ({
        id: `gp_${index}`,
        url: getPhotoUrl(photo.name, 800),
        width: photo.widthPx || 800,
        height: photo.heightPx || 600,
      }));

    return {
      placeId: place.id,
      name: place.displayName?.text || query,
      address: place.formattedAddress || '',
      photos,
    };
  } catch (error) {
    console.warn('Google Places API error:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Photo URL — construct a photo media URL from a photo resource name
// ---------------------------------------------------------------------------

function getPhotoUrl(photoName: string, maxWidth: number = 800): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${API_KEY}`;
}

// ---------------------------------------------------------------------------
// Search for photos only (convenience wrapper)
// ---------------------------------------------------------------------------

export async function searchPlacePhotos(
  query: string,
  latitude?: number,
  longitude?: number,
): Promise<PlacePhoto[]> {
  const result = await searchPlace(query, latitude, longitude);
  return result?.photos || [];
}

// ---------------------------------------------------------------------------
// Multi-result text search — find places by name with richer data
// ---------------------------------------------------------------------------

export interface GooglePlaceSearchResult {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  ratingCount: number;
  types: string[];
  primaryType: string;
  photos: PlacePhoto[];
}

export async function searchPlaces(
  query: string,
  latitude?: number,
  longitude?: number,
  maxResults: number = 5,
): Promise<GooglePlaceSearchResult[]> {
  try {
    const body: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: maxResults,
      languageCode: 'en',
    };

    if (latitude && longitude) {
      body.locationBias = {
        circle: {
          center: { latitude, longitude },
          radius: 5000.0,
        },
      };
    }

    const res = await fetch(`${BASE_URL}:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.rating',
          'places.userRatingCount',
          'places.types',
          'places.primaryType',
          'places.photos',
        ].join(','),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('Google Places multi-search error:', res.status);
      return [];
    }

    const data = await res.json();
    if (!data.places) return [];

    return data.places.map((place: any) => ({
      placeId: place.id,
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      latitude: place.location?.latitude || 0,
      longitude: place.location?.longitude || 0,
      rating: place.rating || 0,
      ratingCount: place.userRatingCount || 0,
      types: place.types || [],
      primaryType: place.primaryType || '',
      photos: (place.photos || [])
        .slice(0, 3)
        .map((photo: any, i: number) => ({
          id: `gps_${i}`,
          url: getPhotoUrl(photo.name, 400),
          width: photo.widthPx || 400,
          height: photo.heightPx || 300,
        })),
    }));
  } catch (error) {
    console.warn('Google Places multi-search API error:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Nearby Search — find notable places near a coordinate
// ---------------------------------------------------------------------------

export async function searchNearby(
  latitude: number,
  longitude: number,
  radiusMeters: number = 200,
  maxResults: number = 5,
): Promise<GooglePlaceSearchResult[]> {
  try {
    const body: Record<string, unknown> = {
      maxResultCount: maxResults,
      languageCode: 'en',
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: radiusMeters,
        },
      },
      excludedTypes: [
        'parking',
        'gas_station',
        'atm',
        'bus_station',
        'train_station',
        'transit_station',
      ],
    };

    const res = await fetch(`${BASE_URL}:searchNearby`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.rating',
          'places.userRatingCount',
          'places.types',
          'places.primaryType',
          'places.photos',
        ].join(','),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('Google Places nearby error:', res.status);
      return [];
    }

    const data = await res.json();
    if (!data.places) return [];

    return data.places.map((place: any) => ({
      placeId: place.id,
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      latitude: place.location?.latitude || 0,
      longitude: place.location?.longitude || 0,
      rating: place.rating || 0,
      ratingCount: place.userRatingCount || 0,
      types: place.types || [],
      primaryType: place.primaryType || '',
      photos: (place.photos || [])
        .slice(0, 3)
        .map((photo: any, i: number) => ({
          id: `gpn_${i}`,
          url: getPhotoUrl(photo.name, 400),
          width: photo.widthPx || 400,
          height: photo.heightPx || 300,
        })),
    }));
  } catch (error) {
    console.warn('Google Places nearby API error:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Get Place Details — fetch full info by place ID (for POI taps)
// ---------------------------------------------------------------------------

export async function getPlaceDetails(
  placeId: string,
): Promise<GooglePlaceDetails | null> {
  try {
    const res = await fetch(`${BASE_URL}/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': [
          'id',
          'displayName',
          'formattedAddress',
          'addressComponents',
          'location',
          'rating',
          'userRatingCount',
          'types',
          'primaryType',
          'photos',
          'websiteUri',
          'nationalPhoneNumber',
        ].join(','),
      },
    });

    if (!res.ok) {
      console.warn('Google Places detail error:', res.status);
      return null;
    }

    const place = await res.json();
    if (!place) return null;

    // Extract city & country from addressComponents
    let city = '';
    let country = '';
    if (place.addressComponents) {
      for (const comp of place.addressComponents) {
        const types: string[] = comp.types || [];
        if (types.includes('locality') && !city) {
          city = comp.longText || comp.shortText || '';
        }
        if (types.includes('country') && !country) {
          country = comp.longText || comp.shortText || '';
        }
        // Some places don't have "locality" — fall back to sublocality or administrative_area
        if (
          !city &&
          (types.includes('sublocality') ||
            types.includes('administrative_area_level_1'))
        ) {
          city = comp.longText || comp.shortText || '';
        }
      }
    }

    // Build photo URLs
    const photos: PlacePhoto[] = (place.photos || [])
      .slice(0, 8)
      .map((photo: any, index: number) => ({
        id: `gp_detail_${index}`,
        url: getPhotoUrl(photo.name, 800),
        width: photo.widthPx || 800,
        height: photo.heightPx || 600,
      }));

    return {
      placeId: place.id || placeId,
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      city,
      country,
      latitude: place.location?.latitude || 0,
      longitude: place.location?.longitude || 0,
      rating: place.rating || 0,
      ratingCount: place.userRatingCount || 0,
      types: place.types || [],
      primaryType: place.primaryType || '',
      photos,
      websiteUri: place.websiteUri,
      phoneNumber: place.nationalPhoneNumber,
    };
  } catch (error) {
    console.warn('Google Places detail API error:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Map Google Place types → app categories
// ---------------------------------------------------------------------------

const GOOGLE_TYPE_TO_CATEGORY: Record<string, string> = {
  // Restaurants
  restaurant: 'restaurant',
  meal_delivery: 'restaurant',
  meal_takeaway: 'restaurant',
  food: 'restaurant',
  bakery: 'restaurant',
  // Hotels
  hotel: 'hotel',
  lodging: 'hotel',
  motel: 'hotel',
  resort_hotel: 'hotel',
  // Bars
  bar: 'bar',
  wine_bar: 'bar',
  // Cafes
  cafe: 'cafe',
  coffee_shop: 'cafe',
  // Nature
  park: 'nature',
  natural_feature: 'nature',
  campground: 'nature',
  // Culture
  museum: 'culture',
  art_gallery: 'culture',
  church: 'culture',
  hindu_temple: 'culture',
  mosque: 'culture',
  synagogue: 'culture',
  library: 'culture',
  tourist_attraction: 'culture',
  // Shopping
  shopping_mall: 'shopping',
  store: 'shopping',
  clothing_store: 'shopping',
  jewelry_store: 'shopping',
  book_store: 'shopping',
  // Nightlife
  night_club: 'nightlife',
  casino: 'nightlife',
  // Services
  bank: 'services',
  atm: 'services',
  post_office: 'services',
  laundry: 'services',
  car_rental: 'services',
  gas_station: 'services',
  pharmacy: 'services',
  hospital: 'services',
  doctor: 'services',
  dentist: 'services',
  gym: 'services',
  hair_care: 'services',
  spa: 'services',
};

export function mapGoogleTypesToCategory(
  types: string[],
  primaryType?: string,
): string | null {
  // Check primary type first
  if (primaryType && GOOGLE_TYPE_TO_CATEGORY[primaryType]) {
    return GOOGLE_TYPE_TO_CATEGORY[primaryType];
  }
  // Then iterate through types
  for (const t of types) {
    if (GOOGLE_TYPE_TO_CATEGORY[t]) {
      return GOOGLE_TYPE_TO_CATEGORY[t];
    }
  }
  return null;
}
