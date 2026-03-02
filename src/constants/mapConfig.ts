// Region type inlined to avoid importing react-native-maps on web
interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export const DEFAULT_REGION: Region = {
  latitude: 52.2297,
  longitude: 21.0122,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export const WORLD_REGION: Region = {
  latitude: 30,
  longitude: 10,
  latitudeDelta: 100,
  longitudeDelta: 100,
};

export const CLUSTER_RADIUS = 50;
export const MIN_ZOOM_LEVEL = 2;
export const MAX_ZOOM_LEVEL = 20;

// ---------------------------------------------------------------------------
// Custom dark map style — apothecary / botanical theme
// Warm dark greens, muted earth tones. Works with Google Maps provider on
// Android; iOS uses userInterfaceStyle="dark" instead.
// ---------------------------------------------------------------------------

export const CUSTOM_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#111714' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111714' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5a6357' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#2a332e' }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4a5248' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.fill',
    stylers: [{ color: '#151c18' }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#131a16' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#1a231e' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8a8275' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#111714' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'on' }, { saturation: -60 }, { lightness: -20 }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry.fill',
    stylers: [{ color: '#1a2a1e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#222b26' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#2a342e' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b655c' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#283530' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#303b35' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0e1412' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3a4a40' }],
  },
];
