import { useState, useEffect, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export function useLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('Location permission denied');
      Alert.alert(
        'Location Permission Required',
        'Please enable location access in your device settings to see your position on the map.',
      );
      return false;
    }
    return true;
  };

  const requestLocation = useCallback(async (): Promise<UserLocation | null> => {
    if (Platform.OS === 'web') return null;

    setIsLoading(true);
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) return null;

      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords: UserLocation = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
      };

      setLocation(coords);
      setErrorMsg(null);
      return coords;
    } catch (error) {
      console.warn('Location error:', error);
      setErrorMsg('Could not get location');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Request location on mount (native only)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      requestLocation();
    }
  }, [requestLocation]);

  return { location, errorMsg, isLoading, requestLocation };
}
