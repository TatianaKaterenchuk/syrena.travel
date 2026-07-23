export const colors = {
  // ─── Foundation ─────────────────────────────────────────────────
  // Deep navy — midnight elegance
  background: {
    primary: '#010954',      // Deep navy
    secondary: '#0A1264',     // Dark navy
    tertiary: '#141C74',      // Slate navy
    overlay: 'rgba(1, 9, 84, 0.88)',
  },

  // ─── Accent — Rich Gold ──────────────────────────────────────
  // Warm, luxurious gold — polished and refined
  gold: {
    primary: '#D4A843',       // Rich gold — main accent
    light: '#E8C96E',         // Bright gold highlight
    metallic: '#C49B38',      // Deep gold
    muted: '#8B7A3E',         // Antiqued gold — subtle
  },

  // ─── Text ──────────────────────────────────────────────────────
  text: {
    primary: '#F0EDE6',       // Warm ivory white
    secondary: '#A0A4B0',     // Cool silver
    tertiary: '#5C6178',      // Muted slate
    inverse: '#010954',
  },

  // ─── Category — Jewel tones on midnight ────────────────────────
  category: {
    restaurant: '#6B9E8A',    // Jade
    lodging: '#8B7355',       // Amber walnut
    bar: '#A06070',           // Garnet
    cafe: '#C49060',          // Warm copper
    nature: '#6B8F71',        // Emerald
    culture: '#8B6F9B',       // Amethyst
    shop: '#B8856C',           // Bronze
    club: '#6B72A0',          // Sapphire
    services: '#7E8B70',      // Sage
  },

  // ─── UI Chrome ─────────────────────────────────────────────────
  ui: {
    border: '#0E1570',        // Navy edge
    divider: '#060D48',       // Deep navy hairline
    tabBarBg: '#000842',      // Darker than primary
    cardBg: '#0A1264',        // Navy card surface
    searchBg: '#060D48',      // Input fields
    error: '#C75050',         // Muted red
    success: '#5A9E6E',       // Emerald green
    warning: '#D4A843',       // Gold
  },
} as const;

export type CategoryColor = keyof typeof colors.category;
