import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { theme, commonStyles } from '../utils/theme';

/**
 * Standalone RSVP Buttons Component
 * Manages its own state internally to avoid parent re-renders
 * Only updates backend lazily (debounced) - never updates parent state
 * 
 * @param {string|null} currentStatus - Current RSVP status ('going', 'maybe', 'not-going', or null)
 * @param {boolean} allowMaybe - Whether "Maybe" option is enabled
 * @param {string} eventId - Event ID for RSVP update
 */
const RSVPButtons = ({
  currentStatus: initialStatus,
  allowMaybe,
  eventId,
}) => {
  const { updateMemberRSVP } = useEvents();
  const { user } = useAuth();
  const userId = user?.uid || user?.id;
  // Local state for immediate UI updates (doesn't cause parent re-render)
  const [localStatus, setLocalStatus] = useState(initialStatus);
  const syncTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Sync on unmount if there's a pending change
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncFinalStatus();
      }
    };
  }, []);

  // Update local status when prop changes (e.g., from initial load)
  useEffect(() => {
    if (initialStatus !== localStatus && !syncTimeoutRef.current) {
      setLocalStatus(initialStatus);
    }
  }, [initialStatus]);

  const syncFinalStatus = useCallback(async () => {
    if (!isMountedRef.current || !updateMemberRSVP || !eventId || !userId) return;
    
    try {
      // Update backend directly - bypasses parent state updates
      await updateMemberRSVP(eventId, userId, localStatus);
    } catch (error) {
      console.error('Error syncing RSVP:', error);
      // Revert on error
      setLocalStatus(initialStatus);
    }
  }, [localStatus, eventId, userId, updateMemberRSVP, initialStatus]);

  const handleStatusChange = useCallback((newStatus) => {
    // Update local state immediately (only this component re-renders)
    setLocalStatus(newStatus);

    // Clear any pending sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Debounce backend sync (lazy update after 500ms of inactivity)
    syncTimeoutRef.current = setTimeout(() => {
      syncFinalStatus();
      syncTimeoutRef.current = null;
    }, 500);
  }, [syncFinalStatus]);

  const getButtonVariant = (status) => {
    return localStatus === status ? 'primary' : 'outline';
  };

  return (
    <View style={styles.rsvpButtonsContainer}>
      <View style={styles.rsvpButtons}>
        <Pressable
          style={[
            styles.rsvpButton,
            getButtonVariant('going') === 'primary' ? styles.rsvpButtonPrimary : styles.rsvpButtonOutline,
          ]}
          onPress={(e) => {
            e.stopPropagation();
            handleStatusChange('going');
          }}
        >
          <Text
            style={[
              styles.rsvpButtonText,
              getButtonVariant('going') === 'primary' ? styles.rsvpButtonTextPrimary : styles.rsvpButtonTextOutline,
            ]}
          >
            Going
          </Text>
        </Pressable>
        {allowMaybe && (
          <Pressable
            style={[
              styles.rsvpButton,
              getButtonVariant('maybe') === 'primary' ? styles.rsvpButtonPrimary : styles.rsvpButtonOutline,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              handleStatusChange('maybe');
            }}
          >
            <Text
              style={[
                styles.rsvpButtonText,
                getButtonVariant('maybe') === 'primary' ? styles.rsvpButtonTextPrimary : styles.rsvpButtonTextOutline,
              ]}
            >
              Maybe
            </Text>
          </Pressable>
        )}
        <Pressable
          style={[
            styles.rsvpButton,
            getButtonVariant('not-going') === 'primary' ? styles.rsvpButtonPrimary : styles.rsvpButtonOutline,
          ]}
          onPress={(e) => {
            e.stopPropagation();
            handleStatusChange('not-going');
          }}
        >
          <Text
            style={[
              styles.rsvpButtonText,
              getButtonVariant('not-going') === 'primary' ? styles.rsvpButtonTextPrimary : styles.rsvpButtonTextOutline,
            ]}
          >
            Can't Make It
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rsvpButtonsContainer: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
    backgroundColor: theme.colors.woodLight,
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rsvpButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  rsvpButtonPrimary: {
    backgroundColor: theme.colors.meepleRed,
  },
  rsvpButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.colors.meepleRed,
  },
  rsvpButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
  },
  rsvpButtonTextPrimary: {
    color: '#fff',
  },
  rsvpButtonTextOutline: {
    color: theme.colors.meepleRed,
  },
});

export default RSVPButtons;

