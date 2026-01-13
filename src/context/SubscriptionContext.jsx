/**
 * Subscription Context
 * Manages subscription state and provides subscription-related functions throughout the app
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import {
  initializePurchases,
  disconnectPurchases,
  getAvailableProducts,
  getPurchaseHistory,
  purchaseSubscription,
  restorePurchases,
  verifySubscriptionReceipt,
  getUserSubscription,
  isSubscriptionActive,
  setupPurchaseListener,
  updateUserSubscription,
} from '../services/subscriptionService';

const SubscriptionContext = createContext();

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState(null);

  // Initialize purchases when component mounts
  useEffect(() => {
    let isMounted = true;
    let unsubscribePurchaseListener = null;

    const init = async () => {
      if (Platform.OS === 'web') {
        setLoading(false);
        return;
      }

      setInitializing(true);
      try {
        // Initialize the purchase service
        const initResult = await initializePurchases();
        if (!initResult.success) {
          console.warn('Failed to initialize purchases:', initResult.error);
          if (isMounted) {
            setError(initResult.error);
            setLoading(false);
            setInitializing(false);
          }
          return;
        }

        // Set up purchase listener
        unsubscribePurchaseListener = setupPurchaseListener(async (update) => {
          if (!isMounted || !user) return;

          if (update.type === 'purchase' && !update.acknowledged) {
            // New purchase - verify it
            setPurchasing(true);
            try {
              const verifyResult = await verifySubscriptionReceipt(update.purchase, user.uid);
              if (verifyResult.success && verifyResult.verified) {
                // Reload subscription status
                await loadSubscription();
              } else {
                setError(verifyResult.error || 'Failed to verify purchase');
              }
            } catch (err) {
              console.error('Error handling purchase:', err);
              setError(err.message);
            } finally {
              setPurchasing(false);
            }
          } else if (update.type === 'error') {
            setError(update.error);
          }
        });

        // Load available products
        const productsResult = await getAvailableProducts();
        if (productsResult.success && isMounted) {
          setProducts(productsResult.products);
        }

        // Load user subscription if authenticated
        if (isAuthenticated && user) {
          await loadSubscription();
        }
      } catch (err) {
        console.error('Error initializing subscriptions:', err);
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setInitializing(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
      if (unsubscribePurchaseListener) {
        unsubscribePurchaseListener();
      }
      disconnectPurchases();
    };
  }, []);

  // Load subscription when user changes
  useEffect(() => {
    if (isAuthenticated && user && !loading) {
      loadSubscription();
    } else if (!isAuthenticated) {
      setSubscription(null);
    }
  }, [isAuthenticated, user?.uid]);

  // Load subscription status from Firestore
  const loadSubscription = useCallback(async () => {
    if (!user?.uid) {
      setSubscription(null);
      return;
    }

    try {
      const userSubscription = await getUserSubscription(user.uid);
      setSubscription(userSubscription);
    } catch (err) {
      console.error('Error loading subscription:', err);
      setError(err.message);
    }
  }, [user?.uid]);

  // Purchase a subscription
  const purchase = useCallback(async (productId) => {
    if (!user?.uid) {
      throw new Error('User must be authenticated to purchase');
    }

    if (purchasing) {
      throw new Error('A purchase is already in progress');
    }

    setPurchasing(true);
    setError(null);

    try {
      const result = await purchaseSubscription(productId, user.uid);
      
      if (!result.success) {
        if (result.cancelled) {
          // User cancelled - don't show error
          return { success: false, cancelled: true };
        }
        throw new Error(result.error || 'Purchase failed');
      }

      // Purchase initiated - the listener will handle the result
      return { success: true, message: 'Purchase initiated' };
    } catch (err) {
      const errorMessage = err.message || 'Purchase failed';
      setError(errorMessage);
      throw err;
    } finally {
      // Don't set purchasing to false here - let the listener handle it
      // This allows the UI to show loading state during the purchase flow
    }
  }, [user?.uid, purchasing]);

  // Restore previous purchases
  const restore = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('User must be authenticated to restore purchases');
    }

    setError(null);
    try {
      const result = await restorePurchases();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to restore purchases');
      }

      // Verify each purchase
      if (result.purchases && result.purchases.length > 0) {
        for (const purchase of result.purchases) {
          await verifySubscriptionReceipt(purchase, user.uid);
        }
        // Reload subscription after verification
        await loadSubscription();
      }

      return { success: true, purchases: result.purchases };
    } catch (err) {
      const errorMessage = err.message || 'Restore failed';
      setError(errorMessage);
      throw err;
    }
  }, [user?.uid, loadSubscription]);

  // Check if user has active subscription
  const hasActiveSubscription = useMemo(() => {
    return isSubscriptionActive(subscription);
  }, [subscription]);

  // Get subscription status
  const subscriptionStatus = useMemo(() => {
    if (!subscription) {
      return 'none';
    }

    if (!subscription.verified) {
      return 'pending';
    }

    if (subscription.status === 'active' && isSubscriptionActive(subscription)) {
      return 'active';
    }

    if (subscription.status === 'expired' || !isSubscriptionActive(subscription)) {
      return 'expired';
    }

    if (subscription.status === 'cancelled') {
      return 'cancelled';
    }

    return 'unknown';
  }, [subscription]);

  // Refresh subscription status
  const refresh = useCallback(async () => {
    await loadSubscription();
  }, [loadSubscription]);

  const value = useMemo(() => ({
    // State
    subscription,
    products,
    loading,
    initializing,
    purchasing,
    error,
    
    // Status
    hasActiveSubscription,
    subscriptionStatus,
    
    // Actions
    purchase,
    restore,
    refresh,
    loadSubscription,
    
    // Utilities
    clearError: () => setError(null),
  }), [
    subscription,
    products,
    loading,
    initializing,
    purchasing,
    error,
    hasActiveSubscription,
    subscriptionStatus,
    purchase,
    restore,
    refresh,
    loadSubscription,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
















