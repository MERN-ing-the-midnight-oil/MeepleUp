import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

const Navigation = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  const isActive = (routeName) => {
    return route.name === routeName;
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
        <Text style={styles.brand}>MeepleUp</Text>
        <View style={styles.navLinks}>
          {navItems.map((item) => (
            <TouchableOpacity
              key={item.route}
              onPress={() => navigation.navigate(item.route)}
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
            </TouchableOpacity>
          ))}
          {user && (
            <TouchableOpacity onPress={logout} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  brand: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4a90e2',
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
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
  logoutButton: {
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#4a90e2',
    borderRadius: 4,
  },
  logoutText: {
    color: '#4a90e2',
    fontSize: 14,
  },
});

export default Navigation;
