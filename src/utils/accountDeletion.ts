import { Alert } from 'react-native';
import { deleteUser, getAuth } from 'firebase/auth';

/**
 * Complete account-deletion flow required by App Store Guideline 5.1.1(v):
 * confirm → re-authenticate in place with the password → wipe the user's
 * Firestore footprint → delete the Firebase Auth account.
 *
 * Shared by the Settings screen and the profile modal so the flow behaves
 * identically everywhere. Navigation after success is the caller's job via
 * `onDeleted`.
 */
export function confirmAndDeleteAccount(onDeleted: () => void): void {
  Alert.alert(
    'Delete Account',
    'This action cannot be undone. Your account and all your data will be permanently removed. Are you sure?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Firebase requires a RECENT sign-in to delete an account.
          // Re-authenticate in place so the flow always completes in one
          // sitting — a "sign out and back in first" dead end is what got
          // the app rejected under 5.1.1(v).
          Alert.prompt(
            'Confirm Your Password',
            'For security, enter your password to permanently delete your account.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete Account',
                style: 'destructive',
                onPress: async (password?: string) => {
                  const auth = getAuth();
                  const currentUser = auth.currentUser;
                  if (!currentUser?.email || !password) {
                    Alert.alert('Error', 'Password is required to delete your account.');
                    return;
                  }
                  try {
                    const { EmailAuthProvider, reauthenticateWithCredential } =
                      await import('firebase/auth');
                    await reauthenticateWithCredential(
                      currentUser,
                      EmailAuthProvider.credential(currentUser.email, password),
                    );
                    await performAccountDeletion();
                    onDeleted();
                  } catch (error: any) {
                    if (
                      error?.code === 'auth/wrong-password' ||
                      error?.code === 'auth/invalid-credential'
                    ) {
                      Alert.alert('Incorrect Password', 'Please try again.');
                    } else {
                      console.warn('[delete-account] failed', error?.code, error?.message);
                      Alert.alert('Error', 'Failed to delete account. Please try again.');
                    }
                  }
                },
              },
            ],
            'secure-text',
          );
        },
      },
    ],
  );
}

async function performAccountDeletion(): Promise<void> {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const uid = currentUser.uid;

  // Remove the Firestore footprint FIRST (while still authenticated) so no
  // ghost profile lingers in search, suggestions, or friends lists.
  const { getDocuments, deleteDocument, where } = await import(
    '../services/firebase/firestore'
  );
  const wipe = async (coll: string, field: string) => {
    try {
      const docs = await getDocuments<any>(coll, [where(field, '==', uid)]);
      await Promise.all(docs.map((d: any) => deleteDocument(coll, d.id)));
    } catch (e) {
      console.warn(`[delete-account] failed wiping ${coll}`, e);
    }
  };
  await Promise.all([
    wipe('userPlaces', 'userId'),
    wipe('friends', 'userId'), // my links to others
    wipe('friends', 'uid'), // others' links to me
    wipe('friendRequests', 'fromUid'),
    wipe('friendRequests', 'toUid'),
    wipe('placeVisits', 'userId'),
    wipe('userLists', 'userId'),
  ]);
  try {
    await deleteDocument('users', uid);
  } catch (e) {
    console.warn('[delete-account] failed deleting user doc', e);
  }
  // Firebase Auth account last — this also signs us out.
  await deleteUser(currentUser);

  // Reset local auth state so the next sign-in starts clean.
  const { useAuthStore } = await import('../stores/useAuthStore');
  await useAuthStore.getState().signOut().catch(() => {});

  Alert.alert('Account Deleted', 'Your account and data have been removed.');
}
