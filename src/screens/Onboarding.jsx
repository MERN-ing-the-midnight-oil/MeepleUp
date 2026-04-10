import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, useWindowDimensions, Switch, KeyboardAvoidingView, Platform, TouchableOpacity, Animated } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useCollections } from '../context/CollectionsContext';
import { validateJoinCode } from '../utils/api';
import { theme, commonStyles } from '../utils/theme';
import { db } from '../config/firebase';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import CalendarDatePicker from '../components/common/CalendarDatePicker';
import Modal from '../components/common/Modal';
import DateTimePicker from '@react-native-community/datetimepicker';
import PoweredByBGG from '../components/PoweredByBGG';
import JoinForm from '../components/JoinForm';
import EventCard from '../components/EventCard';
import UserProfileModal from '../components/UserProfileModal';
import MeepleupPurchaseModal from '../components/MeepleupPurchaseModal';
import ArchivedMeepleUpsModal from '../components/ArchivedMeepleUpsModal';
import AppTour, { useTour } from '../components/AppTour';
import logger from '../utils/logger';

const Onboarding = () => {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { user, updateUser } = useAuth();
  const { joinEventWithCode, createEvent, createEventWithPurchaseCheck, getUserEvents, leaveEvent, archiveEvent, deleteEvent, getEventById, getUserArchivedEvents, loading: eventsLoading, events } = useEvents();
  const { getUserCollection, initialised: collectionsInitialised, loading: collectionsLoading } = useCollections();
  const [hasCheckedRedirect, setHasCheckedRedirect] = useState(false);
  const redirectTimeoutRef = useRef(null);
  const [joinCodeWord1, setJoinCodeWord1] = useState('');
  const [joinCodeWord2, setJoinCodeWord2] = useState('');
  const [joinCodeWord3, setJoinCodeWord3] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventAddress, setEventAddress] = useState('');
  const [selectedDates, setSelectedDates] = useState([]); // Array of { date: Date, startTime: Date, endTime: Date, location?: string, note?: string }
  const [usualStartTime, setUsualStartTime] = useState(null); // Optional - no default
  const [usualEndTime, setUsualEndTime] = useState(null); // Optional - no default
  const [showTimePicker, setShowTimePicker] = useState({ type: null, dateIndex: null }); // { type: 'usualStart' | 'usualEnd' | 'start' | 'end', dateIndex: number }
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [editingDateIndex, setEditingDateIndex] = useState(null); // Index of date being edited
  const [editingDateForm, setEditingDateForm] = useState({ location: '', note: '' }); // Form state for editing date
  const [pendingEditDateIndex, setPendingEditDateIndex] = useState(null); // Store date index when closing edit modal to open time picker
  const [eventDescription, setEventDescription] = useState('');
  const [rsvpRequired, setRsvpRequired] = useState(true);
  // Public meepleups feature removed - all meepleups are private
  const [memberLimit, setMemberLimit] = useState('');
  const [mode, setMode] = useState('choice'); // 'choice', 'join', 'create'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [organizerData, setOrganizerData] = useState({}); // { eventId: { name, avatarUrl } }
  const [memberData, setMemberData] = useState({}); // { eventId: { [userId]: { name, avatarUrl } } }
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [joinedEventName, setJoinedEventName] = useState(null); // Store event name for success modal
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showArchivedMeepleUpsModal, setShowArchivedMeepleUpsModal] = useState(false);
  const [pendingEventData, setPendingEventData] = useState(null); // Store event data when purchase is required
  const scrollViewRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const selectedDatesRef = useRef(selectedDates);
  const scrollPositionRef = useRef(0); // Track scroll position to prevent jumps
  const [showTour, setShowTour] = useState(false);
  const { shouldShowTour } = useTour();
  
  // Keep ref in sync with state
  useEffect(() => {
    selectedDatesRef.current = selectedDates;
  }, [selectedDates]);
  
  // Track scroll position
  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset?.y ?? 0;
    if (offsetY >= 0) {
      scrollPositionRef.current = offsetY;
    }
  };
  
  // Restore scroll position when selectedDates changes (e.g., when dates are added/updated)
  // Use useLayoutEffect to restore synchronously before paint, preventing visible jumps
  const previousDateCountRef = useRef(selectedDates.length);
  useLayoutEffect(() => {
    const currentDateCount = selectedDates.length;
    const dateCountChanged = currentDateCount !== previousDateCountRef.current;
    previousDateCountRef.current = currentDateCount;
    
    if (dateCountChanged && scrollViewRef.current && scrollPositionRef.current > 0) {
      // Restore synchronously before paint to prevent visible jump
      scrollViewRef.current.scrollTo({
        y: scrollPositionRef.current,
        animated: false,
      });
      
      // Backup restore after paint
      requestAnimationFrame(() => {
        if (scrollViewRef.current && scrollPositionRef.current > 0) {
          scrollViewRef.current.scrollTo({
            y: scrollPositionRef.current,
            animated: false,
          });
        }
      });
    }
  }, [selectedDates.length]);
  
  // Reduced logging - removed editingDateIndex change log

  // Show tour for new users
  useEffect(() => {
    if (shouldShowTour && mode === 'choice' && !hasCheckedRedirect) {
      const timer = setTimeout(() => {
        setShowTour(true);
      }, 1500); // Wait a bit for screen to render
      return () => clearTimeout(timer);
    }
  }, [shouldShowTour, mode, hasCheckedRedirect]);

  // Check if user is member of exactly one meepleUp and redirect to logistics tab
  // Also redirects to collection if user has no games
  useEffect(() => {
    // Don't check if we've already checked or if still loading
    if (hasCheckedRedirect || eventsLoading) {
      return;
    }

    // Wait for collections to initialize before checking
    if (!collectionsInitialised || collectionsLoading) {
      return;
    }

    // Clear any pending timeout
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }

    if (!user) {
      setHasCheckedRedirect(true);
      return;
    }

    const userId = user.uid || user.id;
    if (!userId) {
      setHasCheckedRedirect(true);
      return;
    }

    // Check if user has any games in their collection
    const userCollection = getUserCollection(userId);
    const hasGames = userCollection && userCollection.length > 0;
    if (__DEV__) {
      logger.debug('[Onboarding] User collection:', userCollection?.length || 0, 'games');
    }

    // If user has no games, redirect to collection screen
    if (!hasGames) {
      if (__DEV__) {
        logger.debug('[Onboarding] User has no games, redirecting to collection');
      }
      setHasCheckedRedirect(true);
      navigation.navigate('Collection');
      return;
    }

    // Get all events where user is a member
    // getUserEvents doesn't take parameters - it uses user from context
    const userEvents = getUserEvents();
    // Reduced logging - removed redirect check logs
    
    // Filter to only active events (not archived) - explicitly check for isActive === true
    const activeEvents = userEvents.filter(event => event.isActive === true);

    // If user is a member of exactly one active meepleUp, redirect to its logistics tab
    if (activeEvents.length === 1) {
      const eventId = activeEvents[0].id;
      setHasCheckedRedirect(true);
      navigation.navigate('EventHub', { eventId });
      return;
    }

    // If we have events but not exactly one, we're done checking
    if (activeEvents.length !== 1 && (userEvents.length > 0 || events.length > 0)) {
      if (__DEV__) {
        logger.debug('[Onboarding] ✗ Not redirecting - user has', activeEvents.length, 'active events');
      }
      setHasCheckedRedirect(true);
      return;
    }

    // If events haven't loaded yet, wait a bit for Firestore sync
    if (activeEvents.length === 0 && events.length === 0 && !eventsLoading) {
      if (__DEV__) {
        logger.debug('[Onboarding] Waiting for Firestore sync...');
      }
      redirectTimeoutRef.current = setTimeout(() => {
        const delayedUserEvents = getUserEvents();
        const delayedActiveEvents = delayedUserEvents.filter(event => event.isActive === true);
        if (__DEV__) {
          logger.debug('[Onboarding] Delayed check - active events:', delayedActiveEvents.length, 'of', delayedUserEvents.length, 'total user events');
        }
        
        if (delayedActiveEvents.length === 1) {
          const eventId = delayedActiveEvents[0].id;
          if (__DEV__) {
            logger.debug('[Onboarding] ✓ Redirecting to event after Firestore sync:', eventId);
          }
          setHasCheckedRedirect(true);
          navigation.navigate('EventHub', { eventId });
        } else {
          if (__DEV__) {
            logger.debug('[Onboarding] ✗ Not redirecting after delay - user has', delayedActiveEvents.length, 'active events');
          }
          setHasCheckedRedirect(true);
        }
        redirectTimeoutRef.current = null;
      }, 2000); // Wait 2 seconds for Firestore to sync

      return () => {
        if (redirectTimeoutRef.current) {
          clearTimeout(redirectTimeoutRef.current);
          redirectTimeoutRef.current = null;
        }
      };
    }
  }, [user, getUserEvents, eventsLoading, events, navigation, hasCheckedRedirect, getUserCollection, collectionsInitialised, collectionsLoading]);

  const handleModeChange = (nextMode) => {
    setError('');
    if (nextMode === 'choice') {
      setEventName('');
      setEventLocation('');
      setEventAddress('');
      setSelectedDates([]);
      setUsualStartTime(null);
      setUsualEndTime(null);
      setEventDescription('');
      setRsvpRequired(true);
      setMemberLimit('');
      setJoinCodeWord1('');
      setJoinCodeWord2('');
      setJoinCodeWord3('');
      setShowCalendarModal(false);
      setEditingDateIndex(null);
      setEditingDateForm({ location: '', note: '' });
    }
    setMode(nextMode);
  };

  const handleJoinCodeWordChange = (wordIndex, text) => {
    // Allow any case - normalization happens during comparison
    const trimmed = text.trim();
    if (wordIndex === 1) {
      setJoinCodeWord1(trimmed);
    } else if (wordIndex === 2) {
      setJoinCodeWord2(trimmed);
    } else if (wordIndex === 3) {
      setJoinCodeWord3(trimmed);
    }
    setError('');
  };


  const handleJoinByCode = async () => {
    if (!user) {
      setError('Please sign in before joining a MeepleUp.');
      return;
    }

    const word1 = joinCodeWord1.trim().toLowerCase();
    const word2 = joinCodeWord2.trim().toLowerCase();
    const word3 = joinCodeWord3.trim().toLowerCase();

    if (!word1 || !word2 || !word3) {
      setError('Please enter all three words of the join code');
      return;
    }

    const joinCode = `${word1} ${word2} ${word3}`;

    if (!validateJoinCode(joinCode)) {
      setError('Invalid join code format');
      return;
    }

    setLoading(true);
    try {
      const joinedEvent = await joinEventWithCode(joinCode, user.uid);

      if (!joinedEvent) {
        setError('MeepleUp not found. Please double-check your join code. If the event was just created, wait a moment and try again.');
        setLoading(false);
        return;
      }

      // Show success modal with event name
      setLoading(false);
      setJoinedEventName(joinedEvent.name || 'MeepleUp');
      handleModeChange('choice');
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.error(err);
      setLoading(false);
    }
  };

  const handleLeaveEvent = async (eventId) => {
    const userIdentifier = user?.uid || user?.id;
    if (!userIdentifier) {
      Alert.alert('Error', 'You must be signed in to leave a MeepleUp.');
      return;
    }

    try {
      await leaveEvent(eventId);
      Alert.alert('Left MeepleUp', 'You have successfully left the MeepleUp.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to leave MeepleUp. Please try again.');
      console.error('Error leaving MeepleUp:', error);
    }
  };

  const handleArchiveEvent = async (eventId) => {
    const userIdentifier = user?.uid || user?.id;
    if (!userIdentifier) {
      Alert.alert('Error', 'You must be signed in to archive a MeepleUp.');
      return;
    }

    try {
      await archiveEvent(eventId, userIdentifier);
      Alert.alert('MeepleUp Archived', 'The MeepleUp has been archived. All members have been notified.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to archive MeepleUp. Please try again.');
      console.error('Error archiving MeepleUp:', error);
    }
  };

  const handleDeleteEvent = async (eventId, currentUserId) => {
    logger.debug('[Onboarding] handleDeleteEvent called:', eventId, currentUserId);
    const userIdentifier = currentUserId || user?.uid || user?.id;
    if (!userIdentifier) {
      console.warn('[Onboarding] No user identifier found');
      Alert.alert('Error', 'You must be signed in to delete a MeepleUp.');
      return;
    }

    try {
      logger.debug('[Onboarding] Calling deleteEvent with:', eventId, userIdentifier);
      await deleteEvent(eventId, userIdentifier);
      logger.debug('[Onboarding] deleteEvent completed successfully');
      // Alert is shown in the modal
    } catch (error) {
      console.error('[Onboarding] Error in handleDeleteEvent:', error);
      throw error; // Let the modal handle the error
    }
  };

  const handleCreateEvent = async () => {
    if (!user) {
      setError('Please sign in before creating a MeepleUp.');
      return;
    }

    if (!eventName.trim() || !eventLocation.trim() || selectedDates.length === 0) {
      setError('Please fill in all required MeepleUp details, including at least one event date.');
      return;
    }

    setLoading(true);
    try {
      if (__DEV__) {
        logger.debug('[Onboarding] handleCreateEvent - selectedDates before conversion:', {
          count: selectedDates.length,
          selectedDates: selectedDates.map(d => ({
            date: d.date instanceof Date ? d.date.toISOString() : d.date,
            dateLocal: d.date instanceof Date ? d.date.toString() : new Date(d.date).toString(),
            dateType: d.date instanceof Date ? 'Date' : typeof d.date,
            startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
            startTimeLocal: d.startTime instanceof Date ? d.startTime.toString() : new Date(d.startTime).toString(),
            startTimeType: d.startTime instanceof Date ? 'Date' : typeof d.startTime,
            endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
            endTimeLocal: d.endTime instanceof Date ? d.endTime.toString() : new Date(d.endTime).toString(),
            endTimeType: d.endTime instanceof Date ? 'Date' : typeof d.endTime,
          })),
        });
      }
      
      // Convert dates to ISO strings for storage
      const eventDates = selectedDates.map((d, index) => {
        const dateObj = d.date instanceof Date ? d.date : new Date(d.date);
        const startTimeObj = d.startTime instanceof Date ? d.startTime : new Date(d.startTime);
        const endTimeObj = d.endTime instanceof Date ? d.endTime : new Date(d.endTime);
        
        const converted = {
          date: dateObj.toISOString(),
          startTime: startTimeObj.toISOString(),
          endTime: endTimeObj.toISOString(),
        };
        
        // Include per-date location and note if they exist
        if (d.location && d.location.trim()) {
          converted.location = d.location.trim();
        }
        if (d.note && d.note.trim()) {
          converted.note = d.note.trim();
        }
        
        if (__DEV__) {
          logger.debug(`[Onboarding] Converting date ${index + 1}:`, {
            original: {
              date: d.date instanceof Date ? d.date.toISOString() : d.date,
              startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
              endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
              location: d.location,
              note: d.note,
            },
            converted: converted,
          });
        }
        
        return converted;
      });
      
      if (__DEV__) {
        logger.debug('[Onboarding] handleCreateEvent - eventDates after conversion:', {
          count: eventDates.length,
          eventDates: eventDates.map((ed, index) => ({
            index,
            date: ed.date,
            startTime: ed.startTime,
            endTime: ed.endTime,
            dateParsed: new Date(ed.date).toISOString(),
            startTimeParsed: new Date(ed.startTime).toISOString(),
            endTimeParsed: new Date(ed.endTime).toISOString(),
          })),
        });
      }
      
      const scheduledForValue = selectedDates[0]?.date instanceof Date 
        ? selectedDates[0].date.toISOString() 
        : (selectedDates[0]?.date ? new Date(selectedDates[0].date).toISOString() : '');
      
      if (__DEV__) {
        logger.debug('[Onboarding] handleCreateEvent - scheduledFor:', {
          scheduledFor: scheduledForValue,
          firstDate: selectedDates[0]?.date instanceof Date 
            ? selectedDates[0].date.toISOString() 
            : selectedDates[0]?.date,
        });
      }
      
      const eventData = {
        name: eventName.trim(),
        location: eventLocation.trim(),
        address: eventAddress.trim() || '',
        eventDates,
        scheduledFor: scheduledForValue, // For backward compatibility
        description: '', // Description removed from UI
        visibility: 'private', // Invite only for v1
        organizerId: user.uid,
      };
      
      if (__DEV__) {
        logger.debug('[Onboarding] handleCreateEvent - eventData being sent to createEvent:', {
          ...eventData,
          eventDates: eventData.eventDates.map((ed, index) => ({
            index,
            date: ed.date,
            startTime: ed.startTime,
            endTime: ed.endTime,
          })),
        });
      }

      // Only include usual times if they're set
      if (usualStartTime) {
        eventData.usualStartTime = usualStartTime.toISOString();
      }
      if (usualEndTime) {
        eventData.usualEndTime = usualEndTime.toISOString();
      }

      // Use createEventWithPurchaseCheck to handle purchase flow
      const result = await createEventWithPurchaseCheck(eventData);

      if (result.requiresPurchase) {
        // Purchase required - show purchase modal
        setPendingEventData(eventData);
        setShowPurchaseModal(true);
        setLoading(false);
        return;
      }

      if (!result.success) {
        setError(result.error || 'Failed to create MeepleUp. Please try again.');
        setLoading(false);
        return;
      }

      const newEvent = result.event;

      setEventName('');
      setEventLocation('');
      setEventAddress('');
      setSelectedDates([]);
      setUsualStartTime(null);
      setUsualEndTime(null);
      setEventDescription('');
      setRsvpRequired(true);
      setMemberLimit('');
      setShowCalendarModal(false);
      setError('');

      Alert.alert(
        'MeepleUp Created',
        'Your MeepleUp has been created successfully!',
        [
          {
            text: 'OK',
            onPress: () => navigation.replace('EventHub', {
              eventId: newEvent.id,
              joinCode: newEvent.joinCode,
            }),
          },
        ],
      );
    } catch (err) {
      setError('Failed to create MeepleUp. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Get user's events and sort by creation date (newest first)
  const userIdentifier = user?.uid || user?.id;
  let allUserEvents = [];
  try {
    if (userIdentifier && getUserEvents) {
      // getUserEvents doesn't take parameters - it uses user from context
      const events = getUserEvents();
      allUserEvents = Array.isArray(events) ? events : [];
    }
  } catch (error) {
    console.error('Error getting user events:', error);
    allUserEvents = [];
  }
  
  // Filter to only active events (not archived) - explicitly check for isActive === true
  const userEvents = allUserEvents.filter(event => event.isActive === true);
  
  const sortedEvents = Array.isArray(userEvents) && userEvents.length > 0
    ? [...userEvents].sort((a, b) => {
        const dateA = new Date(a?.createdAt || 0);
        const dateB = new Date(b?.createdAt || 0);
        return dateB - dateA; // Newest first
      })
    : [];

  // Fetch organizer and member data for all events
  useEffect(() => {
    if (!userIdentifier || !db || sortedEvents.length === 0) return;

    const fetchEventData = async () => {
      const organizers = {};
      const members = {}; // { eventId: { [userId]: { name, avatarUrl } } }
      try {
        for (const event of sortedEvents) {
          if (!event.id) continue;
          
          const eventMembers = {};
          
          // Fetch member data from members collection
          try {
            const membersSnapshot = await db
              .collection('gamingGroups')
              .doc(event.id)
              .collection('members')
              .get();

            membersSnapshot.docs.forEach((memberDoc) => {
              const memberData = memberDoc.data();
              const memberId = memberDoc.id;
              
              // Store member data
              eventMembers[memberId] = {
                name: memberData.userName || null,
                avatarUrl: memberData.userAvatarUrl || null,
              };
            });
          } catch (error) {
            // Permission errors can occur if user isn't a member yet or group doesn't exist
            // This is non-fatal - we'll use fallback data from the event.members array
            if (error.code === 'permission-denied' || error.message?.includes('permission')) {
              if (__DEV__) {
                console.warn(`Permission denied fetching members for event ${event.id}, using fallback data`);
              }
            } else {
              console.error(`Error fetching members for event ${event.id}:`, error);
            }
          }

          // Fetch missing member data from users collection
          if (event.members && Array.isArray(event.members)) {
            for (const member of event.members) {
              if (!member.userId || eventMembers[member.userId]) continue;
              
              try {
                // Check if member is current user first
                if (member.userId === userIdentifier) {
                  eventMembers[member.userId] = {
                    name: user?.name || user?.email || 'You',
                    avatarUrl: user?.photoURL || user?.avatarUrl || null,
                  };
                } else {
                  // Try to get from users collection
                  const userDoc = await db.collection('users').doc(member.userId).get();
                  if (userDoc.exists) {
                    const userData = userDoc.data();
                    eventMembers[member.userId] = {
                      name: userData.name || userData.email || 'Unknown',
                      avatarUrl: userData.avatarUrl || null,
                    };
                  } else if (member.userName) {
                    // Fallback to member data from event
                    eventMembers[member.userId] = {
                      name: member.userName,
                      avatarUrl: member.userAvatarUrl || null,
                    };
                  }
                }
              } catch (error) {
                console.error(`Error fetching member data for ${member.userId}:`, error);
              }
            }
          }
          
          members[event.id] = eventMembers;
          
          // Fetch organizer info
          if (event.organizerId) {
            try {
              // Check if organizer is current user first
              if (event.organizerId === userIdentifier) {
                organizers[event.id] = {
                  name: user?.name || user?.email || 'You',
                  avatarUrl: user?.photoURL || user?.avatarUrl || null,
                };
              } else {
                // Fetch from Firestore
                const organizerDoc = await db.collection('users').doc(event.organizerId).get();
                if (organizerDoc.exists) {
                  const organizerData = organizerDoc.data();
                  organizers[event.id] = {
                    name: organizerData.name || organizerData.email || 'Unknown Host',
                    avatarUrl: organizerData.avatarUrl || null,
                  };
                } else {
                  // Fallback: try to get from members collection
                  const memberDoc = await db
                    .collection('gamingGroups')
                    .doc(event.id)
                    .collection('members')
                    .doc(event.organizerId)
                    .get();
                  if (memberDoc.exists) {
                    const memberData = memberDoc.data();
                    organizers[event.id] = {
                      name: memberData.userName || 'Unknown Host',
                      avatarUrl: memberData.userAvatarUrl || null,
                    };
                  }
                }
              }
            } catch (error) {
              console.error(`Error fetching organizer for event ${event.id}:`, error);
            }
          }
        }
        setOrganizerData(organizers);
        setMemberData(members);
      } catch (error) {
        console.error('Error fetching event data:', error);
      }
    };

    fetchEventData();
  }, [userIdentifier, sortedEvents.length, user]);

  if (mode === 'choice') {
    return (
      <>
      <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
        >
          <ScrollView 
            contentContainerStyle={styles.container}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: false }
            )}
            scrollEventThrottle={16}
          >
          <View style={styles.content}>
            <Text 
              style={[styles.title, { fontSize: Math.min(width * 0.15, 60) }]} 
              numberOfLines={1} 
              adjustsFontSizeToFit={true}
              minimumFontScale={0.5}
            >
              Welcome to MeepleUp!
            </Text>
          <View style={[styles.bggLogoContainer, { width: width * 0.5 }]}>
            <PoweredByBGG 
              size="extraLarge" 
              variant="color" 
              containerWidth={width * 0.5}
            />
          </View>
    
          {/* User's MeepleUps */}
          <View style={styles.eventsSection} testID="events-section">
            <View style={styles.membershipsToken}>
              <Text style={styles.membershipsTokenText}>Your MeepleUps</Text>
            </View>
            {Array.isArray(sortedEvents) && sortedEvents.length > 0 ? (
              sortedEvents.map((event) => {
                if (!event || !event.id) return null;
                const userIdentifier = user?.uid || user?.id;
                const isOrganizer = event.organizerId === userIdentifier;
                
                const organizer = organizerData[event.id] || {};
                const eventMemberData = memberData[event.id] || {};
                
                // Extract member avatars and names
                const memberAvatars = {};
                const memberNames = {};
                Object.keys(eventMemberData).forEach((userId) => {
                  memberAvatars[userId] = eventMemberData[userId]?.avatarUrl || null;
                  memberNames[userId] = eventMemberData[userId]?.name || 'Unknown';
                });
                
                return (
                  <EventCard
                    key={event.id}
                    event={event}
                    onPress={() => navigation.navigate('EventHub', {
                      eventId: event.id,
                    })}
                    isOrganizer={isOrganizer}
                    style={styles.eventCard}
                    currentUserId={userIdentifier}
                    memberAvatars={memberAvatars}
                    memberNames={memberNames}
                    onMemberPress={(userId, userName, avatarUrl) => {
                      setSelectedUserForProfile({ userId, userName, avatarUrl });
                    }}
                    navigation={navigation}
                    onLeave={handleLeaveEvent}
                    onArchive={handleArchiveEvent}
                  />
                );
              })
            ) : (
              <View style={styles.emptyMembershipsContainer}>
                <MaterialIcons name="lock-outline" size={16} color={theme.colors.textSecondary} style={styles.emptyMembershipsIcon} />
                <Text style={styles.emptyMembershipsText}>
                  MeepleUps are invite-only.{'\n'}Join a friend's group or create one—your first MeepleUp will appear here.
                </Text>
              </View>
            )}
          </View>

          {/* Archived MeepleUps Section */}
          {(() => {
            const userIdentifier = user?.uid || user?.id;
            const archivedEvents = userIdentifier ? getUserArchivedEvents() : [];
            const organizerArchivedEvents = archivedEvents.filter(event => event.organizerId === userIdentifier);
            
            if (organizerArchivedEvents.length > 0) {
              return (
                <View style={styles.eventsSection}>
                  <TouchableOpacity
                    onPress={() => {
                      // Open the archived MeepleUps modal
                      setShowArchivedMeepleUpsModal(true);
                    }}
                    style={styles.archivedHeader}
                  >
                    <Text style={styles.archivedHeaderText}>
                      📦 Archived MeepleUps ({organizerArchivedEvents.length})
                    </Text>
                    <MaterialIcons 
                      name="arrow-forward" 
                      size={24} 
                      color={theme.colors.textSecondary} 
                    />
                  </TouchableOpacity>
                </View>
              );
            }
            return null;
          })()}
          
          {/* Join an existing MeepleUp Section */}
          <View style={styles.joinSection} testID="join-section">
            <JoinForm
              joinCodeWord1={joinCodeWord1}
              joinCodeWord2={joinCodeWord2}
              joinCodeWord3={joinCodeWord3}
              onJoinCodeWordChange={handleJoinCodeWordChange}
              onJoin={handleJoinByCode}
              error={error}
              loading={loading}
            />
          </View>

          <View style={styles.options}>
            <View style={styles.organizeCard} testID="create-section">
              <View style={styles.organizeTitleContainer}>
                <Text style={styles.organizeTitle}>Host a MeepleUp</Text>
              </View>
              <Text style={styles.organizeSubtitle}>
                Invite your friends to a game night with a simple 3-word code.
              </Text>
              <Button
                label="Host"
                onPress={() => handleModeChange('create')}
                style={styles.hostButton}
              />
            </View>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {selectedUserForProfile && (
        <UserProfileModal
          isOpen={!!selectedUserForProfile}
          onClose={() => setSelectedUserForProfile(null)}
          userId={selectedUserForProfile.userId}
          userName={selectedUserForProfile.userName}
          avatarUrl={selectedUserForProfile.avatarUrl}
        />
      )}
      <AppTour
        isOpen={showTour}
        onClose={() => setShowTour(false)}
        currentScreen="Onboarding"
      />
      {(() => {
        const userIdentifier = user?.uid || user?.id;
        const archivedEvents = userIdentifier ? getUserArchivedEvents() : [];
        return (
          <ArchivedMeepleUpsModal
            isOpen={showArchivedMeepleUpsModal}
            onClose={() => setShowArchivedMeepleUpsModal(false)}
            archivedEvents={archivedEvents}
            onDelete={handleDeleteEvent}
            currentUserId={userIdentifier}
          />
        );
      })()}
      </>
    );
  }

  if (mode === 'join') {
    return (
      <>
      <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
        >
          <ScrollView 
            contentContainerStyle={styles.container}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: false }
            )}
            scrollEventThrottle={16}
          >
          <View style={styles.content}>
            <Button
              label="← Back"
              onPress={() => handleModeChange('choice')}
              variant="outline"
              style={styles.backButton}
            />
            <Text style={styles.title}>Join an existing MeepleUp</Text>
            <Text style={styles.subtitle}>
              Enter the three-word join code provided by your gamiing group organizer.
            </Text>
            
            <JoinForm
              joinCodeWord1={joinCodeWord1}
              joinCodeWord2={joinCodeWord2}
              joinCodeWord3={joinCodeWord3}
              onJoinCodeWordChange={handleJoinCodeWordChange}
              onJoin={handleJoinByCode}
              error={error}
              loading={loading}
              showTitle={false}
              showSubtitle={false}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {selectedUserForProfile && (
        <UserProfileModal
          isOpen={!!selectedUserForProfile}
          onClose={() => setSelectedUserForProfile(null)}
          userId={selectedUserForProfile.userId}
          userName={selectedUserForProfile.userName}
          avatarUrl={selectedUserForProfile.avatarUrl}
        />
      )}
      </>
    );
  }


  return (
    <>
    <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
      >
        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={[styles.container, styles.createFormContainer]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={true}
          onScroll={(event) => {
            // Track scroll position for restoration
            handleScroll(event);
            // Also update animated value for other uses
            Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: false }
            )(event);
          }}
          scrollEventThrottle={16}
        >
        <View style={styles.content}>
        <Button
          label="← Back"
          onPress={() => handleModeChange('choice')}
          variant="outline"
          style={styles.backButton}
        />
        <Text style={styles.title}>Create a MeepleUp</Text>
        <Text style={styles.subtitle}>
          Fill in the details and we&apos;ll generate a join code to share with friends.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Must-Have Fields */}
        <View style={styles.section}>
         
          
          {/* Basic Info */}
          <View style={styles.subsection}>
          
            
            {/* MeepleUp Name */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>MeepleUp Name <Text style={styles.requiredAsterisk}>*</Text></Text>
              <Input
                placeholder="Give your gaming group a name"
                value={eventName}
                onChangeText={(text) => {
                  setEventName(text);
                  setError('');
                }}
                style={styles.input}
              />
            </View>

            {/* Location */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Usual Location <Text style={styles.requiredAsterisk}>*</Text></Text>
              <Input
                placeholder="Where you usually meet"
                value={eventLocation}
                onChangeText={(text) => {
                  setEventLocation(text);
                  setError('');
                }}
                style={styles.input}
              />
              <View style={styles.subcategoryContainer}>
                <Text style={styles.subcategoryLabel}>Address</Text>
                <Input
                  placeholder="(optional)"
                  value={eventAddress}
                  onChangeText={(text) => {
                    setEventAddress(text);
                    setError('');
                  }}
                  style={styles.subcategoryInput}
                />
              </View>

              {/* Calendar Button */}
              <Text style={styles.fieldLabel}>When do you plan to meet? <Text style={styles.requiredAsterisk}>*</Text></Text>
              <Pressable
                style={({ pressed }) => [
                  styles.calendarButtonPressable,
                  pressed && styles.calendarButtonPressed,
                ]}
                onPress={() => setShowCalendarModal(true)}
              >
                <MaterialIcons name="calendar-today" size={20} color="#ffffff" style={styles.calendarButtonIcon} />
                <Text style={styles.calendarButtonText}>
                  {selectedDates.length > 0 
                    ? `View Calendar (${selectedDates.length} date${selectedDates.length !== 1 ? 's' : ''} selected)`
                    : 'Choose your next meeting day (you can always change it later).'}
                </Text>
              </Pressable>
            </View>

            {/* Date & Time */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Date & Time</Text>
              
              {/* Usual Time */}
              <View style={styles.timeRow}>
                <View style={styles.timeInputContainer}>
                  <Text style={styles.timeLabel}>Usual Start Time</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.timeButton,
                      pressed && styles.timeButtonPressed,
                    ]}
                    onPress={() => setShowTimePicker({ type: 'usualStart', dateIndex: null })}
                  >
                    <Text style={[
                      styles.timeButtonText,
                      !usualStartTime && styles.timeButtonTextPlaceholder
                    ]}>
                      {usualStartTime 
                        ? usualStartTime.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : '(optional)'}
                    </Text>
                    <MaterialIcons name="access-time" size={20} color={theme.colors.textSecondary} style={styles.timeIcon} />
                  </Pressable>
                </View>
                
                <View style={styles.timeInputContainer}>
                  <Text style={styles.timeLabel}>Usual End Time</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.timeButton,
                      pressed && styles.timeButtonPressed,
                    ]}
                    onPress={() => setShowTimePicker({ type: 'usualEnd', dateIndex: null })}
                  >
                    <Text style={[
                      styles.timeButtonText,
                      !usualEndTime && styles.timeButtonTextPlaceholder
                    ]}>
                      {usualEndTime 
                        ? usualEndTime.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : '(optional)'}
                    </Text>
                    <MaterialIcons name="access-time" size={20} color={theme.colors.textSecondary} style={styles.timeIcon} />
                  </Pressable>
                </View>
              </View>
            </View>

            {/* RSVP Required */}
            <View style={styles.fieldContainer}>
              <View style={styles.toggleRowCentered}>
                <Text style={styles.toggleLabel}>Ask people to RSVP?</Text>
                <Switch
                  value={rsvpRequired}
                  onValueChange={setRsvpRequired}
                  trackColor={{ false: '#ddd', true: '#d45d5d' }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </View>
        </View>

        <Button
          label={loading ? 'Creating...' : 'Create This MeepleUp!'}
          onPress={handleCreateEvent}
          disabled={loading}
          style={styles.fullButton}
        />
      </View>
      </ScrollView>
    </KeyboardAvoidingView>

      {/* Calendar Modal */}
      <Modal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        title="Select Event Dates"
        fullScreen={true}
      >
        <ScrollView
          style={styles.modalContent}
          contentContainerStyle={styles.modalScrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <View style={styles.modalFieldContainer}>
            <Text style={styles.fieldLabel}>Usual Time</Text>
            
            <View style={styles.timeRow}>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeLabel}>Start Time</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.timeButton,
                    pressed && styles.timeButtonPressed,
                  ]}
                  onPress={() => setShowTimePicker({ type: 'usualStart', dateIndex: null })}
                >
                  <Text style={[
                    styles.timeButtonText,
                    !usualStartTime && styles.timeButtonTextPlaceholder
                  ]}>
                    {usualStartTime 
                      ? usualStartTime.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : '(optional)'}
                  </Text>
                  <MaterialIcons name="access-time" size={20} color={theme.colors.textSecondary} style={styles.timeIcon} />
                </Pressable>
              </View>
              
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeLabel}>End Time</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.timeButton,
                    pressed && styles.timeButtonPressed,
                  ]}
                  onPress={() => setShowTimePicker({ type: 'usualEnd', dateIndex: null })}
                >
                  <Text style={[
                    styles.timeButtonText,
                    !usualEndTime && styles.timeButtonTextPlaceholder
                  ]}>
                    {usualEndTime 
                      ? usualEndTime.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : '(optional)'}
                  </Text>
                  <MaterialIcons name="access-time" size={20} color={theme.colors.textSecondary} style={styles.timeIcon} />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={[styles.modalFieldContainer, { marginBottom: theme.spacing.xs }]}>
            <Text style={styles.fieldLabel}>Long press to set dates, tap to edit times</Text>
            <CalendarDatePicker
              persistScrollRestore={false}
              selectedDates={selectedDates}
              onDatesChange={(newDates) => {
                if (__DEV__) {
                  logger.debug('[Onboarding] CalendarDatePicker onDatesChange callback received:', {
                    count: newDates.length,
                    dates: newDates.map(d => ({
                      date: d.date instanceof Date ? d.date.toISOString() : d.date,
                      dateLocal: d.date instanceof Date ? d.date.toString() : new Date(d.date).toString(),
                      startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
                      startTimeLocal: d.startTime instanceof Date ? d.startTime.toString() : new Date(d.startTime).toString(),
                      endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
                      endTimeLocal: d.endTime instanceof Date ? d.endTime.toString() : new Date(d.endTime).toString(),
                    })),
                  });
                }
                setSelectedDates(newDates);
              }}
              minDate={new Date()}
              usualStartTime={usualStartTime}
              usualEndTime={usualEndTime}
              onDateTimeEdit={(dateIndex, timeType) => {
                setShowTimePicker({ type: timeType || 'start', dateIndex });
              }}
              onDatePress={(dateIndex, dateInfo) => {
                if (__DEV__) {
                  logger.debug('[Onboarding] onDatePress called:', { dateIndex, dateInfo, selectedDatesLength: selectedDates.length });
                }
                
                // Close calendar modal first
                setShowCalendarModal(false);
                
                // Use setTimeout to ensure calendar modal closes before opening edit modal
                // Use ref to get latest selectedDates
                setTimeout(() => {
                  const currentDates = selectedDatesRef.current;
                  if (__DEV__) {
                    logger.debug('[Onboarding] setTimeout callback - currentDates length:', currentDates.length, 'dateIndex:', dateIndex);
                  }
                  
                  if (dateIndex !== null && dateIndex !== undefined && dateIndex >= 0 && currentDates[dateIndex]) {
                    const date = currentDates[dateIndex];
                    if (__DEV__) {
                      logger.debug('[Onboarding] Opening edit modal for date:', date);
                      logger.debug('[Onboarding] Setting editingDateIndex to:', dateIndex);
                    }
                    setEditingDateIndex(dateIndex);
                    setEditingDateForm({
                      location: date.location || '',
                      note: date.note || '',
                    });
                    if (__DEV__) {
                      logger.debug('[Onboarding] State updated, editingDateIndex should be:', dateIndex);
                    }
                  } else {
                    if (__DEV__) {
                      console.warn('[Onboarding] Invalid dateIndex or date not found:', { 
                        dateIndex, 
                        selectedDatesLength: currentDates.length,
                        selectedDates: currentDates.map((d, i) => ({ index: i, date: d.date }))
                      });
                    }
                  }
                }, 300);
              }}
            />
          </View>

          <View style={[styles.modalActions, { marginTop: 0 }]}>
            <Button
              label="Done"
              onPress={() => setShowCalendarModal(false)}
              style={styles.modalButton}
            />
          </View>
        </ScrollView>
      </Modal>

      {/* Date Edit Modal */}
      <Modal
        isOpen={editingDateIndex !== null}
        onClose={() => {
          if (__DEV__) {
            logger.debug('[Onboarding] Closing Date Edit Modal');
          }
          setEditingDateIndex(null);
          setEditingDateForm({ location: '', note: '' });
        }}
        title="Edit Event Date"
      >
        <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
          {editingDateIndex !== null && selectedDates[editingDateIndex] && (
            <>
              <View style={styles.modalFieldContainer}>
                <Text style={styles.fieldLabel}>
                  {selectedDates[editingDateIndex].date instanceof Date
                    ? selectedDates[editingDateIndex].date.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : new Date(selectedDates[editingDateIndex].date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                </Text>
              </View>

              <View style={styles.modalFieldContainer}>
                <Text style={styles.fieldLabel}>Start Time</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.timeButton,
                    pressed && styles.timeButtonPressed,
                  ]}
                  onPress={() => {
                    // Save current form state before closing
                    if (editingDateIndex !== null) {
                      const updatedDates = [...selectedDates];
                      updatedDates[editingDateIndex] = {
                        ...updatedDates[editingDateIndex],
                        location: editingDateForm.location.trim() || undefined,
                        note: editingDateForm.note.trim() || undefined,
                      };
                      setSelectedDates(updatedDates);
                    }
                    // Close edit modal first, then open time picker
                    const currentDateIndex = editingDateIndex;
                    setPendingEditDateIndex(currentDateIndex);
                    setEditingDateIndex(null);
                    setTimeout(() => {
                      setShowTimePicker({ type: 'start', dateIndex: currentDateIndex });
                    }, 300);
                  }}
                >
                  <Text style={styles.timeButtonText}>
                    {selectedDates[editingDateIndex].startTime instanceof Date
                      ? selectedDates[editingDateIndex].startTime.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : new Date(selectedDates[editingDateIndex].startTime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })}
                  </Text>
                  <MaterialIcons name="access-time" size={20} color={theme.colors.textSecondary} style={styles.timeIcon} />
                </Pressable>
              </View>

              <View style={styles.modalFieldContainer}>
                <Text style={styles.fieldLabel}>End Time</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.timeButton,
                    pressed && styles.timeButtonPressed,
                  ]}
                  onPress={() => {
                    // Save current form state before closing
                    if (editingDateIndex !== null) {
                      const updatedDates = [...selectedDates];
                      updatedDates[editingDateIndex] = {
                        ...updatedDates[editingDateIndex],
                        location: editingDateForm.location.trim() || undefined,
                        note: editingDateForm.note.trim() || undefined,
                      };
                      setSelectedDates(updatedDates);
                    }
                    // Close edit modal first, then open time picker
                    const currentDateIndex = editingDateIndex;
                    setPendingEditDateIndex(currentDateIndex);
                    setEditingDateIndex(null);
                    setTimeout(() => {
                      setShowTimePicker({ type: 'end', dateIndex: currentDateIndex });
                    }, 300);
                  }}
                >
                  <Text style={styles.timeButtonText}>
                    {selectedDates[editingDateIndex].endTime instanceof Date
                      ? selectedDates[editingDateIndex].endTime.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : new Date(selectedDates[editingDateIndex].endTime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })}
                  </Text>
                  <MaterialIcons name="access-time" size={20} color={theme.colors.textSecondary} style={styles.timeIcon} />
                </Pressable>
              </View>

              <View style={styles.modalFieldContainer}>
                <Text style={styles.fieldLabel}>Location</Text>
                <Input
                  placeholder={eventLocation || "Location for this date"}
                  value={editingDateForm.location}
                  onChangeText={(text) => {
                    setEditingDateForm(prev => ({ ...prev, location: text }));
                  }}
                  style={styles.input}
                />
              </View>

              <View style={styles.modalFieldContainer}>
                <Text style={styles.fieldLabel}>Note</Text>
                <Input
                  placeholder="Note for this date"
                  value={editingDateForm.note}
                  onChangeText={(text) => {
                    setEditingDateForm(prev => ({ ...prev, note: text }));
                  }}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  style={styles.input}
                />
                <Text style={styles.charCount}>
                  {editingDateForm.note.length}/500 characters
                </Text>
              </View>

              <View style={styles.modalActions}>
                <Button
                  label="Save"
                  onPress={() => {
                    if (editingDateIndex !== null) {
                      const updatedDates = [...selectedDates];
                      updatedDates[editingDateIndex] = {
                        ...updatedDates[editingDateIndex],
                        location: editingDateForm.location.trim() || undefined,
                        note: editingDateForm.note.trim() || undefined,
                      };
                      setSelectedDates(updatedDates);
                      setEditingDateIndex(null);
                      setEditingDateForm({ location: '', note: '' });
                    }
                  }}
                  style={styles.modalButton}
                />
                <Button
                  label="Cancel"
                  onPress={() => {
                    setEditingDateIndex(null);
                    setEditingDateForm({ location: '', note: '' });
                  }}
                  variant="outline"
                  style={styles.modalButton}
                />
              </View>
            </>
          )}
        </ScrollView>
      </Modal>

      {/* Time Picker Modal - Moved outside calendar modal so it can be used independently */}
        {showTimePicker.type && (
          Platform.OS === 'ios' ? (
            <Modal
              isOpen={true}
              onClose={() => {
                setShowTimePicker({ type: null, dateIndex: null });
                // Reopen edit modal if we were editing a date
                const currentPendingIndex = pendingEditDateIndex;
                if (currentPendingIndex !== null) {
                  setTimeout(() => {
                    const currentDates = selectedDatesRef.current;
                    const date = currentDates[currentPendingIndex];
                    if (date) {
                      setEditingDateIndex(currentPendingIndex);
                      setEditingDateForm({
                        location: date.location || '',
                        note: date.note || '',
                      });
                      setPendingEditDateIndex(null);
                    }
                  }, 300);
                }
              }}
              title={
                showTimePicker.type === 'usualStart' ? 'Usual Start Time' :
                showTimePicker.type === 'usualEnd' ? 'Usual End Time' :
                showTimePicker.type === 'start' ? 'Start Time' :
                'End Time'
              }
            >
              <View style={styles.timePickerModalContent}>
                <DateTimePicker
                  value={
                    showTimePicker.type === 'usualStart' ? (usualStartTime || new Date(new Date().setHours(18, 0, 0, 0))) :
                    showTimePicker.type === 'usualEnd' ? (usualEndTime || new Date(new Date().setHours(22, 0, 0, 0))) :
                    showTimePicker.dateIndex !== null && selectedDates[showTimePicker.dateIndex]
                      ? (showTimePicker.type === 'start' 
                          ? selectedDates[showTimePicker.dateIndex].startTime
                          : selectedDates[showTimePicker.dateIndex].endTime)
                      : new Date()
                  }
                  mode="time"
                  display="spinner"
                  is24Hour={false}
                  onChange={(event, date) => {
                    if (date) {
                      if (showTimePicker.type === 'usualStart') {
                        setUsualStartTime(date);
                        // Update all dates that haven't been individually edited
                        setSelectedDates(prev => prev.map(d => {
                          // Extract date components to preserve the date without timezone shifts
                          const dateObj = d.date instanceof Date ? d.date : new Date(d.date);
                          const year = dateObj.getFullYear();
                          const month = dateObj.getMonth();
                          const day = dateObj.getDate();
                          const newTime = new Date(year, month, day, date.getHours(), date.getMinutes(), 0, 0);
                        return { ...d, startTime: newTime, location: d.location, note: d.note };
                        }));
                      } else if (showTimePicker.type === 'usualEnd') {
                        setUsualEndTime(date);
                        setSelectedDates(prev => prev.map(d => {
                          // Extract date components to preserve the date without timezone shifts
                          const dateObj = d.date instanceof Date ? d.date : new Date(d.date);
                          const year = dateObj.getFullYear();
                          const month = dateObj.getMonth();
                          const day = dateObj.getDate();
                          const newTime = new Date(year, month, day, date.getHours(), date.getMinutes(), 0, 0);
                        return { ...d, endTime: newTime, location: d.location, note: d.note };
                        }));
                      } else if (showTimePicker.type === 'start' || showTimePicker.type === 'end') {
                        const updatedDates = [...selectedDates];
                        if (showTimePicker.dateIndex !== null && updatedDates[showTimePicker.dateIndex]) {
                          // Extract date components to preserve the date without timezone shifts
                          const dateObj = updatedDates[showTimePicker.dateIndex].date instanceof Date 
                            ? updatedDates[showTimePicker.dateIndex].date 
                            : new Date(updatedDates[showTimePicker.dateIndex].date);
                          const year = dateObj.getFullYear();
                          const month = dateObj.getMonth();
                          const day = dateObj.getDate();
                          const newTime = new Date(year, month, day, date.getHours(), date.getMinutes(), 0, 0);
                          updatedDates[showTimePicker.dateIndex] = {
                            ...updatedDates[showTimePicker.dateIndex],
                            [showTimePicker.type === 'start' ? 'startTime' : 'endTime']: newTime,
                          };
                          setSelectedDates(updatedDates);
                        }
                      }
                    }
                  }}
                  style={{ width: '100%', height: 200 }}
                />
                <View style={styles.iosPickerActions}>
                  {(showTimePicker.type === 'usualStart' || showTimePicker.type === 'usualEnd') && (
                    <Button
                      label="Clear"
                      onPress={() => {
                        if (showTimePicker.type === 'usualStart') {
                          setUsualStartTime(null);
                        } else if (showTimePicker.type === 'usualEnd') {
                          setUsualEndTime(null);
                        }
                        setShowTimePicker({ type: null, dateIndex: null });
                        // Reopen edit modal if we were editing a date
                        const currentPendingIndex = pendingEditDateIndex;
                        if (currentPendingIndex !== null) {
                          setTimeout(() => {
                            const currentDates = selectedDatesRef.current;
                            const date = currentDates[currentPendingIndex];
                            if (date) {
                              setEditingDateIndex(currentPendingIndex);
                              setEditingDateForm({
                                location: date.location || '',
                                note: date.note || '',
                              });
                              setPendingEditDateIndex(null);
                            }
                          }, 300);
                        }
                      }}
                      variant="outline"
                      style={styles.modalButton}
                    />
                  )}
                  <Button
                    label="Done"
                    onPress={() => {
                      setShowTimePicker({ type: null, dateIndex: null });
                      // Reopen edit modal if we were editing a date
                      const currentPendingIndex = pendingEditDateIndex;
                      if (currentPendingIndex !== null) {
                        setTimeout(() => {
                          const currentDates = selectedDatesRef.current;
                          const date = currentDates[currentPendingIndex];
                          if (date) {
                            setEditingDateIndex(currentPendingIndex);
                            setEditingDateForm({
                              location: date.location || '',
                              note: date.note || '',
                            });
                            setPendingEditDateIndex(null);
                          }
                        }, 300);
                      }
                    }}
                    style={styles.modalButton}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            showTimePicker.type && (
              <DateTimePicker
                value={
                  showTimePicker.type === 'usualStart' ? (usualStartTime || new Date(new Date().setHours(18, 0, 0, 0))) :
                  showTimePicker.type === 'usualEnd' ? (usualEndTime || new Date(new Date().setHours(22, 0, 0, 0))) :
                  showTimePicker.dateIndex !== null && selectedDates[showTimePicker.dateIndex]
                    ? (showTimePicker.type === 'start' 
                        ? selectedDates[showTimePicker.dateIndex].startTime
                        : selectedDates[showTimePicker.dateIndex].endTime)
                    : new Date()
                }
                mode="time"
                display="default"
                is24Hour={false}
                onChange={(event, date) => {
                  if (date && event.type !== 'dismissed') {
                    if (showTimePicker.type === 'usualStart') {
                      setUsualStartTime(date);
                      setSelectedDates(prev => prev.map(d => {
                        // Extract date components to preserve the date without timezone shifts
                        const dateObj = d.date instanceof Date ? d.date : new Date(d.date);
                        const year = dateObj.getFullYear();
                        const month = dateObj.getMonth();
                        const day = dateObj.getDate();
                        const newTime = new Date(year, month, day, date.getHours(), date.getMinutes(), 0, 0);
                        return { ...d, startTime: newTime, location: d.location, note: d.note };
                      }));
                    } else if (showTimePicker.type === 'usualEnd') {
                      setUsualEndTime(date);
                      setSelectedDates(prev => prev.map(d => {
                        // Extract date components to preserve the date without timezone shifts
                        const dateObj = d.date instanceof Date ? d.date : new Date(d.date);
                        const year = dateObj.getFullYear();
                        const month = dateObj.getMonth();
                        const day = dateObj.getDate();
                        const newTime = new Date(year, month, day, date.getHours(), date.getMinutes(), 0, 0);
                        return { ...d, endTime: newTime, location: d.location, note: d.note };
                      }));
                    } else if (showTimePicker.type === 'start' || showTimePicker.type === 'end') {
                      const updatedDates = [...selectedDates];
                      if (showTimePicker.dateIndex !== null && updatedDates[showTimePicker.dateIndex]) {
                        // Extract date components to preserve the date without timezone shifts
                        const dateObj = updatedDates[showTimePicker.dateIndex].date instanceof Date 
                          ? updatedDates[showTimePicker.dateIndex].date 
                          : new Date(updatedDates[showTimePicker.dateIndex].date);
                        const year = dateObj.getFullYear();
                        const month = dateObj.getMonth();
                        const day = dateObj.getDate();
                        const newTime = new Date(year, month, day, date.getHours(), date.getMinutes(), 0, 0);
                        updatedDates[showTimePicker.dateIndex] = {
                          ...updatedDates[showTimePicker.dateIndex],
                          [showTimePicker.type === 'start' ? 'startTime' : 'endTime']: newTime,
                          location: updatedDates[showTimePicker.dateIndex].location,
                          note: updatedDates[showTimePicker.dateIndex].note,
                        };
                        setSelectedDates(updatedDates);
                      }
                    }
                    setShowTimePicker({ type: null, dateIndex: null });
                    // Reopen edit modal if we were editing a date
                    const currentPendingIndex = pendingEditDateIndex;
                    if (currentPendingIndex !== null) {
                      setTimeout(() => {
                        const currentDates = selectedDatesRef.current;
                        const date = currentDates[currentPendingIndex];
                        if (date) {
                          setEditingDateIndex(currentPendingIndex);
                          setEditingDateForm({
                            location: date.location || '',
                            note: date.note || '',
                          });
                          setPendingEditDateIndex(null);
                        }
                      }, 300);
                    }
                  }
                }}
              />
            )
          )
        )}
    {selectedUserForProfile && (
      <UserProfileModal
        isOpen={!!selectedUserForProfile}
        onClose={() => setSelectedUserForProfile(null)}
        userId={selectedUserForProfile.userId}
        userName={selectedUserForProfile.userName}
        avatarUrl={selectedUserForProfile.avatarUrl}
      />
    )}

    {/* MeepleUp Purchase Modal */}
    <MeepleupPurchaseModal
      visible={showPurchaseModal}
      onClose={() => {
        setShowPurchaseModal(false);
        setPendingEventData(null);
      }}
      onPurchaseComplete={async () => {
        setShowPurchaseModal(false);
        // Retry creating the event after purchase
        if (pendingEventData) {
          setLoading(true);
          try {
            const result = await createEventWithPurchaseCheck(pendingEventData);
            if (result.success) {
              const newEvent = result.event;
              setEventName('');
              setEventLocation('');
              setEventAddress('');
              setSelectedDates([]);
              setUsualStartTime(null);
              setUsualEndTime(null);
              setEventDescription('');
              setRsvpRequired(true);
              setMemberLimit('');
              setShowCalendarModal(false);
              setError('');
              setPendingEventData(null);

              Alert.alert(
                'MeepleUp Created',
                'Your MeepleUp has been created successfully!',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.replace('EventHub', {
                      eventId: newEvent.id,
                      joinCode: newEvent.joinCode,
                    }),
                  },
                ],
              );
            } else {
              setError(result.error || 'Failed to create MeepleUp. Please try again.');
            }
          } catch (err) {
            setError('Failed to create MeepleUp. Please try again.');
            console.error(err);
          } finally {
            setLoading(false);
          }
        }
      }}
      userId={user?.uid || user?.id}
    />

    {/* Join Success Modal */}
    <Modal
      isOpen={!!joinedEventName}
      onClose={() => setJoinedEventName(null)}
      title="Successfully Joined!"
    >
      <View style={styles.successModalContent}>
        <View style={styles.successIconContainer}>
          <MaterialIcons name="check-circle" size={64} color={theme.colors.success || theme.colors.meepleRed} />
        </View>
        <Text style={styles.successModalText}>
          You've successfully joined
        </Text>
        <Text style={styles.successModalEventName}>
          "{joinedEventName}"
        </Text>
        <Text style={styles.successModalSubtext}>
          You can now see this MeepleUp in your "MeepleUps" tab and start proposing games!
        </Text>
        <Button
          label="Got it!"
          onPress={() => setJoinedEventName(null)}
          style={styles.successModalButton}
        />
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    backgroundColor: theme.colors.bgColor, // Wood table background
  },
  createFormContainer: {
    paddingBottom: 400,
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
    justifyContent: 'center',
  },
  title: {
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    backgroundColor: 'transparent',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  bggLogoContainer: {
    marginBottom: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: '100%',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  options: {
    marginBottom: theme.spacing.lg,
  },
  optionCard: {
    ...commonStyles.card,
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
    marginBottom: theme.spacing.lg,
  },
  optionCardPressed: {
    opacity: 0.7,
  },
  optionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  optionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginLeft: theme.spacing.sm,
  },
  plusSymbol: {
    fontSize: 28,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
  },
  optionText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.fontSize.sm * theme.typography.lineHeight.normal,
  },
  backButton: {
    marginBottom: theme.spacing.md,
    alignSelf: 'flex-start',
    borderRadius: 0,
  },
  input: {
    marginBottom: theme.spacing.lg,
    borderRadius: 0,
  },
  fullButton: {
    width: '100%',
    borderRadius: 0,
  },
  error: {
    color: theme.colors.error,
    fontSize: theme.typography.fontSize.sm,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.meepleRed,
    marginBottom: theme.spacing.lg,
  },
  subsection: {
    marginBottom: theme.spacing.lg,
    paddingLeft: theme.spacing.sm,
  },
  subsectionTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  fieldContainer: {
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subcategoryContainer: {
    marginLeft: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  subcategoryLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  subcategoryInput: {
    marginBottom: theme.spacing.lg,
    borderRadius: 0,
  },
  fieldExample: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: theme.spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  toggleRowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  toggleLabelContainer: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  toggleLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  toggleDescription: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  pickerContainer: {
    backgroundColor: theme.colors.woodLight,
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
    borderRadius: 0,
    padding: theme.spacing.md,
  },
  pickerText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  indentedInput: {
    marginTop: theme.spacing.sm,
  },
  charCount: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'right',
    marginTop: theme.spacing.xs,
  },
  dateTimePicker: {
    marginBottom: 0,
  },
  timeRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  timeInputContainer: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  timeButton: {
    backgroundColor: theme.colors.surfaceColor,
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
    borderRadius: 0,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeButtonPressed: {
    borderColor: theme.colors.meepleRed,
    backgroundColor: theme.colors.woodLight,
  },
  timeButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  timeButtonTextPlaceholder: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.normal,
    color: theme.colors.textSecondary,
  },
  timeIcon: {
    marginLeft: theme.spacing.sm,
  },
  calendarButton: {
    marginTop: theme.spacing.sm,
    borderRadius: 0,
  },
  calendarButtonPressable: {
    ...commonStyles.button,
    backgroundColor: theme.colors.feltGreen,
    borderWidth: 2,
    borderColor: theme.colors.feltGreen,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    ...theme.shadows.card,
  },
  calendarButtonPressed: {
    opacity: 0.9,
    backgroundColor: theme.colors.feltGreen,
    transform: [{ scale: 0.98 }],
  },
  calendarButtonIcon: {
    marginRight: theme.spacing.sm,
  },
  calendarButtonText: {
    ...commonStyles.buttonText,
    color: '#ffffff',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    flex: 1,
    textAlign: 'center',
  },
  modalContent: {
    padding: theme.spacing.xl,
  },
  modalScrollContent: {
    paddingBottom: theme.spacing['2xl'],
  },
  modalFieldContainer: {
    marginBottom: theme.spacing['2xl'],
  },
  fieldHint: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  modalActions: {
    marginTop: theme.spacing.sm,
  },
  modalButton: {
    marginBottom: theme.spacing.md,
    borderRadius: 0,
  },
  iosPickerActions: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
  },
  timePickerModalContent: {
    padding: theme.spacing.xl,
    minHeight: 280,
  },
  eventsSection: {
    width: '100%',
    marginBottom: theme.spacing['2xl'],
    position: 'relative',
  },
  membershipsToken: {
    alignSelf: 'center',
    backgroundColor: '#b89d7a', // Cardboard tan/brown color
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md * 1.5,
    paddingVertical: theme.spacing.sm * 1.5,
    marginBottom: -theme.spacing.sm, // Overlap the top card slightly
    zIndex: 10, // Ensure it appears above the cards
    // Sharp shadows on bottom and left for thick card-stock appearance
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 4 }, // Negative width for left shadow, positive height for bottom
    shadowOpacity: 0.6,
    shadowRadius: 3, // Sharp, less diffuse shadow
    elevation: 6, // Android shadow
    // Thicker borders on bottom and left for depth
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#6b5435', // Darker brown border
    borderStyle: 'solid',
  },
  membershipsTokenText: {
    fontSize: theme.typography.fontSize.sm * 1.5,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#2b1f14', // Dark brown text on cardboard for good contrast
    textShadowColor: 'rgba(255, 255, 255, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  emptyMembershipsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  emptyMembershipsIcon: {
    marginRight: theme.spacing.sm,
    marginTop: 2, // Slight vertical alignment adjustment
  },
  emptyMembershipsText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.fontSize.sm * theme.typography.lineHeight.normal,
    flex: 1,
  },
  eventsSectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
  },
  eventCard: {
    backgroundColor: theme.colors.cardSurface,
    // borderRadius removed - let EventCard component's borderRadius (20px) take effect
    borderWidth: 2,
    borderColor: theme.colors.meepleRed,
    marginBottom: theme.spacing.md,
    minHeight: 60,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  eventCardContent: {
    padding: theme.spacing.lg,
    justifyContent: 'center',
    backgroundColor: theme.colors.cardSurface,
  },
  eventCardPressed: {
    opacity: 0.9,
    backgroundColor: theme.colors.woodLight,
    borderColor: theme.colors.meepleRed,
    ...theme.shadows.card,
  },
  eventCardTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventCardTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    backgroundColor: theme.colors.woodLight,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: 0,
    flex: 1,
  },
  eventCardArrow: {
    fontSize: theme.typography.fontSize['2xl'],
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.bold,
    marginLeft: theme.spacing.md,
  },
  leaveButton: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
    backgroundColor: theme.colors.woodLight,
  },
  leaveButtonText: {
    color: theme.colors.meepleRed,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: 'center',
  },
  joinSection: {
    marginBottom: theme.spacing['2xl'],
    // No background - let the wood show through behind the cardboard
    // No padding or border - the cardboard container has its own styling
  },
  organizeCard: {
    marginBottom: theme.spacing['2xl'],
    backgroundColor: '#b89d7a', // Cardboard tan/brown color
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.xl,
    // Shadows only on bottom and left - less diffuse
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 6 }, // Negative width for left shadow, positive height for bottom
    shadowOpacity: 0.5,
    shadowRadius: 6, // Less diffuse shadow
    elevation: 8, // Android shadow
    // Thinner borders on top and right, thicker on bottom and left for perspective
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#6b5435', // Darker brown border
    borderStyle: 'solid',
  },
  organizeTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  organizeTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: '#2b1f14', // Dark brown text on cardboard for good contrast
    textShadowColor: 'rgba(255, 255, 255, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    flex: 1,
  },
  organizeSubtitle: {
    fontSize: theme.typography.fontSize.base,
    color: '#4a3d2f', // Darker brown text on cardboard
    lineHeight: theme.typography.fontSize.base * theme.typography.lineHeight.normal,
    marginBottom: theme.spacing.lg,
  },
  hostButton: {
    alignSelf: 'center',
    width: 'auto',
    paddingHorizontal: theme.spacing.xl,
  },
  archivedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  archivedHeaderText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  archivedCard: {
    opacity: 0.7,
    borderColor: theme.colors.woodMedium,
  },
  joinTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  joinSubtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
    lineHeight: theme.typography.fontSize.base * theme.typography.lineHeight.normal,
  },
  requiredAsterisk: {
    color: theme.colors.meepleRed,
  },
  successModalContent: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  successIconContainer: {
    marginBottom: theme.spacing.md,
  },
  successModalText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  successModalEventName: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  successModalSubtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
  },
  successModalButton: {
    width: '100%',
    borderRadius: 0,
  },
});

export default Onboarding;