import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { normalizeCity, normalizeCountry, isNeighborhood } from './resolveCity';

export interface GeocodedAddress {
  address: string;
  city: string;
  country: string;
}

/**
 * Reverse-geocode lat/lng into a human-readable address, city, and country.
 * Uses expo-location's built-in reverse geocoder.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodedAddress | null> {
  if (Platform.OS === 'web') return null;

  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });

    if (results.length > 0) {
      const r = results[0];
      const streetParts = [r.streetNumber, r.street].filter(Boolean);

      // expo-location sometimes returns district/neighborhood as "city"
      // (e.g. "Śródmieście" instead of "Warsaw", "Stare Miasto" instead of "Poznań").
      let city = r.city || '';
      const adminFallback = r.subregion || r.region || '';

      if (city && isNeighborhood(city)) {
        // Known neighbourhood — resolve to parent city using admin area as fallback
        city = normalizeCity(city, adminFallback);
      } else if (r.subregion && r.city && r.city !== r.subregion) {
        // If city and subregion differ, subregion is usually the real city
        city = r.subregion;
      }
      if (!city) city = adminFallback;

      // Transliterate city & country to English
      city = normalizeCity(city);
      const country = normalizeCountry(r.country || '');

      return {
        address: streetParts.join(' ') || r.name || '',
        city,
        country,
      };
    }

    return null;
  } catch (error) {
    console.warn('Reverse geocoding error:', error);
    return null;
  }
}
