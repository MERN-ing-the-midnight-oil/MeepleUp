import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EventsProvider } from './context/EventsContext';
import { CollectionsProvider } from './context/CollectionsContext';
import { AvailabilityProvider } from './context/AvailabilityContext';
import { NotificationProvider } from './context/NotificationContext';
import WebNavigation from './components/WebNavigation';
import ParallaxBackground from './components/ParallaxBackground';
import Onboarding from './screens/Onboarding';
import Auth from './screens/Auth';
import EventsScreen from './screens/EventsScreen';
import EventHub from './screens/EventHub';
import BrowseAndProposeScreen from './screens/BrowseAndProposeScreen';
import CollectionScreen from './screens/CollectionScreen';
import ProfileScreen from './screens/ProfileScreen';

// Wrapper to pass URL search params to Auth component as route params
const AuthWrapper = () => {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'login';
  
  // Create a mock route object for Auth component
  const mockRoute = {
    params: { mode }
  };
  
  return <Auth route={mockRoute} />;
};

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div className="container"><div className="spinner" /></div>;
  }
  
  return isAuthenticated ? children : <Navigate to="/" replace />;
};

// Public route wrapper (redirects to home if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div className="container"><div className="spinner" /></div>;
  }
  
  return !isAuthenticated ? children : <Navigate to="/events" replace />;
};

const AppContent = () => {
  return (
    <Router>
      <WebNavigation />
      <Routes>
        <Route
          path="/"
          element={
            <PublicRoute>
              <ParallaxBackground>
                <Onboarding />
              </ParallaxBackground>
            </PublicRoute>
          }
        />
        <Route
          path="/auth"
          element={
            <PublicRoute>
              <ParallaxBackground>
                <AuthWrapper />
              </ParallaxBackground>
            </PublicRoute>
          }
        />
        <Route
          path="/events"
          element={
            <ProtectedRoute>
              <EventsScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/event/:eventId"
          element={
            <ProtectedRoute>
              <EventHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/event/:eventId/browse/:dateIndex"
          element={
            <ProtectedRoute>
              <BrowseAndProposeScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collection"
          element={
            <ProtectedRoute>
              <CollectionScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfileScreen />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/events" replace />} />
      </Routes>
    </Router>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <AvailabilityProvider>
        <EventsProvider>
          <CollectionsProvider>
            <NotificationProvider>
              <AppContent />
            </NotificationProvider>
          </CollectionsProvider>
        </EventsProvider>
      </AvailabilityProvider>
    </AuthProvider>
  );
};

export default App;