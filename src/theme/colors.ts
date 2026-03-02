export const colors = {
  // ─── Foundation ─────────────────────────────────────────────────
  // Deep, warm blacks with a green undertone — aged wood and leather
  background: {
    primary: '#0B0F0E',      // Near-black with warm green cast
    secondary: '#131A17',     // Dark forest floor
    tertiary: '#1C2622',      // Mossy stone
    overlay: 'rgba(11, 15, 14, 0.88)',
  },

  // ─── Accent — Warm Brass / Amber ───────────────────────────────
  // Rich, antiqued brass — like old pharmacy hardware
  gold: {
    primary: '#C4A265',       // Warm brass — main accent
    light: '#DFC491',         // Pale amber highlight
    metallic: '#B8935A',      // Deeper brass
    muted: '#7D6A3E',         // Tarnished brass — subtle
  },

  // ─── Text ──────────────────────────────────────────────────────
  text: {
    primary: '#F2EDE4',       // Warm parchment white
    secondary: '#A8A196',     // Aged linen
    tertiary: '#6B655C',      // Faded label
    inverse: '#0B0F0E',
  },

  // ─── Category — Muted botanical / apothecary tones ─────────────
  category: {
    restaurant: '#7A9E7E',    // Sage
    hotel: '#8B7355',         // Walnut
    bar: '#9B6B6B',           // Dried rose
    cafe: '#C4956A',          // Cinnamon
    nature: '#6B8F71',        // Fern
    culture: '#8B6F8B',       // Lavender
    shopping: '#B8856C',      // Terracotta
    nightlife: '#6B6F8B',     // Twilight
    services: '#8B8B6B',      // Olive
  },

  // ─── UI Chrome ─────────────────────────────────────────────────
  ui: {
    border: '#262E2A',        // Subtle forest edge
    divider: '#1A211E',       // Hairline
    tabBarBg: '#0D1210',      // Slightly lighter than primary bg
    cardBg: '#151C19',        // Card surface
    searchBg: '#1A211E',      // Input fields
    error: '#C75050',         // Muted red
    success: '#6B8F71',       // Botanical green
    warning: '#C4956A',       // Amber
  },
} as const;

export type CategoryColor = keyof typeof colors.category;
