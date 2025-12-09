import React, { useState, useRef, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, useWindowDimensions, Switch, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { validateJoinCode } from '../utils/api';
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

const Onboarding = () => {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { user, updateUser } = useAuth();
  const { joinEventWithCode, createEvent, getUserEvents, leaveEvent, getEventById } = useEvents();
  const [joinCodeWord1, setJoinCodeWord1] = useState('');
  const [joinCodeWord2, setJoinCodeWord2] = useState('');
  const [joinCodeWord3, setJoinCodeWord3] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventAddress, setEventAddress] = useState('');
  const [selectedDates, setSelectedDates] = useState([]); // Array of { date: Date, startTime: Date, endTime: Date }
  const [usualStartTime, setUsualStartTime] = useState(new Date(new Date().setHours(18, 0, 0, 0))); // Default 6 PM
  const [usualEndTime, setUsualEndTime] = useState(new Date(new Date().setHours(22, 0, 0, 0))); // Default 10 PM
  const [showTimePicker, setShowTimePicker] = useState({ type: null, dateIndex: null }); // { type: 'usualStart' | 'usualEnd' | 'start' | 'end', dateIndex: number }
  const [showCalendarModal, setShowCalendarModal] = useState(false);
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
  const scrollViewRef = useRef(null);

  const handleModeChange = (nextMode) => {
    setError('');
    if (nextMode === 'choice') {
      setEventName('');
      setEventLocation('');
      setEventAddress('');
      setSelectedDates([]);
      setUsualStartTime(new Date(new Date().setHours(18, 0, 0, 0)));
      setUsualEndTime(new Date(new Date().setHours(22, 0, 0, 0)));
      setEventDescription('');
      setRsvpRequired(true);
      setMemberLimit('');
      setJoinCodeWord1('');
      setJoinCodeWord2('');
      setJoinCodeWord3('');
      setShowCalendarModal(false);
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

      // Navigate back to the choice screen to show the event in the list
      setLoading(false);
      handleModeChange('choice');
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.error(err);
      setLoading(false);
    }
  };



  const handleCreateEvent = async () => {
    if (!user) {
      setError('Please sign in before organizing a MeepleUp.');
      return;
    }

    if (!eventName.trim() || !eventLocation.trim() || selectedDates.length === 0) {
      setError('Please fill in all required MeepleUp details, including at least one event date.');
      return;
    }

    setLoading(true);
    try {
      // Convert dates to ISO strings for storage
      const eventDates = selectedDates.map(d => ({
        date: d.date.toISOString(),
        startTime: d.startTime.toISOString(),
        endTime: d.endTime.toISOString(),
      }));
      
      const eventData = {
        name: eventName.trim(),
        location: eventLocation.trim(),
        address: eventAddress.trim() || '',
        eventDates,
        usualStartTime: usualStartTime.toISOString(),
        usualEndTime: usualEndTime.toISOString(),
        scheduledFor: selectedDates[0]?.date.toISOString() || '', // For backward compatibility
        description: eventDescription.trim(),
        visibility: 'private', // Invite only for v1
        organizerId: user.uid,
      };

      // Add member limit if provided
      if (memberLimit.trim()) {
        const limit = parseInt(memberLimit.trim(), 10);
        if (!isNaN(limit) && limit > 0) {
          eventData.memberLimit = limit;
        }
      }

      const newEvent = await createEvent(eventData);

      setEventName('');
      setEventLocation('');
      setEventAddress('');
      setSelectedDates([]);
      setUsualStartTime(new Date(new Date().setHours(18, 0, 0, 0)));
      setUsualEndTime(new Date(new Date().setHours(22, 0, 0, 0)));
      setEventDescription('');
      setRsvpRequired(true);
      setMemberLimit('');
      setShowCalendarModal(false);
      setError('');

      Alert.alert(
        'MeepleUp Organized',
        `Share this membership link or code so trusted guests can join:\n\nCode: ${newEvent.joinCode}`,
        [
          {
            text: 'View MeepleUp',
            onPress: () => navigation.replace('EventHub', {
              eventId: newEvent.id,
              joinCode: newEvent.joinCode,
            }),
          },
          {
            text: 'Done',
            style: 'cancel',
            onPress: () => handleModeChange('choice'),
          },
        ],
      );
    } catch (err) {
      setError('Failed to organize MeepleUp. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Get user's events and sort by creation date (newest first)
  const userIdentifier = user?.uid || user?.id;
  let userEvents = [];
  try {
    if (userIdentifier && getUserEvents) {
      const events = getUserEvents(userIdentifier);
      userEvents = Array.isArray(events) ? events : [];
    }
  } catch (error) {
    console.error('Error getting user events:', error);
    userEvents = [];
  }
  
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
              console.warn(`Permission denied fetching members for event ${event.id}, using fallback data`);
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
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Welcome to MeepleUp!</Text>
          <View style={[styles.bggLogoContainer, { width: width * 0.5 }]}>
            <PoweredByBGG 
              size="extraLarge" 
              variant="color" 
              containerWidth={width * 0.5}
            />
          </View>
    
          {/* User's MeepleUps */}
          {Array.isArray(sortedEvents) && sortedEvents.length > 0 && (
            <View style={styles.eventsSection}>
              {sortedEvents.map((event) => {
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
                    organizerName={organizer.name}
                    organizerAvatarUrl={organizer.avatarUrl}
                    onOrganizerPress={(userId, userName, avatarUrl) => {
                      setSelectedUserForProfile({ userId, userName, avatarUrl });
                    }}
                    memberAvatars={memberAvatars}
                    memberNames={memberNames}
                    onMemberPress={(userId, userName, avatarUrl) => {
                      setSelectedUserForProfile({ userId, userName, avatarUrl });
                    }}
                  />
                );
              })}
            </View>
          )}
          
          {/* Join an existing MeepleUp Section */}
          <View style={styles.joinSection}>
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
            <Pressable
              style={({ pressed }) => [
                styles.optionCard,
                pressed && styles.optionCardPressed,
              ]}
              onPress={() => handleModeChange('create')}
            >
              <View style={styles.optionTitleContainer}>
                <Text style={styles.plusSymbol}>+</Text>
                <Text style={styles.optionTitle}>Organize</Text>
              </View>
              <Text style={styles.optionText}>
                Organize your own game night and share a join code with friends.
              </Text>
            </Pressable>
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
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.content}>
            <Button
              label="← Back"
              onPress={() => handleModeChange('choice')}
              variant="outline"
              style={styles.backButton}
            />
            <Text style={styles.title}>Join an existing MeepleUp</Text>
            <Text style={styles.subtitle}>
              Enter the three-word join code provided by your game night organizer.
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
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.content}>
        <Button
          label="← Back"
          onPress={() => handleModeChange('choice')}
          variant="outline"
          style={styles.backButton}
        />
        <Text style={styles.title}>Organize a MeepleUp</Text>
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
              <Text style={styles.fieldExample}>Example: "Tuesday Game Night at Joe's"</Text>
              <Input
                placeholder="Give your event a name"
                value={eventName}
                onChangeText={(text) => {
                  setEventName(text);
                  setError('');
                }}
                style={styles.input}
              />
            </View>

            {/* Date & Time */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Date & Time <Text style={styles.requiredAsterisk}>*</Text></Text>
              <Text style={styles.fieldExample}>
                Select dates from the calendar. Set default times that will apply to all selected dates.
              </Text>
              
              {/* Usual Time */}
              <View style={styles.timeRow}>
                <View style={styles.timeInputContainer}>
                  <Text style={styles.timeLabel}>Usual Start Time</Text>
                  <Pressable
                    style={styles.timeButton}
                    onPress={() => setShowTimePicker({ type: 'usualStart', dateIndex: null })}
                  >
                    <Text style={styles.timeButtonText}>
                      {usualStartTime.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </Text>
                  </Pressable>
                </View>
                
                <View style={styles.timeInputContainer}>
                  <Text style={styles.timeLabel}>Usual End Time</Text>
                  <Pressable
                    style={styles.timeButton}
                    onPress={() => setShowTimePicker({ type: 'usualEnd', dateIndex: null })}
                  >
                    <Text style={styles.timeButtonText}>
                      {usualEndTime.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Calendar Button */}
              <Button
                label={selectedDates.length > 0 
                  ? `View Calendar (${selectedDates.length} date${selectedDates.length !== 1 ? 's' : ''} selected)`
                  : 'Select Dates from Calendar'}
                onPress={() => setShowCalendarModal(true)}
                variant="outline"
                style={styles.calendarButton}
              />
            </View>

            {/* Location */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Location <Text style={styles.requiredAsterisk}>*</Text></Text>
              <Text style={styles.fieldExample}>Example: "Jason's house" or "Nelson's Market"</Text>
              <Input
                placeholder="Jason's house"
                value={eventLocation}
                onChangeText={(text) => {
                  setEventLocation(text);
                  setError('');
                }}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Address</Text>
              <Text style={styles.fieldExample}>Example: "123 Tolkien Dr."</Text>
              <Input
                placeholder="123 Tolkien Dr."
                value={eventAddress}
                onChangeText={(text) => {
                  setEventAddress(text);
                  setError('');
                }}
                style={styles.input}
              />
            </View>
          </View>

          {/* Access Control */}
          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Access Control</Text>
            
            {/* Who can join? */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Who can join?</Text>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelContainer}>
                  <Text style={styles.toggleLabel}>Private: Invite only</Text>
                  <Text style={styles.toggleDescription}>
                    A join code will be generated for this event
                  </Text>
                </View>
              </View>
            </View>

            {/* RSVP Required */}
            <View style={styles.fieldContainer}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelContainer}>
                  <Text style={styles.toggleLabel}>RSVP Required?</Text>
                  <Text style={styles.toggleDescription}>
                    {rsvpRequired 
                      ? 'Members must RSVP Going/Maybe/No' 
                      : 'Attendance is optional/flexible'}
                  </Text>
                </View>
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

        {/* Optional Fields */}
        <View style={styles.section}>
          {/* MeepleUp Description */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>MeepleUp Description</Text>
            <Text style={styles.fieldExample}>Example: "Bring snacks! We'll be playing heavy euros."</Text>
            <Input
              placeholder="Bring snacks! We'll be playing heavy euros."
              value={eventDescription}
              onChangeText={(text) => {
                setEventDescription(text);
                setError('');
              }}
              multiline
              numberOfLines={3}
              maxLength={500}
              style={styles.input}
            />
            <Text style={styles.charCount}>
              {eventDescription.length}/500 characters
            </Text>
          </View>

          {/* Member Limit */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Member Limit</Text>
            <Text style={styles.fieldExample}>Example: "Max 6 players" (leave blank = unlimited)</Text>
            <Input
              placeholder="Leave blank for unlimited"
              value={memberLimit}
              onChangeText={(text) => {
                // Only allow numbers
                const numericValue = text.replace(/[^0-9]/g, '');
                setMemberLimit(numericValue);
                setError('');
              }}
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
        </View>

        <Button
          label={loading ? 'Organizing...' : 'Organize MeepleUp'}
          onPress={handleCreateEvent}
          disabled={loading}
          style={styles.fullButton}
        />
      </View>

      {/* Calendar Modal */}
      <Modal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        title="Select Event Dates"
        fullScreen={true}
      >
        <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
          <View style={styles.modalFieldContainer}>
            <Text style={styles.fieldLabel}>Usual Time</Text>
            <Text style={styles.fieldHint}>
              Set the default start and end times. These will be used for all selected dates unless you edit individual dates.
            </Text>
            
            <View style={styles.timeRow}>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeLabel}>Start Time</Text>
                <Pressable
                  style={styles.timeButton}
                  onPress={() => setShowTimePicker({ type: 'usualStart', dateIndex: null })}
                >
                  <Text style={styles.timeButtonText}>
                    {usualStartTime.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </Pressable>
              </View>
              
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeLabel}>End Time</Text>
                <Pressable
                  style={styles.timeButton}
                  onPress={() => setShowTimePicker({ type: 'usualEnd', dateIndex: null })}
                >
                  <Text style={styles.timeButtonText}>
                    {usualEndTime.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.modalFieldContainer}>
            <Text style={styles.fieldLabel}>Select Event Dates</Text>
            <Text style={styles.fieldHint}>
              Scroll through the calendar to see the next 12 months. Tap dates to select or deselect them. Selected dates show their times below. Tap a date's time on the calendar to edit it individually.
            </Text>
            <CalendarDatePicker
              selectedDates={selectedDates}
              onDatesChange={setSelectedDates}
              minDate={new Date()}
              usualStartTime={usualStartTime}
              usualEndTime={usualEndTime}
              onDateTimeEdit={(dateIndex, timeType) => {
                setShowTimePicker({ type: timeType || 'start', dateIndex });
              }}
            />
          </View>

          <View style={styles.modalActions}>
            <Button
              label="Done"
              onPress={() => setShowCalendarModal(false)}
              style={styles.modalButton}
            />
          </View>
        </ScrollView>

        {/* Time Picker Modal */}
        {showTimePicker.type && (
          Platform.OS === 'ios' ? (
            <Modal
              isOpen={true}
              onClose={() => setShowTimePicker({ type: null, dateIndex: null })}
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
                    showTimePicker.type === 'usualStart' ? usualStartTime :
                    showTimePicker.type === 'usualEnd' ? usualEndTime :
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
                          const newDate = new Date(d.date);
                          newDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
                          return { ...d, startTime: newDate };
                        }));
                      } else if (showTimePicker.type === 'usualEnd') {
                        setUsualEndTime(date);
                        setSelectedDates(prev => prev.map(d => {
                          const newDate = new Date(d.date);
                          newDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
                          return { ...d, endTime: newDate };
                        }));
                      } else if (showTimePicker.type === 'start' || showTimePicker.type === 'end') {
                        const updatedDates = [...selectedDates];
                        if (showTimePicker.dateIndex !== null && updatedDates[showTimePicker.dateIndex]) {
                          const newTime = new Date(updatedDates[showTimePicker.dateIndex].date);
                          newTime.setHours(date.getHours(), date.getMinutes(), 0, 0);
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
                  <Button
                    label="Done"
                    onPress={() => setShowTimePicker({ type: null, dateIndex: null })}
                    style={styles.modalButton}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            showTimePicker.type && (
              <DateTimePicker
                value={
                  showTimePicker.type === 'usualStart' ? usualStartTime :
                  showTimePicker.type === 'usualEnd' ? usualEndTime :
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
                        const newDate = new Date(d.date);
                        newDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
                        return { ...d, startTime: newDate };
                      }));
                    } else if (showTimePicker.type === 'usualEnd') {
                      setUsualEndTime(date);
                      setSelectedDates(prev => prev.map(d => {
                        const newDate = new Date(d.date);
                        newDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
                        return { ...d, endTime: newDate };
                      }));
                    } else if (showTimePicker.type === 'start' || showTimePicker.type === 'end') {
                      const updatedDates = [...selectedDates];
                      if (showTimePicker.dateIndex !== null && updatedDates[showTimePicker.dateIndex]) {
                        const newTime = new Date(updatedDates[showTimePicker.dateIndex].date);
                        newTime.setHours(date.getHours(), date.getMinutes(), 0, 0);
                        updatedDates[showTimePicker.dateIndex] = {
                          ...updatedDates[showTimePicker.dateIndex],
                          [showTimePicker.type === 'start' ? 'startTime' : 'endTime']: newTime,
                        };
                        setSelectedDates(updatedDates);
                      }
                    }
                    setShowTimePicker({ type: null, dateIndex: null });
                  }
                }}
              />
            )
          )
        )}
      </Modal>
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
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
  },
  createFormContainer: {
    paddingBottom: 400,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 20,
    textAlign: 'center',
  },
  bggLogoContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: '100%',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  options: {
    marginBottom: 16,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    marginBottom: 16,
  },
  optionCardPressed: {
    opacity: 0.7,
  },
  optionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  plusSymbol: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#d45d5d',
  },
  optionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  backButton: {
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  input: {
    marginBottom: 16,
  },
  fullButton: {
    width: '100%',
  },
  error: {
    color: '#d32f2f',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#d45d5d',
    marginBottom: 16,
  },
  subsection: {
    marginBottom: 24,
    paddingLeft: 8,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  fieldExample: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 8,
  },
  toggleLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  toggleDescription: {
    fontSize: 12,
    color: '#666',
  },
  pickerContainer: {
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#dee2e6',
    borderRadius: 8,
    padding: 12,
  },
  pickerText: {
    fontSize: 14,
    color: '#666',
  },
  indentedInput: {
    marginTop: 8,
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  dateTimePicker: {
    marginBottom: 0,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 16,
  },
  timeInputContainer: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  timeButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2f2f2f',
  },
  calendarButton: {
    marginTop: 8,
  },
  modalContent: {
    padding: 20,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  modalFieldContainer: {
    marginBottom: 24,
  },
  fieldHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginBottom: 12,
  },
  modalActions: {
    marginTop: 8,
  },
  modalButton: {
    marginBottom: 12,
  },
  iosPickerActions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  timePickerModalContent: {
    padding: 20,
    minHeight: 280,
  },
  eventsSection: {
    width: '100%',
    marginBottom: 24,
  },
  eventsSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d45d5d',
    marginBottom: 12,
    minHeight: 60,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventCardContent: {
    padding: 16,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  eventCardPressed: {
    opacity: 0.9,
    backgroundColor: '#fff5f5',
    borderColor: '#b84d4d',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  eventCardTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventCardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    flex: 1,
  },
  eventCardArrow: {
    fontSize: 24,
    color: '#d45d5d',
    fontWeight: 'bold',
    marginLeft: 12,
  },
  leaveButton: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff5f5',
  },
  leaveButtonText: {
    color: '#d45d5d',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  joinSection: {
    marginBottom: 32,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  joinTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  joinSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    lineHeight: 22,
  },
  requiredAsterisk: {
    color: '#d45d5d',
  },
});

export default Onboarding;