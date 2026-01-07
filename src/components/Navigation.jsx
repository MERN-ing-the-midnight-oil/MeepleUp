import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import GearIcon from './GearIcon';
import { useResponsive, getResponsiveValue } from '../utils/responsive';
import { theme } from '../utils/theme';

// React Native Navigation Component
const ReactNativeNavigation = ({ navigationRef, currentRouteName }) => {
  const { isAuthenticated, isEmailVerified } = useAuth();
  const { width } = useWindowDimensions();
  const { isMobile, isTablet, isDesktop } = useResponsive();

  if (!isAuthenticated || !isEmailVerified) {
    return null;
  }

  const handleNavigate = (routeName) => {
    navigationRef?.current?.navigate(routeName);
  };

  const isActive = (routeName) => {
    // Special handling for MeepleUps tab - it uses Onboarding route
    if (routeName === 'Onboarding' && currentRouteName === 'Onboarding') {
      return true;
    }
    return currentRouteName === routeName;
  };

  const navItems = [
    { name: 'MeepleUps', route: 'Onboarding' },
    { name: 'List/Import', route: 'Collection' },
    { name: 'Profile', route: 'Profile', showGear: true },
  ];

  // Responsive values
  const paddingTop = getResponsiveValue({ xs: 40, md: 44, lg: 48 }, width);
  const paddingHorizontal = getResponsiveValue({ xs: 20, md: 24, lg: 32 }, width);
  const paddingBottom = getResponsiveValue({ xs: 2, md: 3, lg: 4 }, width);
  const navLinkPaddingVertical = getResponsiveValue({ xs: 8, md: 10, lg: 12 }, width);
  const navLinkPaddingHorizontal = getResponsiveValue({ xs: 12, md: 16, lg: 20 }, width);
  const navLinkMarginRight = getResponsiveValue({ xs: 4, md: 6, lg: 8 }, width);
  const inactiveFontSize = getResponsiveValue({ xs: 14, md: 15, lg: 16 }, width);
  const activeFontSize = getResponsiveValue({ xs: 18, md: 20, lg: 22 }, width);
  const borderBottomWidth = getResponsiveValue({ xs: 4, md: 4, lg: 5 }, width);
  const gearIconSize = getResponsiveValue({ xs: 14, md: 16, lg: 18 }, width);
  const activeGearIconSize = getResponsiveValue({ xs: 18, md: 20, lg: 22 }, width);

  const styles = StyleSheet.create({
    container: {
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: '#e0e0e0',
      paddingTop,
    },
    navContent: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal,
      paddingBottom,
    },
    navLinks: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    navLink: {
      paddingVertical: navLinkPaddingVertical,
      paddingHorizontal: navLinkPaddingHorizontal,
      marginRight: navLinkMarginRight,
      minHeight: 44, // Better touch target on mobile
    },
    navLinkActive: {
      borderBottomWidth,
      borderBottomColor: '#dc2626',
    },
    navLinkText: {
      fontSize: inactiveFontSize,
      color: '#666',
    },
    navLinkTextActive: {
      color: '#dc2626',
      fontWeight: 'bold',
      fontSize: activeFontSize,
    },
    navLinkContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.navContent}>
        <View style={styles.navLinks}>
          {navItems.map((item) => (
            <Pressable
              key={item.route}
              onPress={() => handleNavigate(item.route)}
              style={[
                styles.navLink,
                isActive(item.route) && styles.navLinkActive,
              ]}
            >
              <View style={styles.navLinkContent}>
                <Text
                  style={[
                    styles.navLinkText,
                    isActive(item.route) && styles.navLinkTextActive,
                  ]}
                >
                  {item.name}
                </Text>
                {item.showGear && (
                  <>
                    <Text
                      style={[
                        styles.navLinkText,
                        isActive(item.route) && styles.navLinkTextActive,
                      ]}
                    >
                      {' / '}
                    </Text>
                    <GearIcon
                      size={isActive(item.route) ? activeGearIconSize : gearIconSize}
                      color={isActive(item.route) ? '#dc2626' : '#666'}
                    />
                  </>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
};

// Main Navigation component - React Native only
// For web, a separate component should be used (see src/App.jsx)
const Navigation = (props) => {
  // Only render if navigationRef is provided (React Native)
  if (props.navigationRef) {
    return <ReactNativeNavigation {...props} />;
  }
  
  // For web, return null (web uses a different navigation setup)
  return null;
};

export default Navigation;
