/**
 * Subscription Service
 * Handles in-app purchases for iOS (StoreKit) and Android (Google Play Billing)
 * 
 * This service provides a unified interface for managing subscriptions across platforms.
 * It uses expo-in-app-purchases for cross-platform support.
 */

import * as InAppPurchases from 'expo-in-app-purchases';
import { Platform } from 'react-native';
import { db, functions } from '../config/firebase';
import firebase from '../config/firebase';

// Subscription product IDs - these must match your App Store Connect and Google Play Console configurations
// Format: platform_productId (e.g., 'monthly_premium', 'yearly_premium')
export const SUBSCRIPTION_PRODUCTS = {
  // iOS product IDs (from App Store Connect)
  ios: {
    monthly: 'com.rhyssmoker.meepleup.monthly', // Replace with your actual product ID
    yearly: 'com.rhyssmoker.meepleup.yearly',   // Replace with your actual product ID
  },
  // Android product IDs (from Google Play Console)
  android: {
    monthly: 'com.meepleup.app.monthly', // Replace with your actual product ID
    yearly: 'com.meepleup.app.yearly',   // Replace with your actual product ID
  },
};

// Get product IDs for current platform
export const getProductIds = () => {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return Object.values(SUBSCRIPTION_PRODUCTS[platform]);
};

/**
 * Initialize the in-app purchase connection
 * Must be called before any purchase operations
 */
