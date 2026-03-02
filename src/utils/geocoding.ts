import * as Location from 'expo-location';
import { Platform } from 'react-native';

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
      return {
        address: streetParts.join(' ') || r.name || '',
        city: r.city || r.subregion || r.region || '',
        country: r.country || '',
      };
    }

    return null;
  } catch (error) {
    console.warn('Reverse geocoding error:', error);
    return null;
  }
}
