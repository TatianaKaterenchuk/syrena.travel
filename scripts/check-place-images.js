/**
 * check-place-images.js
 * One-shot debugging: sample some place docs and HEAD their imageURLs to see
 * if Google Places URLs in Firestore are still loadable, or if they're 403/404.
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  getDocs,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBJhp6GtUond492KD-Od85sq8eDg9jFzX4',
  authDomain: 'syrena-travel.firebaseapp.com',
  projectId: 'syrena-travel',
  storageBucket: 'syrena-travel.firebasestorage.app',
  messagingSenderId: '511200626594',
  appId: '1:511200626594:web:f9f6be919b198236fe54fb',
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, 'reviewer@syrenatravel.app', 'SyrenaReview2026');

  const snap = await getDocs(collection(db, 'places'));
  console.log(`Total places: ${snap.size}`);

  const samples = snap.docs.slice(0, 8);
  for (const d of samples) {
    const data = d.data();
    const first = data.imageURLs?.[0];
    console.log(`\n${data.name || d.id}:`);
    console.log(`  imageURLs.length = ${data.imageURLs?.length ?? 0}`);
    if (first) {
      console.log(`  first URL: ${first.slice(0, 100)}${first.length > 100 ? '…' : ''}`);
      try {
        const res = await fetch(first, { method: 'HEAD', redirect: 'manual' });
        console.log(`  HEAD status: ${res.status} ${res.statusText || ''}`);
        if (res.status >= 300 && res.status < 400) {
          console.log(`  redirect to: ${(res.headers.get('location') || '').slice(0, 80)}…`);
        }
      } catch (e) {
        console.log(`  HEAD error: ${e.message}`);
      }
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
