import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './config';

export const uploadImage = async (
  path: string,
  uri: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  let blob: Blob;

  try {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    blob = await response.blob();
  } catch (error) {
    console.error('[uploadImage] Error fetching image from URI:', uri, error);
    throw new Error(
      `Could not load the selected image. Please try picking the photo again. (${error instanceof Error ? error.message : 'Unknown error'})`
    );
  }

  if (blob.size === 0) {
    throw new Error('Selected image appears to be empty. Please try a different photo.');
  }

  const storageRef = ref(storage, path);
  const metadata = { contentType: blob.type || 'image/jpeg' };
  const uploadTask = uploadBytesResumable(storageRef, blob, metadata);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.(progress);
      },
      (error) => {
        console.error('[uploadImage] Upload failed:', error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        } catch (error) {
          console.error('[uploadImage] Failed to get download URL:', error);
          reject(error);
        }
      }
    );
  });
};

export const deleteImage = async (path: string): Promise<void> => {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('[deleteImage] Failed to delete:', path, error);
  }
};

export const getImageURL = async (path: string): Promise<string> => {
  try {
    const storageRef = ref(storage, path);
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.error('[getImageURL] Failed to get URL:', path, error);
    return '';
  }
};
