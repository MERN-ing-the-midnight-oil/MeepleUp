import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { theme, commonStyles } from '../utils/theme';
import { useResponsive } from '../utils/responsive';
import storage from '../utils/storage';
import { useAuth } from '../context/AuthContext';

const TOUR_STORAGE_KEY = 'meepleup_tour_completed';
const TOUR_VERSION = 1; // Increment to show tour again after updates

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to MeepleUp!',
    description: 'MeepleUp helps board game groups coordinate game nights. Let\'s take a quick tour of the main features.',
    position: 'center',
    showSkip: true,
  },
  {
    id: 'events',
    title: 'Your MeepleUps',
    description: 'This is where you\'ll see all your gaming groups. Each MeepleUp is a private group for organizing regular game nights.',
    position: 'top',
    highlight: 'events-section',
  },
  {
    id: 'join',
    title: 'Join a MeepleUp',
    description: 'Got a 3-word join code from a friend? Enter it here to join their gaming group.',
    position: 'center',
    highlight: 'join-section',
  },
  {
    id: 'create',
    title: 'Host a MeepleUp',
    description: 'Create your own gaming group! Set up recurring game nights and invite friends with a simple join code.',
    position: 'center',
    highlight: 'create-section',
  },
  {
    id: 'collection',
    title: 'Your Game Collection',
    description: 'Manage your board game collection here. Import from BoardGameGeek or scan games with AI.',
    position: 'center',
    highlight: 'collection-nav',
    screen: 'Collection',
  },
  {
    id: 'event-hub',
    title: 'Event Hub',
    description: 'Each MeepleUp has three tabs: Event (schedule & RSVPs), Games (browse collections), and Discussion (chat with members).',
    position: 'center',
    highlight: 'event-hub',
    screen: 'EventHub',
  },
  {
    id: 'rsvp',
    title: 'RSVP System',
    description: 'Let organizers know if you\'re coming! RSVP for specific dates with Going, Maybe, or Can\'t Make It.',
    position: 'center',
    highlight: 'rsvp-section',
    screen: 'EventHub',
  },
  {
    id: 'games',
    title: 'Browse Games',
    description: 'See all games from everyone in your group. Filter by category, propose games for upcoming nights, and see what others want to play.',
    position: 'center',
    highlight: 'games-tab',
    screen: 'EventHub',
  },
  {
    id: 'propose',
    title: 'Propose Games',
    description: 'Found a game you want to play? Propose it for a specific game night! Members can see your proposals and weigh in on which games they\'re interested in playing.',
    position: 'center',
    highlight: 'propose-section',
    screen: 'BrowseAndPropose',
  },
  {
    id: 'weigh-in',
    title: 'Weigh In on Games',
    description: 'See a game someone proposed? Rate it with stars to show your interest! Use 3 stars for "really want to play", 2 for "want to play", 1 for "fine with it", or express if you\'d rather not. Your input helps the group decide what to play!',
    position: 'center',
    highlight: 'weigh-in-section',
    screen: 'BrowseAndPropose',
  },
  {
    id: 'beeple-recommendations',
    title: 'Beeple Recommendations',
    description: 'Get personalized game suggestions! Beeple analyzes your collection and recommends games you might like based on publishers, mechanics, categories, and complexity. Adjust the weights to fine-tune your preferences.',
    position: 'center',
    highlight: 'beeple-recommendations-section',
    screen: 'BrowseAndPropose',
  },
  {
    id: 'beeple-optimizer',
    title: 'Beeple Game Optimizer',
    description: 'Let Beeple help plan your game night! The optimizer takes all proposed games and member votes to suggest an optimized schedule. It considers player counts, playing time, and everyone\'s interest levels to maximize fun!',
    position: 'center',
    highlight: 'beeple-optimizer-section',
    screen: 'BrowseAndPropose',
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'Ready to start organizing game nights? Create or join a MeepleUp to get started!',
    position: 'center',
    showSkip: false,
  },
];

