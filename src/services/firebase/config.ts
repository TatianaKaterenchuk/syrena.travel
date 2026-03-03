import { initializeApp } from 'firebase/app';
// @ts-ignore — getReactNativePersistence exists at runtime but TS types lag behind
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBJhp6GtUond492KD-Od85sq8eDg9jFzX4',
  authDomain: 'syrena-travel.firebaseapp.com',
  projectId: 'syrena-travel',
  storageBucket: 'syrena-travel.firebasestorage.app',
  messagingSenderId: '511200626594',
  appId: '1:511200626594:web:f9f6be919b198236fe54fb',
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
