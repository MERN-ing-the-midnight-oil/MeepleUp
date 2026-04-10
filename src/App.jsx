import React, { useEffect, useState, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EventsProvider, useEvents } from './context/EventsContext';
import { CollectionsProvider, useCollections } from './context/CollectionsContext';
import { AvailabilityProvider } from './context/AvailabilityContext';
import { NotificationProvider } from './context/NotificationContext';
import { SubscriptionProvider } from './context/SubscriptionProvider';
import WebNavigation from './components/WebNavigation';
import ParallaxBackground from './components/ParallaxBackground';
import Onboarding from './screens/Onboarding';
import Auth from './screens/Auth';
import EventsScreen from './screens/EventsScreen';
import EventHub from './screens/EventHub';
import BrowseAndProposeScreen from './screens/BrowseAndProposeScreen';
import CollectionScreen from './screens/CollectionScreen';
import ProfileScreen from './screens/ProfileScreen';
import SubscriptionScreen from './components/SubscriptionScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/common/Toast';
import { TIMEOUTS } from './utils/constants';
import logger from './utils/logger';

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
    return <main className="container" role="main" aria-live="polite"><div className="spinner" aria-label="Loading" /></main>;
  }
  
  return isAuthenticated ? children : <Navigate to="/" replace />;
};

// Public route wrapper (redirects to home if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <main className="container" role="main" aria-live="polite"><div className="spinner" aria-label="Loading" /></main>;
  }
  
  return !isAuthenticated ? children : <Navigate to="/events" replace />;
};

