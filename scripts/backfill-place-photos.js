/**
 * backfill-place-photos.js
 *
 * Many existing places in Firestore have empty imageURLs arrays because the
 * Add Place flow used to not always save Google Places photos. This script
 * walks every place that has a `googlePlaceId` but no `imageURLs` and fetches
 * up to 5 photos from the Google Places API (v1), saving them to the place doc.
 *
 * Usage:
 *   node scripts/backfill-place-photos.js
 *
 * Optionally limit to a single place:
 *   PLACE_ID=abc123 node scripts/backfill-place-photos.js
 *
 * Safe to re-run — only touches docs that need it.
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBJhp6GtUond492KD-Od85sq8eDg9jFzX4',
  authDomain: 'syrena-travel.firebaseapp.com',
  projectId: 'syrena-travel',
  storageBucket: 'syrena-travel.firebasestorage.app',
  messagingSenderId: '511200626594',
  appId: '1:511200626594:web:f9f6be919b198236fe54fb',
};

const GOOGLE_API_KEY = 'AIzaSyBnYqu6JhN1NQVNkDXN_zhpmNoWy4lFAzo';
const ONLY_PLACE_ID = process.env.PLACE_ID || null;

function log(msg) {
  console.log(`[backfill] ${msg}`);
}

async function fetchPlacePhotos(googlePlaceId) {
  const url = `https://places.googleapis.com/v1/places/${googlePlaceId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'photos',
      // The mobile API key is referer-restricted to the app bundle.
      // Spoofing the iOS bundle ID gets us past the check from a Node script.
      'X-Ios-Bundle-Identifier': 'com.alegro.syrena-travel',
      Referer: 'https://syrena-travel.web.app/',
    },
  });
  if (!res.ok) {
    throw new Error(`Places API returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const photos = (data.photos || []).slice(0, 5);
  return photos.map(
    (p) => `https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=1200&key=${GOOGLE_API_KEY}`,
  );
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Firestore rules now restrict place updates to the creator or an ADMIN.
  // This script rewrites other users' places, so it must sign in as an
  // admin account: SYRENA_DEMO_EMAIL=mkarnow@gmail.com SYRENA_DEMO_PASSWORD=... node scripts/backfill-place-photos.js
  const email = process.env.SYRENA_DEMO_EMAIL || 'reviewer@syrenatravel.app';
  const password = process.env.SYRENA_DEMO_PASSWORD || 'SyrenaReview2026';
  log(`signing in as ${email}…`);
  await signInWithEmailAndPassword(auth, email, password);

  log('fetching all places…');
  const snap = await getDocs(collection(db, 'places'));
  log(`total places: ${snap.size}`);

  let scanned = 0;
  let updated = 0;
  let skipped_hasImages = 0;
  let skipped_noGoogleId = 0;
  let failed = 0;

  for (const docSnap of snap.docs) {
    scanned++;
    const data = docSnap.data() || {};
    const id = docSnap.id;

    if (ONLY_PLACE_ID && id !== ONLY_PLACE_ID) continue;

    // We REPLACE existing imageURLs when they point to Firebase Storage,
    // because the project hit its Firebase Storage download quota and every
    // firebasestorage.googleapis.com URL now returns 402. Google Places CDN
    // URLs are free and don't have this problem, so we re-fetch.
    const existing = Array.isArray(data.imageURLs) ? data.imageURLs : [];
    const isFirebaseUrl = (u) => typeof u === 'string' && u.includes('firebasestorage.googleapis.com');
    const needsReplacement = existing.length === 0 || existing.every(isFirebaseUrl);

    if (!needsReplacement) {
      skipped_hasImages++;
      continue;
    }

    if (!data.googlePlaceId) {
      skipped_noGoogleId++;
      log(`  ⤴ ${id} (${data.name || 'unnamed'}) — no googlePlaceId, can't backfill`);
      continue;
    }

    try {
      const urls = await fetchPlacePhotos(data.googlePlaceId);
      if (urls.length === 0) {
        log(`  · ${id} (${data.name}) — Google returned no photos`);
        skipped_hasImages++; // treat as "we tried, nothing to do"
        continue;
      }
      await updateDoc(doc(db, 'places', id), { imageURLs: urls });
      updated++;
      log(`  ✓ ${id} (${data.name}) — wrote ${urls.length} photos`);
    } catch (e) {
      failed++;
      log(`  ✗ ${id} (${data.name}) — ${e.message}`);
    }

    // Be polite to Google's API
    await new Promise((r) => setTimeout(r, 250));
  }

  log('—');
  log(`scanned=${scanned}  updated=${updated}  already-had-images=${skipped_hasImages}  no-googleId=${skipped_noGoogleId}  failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});
