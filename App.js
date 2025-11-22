import React from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Text, TextInput } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { EventsProvider } from './src/context/EventsContext';
import { CollectionsProvider } from './src/context/CollectionsContext';
import { AvailabilityProvider } from './src/context/AvailabilityContext';
import LandingScreen from './src/screens/Landing';
import AuthScreen from './src/screens/Auth';
import VerifyEmailScreen from './src/screens/VerifyEmail';
import OnboardingScreen from './src/screens/Onboarding';
import EventHubScreen from './src/screens/EventHub';
import CollectionScreen from './src/screens/CollectionScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoadingSpinner from './src/components/common/LoadingSpinner';
import Navigation from './src/components/Navigation';
// Fonts are now loaded on-demand, no need to load all at startup

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
  const navigationRef = useNavigationContainerRef();
  const [currentRouteName, setCurrentRouteName] = React.useState();

  const handleNavReady = () => {
    setCurrentRouteName(navigationRef.getCurrentRoute()?.name);
  };

  const handleStateChange = () => {
    setCurrentRouteName(navigationRef.getCurrentRoute()?.name);
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={handleNavReady}
      onStateChange={handleStateChange}
    >
      {isAuthenticated && isVerified && (
        <Navigation navigationRef={navigationRef} currentRouteName={currentRouteName} />
      )}
      <Stack.Navigator
        initialRouteName={!isAuthenticated ? 'Landing' : isVerified ? 'Onboarding' : 'VerifyEmail'}
        screenOptions={{
          headerShown: false,
        }}
      >
        {!isAuthenticated && (
          <>
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="Auth" component={AuthScreen} />
          </>
        )}
        {isAuthenticated && !isVerified && (
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        )}
        {isAuthenticated && isVerified && (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="EventHub" component={EventHubScreen} />
            <Stack.Screen name="Collection" component={CollectionScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
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

  // Show loading screen while auth is loading
  // Fonts are now loaded on-demand, so no need to wait for them
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <AvailabilityProvider>
      <EventsProvider>
        <CollectionsProvider>
          <AppNavigator />
        </CollectionsProvider>
      </EventsProvider>
    </AvailabilityProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
});

