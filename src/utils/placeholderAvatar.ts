/**
 * Returns a fun placeholder avatar URL based on a seed string.
 * Uses robohash.org which generates unique robot/monster avatars,
 * or random dog photos from place-puppy alternatives.
 */

const DOG_AVATARS = [
  'https://placedog.net/200/200?id=1',
  'https://placedog.net/200/200?id=2',
  'https://placedog.net/200/200?id=3',
  'https://placedog.net/200/200?id=4',
  'https://placedog.net/200/200?id=5',
  'https://placedog.net/200/200?id=6',
  'https://placedog.net/200/200?id=7',
  'https://placedog.net/200/200?id=8',
  'https://placedog.net/200/200?id=9',
  'https://placedog.net/200/200?id=10',
];

/**
 * Get a consistent placeholder avatar for a given seed (e.g. uid or name).
 * Uses robohash which generates unique fun avatars from any string.
 */
export function getPlaceholderAvatar(seed?: string): string {
  // Use robohash for fun unique avatars (set3 = cute robots, set4 = cats)
  const safeSeed = encodeURIComponent(seed || 'default');
  return `https://robohash.org/${safeSeed}?set=set4&size=200x200`;
}

/**
 * Returns photoURL if truthy, otherwise a placeholder avatar.
 */
export function avatarUrl(photoURL: string | null | undefined, seed?: string): string {
  if (photoURL) return photoURL;
  return getPlaceholderAvatar(seed);
}

/**
 * Returns the first image URL from a place's imageURLs array, or a generic
 * placeholder if the array is missing/empty. Never returns empty/undefined,
 * so it's always safe to pass directly to <Image source={{ uri: ... }} />.
 */
export function placeImageUri(imageURLs: string[] | null | undefined, seed?: string): string {
  const first = imageURLs?.[0];
  if (first && typeof first === 'string' && first.length > 0) return first;
  // Use a deterministic placeholder so missing images don't randomize on every render
  const safeSeed = encodeURIComponent(seed || 'place');
  return `https://picsum.photos/seed/${safeSeed}/600/400`;
}

/**
 * Rewrite an image URL to request a smaller rendition when the source
 * supports it (Google Places media URLs and picsum placeholders). Card
 * thumbnails were decoding 800px images into 100pt tiles — asking the CDN
 * for the display size cuts download + decode dramatically. URLs that
 * can't be resized (Firebase Storage) pass through unchanged.
 */
export function sizedImageUri(uri: string, widthPx: number): string {
  if (!uri) return uri;
  if (uri.includes('places.googleapis.com')) {
    return uri.replace(/maxWidthPx=\d+/, `maxWidthPx=${Math.round(widthPx)}`);
  }
  if (uri.includes('picsum.photos/seed/')) {
    const w = Math.round(widthPx);
    const h = Math.round((widthPx * 2) / 3);
    return uri.replace(/\/\d+\/\d+$/, `/${w}/${h}`);
  }
  return uri;
}
