import { PlaceCategory, BudgetTier, BUDGET_LABELS } from '../types';

// ---------------------------------------------------------------------------
// Semantic tag expansions: when a Google Place type, subcategory, or manual
// tag matches a key, also include the associated related tags.
// ---------------------------------------------------------------------------

const TAG_EXPANSIONS: Record<string, string[]> = {
  // Services
  spa: ['spa', 'wellness', 'relaxation'],
  massage: ['massage', 'spa', 'wellness', 'relaxation'],
  hair_care: ['hair', 'beauty', 'salon'],
  gym: ['gym', 'fitness', 'workout'],
  pharmacy: ['pharmacy', 'health'],
  hospital: ['hospital', 'health', 'medical'],
  doctor: ['doctor', 'health', 'medical'],
  dentist: ['dentist', 'health', 'medical'],
  laundry: ['laundry', 'cleaning'],
  car_rental: ['car rental', 'transport'],
  bank: ['bank', 'finance'],
  atm: ['atm', 'finance'],
  post_office: ['post office', 'mail'],
  gas_station: ['gas station', 'fuel'],

  // Restaurant / food
  bakery: ['bakery', 'pastry', 'bread'],
  meal_delivery: ['delivery', 'takeout'],
  meal_takeaway: ['takeout', 'delivery'],

  // Hotel
  resort_hotel: ['resort', 'luxury'],
  motel: ['motel', 'budget'],
  lodging: ['accommodation', 'lodging'],

  // Nature
  park: ['park', 'outdoor', 'green space'],
  campground: ['camping', 'outdoor', 'adventure'],
  natural_feature: ['nature', 'scenic'],

  // Culture
  museum: ['museum', 'art', 'history'],
  art_gallery: ['art', 'gallery', 'exhibition'],
  church: ['church', 'religious', 'historic'],
  hindu_temple: ['temple', 'religious', 'historic'],
  mosque: ['mosque', 'religious', 'historic'],
  synagogue: ['synagogue', 'religious', 'historic'],
  tourist_attraction: ['tourist', 'sightseeing', 'landmark'],
  library: ['library', 'books', 'reading'],

  // Nightlife
  night_club: ['nightclub', 'dancing', 'nightlife'],
  casino: ['casino', 'gambling', 'entertainment'],

  // Bar subtypes
  wine_bar: ['wine', 'wine bar'],
  coffee_shop: ['coffee', 'cafe'],
};

// Noisy Google types that add no search value
const IGNORED_TYPES = new Set([
  'point_of_interest',
  'establishment',
  'premise',
  'political',
  'street_address',
  'route',
  'geocode',
  'locality',
  'sublocality',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'country',
  'postal_code',
]);

// ---------------------------------------------------------------------------
// generateTags — build a deduplicated, lowercased tag list from place data
// ---------------------------------------------------------------------------

interface GenerateTagsInput {
  category: PlaceCategory;
  subcategory?: string;
  budgetTier?: BudgetTier | null;
  city?: string;
  country?: string;
  googleTypes?: string[];
  googlePrimaryType?: string;
}

export function generateTags(input: GenerateTagsInput): string[] {
  const tags = new Set<string>();

  // 1. Category name
  tags.add(input.category);

  // 2. Subcategory
  if (input.subcategory?.trim()) {
    const sub = input.subcategory.trim().toLowerCase();
    tags.add(sub);
    // Expand subcategory (try both raw and underscore form)
    const expansions =
      TAG_EXPANSIONS[sub] || TAG_EXPANSIONS[sub.replace(/ /g, '_')];
    if (expansions) expansions.forEach((t) => tags.add(t));
  }

  // 3. Budget tier label
  if (input.budgetTier) {
    tags.add(BUDGET_LABELS[input.budgetTier].toLowerCase());
  }

  // 4. City & country
  if (input.city?.trim()) tags.add(input.city.trim().toLowerCase());
  if (input.country?.trim()) tags.add(input.country.trim().toLowerCase());

  // 5. Google primary type
  if (input.googlePrimaryType && !IGNORED_TYPES.has(input.googlePrimaryType)) {
    const cleaned = input.googlePrimaryType.replace(/_/g, ' ');
    tags.add(cleaned);
    const expansions = TAG_EXPANSIONS[input.googlePrimaryType];
    if (expansions) expansions.forEach((t) => tags.add(t));
  }

  // 6. Google types array
  if (input.googleTypes) {
    for (const gType of input.googleTypes) {
      if (IGNORED_TYPES.has(gType)) continue;
      const cleaned = gType.replace(/_/g, ' ');
      tags.add(cleaned);
      const expansions = TAG_EXPANSIONS[gType];
      if (expansions) expansions.forEach((t) => tags.add(t));
    }
  }

  // Remove empty string if any
  tags.delete('');

  return Array.from(tags);
}

/**
 * Expand manual tags through TAG_EXPANSIONS.
 * E.g. if user types "massage", also returns ["spa", "wellness", "relaxation"].
 */
export function expandManualTags(manualTags: string[]): string[] {
  const result = new Set<string>();
  for (const tag of manualTags) {
    const lower = tag.trim().toLowerCase();
    if (!lower) continue;
    result.add(lower);
    const expansions =
      TAG_EXPANSIONS[lower] || TAG_EXPANSIONS[lower.replace(/ /g, '_')];
    if (expansions) expansions.forEach((t) => result.add(t));
  }
  return Array.from(result);
}
