/**
 * MeepleUp Purchase Service
 * Handles one-time in-app purchases for creating meepleups
 * 
 * This service provides a unified interface for managing one-time purchases
 * across iOS (StoreKit) and Android (Google Play Billing).
 * It uses expo-in-app-purchases for cross-platform support.
 */

import * as InAppPurchases from 'expo-in-app-purchases';
import { Platform } from 'react-native';
import { db, functions } from '../config/firebase';
import firebase from '../config/firebase';

// Product IDs for meepleup creation - these must match your App Store Connect and Google Play Console configurations
export const MEEPLEUP_PURCHASE_PRODUCTS = {
  // iOS product ID (from App Store Connect)
  ios: 'com.rhyssmoker.meepleup.create', // Replace with your actual product ID
  // Android product ID (from Google Play Console)
  android: 'com.meepleup.app.create',   // Replace with your actual product ID
};

// Get product ID for current platform
export const getMeepleupProductId = () => {
  return Platform.OS === 'ios' ? MEEPLEUP_PURCHASE_PRODUCTS.ios : MEEPLEUP_PURCHASE_PRODUCTS.android;
};

/**
 * Get available meepleup creation product from the store
 */
export const getMeepleupProduct = async () => {
  try {
    if (Platform.OS === 'web') {
      return { success: false, product: null, error: 'Web platform not supported' };
    }

    const productId = getMeepleupProductId();
    const { results } = await InAppPurchases.getProductsAsync([productId]);
    
    if (results.length === 0) {
      return { success: false, product: null, error: 'Product not found in store' };
    }

    const product = results[0];
    return {
      success: true,
      product: {
        productId: product.productId,
        title: product.title,
        description: product.description,
        price: product.price,
        currency: product.currencyCode || 'USD',
        priceString: product.priceString,
        type: product.type,
      },
    };
  } catch (error) {
    console.error('Error fetching meepleup product:', error);
    return { success: false, product: null, error: error.message };
  }
};

/**
 * Purchase meepleup creation
 * @param {string} userId - The current user's ID for verification
 */
export const purchaseMeepleupCreation = async (userId) => {
  try {
    if (Platform.OS === 'web') {
      return { success: false, error: 'Web platform not supported' };
    }

    const productId = getMeepleupProductId();

    // Initiate the purchase
    await InAppPurchases.purchaseItemAsync(productId);

    // Note: The actual purchase result will come through the purchase update listener
    // This function just initiates the purchase flow
    return { success: true, message: 'Purchase initiated' };
  } catch (error) {
    console.error('Error purchasing meepleup creation:', error);
    
    // Handle specific error codes
    if (error.code === 'E_USER_CANCELLED') {
      return { success: false, error: 'Purchase was cancelled', cancelled: true };
    }
    
    return { success: false, error: error.message || 'Purchase failed' };
  }
};

/**
 * Verify meepleup creation purchase receipt with backend
 * This should be called after a purchase to verify it's legitimate
 * @param {Object} purchase - The purchase object from the store
 * @param {string} userId - The current user's ID
 */
