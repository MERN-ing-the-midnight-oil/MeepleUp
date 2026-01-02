import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator, Alert } from 'react-native';
import { Platform } from 'react-native';
import Button from './common/Button';
import { theme } from '../utils/theme';
import {
  getMeepleupProduct,
  purchaseMeepleupCreation,
  initializePurchases,
} from '../services/meepleupPurchaseService';
import { initializePurchases as initIAP } from '../services/subscriptionService';

/**
 * Modal component for purchasing meepleup creation
 * Shows product information and handles purchase flow
 */
const MeepleupPurchaseModal = ({ visible, onClose, onPurchaseComplete, userId }) => {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      loadProduct();
    }
  }, [visible]);

  const loadProduct = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Initialize IAP connection
      await initIAP();
      
      // Get product information
      const result = await getMeepleupProduct();
      
      if (result.success && result.product) {
        setProduct(result.product);
      } else {
        setError(result.error || 'Failed to load product information');
      }
    } catch (err) {
      console.error('Error loading meepleup product:', err);
      setError(err.message || 'Failed to load product information');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!userId) {
      Alert.alert('Error', 'You must be signed in to make a purchase');
      return;
    }

    setPurchasing(true);
    setError(null);

    try {
      const result = await purchaseMeepleupCreation(userId);
      
      if (result.success) {
        // Purchase initiated - the purchase listener in EventsContext will handle verification
        // Wait a moment for the purchase to process
        setTimeout(() => {
          setPurchasing(false);
          onPurchaseComplete();
        }, 1000);
      } else if (result.cancelled) {
        setPurchasing(false);
        // User cancelled, just close
      } else {
        setError(result.error || 'Purchase failed');
        setPurchasing(false);
      }
    } catch (err) {
      console.error('Error initiating purchase:', err);
      setError(err.message || 'Purchase failed');
      setPurchasing(false);
    }
  };

  const handleClose = () => {
    if (!purchasing) {
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Create Your MeepleUp</Text>
          <Text style={styles.description}>
            Unlock the ability to create and organize your own MeepleUp events.
            This is a one-time purchase that allows you to create unlimited MeepleUps.
          </Text>

          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.meepleRed} />
              <Text style={styles.loadingText}>Loading product information...</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <Button
                label="Retry"
                onPress={loadProduct}
                variant="outline"
                style={styles.retryButton}
              />
            </View>
          )}

          {product && !loading && !error && (
            <>
              <View style={styles.productInfo}>
                <Text style={styles.productTitle}>{product.title}</Text>
                {product.description && (
                  <Text style={styles.productDescription}>{product.description}</Text>
                )}
                <Text style={styles.productPrice}>{product.priceString}</Text>
              </View>

              <View style={styles.actions}>
                <Button
                  label={purchasing ? 'Processing...' : `Purchase for ${product.priceString}`}
                  onPress={handlePurchase}
                  disabled={purchasing}
                  style={styles.purchaseButton}
                />
                <Button
                  label="Cancel"
                  onPress={handleClose}
                  variant="outline"
                  disabled={purchasing}
                  style={styles.cancelButton}
                />
              </View>
            </>
          )}

          {!product && !loading && !error && (
            <View style={styles.actions}>
              <Button
                label="Close"
                onPress={handleClose}
                variant="outline"
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  title: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.error + '10',
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.fontSize.sm,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: theme.spacing.sm,
  },
  productInfo: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.woodLight + '20',
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.xl,
    alignItems: 'center',
  },
  productTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  productDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  productPrice: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
  },
  actions: {
    gap: theme.spacing.md,
  },
  purchaseButton: {
    marginBottom: theme.spacing.sm,
  },
  cancelButton: {
    marginTop: theme.spacing.sm,
  },
});

export default MeepleupPurchaseModal;


