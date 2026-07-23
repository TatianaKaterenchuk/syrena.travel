/**
 * Shared neighbourhood → city mapping and country-name normalisation.
 *
 * Used by:
 *  – app/(tabs)/index.tsx  (explore grouping)
 *  – src/services/googlePlaces.ts  (place details)
 *  – src/utils/geocoding.ts  (reverse geocode)
 */

// ---------------------------------------------------------------------------
// Neighbourhood / district → parent city
// ---------------------------------------------------------------------------

const NEIGHBORHOOD_TO_CITY: Record<string, string> = {
  // Warsaw
  'śródmieście': 'Warsaw', 'srodmiescie': 'Warsaw',
  'nowe miasto': 'Warsaw',
  'praga północ': 'Warsaw', 'praga południe': 'Warsaw',
  'praga polnoc': 'Warsaw', 'praga poludnie': 'Warsaw',
  'praga-południe': 'Warsaw', 'praga-północ': 'Warsaw',
  'mokotów': 'Warsaw', 'mokotow': 'Warsaw',
  'wola': 'Warsaw', 'żoliborz': 'Warsaw', 'zoliborz': 'Warsaw',
  'ochota': 'Warsaw', 'ursynów': 'Warsaw', 'ursynow': 'Warsaw',
  'bielany': 'Warsaw', 'bemowo': 'Warsaw',
  'targówek': 'Warsaw', 'targowek': 'Warsaw',
  'wilanów': 'Warsaw', 'wilanow': 'Warsaw',
  'włochy': 'Warsaw', 'wlochy': 'Warsaw',
  'ursus': 'Warsaw', 'rembertów': 'Warsaw',
  'wesoła': 'Warsaw', 'wesola': 'Warsaw',
  'wawer': 'Warsaw', 'białołęka': 'Warsaw',
  // Krakow
  'kazimierz': 'Krakow', 'podgórze': 'Krakow', 'podgorze': 'Krakow',
  'nowa huta': 'Krakow', 'zwierzyniec': 'Krakow',
  'krowodrza': 'Krakow', 'bronowice': 'Krakow',
  // Athens
  'plaka': 'Athens', 'monastiraki': 'Athens', 'kolonaki': 'Athens',
  'exarchia': 'Athens', 'psyrri': 'Athens', 'pangrati': 'Athens',
  'koukaki': 'Athens', 'athina': 'Athens',
  // Rome
  'trastevere': 'Rome', 'monti': 'Rome', 'testaccio': 'Rome',
  'prati': 'Rome', 'centro storico': 'Rome',
  // Paris
  'le marais': 'Paris', 'montmartre': 'Paris',
  'belleville': 'Paris', 'bastille': 'Paris',
  // Berlin
  'kreuzberg': 'Berlin', 'mitte': 'Berlin',
  'neukölln': 'Berlin', 'neukolln': 'Berlin',
  'friedrichshain': 'Berlin', 'prenzlauer berg': 'Berlin',
  'charlottenburg': 'Berlin', 'schöneberg': 'Berlin',
  // NYC
  'soho': 'New York', 'chelsea': 'New York', 'tribeca': 'New York',
  'williamsburg': 'New York', 'bushwick': 'New York',
  'midtown': 'New York', 'harlem': 'New York',
  'greenpoint': 'New York', 'dumbo': 'New York',
  // London
  'shoreditch': 'London', 'camden': 'London', 'brixton': 'London',
  'notting hill': 'London', 'hackney': 'London',
  // Generic district names (empty string = "use admin area fallback")
  'stare miasto': '', 'old town': '', 'new town': '', 'downtown': '',
  'city center': '', 'city centre': '', 'centro': '', 'altstadt': '',
  'ciutat vella': '', 'vieille ville': '',
};

/**
 * Returns true when the given string looks like a neighbourhood / district
 * rather than a real city name.
 */
export function isNeighborhood(name: string): boolean {
  return NEIGHBORHOOD_TO_CITY[name.toLowerCase().trim()] !== undefined;
}

/**
 * If `city` is a known neighbourhood, return the parent city.
 * For generic names (old town, centro …) `fallback` is returned when provided,
 * otherwise the original value is kept.
 */
