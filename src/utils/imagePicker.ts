import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  quality: 0.7,
  allowsMultipleSelection: false,
  exif: false,
};

const MAX_DIMENSION = 1200;

/**
 * Request camera permissions. Returns true if granted.
 */
const requestCameraPermission = async (): Promise<boolean> => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Camera Permission Required',
      'Please enable camera access in your device settings to take photos.',
    );
    return false;
  }
  return true;
};

/**
 * Request media library permissions. Returns true if granted.
 */
const requestMediaLibraryPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return true;
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Photo Library Permission Required',
      'Please enable photo library access in your device settings to select photos.',
    );
    return false;
  }
  return true;
};

/**
 * Opens the device photo library, allows the user to pick and edit an image.
 * The image is compressed to quality 0.7 and resized to a max of 1200px.
 * Returns the local URI of the selected image, or null if cancelled.
 */
export const pickImage = async (): Promise<string | null> => {
  const hasPermission = await requestMediaLibraryPermission();
  if (!hasPermission) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    ...IMAGE_OPTIONS,
    resize: { width: MAX_DIMENSION, height: MAX_DIMENSION },
  } as ImagePicker.ImagePickerOptions);

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return result.assets[0].uri;
};

/**
 * Opens the device camera, allows the user to take and edit a photo.
 * The image is compressed to quality 0.7 and resized to a max of 1200px.
 * Returns the local URI of the captured photo, or null if cancelled.
 */
export const takePhoto = async (): Promise<string | null> => {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) return null;

  const result = await ImagePicker.launchCameraAsync({
    ...IMAGE_OPTIONS,
    resize: { width: MAX_DIMENSION, height: MAX_DIMENSION },
  } as ImagePicker.ImagePickerOptions);

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return result.assets[0].uri;
};
