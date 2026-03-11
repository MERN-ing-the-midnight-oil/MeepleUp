// Global used by React Native / Expo
global.__DEV__ = true;

// Minimal fetch for Firebase and other libs that require it in Jest
if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
}

// Mock expo modules that are hard to test in Node
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({
      coords: { latitude: 37.7749, longitude: -122.4194 },
    })
  ),
}));