export const initializePurchases = async () => {
  try {
    if (Platform.OS === 'web') {
      console.warn('In-app purchases are not supported on web');
      return { success: false, error: 'Web platform not supported' };
    }

    const isAvailable = await InAppPurchases.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, error: 'In-app purchases are not available on this device' };
    }

    // Connect to the store
    await InAppPurchases.connectAsync();
    return { success: true };
  } catch (error) {
    console.error('Error initializing purchases:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Disconnect from the in-app purchase service
 * Should be called when the app is closing or when done with purchases
 */
export const disconnectPurchases = async () => {
  try {
    if (Platform.OS === 'web') {
      return { success: true };
    }
    await InAppPurchases.disconnectAsync();
    return { success: true };
  } catch (error) {
    console.error('Error disconnecting purchases:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get available subscription products from the store
 */
export const getAvailableProducts = async () => {
  try {
    if (Platform.OS === 'web') {
      return { success: false, products: [], error: 'Web platform not supported' };
    }

    const productIds = getProductIds();
    const { results } = await InAppPurchases.getProductsAsync(productIds);
    
    return {
      success: true,
      products: results.map(product => ({
        productId: product.productId,
        title: product.title,
        description: product.description,
        price: product.price,
        currency: product.currencyCode || 'USD',
        priceString: product.priceString,
        type: product.type,
      })),
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { success: false, products: [], error: error.message };
  }
};

/**
 * Get current purchase history for the user
 */
export const getPurchaseHistory = async () => {
  try {
    if (Platform.OS === 'web') {
      return { success: false, purchases: [], error: 'Web platform not supported' };
    }

    const { results } = await InAppPurchases.getPurchaseHistoryAsync();
    
    return {
      success: true,
      purchases: results.map(purchase => ({
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        transactionDate: purchase.transactionDate,
        transactionReceipt: purchase.transactionReceipt,
        acknowledged: purchase.acknowledged,
      })),
    };
  } catch (error) {
    console.error('Error fetching purchase history:', error);
    return { success: false, purchases: [], error: error.message };
  }
};

/**
 * Purchase a subscription product
 * @param {string} productId - The product ID to purchase
 * @param {string} userId - The current user's ID for verification
 */
export const purchaseSubscription = async (productId, userId) => {
  try {
    if (Platform.OS === 'web') {
      return { success: false, error: 'Web platform not supported' };
    }

    // Verify product ID is valid
    const productIds = getProductIds();
    if (!productIds.includes(productId)) {
      return { success: false, error: 'Invalid product ID' };
    }

    // Initiate the purchase
    await InAppPurchases.purchaseItemAsync(productId);

    // Note: The actual purchase result will come through the purchase update listener
    // This function just initiates the purchase flow
    return { success: true, message: 'Purchase initiated' };
  } catch (error) {
    console.error('Error purchasing subscription:', error);
    
    // Handle specific error codes
    if (error.code === 'E_USER_CANCELLED') {
      return { success: false, error: 'Purchase was cancelled', cancelled: true };
    }
    
    return { success: false, error: error.message || 'Purchase failed' };
  }
};

/**
 * Restore previous purchases
 * Useful when user reinstalls the app or switches devices
 */
export const restorePurchases = async () => {
  try {
    if (Platform.OS === 'web') {
      return { success: false, purchases: [], error: 'Web platform not supported' };
    }

    const { results } = await InAppPurchases.getPurchaseHistoryAsync();
    
    return {
      success: true,
      purchases: results.map(purchase => ({
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        transactionDate: purchase.transactionDate,
        transactionReceipt: purchase.transactionReceipt,
      })),
    };
  } catch (error) {
    console.error('Error restoring purchases:', error);
    return { success: false, purchases: [], error: error.message };
  }
};

/**
 * Verify subscription receipt with backend
 * This should be called after a purchase to verify it's legitimate
 * @param {Object} purchase - The purchase object from the store
 * @param {string} userId - The current user's ID
 */
export const verifySubscriptionReceipt = async (purchase, userId) => {
  try {
    if (!purchase || !userId) {
      return { success: false, error: 'Missing purchase or user ID' };
    }

    // Call Firebase Function to verify the receipt
    let verifyFunction;
    try {
      // Try to use exported functions instance first
      if (functions) {
        verifyFunction = functions.httpsCallable('verifySubscription');
      } else if (firebase.functions) {
        // Fallback to firebase.functions()
        verifyFunction = firebase.functions().httpsCallable('verifySubscription');
      } else {
        throw new Error('Firebase Functions not initialized');
      }
    } catch (error) {
      console.warn('Firebase Functions not available:', error);
    }
    
    if (!verifyFunction) {
      // Fallback: Store purchase info in Firestore for manual verification
      console.warn('Firebase Functions not available, storing purchase for manual verification');
      await storePurchaseLocally(purchase, userId);
      return { success: true, verified: false, pending: true };
    }

    const result = await verifyFunction({
      platform: Platform.OS,
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      transactionReceipt: purchase.transactionReceipt,
      userId,
    });

    if (result.data.success) {
      // Update user subscription status in Firestore
      await updateUserSubscription(userId, {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        platform: Platform.OS,
        verified: true,
        expiresAt: result.data.expiresAt,
        status: 'active',
      });

      return {
        success: true,
        verified: true,
        subscription: result.data.subscription,
      };
    } else {
      return { success: false, error: result.data.error || 'Verification failed' };
    }
  } catch (error) {
    console.error('Error verifying subscription:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Store purchase locally in Firestore (for manual verification if needed)
 */
const storePurchaseLocally = async (purchase, userId) => {
  try {
    if (!db) return;

    const purchaseRef = db.collection('subscriptionPurchases').doc();
    await purchaseRef.set({
      userId,
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      transactionReceipt: purchase.transactionReceipt,
      platform: Platform.OS,
      status: 'pending_verification',
      createdAt: firebase.firestore.Timestamp.now(),
    });
  } catch (error) {
    console.error('Error storing purchase locally:', error);
  }
};

/**
 * Update user subscription status in Firestore
 */
export const updateUserSubscription = async (userId, subscriptionData) => {
  try {
    if (!db || !userId) return { success: false, error: 'Database or user ID missing' };

    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      subscription: {
        ...subscriptionData,
        updatedAt: firebase.firestore.Timestamp.now(),
      },
      updatedAt: firebase.firestore.Timestamp.now(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating user subscription:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get user subscription status from Firestore
 */
export const getUserSubscription = async (userId) => {
  try {
    if (!db || !userId) return null;

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data();
    return userData.subscription || null;
  } catch (error) {
    console.error('Error getting user subscription:', error);
    return null;
  }
};

/**
 * Check if subscription is active and valid
 */
export const isSubscriptionActive = (subscription) => {
  if (!subscription || !subscription.verified) {
    return false;
  }

  if (subscription.status !== 'active') {
    return false;
  }

  // Check expiration date if available
  if (subscription.expiresAt) {
    const expiresAt = subscription.expiresAt.toDate ? subscription.expiresAt.toDate() : new Date(subscription.expiresAt);
    if (expiresAt < new Date()) {
      return false;
    }
  }

  return true;
};

/**
 * Set up purchase update listener
 * This should be called when the app starts to listen for purchase updates
 * @param {Function} callback - Callback function to handle purchase updates
 */
export const setupPurchaseListener = (callback) => {
  if (Platform.OS === 'web') {
    return () => {}; // Return no-op unsubscribe function
  }

  const subscription = InAppPurchases.setPurchaseListener(({ responseCode, results, errorCode }) => {
    if (responseCode === InAppPurchases.IAPResponseCode.OK) {
      // Process successful purchases
      results.forEach(purchase => {
        if (purchase.acknowledged) {
          // Purchase already acknowledged, just notify
          callback({ type: 'purchase', purchase, acknowledged: true });
        } else {
          // New purchase, needs acknowledgment and verification
          callback({ type: 'purchase', purchase, acknowledged: false });
        }
      });
    } else if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
      callback({ type: 'cancelled' });
    } else {
      callback({ type: 'error', error: errorCode || 'Unknown error' });
    }
  });

  // Return unsubscribe function
  return () => {
    // Note: expo-in-app-purchases doesn't have an explicit unsubscribe,
    // but we can track the subscription and ignore callbacks
    subscription.remove?.();
  };
};

