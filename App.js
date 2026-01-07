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
import BrowseAndProposeScreen from './src/screens/BrowseAndProposeScreen';
import CollectionScreen from './src/screens/CollectionScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoadingSpinner from './src/components/common/LoadingSpinner';
import Navigation from './src/components/Navigation';
import AnimatedBackground from './src/components/AnimatedBackground';
import ErrorBoundary from './src/components/ErrorBoundary';
import { ToastProvider } from './src/components/common/Toast';
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

// Screen wrapper components to avoid inline functions
const LandingWrapper = () => (
  <AnimatedBackground>
    <LandingScreen />
  </AnimatedBackground>
);

const AuthWrapper = () => (
  <AnimatedBackground>
    <AuthScreen />
  </AnimatedBackground>
);

// Wrapper components with ErrorBoundary to avoid inline functions
const OnboardingWrapper = () => (
  <ErrorBoundary name="Onboarding">
    <OnboardingScreen />
  </ErrorBoundary>
);

const EventHubWrapper = (props) => (
  <ErrorBoundary name="EventHub">
    <EventHubScreen {...props} />
  </ErrorBoundary>
);

const BrowseAndProposeWrapper = (props) => (
  <ErrorBoundary name="BrowseAndPropose">
    <BrowseAndProposeScreen {...props} />
  </ErrorBoundary>
);

const CollectionWrapper = () => (
  <ErrorBoundary name="Collection">
    <CollectionScreen />
  </ErrorBoundary>
);

const ProfileWrapper = () => (
  <ErrorBoundary name="Profile">
    <ProfileScreen />
  </ErrorBoundary>
);

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
            <Stack.Screen 
              name="Landing" 
              component={LandingWrapper} 
            />
            <Stack.Screen 
              name="Auth" 
              component={AuthWrapper} 
            />
          </>
        )}
        {isAuthenticated && !isVerified && (
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        )}
        {isAuthenticated && isVerified && (
          <>
            <Stack.Screen 
              name="Onboarding" 
              component={OnboardingWrapper} 
            />
            <Stack.Screen 
              name="EventHub" 
              component={EventHubWrapper} 
            />
            <Stack.Screen 
              name="BrowseAndPropose" 
              component={BrowseAndProposeWrapper} 
            />
            <Stack.Screen 
              name="Collection" 
              component={CollectionWrapper} 
            />
            <Stack.Screen 
              name="Profile" 
              component={ProfileWrapper} 
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary name="App Root">
      <AuthProvider>
        <StatusBar style="auto" />
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
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
    <ErrorBoundary name="AppContent">
      <ToastProvider>
        <AvailabilityProvider>
          <EventsProvider>
            <CollectionsProvider>
              <AppNavigator />
            </CollectionsProvider>
          </EventsProvider>
        </AvailabilityProvider>
      </ToastProvider>
    </ErrorBoundary>
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

