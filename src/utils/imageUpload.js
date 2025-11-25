/**
 * Image upload utility functions for Firebase Storage
 */
import { Platform } from 'react-native';
import 'react-native-get-random-values'; // Required for crypto in React Native
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { storage } from '../config/firebase';

/**
 * Request permissions for image picker
 */
export const requestImagePickerPermissions = async () => {
  if (Platform.OS !== 'web') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Sorry, we need camera roll permissions to upload photos!');
    }
  }
};

/**
 * Pick an image from the device
 * @returns {Promise<Object|null>} Image picker result or null if cancelled
 */
export const pickImage = async () => {
  try {
    // Request permissions
    await requestImagePickerPermissions();

    // Launch image picker
    // Note: mediaTypes defaults to images, so we can omit it
    // If you need to specify, use: mediaTypes: ImagePicker.MediaTypeOptions?.Images || 'images'
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio for profile pictures
      quality: 1.0, // Get full quality first, we'll compress after resizing
    });

    if (result.canceled) {
      return null;
    }

    return result.assets[0];
  } catch (error) {
    console.error('Error picking image:', error);
    throw error;
  }
};

/**
 * Resize and compress image for faster uploads
 * @param {string} uri - Image URI
 * @param {number} maxSize - Maximum dimension (default: 512 for profile pics)
 * @param {number} quality - Compression quality 0-1 (default: 0.4 for aggressive compression)
 * @returns {Promise<string>} URI of processed image
 */
export const resizeAndCompressImage = async (uri, maxSize = 512, quality = 0.4) => {
  try {
    // Resize to max dimension (maintains aspect ratio)
    // Since profile pictures are already cropped to square, this will make them maxSize x maxSize
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxSize } }], // Resize width to maxSize, height scales proportionally
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    
    return manipResult.uri;
  } catch (error) {
    console.error('Error resizing/compressing image:', error);
    // If manipulation fails, return original URI
    return uri;
  }
};

/**
 * Convert URI to blob (for web)
 * @param {string} uri - File URI
 * @returns {Promise<Blob>}
 */
const uriToBlob = async (uri) => {
  const response = await fetch(uri);
  return await response.blob();
};


/**
 * Create a timeout promise
 * @param {Promise} promise - Promise to wrap with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise}
 */
const withTimeout = (promise, timeoutMs) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

/**
 * Upload image to Firebase Storage
 * @param {string} uri - Local file URI
 * @param {string} userId - User ID
 * @param {string} path - Storage path (default: 'profile-pictures')
 * @returns {Promise<string>} Download URL of uploaded image
 */
export const uploadImageToFirebase = async (uri, userId, path = 'profile-pictures') => {
  try {
    // Verify user is authenticated
    const { auth } = await import('../config/firebase');
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to upload images');
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${userId}_${timestamp}.jpg`;
    const storagePath = `${path}/${filename}`;

    const storageRef = storage.ref(storagePath);

    const metadata = {
      contentType: 'image/jpeg',
    };

    let uploadTask;
    
    if (Platform.OS === 'web') {
      // For web, use blob
      const blob = await uriToBlob(uri);
      uploadTask = storageRef.put(blob, metadata);
    } else {
      // For React Native, use fetch to get blob from file URI
      // putString doesn't work reliably in React Native, so we use put with Blob
      const response = await fetch(uri);
      const blob = await response.blob();
      uploadTask = storageRef.put(blob, metadata);
    }

    // Wrap upload in a promise to handle completion and errors properly
    const uploadPromise = new Promise((resolve, reject) => {
      uploadTask.on('state_changed', 
        null, // Progress callback (optional)
        (error) => {
          reject(error);
        },
        () => {
          // Upload completed successfully
          resolve();
        }
      );
    });
    
    // Add timeout of 60 seconds for upload
    await withTimeout(uploadPromise, 60000);

    // Get download URL with timeout
    const downloadURL = await withTimeout(storageRef.getDownloadURL(), 10000);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading image to Firebase:', error);
    
    // Check for specific error codes
    if (error.code === 'storage/unauthorized') {
      throw new Error('You do not have permission to upload images. Please check Firebase Storage security rules.');
    }
    if (error.code === 'storage/unknown') {
      throw new Error('Upload failed. Please check Firebase Storage is enabled and security rules allow uploads.');
    }
    if (error.message && error.message.includes('timed out')) {
      throw new Error('Upload timed out. Please check your connection and try again.');
    }
    
    throw new Error(error.message || 'Failed to upload image. Please try again.');
  }
};

/**
 * Delete image from Firebase Storage
 * @param {string} url - Firebase Storage URL
 * @returns {Promise<void>}
 */
export const deleteImageFromFirebase = async (url) => {
  try {
    // Extract path from URL
    const urlObj = new URL(url);
    const path = decodeURIComponent(urlObj.pathname.split('/o/')[1]?.split('?')[0] || '');
    
    if (!path) {
      console.warn('Could not extract path from URL:', url);
      return;
    }

    const storageRef = storage.ref(path);
    await storageRef.delete();
  } catch (error) {
    // Don't log as error if file doesn't exist - this is expected in some cases
    if (error.code === 'storage/object-not-found') {
      // File already deleted or doesn't exist - this is fine
      return;
    }
    // Only log actual errors (permission issues, etc.)
    console.warn('Error deleting image from Firebase:', error.message || error);
    // Don't throw - deletion is not critical
  }
};

/**
 * Complete flow: Pick image and upload to Firebase
 * @param {string} userId - User ID
 * @param {number} maxSize - Maximum dimension for resizing (default: 512 for profile pics)
 * @param {number} quality - Compression quality 0-1 (default: 0.4 for aggressive compression)
 * @returns {Promise<string|null>} Download URL or null if cancelled
 */
export const pickAndUploadImage = async (userId, maxSize = 512, quality = 0.4) => {
  try {
    const image = await pickImage();
    if (!image) {
      return null; // User cancelled
    }

    // Resize and compress the image before upload
    const processedUri = await resizeAndCompressImage(image.uri, maxSize, quality);
    
    const downloadURL = await uploadImageToFirebase(processedUri, userId);
    return downloadURL;
  } catch (error) {
    console.error('Error in pickAndUploadImage:', error);
    throw error;
  }
};

