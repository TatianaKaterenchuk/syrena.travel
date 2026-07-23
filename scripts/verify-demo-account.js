/**
 * verify-demo-account.js
 *
 * Self-healing pre-flight check for the Apple App Review demo account.
 *
 * Apple's review team needs to be able to sign in to test the app. Every time
 * the demo account credentials break (account deleted, password rotated, etc.),
 * Apple gets stuck on the sign-in screen, can't progress, and rejects the
 * submission citing whatever screen they're stuck on (often the welcome popup
 * close button, because that's the next thing they see after a fresh install).
 *
 * This script:
 *   1. Tries to sign in with the canonical demo credentials.
 *   2. If sign-in fails, attempts to create a fresh account with those
 *      credentials. If creation also fails (e.g. email-already-in-use), it
 *      rotates to a fallback email and prints the new credentials so the
 *      operator can update App Store Connect.
 *   3. On success, verifies the user document in Firestore has status="approved"
 *      so the user doesn't get bounced to the pending-approval screen.
 *
 * Run before every submission:
 *   npm run check:demo
 *
 * Exit codes:
 *   0  — account works and is approved
 *   1  — could not heal the account; needs manual intervention
 */

const { initializeApp } = require('firebase/app');
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} = require('firebase/auth');
const {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  Timestamp,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBJhp6GtUond492KD-Od85sq8eDg9jFzX4',
  authDomain: 'syrena-travel.firebaseapp.com',
  projectId: 'syrena-travel',
  storageBucket: 'syrena-travel.firebasestorage.app',
  messagingSenderId: '511200626594',
  appId: '1:511200626594:web:f9f6be919b198236fe54fb',
};

// Canonical demo credentials. Keep these in sync with App Store Connect.
// Email has no period in the local part and uses .app (alpha-only) TLD so
// iPad's on-screen keyboard autocorrect can't mangle it into something else.
// Password is alphanumeric only — no special characters that could trip
// clipboard handlers or be mistyped.
const DEMO_EMAIL = process.env.SYRENA_DEMO_EMAIL || 'reviewer@syrenatravel.app';
const DEMO_PASSWORD = process.env.SYRENA_DEMO_PASSWORD || 'SyrenaReview2026';

function log(msg) {
  console.log(`[demo-account] ${msg}`);
}

async function ensureProfile(db, uid, email) {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const desired = {
    uid,
    email,
    displayName: 'Apple Review',
    username: 'applereview',
    bio: 'App Store Review Account — please use this account to test all features.',
    photoURL: '',
    status: 'approved',
    isAdmin: false,
    role: 'member',
    updatedAt: Timestamp.now(),
  };
  if (!snap.exists()) {
    log('user doc missing — creating');
    await setDoc(userRef, { ...desired, createdAt: Timestamp.now() });
    return;
  }
  const data = snap.data() || {};
  if (data.status !== 'approved') {
    log(`user status is "${data.status}" — flipping to approved`);
    await setDoc(userRef, desired, { merge: true });
  } else {
    log('user doc exists and is approved');
  }
}

async function tryCreate(auth, db, email, password) {
  log(`attempting to create account ${email}`);
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await ensureProfile(db, cred.user.uid, email);
  log(`created uid=${cred.user.uid}`);
  return cred.user.uid;
}

async function trySignIn(auth, email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user.uid;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  log(`checking demo account: ${DEMO_EMAIL}`);

  try {
    const uid = await trySignIn(auth, DEMO_EMAIL, DEMO_PASSWORD);
    log(`sign-in succeeded uid=${uid}`);
    await ensureProfile(db, uid, DEMO_EMAIL);
    await signOut(auth);
    log('OK — demo account is healthy');
    console.log(`\nCREDENTIALS\n  Email:    ${DEMO_EMAIL}\n  Password: ${DEMO_PASSWORD}\n`);
    process.exit(0);
  } catch (err) {
    log(`sign-in failed: ${err.code || err.message}`);
  }

  // Sign-in didn't work. Try to create the account.
  try {
    const uid = await tryCreate(auth, db, DEMO_EMAIL, DEMO_PASSWORD);
    log('created account; verifying sign-in still works');
    await signOut(auth);
    const uid2 = await trySignIn(auth, DEMO_EMAIL, DEMO_PASSWORD);
    if (uid !== uid2) {
      log(`WARN: uid changed between create and verify (${uid} -> ${uid2})`);
    }
    await signOut(auth);
    log('OK — demo account created and sign-in verified');
    console.log(`\nCREDENTIALS\n  Email:    ${DEMO_EMAIL}\n  Password: ${DEMO_PASSWORD}\n`);
    process.exit(0);
  } catch (err) {
    if (err && err.code === 'auth/email-already-in-use') {
      log('account exists but our password is wrong — cannot reset password from client SDK');
      log('options: (1) rotate to a new email via SYRENA_DEMO_EMAIL env var, (2) use Firebase Console to reset the password manually');
      console.error(
        `\nFAILED: account ${DEMO_EMAIL} exists but the stored password does not match "${DEMO_PASSWORD}".\n` +
          `Fix by either:\n` +
          `  (a) running this script again with a fresh email:\n` +
          `      SYRENA_DEMO_EMAIL=apple.review.v2@syrenatravel.app node scripts/verify-demo-account.js\n` +
          `      (then update App Store Connect with the new email)\n` +
          `  (b) opening Firebase Console > Authentication, finding the user, and resetting the password to "${DEMO_PASSWORD}".\n`,
      );
      process.exit(1);
    }
    log(`create failed: ${err.code || err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[demo-account] unexpected error:', e);
  process.exit(1);
});
