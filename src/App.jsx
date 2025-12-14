import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EventsProvider } from './context/EventsContext';
import { CollectionsProvider } from './context/CollectionsContext';
import { AvailabilityProvider } from './context/AvailabilityContext';
import WebNavigation from './components/WebNavigation';
import ParallaxBackground from './components/ParallaxBackground';
import Onboarding from './screens/Onboarding';
import EventsScreen from './screens/EventsScreen';
import EventHub from './screens/EventHub';
import BrowseAndProposeScreen from './screens/BrowseAndProposeScreen';
import CollectionScreen from './screens/CollectionScreen';
import ProfileScreen from './screens/ProfileScreen';

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
          path="/events"
          element={
            <ProtectedRoute>
              <ParallaxBackground>
                <EventsScreen />
              </ParallaxBackground>
            </ProtectedRoute>
          }
        />
        <Route
          path="/event/:eventId"
          element={
            <ProtectedRoute>
              <ParallaxBackground>
                <EventHub />
              </ParallaxBackground>
            </ProtectedRoute>
          }
        />
        <Route
          path="/event/:eventId/browse/:dateIndex"
          element={
            <ProtectedRoute>
              <ParallaxBackground>
                <BrowseAndProposeScreen />
              </ParallaxBackground>
            </ProtectedRoute>
          }
        />
        <Route
          path="/collection"
          element={
            <ProtectedRoute>
              <ParallaxBackground>
                <CollectionScreen />
              </ParallaxBackground>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ParallaxBackground>
                <ProfileScreen />
              </ParallaxBackground>
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
            <AppContent />
          </CollectionsProvider>
        </EventsProvider>
      </AvailabilityProvider>
    </AuthProvider>
  );
};

export default App;