import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Text, TextInput } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { EventsProvider } from './src/context/EventsContext';
import { CollectionsProvider } from './src/context/CollectionsContext';
import RegisterScreen from './src/screens/Register';
import VerifyEmailScreen from './src/screens/VerifyEmail';
import OnboardingScreen from './src/screens/Onboarding';
import HomeScreen from './src/screens/Home';
import EventHubScreen from './src/screens/EventHub';
import CollectionManagementScreen from './src/screens/CollectionManagement';
import UserProfileScreen from './src/screens/UserProfile';
import EventDiscoveryScreen from './src/screens/EventDiscovery';
import LoadingSpinner from './src/components/common/LoadingSpinner';
import Navigation from './src/components/Navigation';

const Stack = createNativeStackNavigator();

const DEFAULT_FONT_FAMILY = 'Graphik';

if (Text.defaultProps == null) {
  Text.defaultProps = {};
}

if (TextInput.defaultProps == null) {
  TextInput.defaultProps = {};
}

const ensureFontFamily = (existingStyle) => {
  if (!existingStyle) {
    return { fontFamily: DEFAULT_FONT_FAMILY };
  }

  if (Array.isArray(existingStyle)) {
    return [...existingStyle, { fontFamily: DEFAULT_FONT_FAMILY }];
  }

  return [existingStyle, { fontFamily: DEFAULT_FONT_FAMILY }];
};

Text.defaultProps.style = ensureFontFamily(Text.defaultProps.style);
TextInput.defaultProps.style = ensureFontFamily(TextInput.defaultProps?.style);

function AppNavigator() {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const isVerified = user?.emailVerified;

  return (
    <NavigationContainer>
      {isAuthenticated && isVerified && <Navigation />}
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {!isAuthenticated && (
          <Stack.Screen name="Register" component={RegisterScreen} />
        )}
        {isAuthenticated && !isVerified && (
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        )}
        {isAuthenticated && isVerified && (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
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
      <StatusBar style="auto" />
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <EventsProvider>
      <CollectionsProvider>
        <AppNavigator />
      </CollectionsProvider>
    </EventsProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

