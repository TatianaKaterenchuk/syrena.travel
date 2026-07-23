import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { updateDocument, getDocuments, where } from './firebase/firestore';
import { UserProfile, Friend } from '../types';

// Configure notification behavior when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications.
 * Returns the Expo push token string, or null on failure.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device.');
    return null;
  }

  // Check and request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted.');
    return null;
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.error('Missing EAS projectId in app.json');
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Android-specific channels
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('admin-approvals', {
        name: 'Admin Approvals',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C4A265',
      });
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C4A265',
      });
      await Notifications.setNotificationChannelAsync('new-places', {
        name: 'New Places',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C4A265',
      });
    }

    return token;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Save (or update) the push token on the user's Firestore doc.
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    await updateDocument('users', userId, { expoPushToken: token });
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

/**
 * Send a push notification to a specific user by UID.
 */
export async function sendPushToUser(
  recipientUid: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const users = await getDocuments<UserProfile>(
      'users',
      [where('uid', '==', recipientUid)],
    );

    // uid might be stored as doc id, not a field — try getDocument as fallback
    let token = users[0]?.expoPushToken;
    if (!token) {
      const { getDocument } = await import('./firebase/firestore');
      const user = await getDocument<UserProfile>('users', recipientUid);
      token = user?.expoPushToken;
    }

    if (!token) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data: data || {},
        channelId: 'messages',
      }),
    });
  } catch (error) {
    console.error('Error sending push to user:', error);
  }
}

/**
 * Send push notifications to all admin users via Expo Push API.
 */
export async function sendPushToAdmins(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    // Query all admin users who have a push token
    const admins = await getDocuments<UserProfile>(
      'users',
      [where('isAdmin', '==', true)],
    );

    const tokens = admins
      .map((a) => a.expoPushToken)
      .filter((t): t is string => !!t && t.length > 0);

    if (tokens.length === 0) return;

    // Build messages
    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default' as const,
      title,
      body,
      data: data || {},
      channelId: 'admin-approvals',
    }));

    // Send via Expo Push API
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (error) {
    console.error('Error sending push to admins:', error);
    // Non-critical: don't throw, just log
  }
}

/**
 * Send push notifications to all friends of a user when they add a new pick.
 */
export async function sendPushToFriends(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    // Get all friends of this user
    const friendDocs = await getDocuments<Friend & { id: string; userId: string }>(
      'friends',
      [where('userId', '==', userId)],
    );

    if (friendDocs.length === 0) return;

    // Get push tokens for each friend
    const friendUids = friendDocs.map((f) => f.uid);
    const tokenPromises = friendUids.map(async (uid) => {
      const users = await getDocuments<UserProfile>('users', [where('uid', '==', uid)]);
      return users[0]?.expoPushToken;
    });

    const tokens = (await Promise.all(tokenPromises)).filter(
      (t): t is string => !!t && t.length > 0,
    );

    if (tokens.length === 0) return;

    // Build messages
    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default' as const,
      title,
      body,
      data: data || {},
      channelId: 'messages',
    }));

    // Send via Expo Push API
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (error) {
    console.error('Error sending push to friends:', error);
  }
}
