/**
 * test-password-reset.js
 * Verify that Firebase Auth actually sends a password reset email
 * for a known account. Run: node scripts/test-password-reset.js <email>
 */

const { initializeApp } = require('firebase/app');
const { getAuth, sendPasswordResetEmail } = require('firebase/auth');

const firebaseConfig = {
  apiKey: 'AIzaSyBJhp6GtUond492KD-Od85sq8eDg9jFzX4',
  authDomain: 'syrena-travel.firebaseapp.com',
  projectId: 'syrena-travel',
  storageBucket: 'syrena-travel.firebasestorage.app',
  messagingSenderId: '511200626594',
  appId: '1:511200626594:web:f9f6be919b198236fe54fb',
};

async function main() {
  const email = process.argv[2] || 'mkarnow@gmail.com';
  console.log(`Sending password reset email to: ${email}`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  try {
    await sendPasswordResetEmail(auth, email);
    console.log('✓ Firebase reports the request succeeded.');
    console.log('  If no email arrives, check:');
    console.log('  1. Firebase Console → Authentication → Templates → Password reset (enabled? sender?)');
    console.log('  2. Whether the email exists in Firebase Auth users');
    console.log('  3. Spam folder');
  } catch (err) {
    console.error('✗ Firebase rejected the request:');
    console.error('  code:', err.code);
    console.error('  message:', err.message);
  }
  process.exit(0);
}

main();
