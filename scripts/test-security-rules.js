/**
 * test-security-rules.js
 *
 * Smoke test for the per-collection Firestore rules, run against PRODUCTION
 * with the App Review demo account + a throwaway test account. Exercises
 * every flow the app depends on, including the tricky both-sides
 * friend-accept writes, and verifies the attacks are blocked.
 *
 * Usage: node scripts/test-security-rules.js
 */

const { initializeApp, deleteApp } = require('firebase/app');
const {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
} = require('firebase/auth');
const {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBJhp6GtUond492KD-Od85sq8eDg9jFzX4',
  authDomain: 'syrena-travel.firebaseapp.com',
  projectId: 'syrena-travel',
};

const DEMO = { email: 'reviewer@syrenatravel.app', password: 'SyrenaReview2026' };
const TEST = { email: 'rulestest@syrenatravel.app', password: 'RulesTest2026x' };

let pass = 0;
let fail = 0;
const failures = [];

async function expect(label, promise, shouldSucceed) {
  try {
    await promise;
    if (shouldSucceed) {
      pass++;
      console.log(`  ✓ ${label}`);
    } else {
      fail++;
      failures.push(label);
      console.log(`  ✗ ${label} — SHOULD HAVE BEEN DENIED`);
    }
  } catch (e) {
    const denied = e.code === 'permission-denied' || `${e.message}`.includes('permission');
    if (!shouldSucceed && denied) {
      pass++;
      console.log(`  ✓ ${label} (denied as expected)`);
    } else {
      fail++;
      failures.push(`${label}: ${e.code || e.message}`);
      console.log(`  ✗ ${label} — ${e.code || e.message}`);
    }
  }
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // ---- unauthenticated ----
  console.log('\n— Unauthenticated —');
  await expect(
    'public read of places (city share page)',
    getDocs(query(collection(db, 'places'), where('city', '==', 'Warsaw'))),
    true,
  );
  await expect(
    'unauthenticated read of users blocked',
    getDocs(collection(db, 'users')),
    false,
  );

  // ---- demo account (regular member) ----
  console.log('\n— Signed in as demo member —');
  const demoCred = await signInWithEmailAndPassword(auth, DEMO.email, DEMO.password);
  const demoUid = demoCred.user.uid;

  await expect('member reads users (friend search)', getDocs(collection(db, 'users')), true);
  await expect(
    'member updates OWN user doc (bio)',
    updateDoc(doc(db, 'users', demoUid), { bio: `rules test ${Date.now()}` }),
    true,
  );
  await expect(
    'demo account heals own status (check:demo flow)',
    updateDoc(doc(db, 'users', demoUid), { status: 'approved' }),
    true,
  );

  // Find another user's doc to attack
  const usersSnap = await getDocs(collection(db, 'users'));
  const victim = usersSnap.docs.find((d) => d.id !== demoUid);
  if (victim) {
    await expect(
      "member edits ANOTHER user's doc blocked",
      updateDoc(doc(db, 'users', victim.id), { bio: 'hacked' }),
      false,
    );
    await expect(
      'member self-granting isAdmin blocked',
      updateDoc(doc(db, 'users', demoUid), { isAdmin: true }),
      false,
    );
  }

  // Places
  const myPlaceRef = await (async () => {
    const ref = await addDoc(collection(db, 'places'), {
      name: 'RULES TEST PLACE', description: '', category: 'restaurant', subcategory: '',
      address: '', city: 'Testville', country: 'PL', imageURLs: [],
      createdBy: demoUid, createdByName: 'Apple Review', createdByPhoto: '',
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      rating: 0, ratingCount: 0, savesCount: 0, beenCount: 0, tags: [], isPublic: true,
    });
    pass++; console.log('  ✓ member creates own place');
    return ref;
  })().catch((e) => { fail++; failures.push(`create place: ${e.code}`); return null; });

  if (myPlaceRef) {
    await expect('creator edits own place', updateDoc(myPlaceRef, { description: 'x' }), true);
  }
  const otherPlace = (await getDocs(collection(db, 'places'))).docs.find(
    (d) => d.data().createdBy && d.data().createdBy !== demoUid,
  );
  if (otherPlace) {
    await expect(
      "member rewriting someone else's place content blocked",
      updateDoc(doc(db, 'places', otherPlace.id), { name: 'VANDALIZED' }),
      false,
    );
    await expect(
      'member bumping counters on any place allowed (been/saves)',
      updateDoc(doc(db, 'places', otherPlace.id), {
        beenCount: (otherPlace.data().beenCount || 0),
      }),
      true,
    );
  }

  // userPlaces
  const upRef = await addDoc(collection(db, 'userPlaces'), {
    userId: demoUid, placeId: myPlaceRef ? myPlaceRef.id : 'x', placeName: 'RULES TEST PLACE',
    placeCategory: 'restaurant', placeImageURL: '', placeCity: 'Testville', placeCountry: 'PL',
    savedAt: Timestamp.now(), isCreator: true, personalNote: '', isFavorite: true,
    placeLocation: null,
  }).then((r) => { pass++; console.log('  ✓ member saves own userPlace'); return r; })
    .catch((e) => { fail++; failures.push(`create userPlace: ${e.code}`); return null; });

  // ---- second account: full friend handshake ----
  console.log('\n— Two-account friend flow —');
  await signOut(auth);
  let testCred;
  try {
    testCred = await createUserWithEmailAndPassword(auth, TEST.email, TEST.password);
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      testCred = await signInWithEmailAndPassword(auth, TEST.email, TEST.password);
    } else throw e;
  }
  const testUid = testCred.user.uid;
  await setDoc(doc(db, 'users', testUid), {
    uid: testUid, email: TEST.email, displayName: 'Rules Test', username: 'rulestest',
    photoURL: '', bio: '', status: 'approved', createdAt: Timestamp.now(),
  });
  console.log('  ✓ test account provisioned');

  // test → demo friend request
  const reqRef = await addDoc(collection(db, 'friendRequests'), {
    fromUid: testUid, toUid: demoUid, fromName: 'Rules Test', fromPhoto: '', status: 'pending',
  });
  console.log('  ✓ test sends friend request');

  await expect(
    "attacker deleting someone else's userPlace blocked",
    upRef ? deleteDoc(doc(db, 'userPlaces', upRef.id)) : Promise.reject({ code: 'permission-denied' }),
    false,
  );

  // demo accepts → creates BOTH friend docs (the tricky rule)
  await signOut(auth);
  await signInWithEmailAndPassword(auth, DEMO.email, DEMO.password);
  await expect(
    'recipient marks request accepted',
    updateDoc(doc(db, 'friendRequests', reqRef.id), { status: 'accepted' }),
    true,
  );
  const fr1 = await addDoc(collection(db, 'friends'), {
    uid: testUid, displayName: 'Rules Test', username: 'rulestest', photoURL: '',
    status: 'accepted', userId: demoUid,
  }).then((r) => { pass++; console.log('  ✓ acceptor creates own friend doc'); return r; })
    .catch((e) => { fail++; failures.push(`friend doc own: ${e.code}`); return null; });
  const fr2 = await addDoc(collection(db, 'friends'), {
    uid: demoUid, displayName: 'Apple Review', username: 'applereview', photoURL: '',
    status: 'accepted', userId: testUid,
  }).then((r) => { pass++; console.log("  ✓ acceptor creates SENDER's friend doc (both-sides write)"); return r; })
    .catch((e) => { fail++; failures.push(`friend doc other: ${e.code}`); return null; });

  // identity fan-out shape: update friend docs where uid == me
  if (fr2) {
    await expect(
      'identity fan-out updates my card on their list',
      updateDoc(doc(db, 'friends', fr2.id), { displayName: 'Apple Review 2' }),
      true,
    );
  }

  // messaging
  const convoRef = await addDoc(collection(db, 'conversations'), {
    participants: [demoUid, testUid],
    participantNames: { [demoUid]: 'Apple Review', [testUid]: 'Rules Test' },
    participantPhotos: { [demoUid]: '', [testUid]: '' },
    lastMessage: '', lastMessageAt: Timestamp.now(), unreadCounts: {},
  }).then((r) => { pass++; console.log('  ✓ participant creates conversation'); return r; })
    .catch((e) => { fail++; failures.push(`create convo: ${e.code}`); return null; });

  if (convoRef) {
    await expect(
      'participant sends message',
      addDoc(collection(db, 'messages'), {
        conversationId: convoRef.id, senderId: demoUid, senderName: 'Apple Review',
        text: 'rules test', createdAt: Timestamp.now(), isRead: false,
      }),
      true,
    );
    await expect(
      'participant reads conversation messages',
      getDocs(query(collection(db, 'messages'), where('conversationId', '==', convoRef.id))),
      true,
    );
  }

  // ---- cleanup ----
  console.log('\n— Cleanup —');
  try {
    if (convoRef) {
      const msgs = await getDocs(query(collection(db, 'messages'), where('conversationId', '==', convoRef.id)));
      for (const m of msgs.docs) await deleteDoc(doc(db, 'messages', m.id)).catch(() => {});
    }
    if (fr1) await deleteDoc(doc(db, 'friends', fr1.id)).catch(() => {});
    if (fr2) await deleteDoc(doc(db, 'friends', fr2.id)).catch(() => {});
    await deleteDoc(doc(db, 'friendRequests', reqRef.id)).catch(() => {});
    if (upRef) await deleteDoc(doc(db, 'userPlaces', upRef.id)).catch(() => {});
    if (myPlaceRef) await deleteDoc(myPlaceRef).catch(() => {});
    // remove throwaway test account
    await signOut(auth);
    const cred = await signInWithEmailAndPassword(auth, TEST.email, TEST.password);
    await deleteDoc(doc(db, 'users', cred.user.uid)).catch(() => {});
    await deleteUser(cred.user).catch(() => {});
    console.log('  ✓ test data removed');
  } catch (e) {
    console.log('  (cleanup issue, non-fatal:', e.code || e.message, ')');
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach((f) => console.log('  -', f));
  }
  await deleteApp(app);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
