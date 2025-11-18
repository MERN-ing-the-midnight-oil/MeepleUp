import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '../context/AuthContext';

const Navigation = ({ navigationRef, currentRouteName }) => {
  const { isAuthenticated, isEmailVerified } = useAuth();

  if (!isAuthenticated || !isEmailVerified) {
    return null;
  }

  const handleNavigate = (routeName) => {
    navigationRef?.current?.navigate(routeName);
  };

  const isActive = (routeName) => {
    return currentRouteName === routeName;
  };

  const navItems = [
    { name: 'Home', route: 'Home' },
    { name: 'Discover', route: 'Discover' },
    { name: 'Collection', route: 'Collection' },
    { name: 'Profile', route: 'Profile' },
  ];

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
              <Text
                style={[
                  styles.navLinkText,
                  isActive(item.route) && styles.navLinkTextActive,
                ]}
              >
                {item.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingTop: 40,
  },
  navContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  navLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 4,
  },
  navLinkActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4a90e2',
  },
  navLinkText: {
    fontSize: 14,
    color: '#666',
  },
  navLinkTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
});

export default Navigation;
