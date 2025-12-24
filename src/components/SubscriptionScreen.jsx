/**
 * Subscription Screen
 * Displays available subscription plans and allows users to purchase or manage subscriptions
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, Alert } from 'react-native';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './common/LoadingSpinner';
import { SUBSCRIPTION_PRODUCTS } from '../services/subscriptionService';

const SubscriptionScreen = () => {
  const { user } = useAuth();
  const {
    products,
    subscription,
    subscriptionStatus,
    hasActiveSubscription,
    loading,
    purchasing,
    error,
    purchase,
    restore,
    refresh,
    clearError,
  } = useSubscription();

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
      clearError();
    }
  }, [error, clearError]);

  const handlePurchase = async (productId) => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please sign in to purchase a subscription.');
      return;
    }

    if (purchasing) {
      return;
    }

    try {
      setSelectedProduct(productId);
      const result = await purchase(productId);
      
      if (result.cancelled) {
        // User cancelled - no need to show error
        return;
      }

      if (result.success) {
        // Purchase initiated - the listener will handle completion
        Alert.alert(
          'Purchase Initiated',
          'Your purchase is being processed. You will be notified when it completes.',
        );
      }
    } catch (err) {
      Alert.alert('Purchase Failed', err.message || 'An error occurred during purchase.');
    } finally {
      setSelectedProduct(null);
    }
  };

  const handleRestore = async () => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please sign in to restore purchases.');
      return;
    }

    setRestoring(true);
    try {
      const result = await restore();
      if (result.success) {
        if (result.purchases && result.purchases.length > 0) {
          Alert.alert('Success', 'Your purchases have been restored.');
          await refresh();
        } else {
          Alert.alert('No Purchases Found', 'No previous purchases were found to restore.');
        }
      }
    } catch (err) {
      Alert.alert('Restore Failed', err.message || 'Failed to restore purchases.');
    } finally {
      setRestoring(false);
    }
  };

  const getProductId = (type) => {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    return SUBSCRIPTION_PRODUCTS[platform][type];
  };

  const monthlyProduct = products.find(p => p.productId === getProductId('monthly'));
  const yearlyProduct = products.find(p => p.productId === getProductId('yearly'));

  const getStatusText = () => {
    switch (subscriptionStatus) {
      case 'active':
        return 'Active';
      case 'expired':
        return 'Expired';
      case 'cancelled':
        return 'Cancelled';
      case 'pending':
        return 'Pending Verification';
      default:
        return 'No Subscription';
    }
  };

  const getStatusColor = () => {
    switch (subscriptionStatus) {
      case 'active':
        return '#4CAF50';
      case 'expired':
        return '#FF9800';
      case 'cancelled':
        return '#F44336';
      case 'pending':
        return '#2196F3';
      default:
        return '#757575';
    }
  };

  if (loading && products.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Subscription Plans</Text>
        <Text style={styles.subtitle}>Choose the plan that works best for you</Text>
      </View>

      {hasActiveSubscription && (
        <View style={[styles.statusCard, { borderColor: getStatusColor() }]}>
          <Text style={styles.statusLabel}>Current Status</Text>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
          {subscription?.expiresAt && (
            <Text style={styles.expiresText}>
              Expires: {subscription.expiresAt.toDate?.().toLocaleDateString() || 'N/A'}
            </Text>
          )}
        </View>
      )}

      <View style={styles.productsContainer}>
        {monthlyProduct && (
          <View style={styles.productCard}>
            <View style={styles.productHeader}>
              <Text style={styles.productTitle}>Monthly</Text>
              <Text style={styles.productPrice}>{monthlyProduct.priceString}</Text>
            </View>
            <Text style={styles.productDescription}>{monthlyProduct.description}</Text>
            <TouchableOpacity
              style={[
                styles.purchaseButton,
                (purchasing && selectedProduct === monthlyProduct.productId) && styles.purchaseButtonDisabled,
              ]}
              onPress={() => handlePurchase(monthlyProduct.productId)}
              disabled={purchasing || hasActiveSubscription}
            >
              <Text style={styles.purchaseButtonText}>
                {purchasing && selectedProduct === monthlyProduct.productId
                  ? 'Processing...'
                  : hasActiveSubscription
                  ? 'Current Plan'
                  : 'Subscribe Monthly'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {yearlyProduct && (
          <View style={[styles.productCard, styles.productCardFeatured]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>BEST VALUE</Text>
            </View>
            <View style={styles.productHeader}>
              <Text style={styles.productTitle}>Yearly</Text>
              <Text style={styles.productPrice}>{yearlyProduct.priceString}</Text>
            </View>
            <Text style={styles.productDescription}>{yearlyProduct.description}</Text>
            {monthlyProduct && monthlyProduct.price && yearlyProduct.price && (
              <Text style={styles.savingsText}>
                Save {Math.round((1 - yearlyProduct.price / (monthlyProduct.price * 12)) * 100)}% vs monthly
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.purchaseButton,
                styles.purchaseButtonFeatured,
                (purchasing && selectedProduct === yearlyProduct.productId) && styles.purchaseButtonDisabled,
              ]}
              onPress={() => handlePurchase(yearlyProduct.productId)}
              disabled={purchasing || hasActiveSubscription}
            >
              <Text style={[styles.purchaseButtonText, styles.purchaseButtonTextFeatured]}>
                {purchasing && selectedProduct === yearlyProduct.productId
                  ? 'Processing...'
                  : hasActiveSubscription
                  ? 'Current Plan'
                  : 'Subscribe Yearly'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {products.length === 0 && (
          <View style={styles.noProductsContainer}>
            <Text style={styles.noProductsText}>
              No subscription products available at this time.
            </Text>
            <Text style={styles.noProductsSubtext}>
              Please check your App Store or Play Store configuration.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={restoring || purchasing}
        >
          <Text style={styles.restoreButtonText}>
            {restoring ? 'Restoring...' : 'Restore Purchases'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          By subscribing, you agree to our Terms of Service and Privacy Policy.
          Subscriptions will auto-renew unless cancelled at least 24 hours before the end of the current period.
        </Text>
      </View>

      {Platform.OS === 'web' && (
        <View style={styles.webNotice}>
          <Text style={styles.webNoticeText}>
            In-app purchases are only available on iOS and Android devices.
            Please use the mobile app to subscribe.
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  expiresText: {
    fontSize: 14,
    color: '#666',
  },
  productsContainer: {
    marginBottom: 24,
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productCardFeatured: {
    borderWidth: 2,
    borderColor: '#4CAF50',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  productTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  productPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  productDescription: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
    lineHeight: 22,
  },
  savingsText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 16,
  },
  purchaseButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  purchaseButtonFeatured: {
    backgroundColor: '#4CAF50',
  },
  purchaseButtonDisabled: {
    backgroundColor: '#ccc',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  purchaseButtonTextFeatured: {
    color: '#fff',
  },
  noProductsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  noProductsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  noProductsSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  actionsContainer: {
    marginTop: 8,
  },
  restoreButton: {
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  restoreButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
  webNotice: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  webNoticeText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
});

export default SubscriptionScreen;

