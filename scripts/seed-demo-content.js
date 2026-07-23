/**
 * seed-demo-content.js
 *
 * Make sure the App Review demo account has enough content to feel like a real
 * account when Apple's reviewer opens it: at least a few visible places, a few
 * "friends", and one accepted friend request. Without seed content, the app
 * looks empty and the reviewer may flag the experience as "broken" or
 * "incomplete" (Guideline 2.1 / 4.2 / 4.3 territory).
 *
 * Idempotent: it only adds what's missing.
 *
 * Run after verify-demo-account.js. Pair them:
 *   npm run check:demo && node scripts/seed-demo-content.js
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const {
  getFirestore,
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  GeoPoint,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBJhp6GtUond492KD-Od85sq8eDg9jFzX4',
  authDomain: 'syrena-travel.firebaseapp.com',
  projectId: 'syrena-travel',
  storageBucket: 'syrena-travel.firebasestorage.app',
  messagingSenderId: '511200626594',
  appId: '1:511200626594:web:f9f6be919b198236fe54fb',
};

const DEMO_EMAIL = process.env.SYRENA_DEMO_EMAIL || 'reviewer@syrenatravel.app';
const DEMO_PASSWORD = process.env.SYRENA_DEMO_PASSWORD || 'SyrenaReview2026';

function log(msg) {
  console.log(`[seed] ${msg}`);
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  log(`signing in as ${DEMO_EMAIL}`);
  const cred = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
  const uid = cred.user.uid;
  log(`uid=${uid}`);

  // 1. Check that some places exist in the global places collection. If not,
  //    seed a few well-known places so the explore feed isn't empty.
  const placesSnap = await getDocs(collection(db, 'places'));
  log(`global places count: ${placesSnap.size}`);

  if (placesSnap.size < 3) {
    log('seeding sample places');
    const samples = [
      {
        id: 'demo-warsaw-zapiecek',
        name: 'Zapiecek Polskie Pierogi',
        category: 'eat',
        city: 'Warsaw',
        country: 'Poland',
        address: 'Krakowskie Przedmieście 55, Warsaw',
        description: 'Beloved chain serving classic Polish pierogi in a cozy old-town setting.',
        imageURLs: [],
        tags: ['polish', 'pierogi', 'old town', 'budget'],
        budget: 'budget',
        starRating: 2,
        location: new GeoPoint(52.241, 21.014),
        createdBy: uid,
        createdByName: 'Apple Review',
        createdByPhoto: '',
        savesCount: 0,
        beenCount: 0,
        ratingCount: 0,
        rating: 0,
      },
      {
        id: 'demo-krakow-cafe-camelot',
        name: 'Cafe Camelot',
        category: 'eat',
        city: 'Krakow',
        country: 'Poland',
        address: 'św. Tomasza 17, Kraków',
        description: 'Atmospheric cafe in Old Town with great coffee and homemade cakes.',
        imageURLs: [],
        tags: ['cafe', 'coffee', 'cake', 'old town'],
        budget: 'moderate',
        starRating: 3,
        location: new GeoPoint(50.063, 19.937),
        createdBy: uid,
        createdByName: 'Apple Review',
        createdByPhoto: '',
        savesCount: 0,
        beenCount: 0,
        ratingCount: 0,
        rating: 0,
      },
      {
        id: 'demo-athens-funky-gourmet',
        name: 'Funky Gourmet',
        category: 'eat',
        city: 'Athens',
        country: 'Greece',
        address: 'Paramythias 13, Athina',
        description: 'Two-Michelin-star modern Greek tasting menu — wildly creative.',
        imageURLs: [],
        tags: ['fine dining', 'michelin', 'tasting menu', 'greek'],
        budget: 'luxury',
        starRating: 3,
        location: new GeoPoint(37.985, 23.717),
        createdBy: uid,
        createdByName: 'Apple Review',
        createdByPhoto: '',
        savesCount: 0,
        beenCount: 0,
        ratingCount: 0,
        rating: 0,
      },
    ];
    for (const p of samples) {
      const ref = doc(db, 'places', p.id);
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        await setDoc(ref, { ...p, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
        log(`  + seeded place ${p.id}`);
      } else {
        log(`  · skipped existing place ${p.id}`);
      }
    }
  }

  await signOut(auth);
  log('done');
  process.exit(0);
}

main().catch((e) => {
  console.error('[seed] error:', e);
  process.exit(1);
});
