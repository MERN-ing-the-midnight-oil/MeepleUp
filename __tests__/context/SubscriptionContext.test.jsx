import React from 'react';
import { render } from '@testing-library/react';

// Mock Firebase config so SubscriptionContext can load without env vars
jest.mock('../../src/config/firebase', () => ({ firebaseInitError: null }));

// Mock AuthContext so useSubscription's provider chain doesn't need real auth
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));

// Mock subscription service
jest.mock('../../src/services/subscriptionService', () => ({
  initializePurchases: jest.fn(() => Promise.resolve({ success: true })),
  disconnectPurchases: jest.fn(),
  getAvailableProducts: jest.fn(() => Promise.resolve([])),
  getPurchaseHistory: jest.fn(() => Promise.resolve([])),
  purchaseSubscription: jest.fn(),
  restorePurchases: jest.fn(),
  verifySubscriptionReceipt: jest.fn(),
  getUserSubscription: jest.fn(() => Promise.resolve(null)),
  isSubscriptionActive: jest.fn(() => false),
  setupPurchaseListener: jest.fn(() => () => {}),
  updateUserSubscription: jest.fn(),
}));

const { useSubscription } = require('../../src/context/SubscriptionContext');

describe('SubscriptionContext', () => {
  it('useSubscription throws when used outside SubscriptionProvider', () => {
    const Component = () => {
      useSubscription();
      return null;
    };
    expect(() => render(<Component />)).toThrow(
      'useSubscription must be used within a SubscriptionProvider'
    );
  });
});
