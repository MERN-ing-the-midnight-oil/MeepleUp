import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EventsProvider } from './context/EventsContext';
import { CollectionsProvider } from './context/CollectionsContext';
import Navigation from './components/Navigation';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import EventHub from './screens/EventHub';
import CollectionManagement from './screens/CollectionManagement';
import UserProfile from './screens/UserProfile';
import EventDiscovery from './screens/EventDiscovery';

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
  
  return !isAuthenticated ? children : <Navigate to="/home" replace />;
};

const AppContent = () => {
  return (
    <Router>
      <Navigation />
      <Routes>
        <Route
          path="/"
          element={
            <PublicRoute>
              <Onboarding />
            </PublicRoute>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
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
          path="/collection"
          element={
            <ProtectedRoute>
              <CollectionManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <UserProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/discover"
          element={
            <ProtectedRoute>
              <EventDiscovery />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Router>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <EventsProvider>
        <CollectionsProvider>
          <AppContent />
        </CollectionsProvider>
      </EventsProvider>
    </AuthProvider>
  );
};

export default App;