export const verifyMeepleupPurchaseReceipt = async (purchase, userId) => {
  try {
    if (!purchase || !userId) {
      return { success: false, error: 'Missing purchase or user ID' };
    }

    // Call Firebase Function to verify the receipt
    let verifyFunction;
    try {
      // Try to use exported functions instance first
      if (functions) {
        verifyFunction = functions.httpsCallable('verifyMeepleupPurchase');
      } else if (firebase.functions) {
        // Fallback to firebase.functions()
        verifyFunction = firebase.functions().httpsCallable('verifyMeepleupPurchase');
      } else {
        throw new Error('Firebase Functions not initialized');
      }
    } catch (error) {
      console.warn('Firebase Functions not available:', error);
    }
    
    if (!verifyFunction) {
      // Fallback: Store purchase info in Firestore for manual verification
      console.warn('Firebase Functions not available, storing purchase for manual verification');
      await storeMeepleupPurchaseLocally(purchase, userId);
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
      // Record the purchase in Firestore
      await recordMeepleupPurchase(userId, {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        platform: Platform.OS,
        verified: true,
        purchasedAt: new Date(),
      });

      return {
        success: true,
        verified: true,
        purchase: result.data.purchase,
      };
    } else {
      return { success: false, error: result.data.error || 'Verification failed' };
    }
  } catch (error) {
    console.error('Error verifying meepleup purchase:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Store purchase locally in Firestore (for manual verification if needed)
 */
const storeMeepleupPurchaseLocally = async (purchase, userId) => {
  try {
    if (!db) return;

    const purchaseRef = db.collection('meepleupPurchases').doc();
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
    console.error('Error storing meepleup purchase locally:', error);
  }
};

/**
 * Record verified meepleup purchase in Firestore
 */
export const recordMeepleupPurchase = async (userId, purchaseData) => {
  try {
    if (!db || !userId) return { success: false, error: 'Database or user ID missing' };

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    const meepleupPurchases = userData.meepleupPurchases || [];
    
    // Add new purchase to the array
    meepleupPurchases.push({
      ...purchaseData,
      purchasedAt: firebase.firestore.Timestamp.fromDate(
        purchaseData.purchasedAt || new Date()
      ),
      createdAt: firebase.firestore.Timestamp.now(),
    });

    await userRef.update({
      meepleupPurchases,
      updatedAt: firebase.firestore.Timestamp.now(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error recording meepleup purchase:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Check if user has purchased meepleup creation
 * This checks both local purchase history and Firestore records
 */
export const hasPurchasedMeepleupCreation = async (userId) => {
  try {
    // First check Firestore for verified purchases
    if (db && userId) {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const purchases = userData.meepleupPurchases || [];
        
        // Check if there's at least one verified purchase
        const verifiedPurchases = purchases.filter(p => p.verified === true);
        if (verifiedPurchases.length > 0) {
          return { hasPurchase: true, source: 'firestore' };
        }
      }
    }

    // Also check local purchase history (for cases where verification might be pending)
    if (Platform.OS !== 'web') {
      try {
        const { results } = await InAppPurchases.getPurchaseHistoryAsync();
        const productId = getMeepleupProductId();
        const hasLocalPurchase = results.some(
          purchase => purchase.productId === productId
        );
        
        if (hasLocalPurchase) {
          return { hasPurchase: true, source: 'local', needsVerification: true };
        }
      } catch (error) {
        console.warn('Error checking local purchase history:', error);
      }
    }

    return { hasPurchase: false };
  } catch (error) {
    console.error('Error checking meepleup purchase status:', error);
    return { hasPurchase: false, error: error.message };
  }
};

/**
 * Set up purchase update listener for meepleup creation
 * This should be called when the app starts to listen for purchase updates
 * @param {Function} callback - Callback function to handle purchase updates
 */
export const setupMeepleupPurchaseListener = (callback) => {
  if (Platform.OS === 'web') {
    return () => {}; // Return no-op unsubscribe function
  }

  const productId = getMeepleupProductId();
  
  const subscription = InAppPurchases.setPurchaseListener(({ responseCode, results, errorCode }) => {
    if (responseCode === InAppPurchases.IAPResponseCode.OK) {
      // Filter for meepleup creation purchases only
      const meepleupPurchases = results.filter(purchase => purchase.productId === productId);
      
      if (meepleupPurchases.length > 0) {
        meepleupPurchases.forEach(purchase => {
          if (purchase.acknowledged) {
            // Purchase already acknowledged, just notify
            callback({ type: 'purchase', purchase, acknowledged: true });
          } else {
            // New purchase, needs acknowledgment and verification
            callback({ type: 'purchase', purchase, acknowledged: false });
          }
        });
      }
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

/**
 * Acknowledge a purchase (required for consumable products on Android)
 */
export const acknowledgeMeepleupPurchase = async (purchase) => {
  try {
    if (Platform.OS === 'web') {
      return { success: true };
    }

    if (purchase.acknowledged) {
      return { success: true, alreadyAcknowledged: true };
    }

    await InAppPurchases.finishTransactionAsync(purchase, true);
    return { success: true };
  } catch (error) {
    console.error('Error acknowledging meepleup purchase:', error);
    return { success: false, error: error.message };
  }
};