// Smart redirect component that checks if user is member of exactly one meepleUp
// Also redirects to collection if user has no games
const SmartEventsRedirect = () => {
  const { user } = useAuth();
  const { getUserEvents, loading, events } = useEvents();
  const { getUserCollection, initialised: collectionsInitialised, loading: collectionsLoading } = useCollections();
  const navigate = useNavigate();
  const [hasRedirected, setHasRedirected] = useState(false);
  const [hasFinishedChecking, setHasFinishedChecking] = useState(false);
  const checkTimeoutRef = useRef(null);

  // Log when component mounts
  useEffect(() => {
    if (__DEV__) {
      logger.debug('🚀 [SmartEventsRedirect] Component mounted/rendered');
    }
  }, []);

  useEffect(() => {
    if (__DEV__) {
      logger.debug('🔄 [SmartEventsRedirect] useEffect triggered', { 
        hasRedirected, 
        loading, 
        hasUser: !!user, 
        eventsCount: events.length,
        userId: user?.uid || user?.id,
        collectionsInitialised,
        collectionsLoading
      });
    }
    
    // Don't check again if we've already redirected
    if (hasRedirected) {
      if (__DEV__) {
        logger.debug('⏭️ [SmartEventsRedirect] Already redirected, skipping');
      }
      return;
    }

    // Clear any pending timeout
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = null;
    }

    // Wait for collections to initialize before checking
    if (!collectionsInitialised || collectionsLoading) {
      if (__DEV__) {
        logger.debug('⏳ [SmartEventsRedirect] Still loading collections...');
      }
      return;
    }

    // Wait for events to load and user to be available
    if (loading) {
      if (__DEV__) {
        logger.debug('⏳ [SmartEventsRedirect] Still loading events...');
      }
      return;
    }

    if (!user) {
      if (__DEV__) {
        logger.debug('❌ [SmartEventsRedirect] No user found');
      }
      setHasFinishedChecking(true);
      return;
    }

    const userId = user.uid || user.id;
    if (!userId) {
      if (__DEV__) {
        logger.debug('❌ [SmartEventsRedirect] No userId found');
      }
      setHasFinishedChecking(true);
      return;
    }

    // Check if user has any games in their collection
    const userCollection = getUserCollection(userId);
    const hasGames = userCollection && userCollection.length > 0;
    if (__DEV__) {
      logger.debug('🎮 [SmartEventsRedirect] User collection:', userCollection?.length || 0, 'games');
    }

    // If user has no games, redirect to collection screen
    if (!hasGames) {
      if (__DEV__) {
        logger.debug('📚 [SmartEventsRedirect] User has no games, redirecting to collection');
      }
      setHasRedirected(true);
      setHasFinishedChecking(true);
      navigate('/collection', { replace: true });
      return;
    }

    // Get all events where user is a member
    const userEvents = getUserEvents();
    if (__DEV__) {
      logger.debug('📊 [SmartEventsRedirect] Checking redirect - userEvents:', userEvents.length, 'all events:', events.length);
    }
    
    // Filter to only active events (not archived) - explicitly check for isActive === true
    const activeEvents = userEvents.filter(event => event.isActive === true);
    if (__DEV__) {
      logger.debug('[SmartEventsRedirect] Active events:', activeEvents.length, 'of', userEvents.length, 'total user events');
    }

    // If user is a member of exactly one active meepleUp, redirect to its logistics tab
    if (activeEvents.length === 1) {
      const eventId = activeEvents[0].id;
      if (__DEV__) {
        logger.debug('[SmartEventsRedirect] ✓ Redirecting to event:', eventId, 'from', activeEvents[0].name);
      }
      setHasRedirected(true);
      setHasFinishedChecking(true);
      navigate(`/event/${eventId}`, { replace: true });
      return;
    }

    // If we have events but not exactly one, we're done checking
    if (activeEvents.length !== 1 && (userEvents.length > 0 || events.length > 0)) {
      if (__DEV__) {
        logger.debug('[SmartEventsRedirect] ✗ Not redirecting - user has', activeEvents.length, 'active events');
      }
      setHasFinishedChecking(true);
      return;
    }

    // If events haven't loaded yet, wait a bit for Firestore sync
    if (activeEvents.length === 0 && events.length === 0 && !loading) {
      if (__DEV__) {
        logger.debug('[SmartEventsRedirect] Waiting for Firestore sync...');
      }
      checkTimeoutRef.current = setTimeout(() => {
        const delayedUserEvents = getUserEvents();
        const delayedActiveEvents = delayedUserEvents.filter(event => event.isActive === true);
        if (__DEV__) {
          logger.debug('[SmartEventsRedirect] Delayed check - active events:', delayedActiveEvents.length, 'of', delayedUserEvents.length, 'total user events');
        }
        
        if (delayedActiveEvents.length === 1) {
          const eventId = delayedActiveEvents[0].id;
          if (__DEV__) {
            logger.debug('[SmartEventsRedirect] ✓ Redirecting to event after Firestore sync:', eventId);
          }
          setHasRedirected(true);
          setHasFinishedChecking(true);
          navigate(`/event/${eventId}`, { replace: true });
        } else {
          if (__DEV__) {
            logger.debug('[SmartEventsRedirect] ✗ Not redirecting after delay - user has', delayedActiveEvents.length, 'active events');
          }
          setHasFinishedChecking(true);
        }
        checkTimeoutRef.current = null;
      }, TIMEOUTS.FIRESTORE_SYNC_MS); // Wait for Firestore to sync

      return () => {
        if (checkTimeoutRef.current) {
          clearTimeout(checkTimeoutRef.current);
          checkTimeoutRef.current = null;
        }
      };
    }
  }, [user, getUserEvents, loading, navigate, events, hasRedirected, getUserCollection, collectionsInitialised, collectionsLoading]);

  // Show loading spinner while loading events/collections or checking
  if (loading || collectionsLoading || !collectionsInitialised || (!hasFinishedChecking && !hasRedirected && user)) {
    if (__DEV__) {
      logger.debug('⏳ [SmartEventsRedirect] Showing loading spinner');
    }
    return <main className="container" role="main" aria-live="polite"><div className="spinner" aria-label="Loading" /></main>;
  }

  // If we redirected, show a brief loading state while navigation happens
  if (hasRedirected) {
    if (__DEV__) {
      logger.debug('✅ [SmartEventsRedirect] Redirected, showing loading spinner');
    }
    return <main className="container" role="main" aria-live="polite"><div className="spinner" aria-label="Loading" /></main>;
  }

  // Otherwise, show the events screen
  if (__DEV__) {
    logger.debug('📋 [SmartEventsRedirect] Showing EventsScreen (no redirect)');
  }
  return <EventsScreen />;
};

const AppContent = () => {
  return (
    <Router>
      <WebNavigation />
      <main role="main">
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
                <ErrorBoundary name="EventsScreen">
                  <SmartEventsRedirect />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/event/:eventId"
            element={
              <ProtectedRoute>
                <ErrorBoundary name="EventHub">
                  <EventHub />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/event/:eventId/browse/:dateIndex"
            element={
              <ProtectedRoute>
                <ErrorBoundary name="BrowseAndPropose">
                  <BrowseAndProposeScreen />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/collection"
            element={
              <ProtectedRoute>
                <ErrorBoundary name="Collection">
                  <CollectionScreen />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ErrorBoundary name="Profile">
                  <ProfileScreen />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription"
            element={
              <ProtectedRoute>
                <SubscriptionScreen />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/events" replace />} />
        </Routes>
      </main>
    </Router>
  );
};

const App = () => {
  return (
    <ErrorBoundary name="App Root">
      <AuthProvider>
        <SubscriptionProvider>
          <AvailabilityProvider>
            <EventsProvider>
              <CollectionsProvider>
                <NotificationProvider>
                  <ToastProvider>
                    <AppContent />
                  </ToastProvider>
                </NotificationProvider>
              </CollectionsProvider>
            </EventsProvider>
          </AvailabilityProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;