const AppTour = ({ 
  isOpen, 
  onClose, 
  currentScreen = 'Onboarding',
  highlightElement = null,
  onStepChange = null,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const { isMobile } = useResponsive();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  const currentStep = TOUR_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === TOUR_STEPS.length - 1;
  const showHighlight = currentStep.highlight && !isFirstStep && !isLastStep;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && currentStep && onStepChange) {
      onStepChange(currentStep);
    }
  }, [currentStepIndex, isOpen]);

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleSkip = async () => {
    await handleComplete();
  };

  const handleComplete = async () => {
    try {
      await storage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ 
        completed: true, 
        version: TOUR_VERSION,
        completedAt: new Date().toISOString(),
      }));
      setCompleted(true);
      onClose();
    } catch (error) {
      console.error('Error saving tour completion:', error);
      onClose();
    }
  };

  if (!isOpen || !currentStep) return null;

  const renderContent = () => {
    if (currentStep.position === 'center') {
      return (
        <View style={styles.centerContent}>
          <View style={styles.iconContainer}>
            {currentStep.id === 'welcome' && (
              <MaterialIcons name="celebration" size={64} color={theme.colors.meepleRed} />
            )}
            {currentStep.id === 'complete' && (
              <MaterialIcons name="check-circle" size={64} color={theme.colors.meepleRed} />
            )}
            {!['welcome', 'complete'].includes(currentStep.id) && (
              <MaterialIcons name="info" size={48} color={theme.colors.meepleRed} />
            )}
          </View>
          <Text style={styles.title}>{currentStep.title}</Text>
          <Text style={styles.description}>{currentStep.description}</Text>
        </View>
      );
    }

    // Positioned tooltip
    return (
      <View style={styles.tooltipContent}>
        <View style={styles.tooltipArrow} />
        <Text style={styles.tooltipTitle}>{currentStep.title}</Text>
        <Text style={styles.tooltipDescription}>{currentStep.description}</Text>
      </View>
    );
  };

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="none"
      onRequestClose={handleSkip}
    >
      <View style={styles.overlay}>
        {/* Highlight overlay */}
        {showHighlight && (
          <View style={styles.highlightOverlay}>
            {/* This will be positioned by the parent component */}
          </View>
        )}

        {/* Tour content */}
        <Animated.View
          style={[
            styles.content,
            currentStep.position === 'center' && styles.centerModal,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {renderContent()}
          </ScrollView>

          {/* Progress indicator */}
          <View style={styles.progressContainer}>
            {TOUR_STEPS.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  index === currentStepIndex && styles.progressDotActive,
                  index < currentStepIndex && styles.progressDotCompleted,
                ]}
              />
            ))}
          </View>

          {/* Navigation buttons */}
          <View style={styles.buttonContainer}>
            {currentStep.showSkip && (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={handleSkip}
              >
                <Text style={styles.skipButtonText}>Skip Tour</Text>
              </TouchableOpacity>
            )}
            
            <View style={styles.navButtons}>
              {!isFirstStep && (
                <TouchableOpacity
                  style={[styles.navButton, styles.prevButton]}
                  onPress={handlePrevious}
                >
                  <View style={styles.iconWrapper}>
                    <MaterialIcons name="arrow-back" size={24} color={theme.colors.textPrimary} />
                  </View>
                  <Text style={[styles.navButtonText, styles.prevButtonText]}>Previous</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={[styles.navButton, styles.nextButton]}
                onPress={handleNext}
              >
                <Text style={[styles.navButtonText, styles.nextButtonText]}>
                  {isLastStep ? 'Get Started!' : 'Next'}
                </Text>
                {!isLastStep && (
                  <View style={styles.iconWrapper}>
                    <MaterialIcons name="arrow-forward" size={24} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

// Hook to check if tour should be shown
export const useTour = () => {
  const [shouldShowTour, setShouldShowTour] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const checkTourStatus = async () => {
      try {
        const tourData = await storage.getItem(TOUR_STORAGE_KEY);
        if (tourData) {
          const parsed = JSON.parse(tourData);
          // Show tour if not completed or if version changed
          setShouldShowTour(!parsed.completed || parsed.version !== TOUR_VERSION);
        } else {
          // First time user
          setShouldShowTour(true);
        }
      } catch (error) {
        console.error('Error checking tour status:', error);
        setShouldShowTour(true); // Default to showing tour on error
      } finally {
        setIsChecking(false);
      }
    };

    checkTourStatus();
  }, []);

  // Re-check tour status when email verification status changes
  // This ensures the tour shows up after email verification
  useEffect(() => {
    if (user?.emailVerified && !isChecking) {
      // User is verified - re-check tour status in case it was cleared
      const checkTourStatus = async () => {
        try {
          const tourData = await storage.getItem(TOUR_STORAGE_KEY);
          if (tourData) {
            const parsed = JSON.parse(tourData);
            setShouldShowTour(!parsed.completed || parsed.version !== TOUR_VERSION);
          } else {
            setShouldShowTour(true);
          }
        } catch (error) {
          console.error('Error re-checking tour status:', error);
          setShouldShowTour(true);
        }
      };
      checkTourStatus();
    }
  }, [user?.emailVerified, isChecking]);

  return { shouldShowTour, isChecking };
};

// Component to wrap screens and provide tour context
export const TourProvider = ({ children, currentScreen }) => {
  const [showTour, setShowTour] = useState(false);
  const [highlightElement, setHighlightElement] = useState(null);
  const { shouldShowTour, isChecking } = useTour();

  useEffect(() => {
    if (!isChecking && shouldShowTour) {
      // Show tour after a short delay to let screen render
      const timer = setTimeout(() => {
        setShowTour(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTour, isChecking]);

  const handleStepChange = (step) => {
    // Handle highlighting elements based on step
    if (step.highlight) {
      // This would need to be implemented per screen
      // For now, we'll just log it
      console.log('Tour step:', step.id, 'highlight:', step.highlight);
    }
  };

  return (
    <>
      {children}
      <AppTour
        isOpen={showTour}
        onClose={() => setShowTour(false)}
        currentScreen={currentScreen}
        highlightElement={highlightElement}
        onStepChange={handleStepChange}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  highlightOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  content: {
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    maxWidth: Platform.OS === 'web' ? 500 : '90%',
    width: Platform.OS === 'web' ? 500 : '90%',
    maxHeight: '80%',
    ...theme.shadows.card,
  },
  centerModal: {
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  centerContent: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    lineHeight: theme.typography.fontSize.base * 1.6,
    marginBottom: theme.spacing.lg,
  },
  tooltipContent: {
    backgroundColor: theme.colors.surfaceColor,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.card,
  },
  tooltipArrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.colors.surfaceColor,
    top: -8,
    alignSelf: 'center',
  },
  tooltipTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.meepleRed,
    marginBottom: theme.spacing.sm,
  },
  tooltipDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: theme.typography.fontSize.sm * 1.5,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.woodMedium,
  },
  progressDotActive: {
    backgroundColor: theme.colors.meepleRed,
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: theme.colors.feltGreen,
  },
  buttonContainer: {
    marginTop: theme.spacing.md,
  },
  skipButton: {
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  skipButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
  navButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.sm,
  },
  prevButton: {
    backgroundColor: theme.colors.woodLight,
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
  },
  nextButton: {
    backgroundColor: theme.colors.meepleRed,
  },
  navButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  prevButtonText: {
    color: theme.colors.textPrimary,
  },
  nextButtonText: {
    color: '#fff',
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AppTour;

