import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { updateDocument, getDocuments, where } from './firebase/firestore';
import { UserProfile } from '../types';

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

    // Android-specific channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('admin-approvals', {
        name: 'Admin Approvals',
        importance: Notifications.AndroidImportance.HIGH,
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
