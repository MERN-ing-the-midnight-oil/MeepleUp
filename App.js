import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { EventsProvider } from './src/context/EventsContext';
import { CollectionsProvider } from './src/context/CollectionsContext';
import OnboardingScreen from './src/screens/Onboarding';
import HomeScreen from './src/screens/Home';
import EventHubScreen from './src/screens/EventHub';
import CollectionManagementScreen from './src/screens/CollectionManagement';
import UserProfileScreen from './src/screens/UserProfile';
import EventDiscoveryScreen from './src/screens/EventDiscovery';
import LoadingSpinner from './src/components/common/LoadingSpinner';
import Navigation from './src/components/Navigation';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated && <Navigation />}
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="EventHub" component={EventHubScreen} />
            <Stack.Screen name="Collection" component={CollectionManagementScreen} />
            <Stack.Screen name="Profile" component={UserProfileScreen} />
            <Stack.Screen name="Discover" component={EventDiscoveryScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <EventsProvider>
        <CollectionsProvider>
          <StatusBar style="auto" />
          <AppNavigator />
        </CollectionsProvider>
      </EventsProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

