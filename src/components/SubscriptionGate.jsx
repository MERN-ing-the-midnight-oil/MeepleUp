/**
 * Subscription Gate Component
 * Protects premium features behind a subscription paywall
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSubscription } from '../context/SubscriptionContext';
import { Platform } from 'react-native';

const SubscriptionGate = ({ children, featureName = 'this feature', onNavigateToSubscription }) => {
  const { hasActiveSubscription, loading } = useSubscription();

  const handleNavigate = () => {
    if (onNavigateToSubscription) {
      onNavigateToSubscription();
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/subscription';
    } else {
      // For React Native, you'll need to pass navigation prop or use a navigation hook
      console.warn('Navigation to subscription screen not configured');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!hasActiveSubscription) {
    return (
      <View style={styles.container}>
        <View style={styles.gateContainer}>
          <Text style={styles.gateTitle}>Premium Feature</Text>
          <Text style={styles.gateMessage}>
            {featureName} is available with a MeepleUp Premium subscription.
          </Text>
          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={handleNavigate}
          >
            <Text style={styles.subscribeButtonText}>View Subscription Plans</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return children;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  gateContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  gateMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  subscribeButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SubscriptionGate;

