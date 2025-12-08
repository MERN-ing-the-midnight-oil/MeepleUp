import React from 'react';
import { Alert } from 'react-native';

/**
 * Utility function to handle leaving an event
 * Shows confirmation dialog and calls the leave handler
 * Used in both EventsScreen and Onboarding
 */
export const handleLeaveEvent = async (eventId, userIdentifier, leaveEventFn, getEventByIdFn) => {
  if (!userIdentifier) {
    Alert.alert('Error', 'You must be signed in to leave a MeepleUp.');
    return;
  }

  const event = getEventByIdFn(eventId);
  if (!event) {
    Alert.alert('Error', 'MeepleUp not found.');
    return;
  }

  // Don't allow organizer to leave
  if (event.organizerId === userIdentifier) {
    Alert.alert('Cannot Leave', 'As the organizer, you cannot leave this MeepleUp. You can archive it instead.');
    return;
  }

  Alert.alert(
    'Leave MeepleUp?',
    'Are you sure you want to leave this MeepleUp? You will need to get a new invitation to rejoin.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveEventFn(eventId, userIdentifier);
            Alert.alert('Left MeepleUp', 'You have successfully left the MeepleUp.');
          } catch (error) {
            Alert.alert('Error', 'Failed to leave MeepleUp. Please try again.');
            console.error(error);
          }
        },
      },
    ],
  );
};

