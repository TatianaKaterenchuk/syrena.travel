import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Alert, Platform } from 'react-native';

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  quality: 0.8,
  allowsMultipleSelection: false,
  exif: false,
  base64: false,
};

const MAX_DIMENSION = 1200;

/**
 * Actually resize the picked image. expo-image-picker has NO resize option
 * (the old `resize:` key was silently ignored), so photos were uploaded at
 * full camera resolution — multi-MB avatars that made profiles crawl.
 */
const downscale = async (
  uri: string,
  width?: number,
  height?: number,
): Promise<string> => {
  try {
    const tooWide = (width ?? Infinity) > MAX_DIMENSION;
    const tooTall = (height ?? Infinity) > MAX_DIMENSION;
    if (!tooWide && !tooTall) return uri;
    const context = ImageManipulator.manipulate(uri);
    context.resize(
      (width ?? 0) >= (height ?? 0)
        ? { width: MAX_DIMENSION }
        : { height: MAX_DIMENSION },
    );
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      compress: 0.8,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  } catch (e) {
    console.warn('[imagePicker] downscale failed, using original', e);
    return uri;
  }
};

/**
 * Normalise a URI returned by expo-image-picker so it always works with
 * fetch() on both iOS and Android.
 *  - iOS sometimes returns `ph://` asset URIs that cannot be fetched.
 *  - On Android the URI is usually a `content://` or `file://` path.
 *  - `file://` URIs are always safe.
 */
const normalizeUri = (uri: string): string => {
  // On iOS, expo-image-picker with allowsEditing should already return a
  // file:// URI pointing at the edited copy. If for some reason it doesn't,
  // the asset object also carries a `uri` that starts with file://. Ensure we
  // always have a usable scheme.
  if (Platform.OS === 'ios' && uri.startsWith('ph://')) {
    // This shouldn't normally happen with allowsEditing, but guard against it.
    console.warn('[imagePicker] Received ph:// URI – this may not render correctly:', uri);
  }
  return uri;
};

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
export const pickImage = async (aspect?: [number, number]): Promise<string | null> => {
  const hasPermission = await requestMediaLibraryPermission();
  if (!hasPermission) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    ...IMAGE_OPTIONS,
    ...(aspect ? { aspect } : {}),
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset.uri) {
    console.warn('[pickImage] Image asset returned without a URI');
    return null;
  }

  const resized = await downscale(asset.uri, asset.width, asset.height);
  return normalizeUri(resized);
};

/**
 * Opens the device camera, allows the user to take and edit a photo.
 * The image is compressed to quality 0.7 and resized to a max of 1200px.
 * Returns the local URI of the captured photo, or null if cancelled.
 */
export const takePhoto = async (aspect?: [number, number]): Promise<string | null> => {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) return null;

  const result = await ImagePicker.launchCameraAsync({
    ...IMAGE_OPTIONS,
    ...(aspect ? { aspect } : {}),
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset.uri) {
    console.warn('[takePhoto] Camera asset returned without a URI');
    return null;
  }

  const resized = await downscale(asset.uri, asset.width, asset.height);
  return normalizeUri(resized);
};
