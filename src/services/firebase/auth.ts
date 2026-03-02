import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';
import { sendPushToAdmins } from '../notifications';

// ---------------------------------------------------------------------------
// Email / Password
// ---------------------------------------------------------------------------

export const signUp = async (
  email: string,
  password: string,
  displayName: string,
  username: string,
  bio: string = '',
  referralSource: string = '',
) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  await updateProfile(user, { displayName });

  // Create user document in Firestore
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    displayName,
    username: username.toLowerCase(),
    email,
    photoURL: '',
    bio,
    referralSource,
    placesCount: 0,
    friendsCount: 0,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Fire-and-forget push notification to admins
  sendPushToAdmins(
    'New User Signup',
    `${displayName} (@${username}) has signed up and needs approval.`,
    { type: 'new_user', userId: user.uid },
  );

  return user;
};

export const signIn = async (email: string, password: string) => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
};

export const signOut = async () => {
  await firebaseSignOut(auth);
};

export const subscribeToAuthState = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