export function resolveCityName(city: string, fallback?: string): string {
  const lower = city.toLowerCase().trim();
  const mapped = NEIGHBORHOOD_TO_CITY[lower];
  if (mapped !== undefined) {
    // mapped === '' means generic – use fallback if available
    return mapped || fallback || city;
  }
  return city;
}

// ---------------------------------------------------------------------------
// Country name normalisation  (local language → English)
// ---------------------------------------------------------------------------

const COUNTRY_NAME_MAP: Record<string, string> = {
  'Polska': 'Poland',
  'Deutschland': 'Germany',
  'France': 'France',          // already English
  'Italia': 'Italy',
  'España': 'Spain',
  'Ελλάδα': 'Greece',
  'Ellada': 'Greece',
  'Türkiye': 'Turkey',
  'Česko': 'Czech Republic',
  'Česká republika': 'Czech Republic',
  'Österreich': 'Austria',
  'Schweiz': 'Switzerland',
  'Suisse': 'Switzerland',
  'Svizzera': 'Switzerland',
  'België': 'Belgium',
  'Belgique': 'Belgium',
  'Nederland': 'Netherlands',
  'Sverige': 'Sweden',
  'Danmark': 'Denmark',
  'Norge': 'Norway',
  'Suomi': 'Finland',
  'Magyarország': 'Hungary',
  'România': 'Romania',
  'Hrvatska': 'Croatia',
  'Slovensko': 'Slovakia',
  'Slovenija': 'Slovenia',
  'Srbija': 'Serbia',
  'Србија': 'Serbia',
  'Ísland': 'Iceland',
  'Éire': 'Ireland',
  'Lietuva': 'Lithuania',
  'Latvija': 'Latvia',
  'Eesti': 'Estonia',
  'Საქართველო': 'Georgia',
  'Portugal': 'Portugal',
  'Россия': 'Russia',
  'Україна': 'Ukraine',
  'Беларусь': 'Belarus',
  'المغرب': 'Morocco',
  'مصر': 'Egypt',
  '日本': 'Japan',
  '대한민국': 'South Korea',
  '中国': 'China',
  'ไทย': 'Thailand',
  'Việt Nam': 'Vietnam',
  'Brasil': 'Brazil',
  'México': 'Mexico',
};

/** Normalise a country name to its common English form. */
export function resolveCountryName(country: string): string {
  return COUNTRY_NAME_MAP[country] || country;
}

// ---------------------------------------------------------------------------
// City-name transliteration map  (local → English)
// ---------------------------------------------------------------------------

export const CITY_NAME_MAP: Record<string, string> = {
  'Athina': 'Athens',
  'Αθήνα': 'Athens',
  'Warszawa': 'Warsaw',
  'Kraków': 'Krakow',
  'Wrocław': 'Wroclaw',
  'Gdańsk': 'Gdansk',
  'Poznań': 'Poznan',
  'Łódź': 'Lodz',
  'Göteborg': 'Gothenburg',
  'København': 'Copenhagen',
  'Köln': 'Cologne',
  'München': 'Munich',
  'Wien': 'Vienna',
  'Praha': 'Prague',
  'Firenze': 'Florence',
  'Roma': 'Rome',
  'Milano': 'Milan',
  'Napoli': 'Naples',
  'Venezia': 'Venice',
  'Torino': 'Turin',
  'Bruxelles': 'Brussels',
  'Genève': 'Geneva',
  'Zürich': 'Zurich',
  'Lisboa': 'Lisbon',
  'Moskva': 'Moscow',
  'Bucuresti': 'Bucharest',
  'Bucureşti': 'Bucharest',
};

/**
 * Full pipeline: resolve neighbourhood → city, transliterate to English,
 * optionally using an admin-area fallback when the city is a generic district.
 */
export function normalizeCity(city: string, adminAreaFallback?: string): string {
  let resolved = resolveCityName(city, adminAreaFallback);
  if (CITY_NAME_MAP[resolved]) resolved = CITY_NAME_MAP[resolved];
  return resolved;
}

/** Full pipeline for country names. */
export function normalizeCountry(country: string): string {
  return resolveCountryName(country);
}
