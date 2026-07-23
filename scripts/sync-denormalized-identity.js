/**
 * sync-denormalized-identity.js
 *
 * One-time migration: user displayName/username/photoURL are denormalized
 * into friends docs, pending friendRequests, conversations, and places
 * (createdByName/Photo). Until now profile renames never propagated, so
 * those copies are stale. This walks every user and rewrites the copies.
 *
 * MUST run while Firestore rules still allow cross-user writes (i.e. before
 * deploying the per-collection rules lockdown).
 *
 * Usage: node scripts/sync-denormalized-identity.js
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBJhp6GtUond492KD-Od85sq8eDg9jFzX4',
  authDomain: 'syrena-travel.firebaseapp.com',
  projectId: 'syrena-travel',
};

const log = (m) => console.log(`[sync] ${m}`);

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, 'reviewer@syrenatravel.app', 'SyrenaReview2026');

  const usersSnap = await getDocs(collection(db, 'users'));
  log(`users: ${usersSnap.size}`);
  let updates = 0;

  for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();
    const uid = u.uid || userDoc.id;
    const name = u.displayName || '';
    const username = u.username || '';
    const photo = u.photoURL || '';
    if (!name) continue;

    // friends docs where this user is the FRIEND (their identity shown to others)
    const friendsSnap = await getDocs(
      query(collection(db, 'friends'), where('uid', '==', uid)),
    );
    for (const f of friendsSnap.docs) {
      const d = f.data();
      if (d.displayName !== name || d.photoURL !== photo || (username && d.username !== username)) {
        await updateDoc(doc(db, 'friends', f.id), {
          displayName: name,
          photoURL: photo,
          ...(username ? { username } : {}),
        });
        updates++;
      }
    }

    // pending friend requests they sent
    const reqSnap = await getDocs(
      query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', uid),
        where('status', '==', 'pending'),
      ),
    );
    for (const r of reqSnap.docs) {
      const d = r.data();
      if (d.fromName !== name || d.fromPhoto !== photo) {
        await updateDoc(doc(db, 'friendRequests', r.id), { fromName: name, fromPhoto: photo });
        updates++;
      }
    }

    // conversations they participate in
    const convoSnap = await getDocs(
      query(collection(db, 'conversations'), where('participants', 'array-contains', uid)),
    );
    for (const c of convoSnap.docs) {
      const d = c.data();
      if (d.participantNames?.[uid] !== name || d.participantPhotos?.[uid] !== photo) {
        await updateDoc(doc(db, 'conversations', c.id), {
          [`participantNames.${uid}`]: name,
          [`participantPhotos.${uid}`]: photo,
        });
        updates++;
      }
    }

    // places they created
    const placesSnap = await getDocs(
      query(collection(db, 'places'), where('createdBy', '==', uid)),
    );
    for (const p of placesSnap.docs) {
      const d = p.data();
      if (d.createdByName !== name || d.createdByPhoto !== photo) {
        await updateDoc(doc(db, 'places', p.id), {
          createdByName: name,
          createdByPhoto: photo,
        });
        updates++;
      }
    }
  }

  log(`done — ${updates} stale docs updated`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[sync] fatal:', e);
  process.exit(1);
});
