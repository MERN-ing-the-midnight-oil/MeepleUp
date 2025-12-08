import { Platform } from 'react-native';

/**
 * Unified navigation hook that works on both web and mobile
 * On web: uses react-router-dom's useNavigate
 * On mobile: uses React Navigation's useNavigation
 */
export const useUnifiedNavigation = () => {
  if (Platform.OS === 'web') {
    try {
      const { useNavigate } = require('react-router-dom');
      const navigate = useNavigate();
      return (path) => {
        navigate(path);
      };
    } catch (e) {
      // react-router-dom not available
      return () => {};
    }
  } else {
    // React Native - try to use React Navigation
    try {
      const { useNavigation } = require('@react-navigation/native');
      const navigation = useNavigation();
      return (path) => {
        // Convert web paths to React Navigation routes
        if (path.startsWith('/event/')) {
          const eventId = path.replace('/event/', '');
          navigation.navigate('EventHub', { eventId });
        } else if (path === '/collection') {
          navigation.navigate('Collection');
        } else if (path === '/profile') {
          navigation.navigate('Profile');
        } else if (path === '/events') {
          navigation.navigate('Onboarding');
        } else {
          // Default navigation
          navigation.navigate(path.replace('/', '') || 'Onboarding');
        }
      };
    } catch (e) {
      // React Navigation not available
      return () => {};
    }
  }
};

