/**
 * Hook for checking subscription access
 * Provides a simple way to check if user has access to premium features
 */

import { useSubscription } from '../context/SubscriptionContext';

/**
 * Hook to check if user has active subscription
 * @returns {Object} { hasAccess, isLoading, subscriptionStatus }
 */
export const useSubscriptionAccess = () => {
  const { hasActiveSubscription, loading, subscriptionStatus } = useSubscription();

  return {
    hasAccess: hasActiveSubscription,
    isLoading: loading,
    subscriptionStatus,
  };
};

/**
 * Hook to require subscription access
 * Throws an error or returns false if user doesn't have access
 * @param {boolean} throwError - If true, throws error instead of returning false
 * @returns {boolean} true if user has access
 */
export const useRequireSubscription = (throwError = false) => {
  const { hasActiveSubscription, loading } = useSubscription();

  if (loading) {
    return false;
  }

  if (!hasActiveSubscription) {
    if (throwError) {
      throw new Error('This feature requires an active subscription');
    }
    return false;
  }

  return true;
};














