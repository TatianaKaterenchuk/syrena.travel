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
// Custom map style — Michelin Guide–inspired light theme
// Clean, warm beige base with minimal detail. Roads are subtle white,
// water is soft blue, parks are muted sage. POIs and transit hidden.
// ---------------------------------------------------------------------------

export const CUSTOM_MAP_STYLE = [
  // Base
  { elementType: 'geometry', stylers: [{ color: '#E8E0D0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F5F0E8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A8478' }] },

  // Administrative
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D0C8BC' }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels.text.fill',
    stylers: [{ visibility: 'on' }, { color: '#9A948A' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6B6560' }],
  },

  // Landscape
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.fill',
    stylers: [{ color: '#EAE2D4' }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#E5DDD0' }],
  },

  // POI — visible so users can browse real restaurants, hotels, cafes on
  // the map like Google Maps and tap one to add it as a Syrena place.
  // The map screen's onPoiClick handler takes care of the tap-to-add flow.
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#DDD8CE' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'on' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'on' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6B6560' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry.fill',
    stylers: [{ color: '#D4DFC8' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8A9A78' }],
  },

  // Roads
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E0D8CC' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ visibility: 'on' }, { color: '#A09A90' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ visibility: 'on' }, { color: '#8A8478' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#F0E8DA' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D8D0C4' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },

  // Transit — hidden
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#D8D0C4' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },

  // Water
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#AAC4D8' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7A9AB0' }],
  },
];
