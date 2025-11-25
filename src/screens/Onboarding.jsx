import React, { useState, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, useWindowDimensions, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { validateJoinCode } from '../utils/api';
import { getUserLocation } from '../utils/helpers';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import AdvancedDateTimePicker from '../components/common/DateTimePicker';
import PoweredByBGG from '../components/PoweredByBGG';

const Onboarding = () => {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { user, updateUser } = useAuth();
  const { joinEventWithCode, createEvent, getUserEvents, leaveEvent, getEventById } = useEvents();
  const [joinCodeWord1, setJoinCodeWord1] = useState('');
  const [joinCodeWord2, setJoinCodeWord2] = useState('');
  const [joinCodeWord3, setJoinCodeWord3] = useState('');
  const [location, setLocation] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventGeneralLocation, setEventGeneralLocation] = useState('');
  const [eventExactLocation, setEventExactLocation] = useState('');
  const [shareExactAddress, setShareExactAddress] = useState(false);
  const [eventDateTime, setEventDateTime] = useState(null);
  const [eventDescription, setEventDescription] = useState('');
  const [rsvpRequired, setRsvpRequired] = useState(true);
  const [whoCanJoin, setWhoCanJoin] = useState('private'); // 'private' or 'public' (for v1, only 'private')
  const [memberLimit, setMemberLimit] = useState('');
  const [mode, setMode] = useState('choice'); // 'choice', 'join', 'discover', 'create'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef(null);

  const handleModeChange = (nextMode) => {
    setError('');
    if (nextMode === 'choice') {
      setEventName('');
      setEventGeneralLocation('');
      setEventExactLocation('');
      setShareExactAddress(false);
      setEventDateTime(null);
      setEventDescription('');
      setRsvpRequired(true);
      setWhoCanJoin('private');
      setMemberLimit('');
      setJoinCodeWord1('');
      setJoinCodeWord2('');
      setJoinCodeWord3('');
    }
    setMode(nextMode);
  };

  const handleJoinCodeWordChange = (wordIndex, text) => {
    // Keep lowercase for word phrases, just trim
    const trimmed = text.trim().toLowerCase();
    if (wordIndex === 1) {
      setJoinCodeWord1(trimmed);
    } else if (wordIndex === 2) {
      setJoinCodeWord2(trimmed);
    } else if (wordIndex === 3) {
      setJoinCodeWord3(trimmed);
    }
    setError('');
  };

  const handleLocationChange = (text) => {
    setLocation(text);
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

  const handleDiscoverEvents = async () => {
    if (!user) {
      setError('Please sign in before discovering MeepleUps.');
      return;
    }

    if (!location.trim()) {
      setError('Please enter your location');
      return;
    }

    setLoading(true);
    try {
      await updateUser({ location: location.trim() });
      // Only navigate if navigation is available and user is authenticated
      if (navigation && navigation.replace) {
        try {
          navigation.replace('Collection');
        } catch (navErr) {
          console.error('Navigation error:', navErr);
          setError('Location saved! Please use the menu to navigate.');
          setLoading(false);
        }
      } else {
        setError('Location saved! Please use the menu to navigate.');
        setLoading(false);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.error(err);
      setLoading(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setLoading(true);
    try {
      const position = await getUserLocation();
      setLocation(`${position.latitude}, ${position.longitude}`);
      setError('');
    } catch (err) {
      setError('Could not get your location. Please enter it manually.');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveEvent = async (eventId) => {
    if (!user) {
      Alert.alert('Error', 'You must be signed in to leave a MeepleUp.');
      return;
    }

    const userIdentifier = user?.uid || user?.id;
    const event = getEventById(eventId);
    
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
              await leaveEvent(eventId, userIdentifier);
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

  const handleCreateEvent = async () => {
    if (!user) {
      setError('Please sign in before hosting a MeepleUp.');
      return;
    }

    if (!eventName.trim() || !eventGeneralLocation.trim() || !eventDateTime) {
      setError('Please fill in all required MeepleUp details.');
      return;
    }

    setLoading(true);
    try {
      // Format the date/time string - use display text if available, otherwise format it
      const scheduledFor = eventDateTime.displayText || 
        (eventDateTime.date ? new Date(eventDateTime.date).toLocaleString() : '');
      
      const eventData = {
        name: eventName.trim(),
        generalLocation: eventGeneralLocation.trim(),
        exactLocation: shareExactAddress && eventExactLocation.trim() ? eventExactLocation.trim() : '',
        scheduledFor: scheduledFor,
        description: eventDescription.trim(),
        visibility: 'private', // Invite only for v1
        organizerId: user.uid,
      };

      // Add recurring info if it's a recurring event
      if (eventDateTime.recurring && eventDateTime.recurring.enabled) {
        eventData.recurring = eventDateTime.recurring;
      }

      // Add member limit if provided
      if (memberLimit.trim()) {
        const limit = parseInt(memberLimit.trim(), 10);
        if (!isNaN(limit) && limit > 0) {
          eventData.memberLimit = limit;
        }
      }

      const newEvent = await createEvent(eventData);

      setEventName('');
      setEventGeneralLocation('');
      setEventExactLocation('');
      setShareExactAddress(false);
      setEventDateTime(null);
      setEventDescription('');
      setRsvpRequired(true);
      setWhoCanJoin('private');
      setMemberLimit('');
      setError('');

      Alert.alert(
        'MeepleUp Hosted',
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
      setError('Failed to host MeepleUp. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'choice') {
    // Get user's events and sort by creation date (newest first)
    const userIdentifier = user?.uid || user?.id;
    const userEvents = userIdentifier ? getUserEvents(userIdentifier) : [];
    const sortedEvents = [...userEvents].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA; // Newest first
    });

    return (
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
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
          {sortedEvents.length > 0 && (
            <View style={styles.eventsSection}>
              {sortedEvents.map((event) => {
                const userIdentifier = user?.uid || user?.id;
                const isOrganizer = event.organizerId === userIdentifier;
                
                return (
                  <View
                    key={event.id}
                    style={styles.eventCard}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.eventCardContent,
                        pressed && styles.eventCardPressed,
                      ]}
                      onPress={() => navigation.navigate('EventHub', {
                        eventId: event.id,
                      })}
                    >
                      <View style={styles.eventCardTitleContainer}>
                        <Text style={styles.eventCardTitle}>
                          {event.name || 'Untitled MeepleUp'}
                        </Text>
                        <Text style={styles.eventCardArrow}>→</Text>
                      </View>
                    </Pressable>
                    {!isOrganizer && (
                      <Pressable
                        style={styles.leaveButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleLeaveEvent(event.id);
                        }}
                      >
                        <Text style={styles.leaveButtonText}>Leave</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          
          <View style={styles.options}>
            <Pressable
              style={({ pressed }) => [
                styles.optionCard,
                pressed && styles.optionCardPressed,
              ]}
              onPress={() => handleModeChange('join')}
            >
              <Text style={styles.optionTitle}>Join</Text>
              <Text style={styles.optionText}>
                Join an existing MeepleUp with a code someone gave you.
              </Text>
            </Pressable>
            
            <Pressable
              style={({ pressed }) => [
                styles.optionCard,
                pressed && styles.optionCardPressed,
              ]}
              onPress={() => handleModeChange('discover')}
            >
              <Text style={styles.optionTitle}>Discover</Text>
              <Text style={styles.optionText}>
                Find public game nights happening near you.
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.optionCard,
                pressed && styles.optionCardPressed,
              ]}
              onPress={() => handleModeChange('create')}
            >
              <Text style={styles.optionTitle}>
                <Text style={styles.plusSymbol}>+ </Text>Host
              </Text>
              <Text style={styles.optionText}>
                Host your own game night and share a join code with friends.
              </Text>
            </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (mode === 'join') {
    return (
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.content}>
          <Button
            label="← Back"
            onPress={() => handleModeChange('choice')}
            variant="outline"
            style={styles.backButton}
          />
          <Text style={styles.title}>Join with Code</Text>
          <Text style={styles.subtitle}>
            Enter the three-word join code provided by your game night organizer.
          </Text>
          
          {error && <Text style={styles.error}>{error}</Text>}
          
          <View style={styles.joinCodeFields}>
            <Input 
              placeholder="Word 1"
              value={joinCodeWord1} 
              onChangeText={(text) => handleJoinCodeWordChange(1, text)}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.joinCodeInput]}
            />
            <Input 
              placeholder="Word 2"
              value={joinCodeWord2} 
              onChangeText={(text) => handleJoinCodeWordChange(2, text)}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.joinCodeInput]}
            />
            <Input 
              placeholder="Word 3"
              value={joinCodeWord3} 
              onChangeText={(text) => handleJoinCodeWordChange(3, text)}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.joinCodeInput]}
            />
          </View>
          
          <Button
            label={loading ? 'Joining...' : 'Join MeepleUp'}
            onPress={handleJoinByCode}
            disabled={loading || !joinCodeWord1.trim() || !joinCodeWord2.trim() || !joinCodeWord3.trim()}
            style={styles.fullButton}
          />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (mode === 'discover') {
    return (
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.content}>
          <Button
            label="← Back"
            onPress={() => handleModeChange('choice')}
            variant="outline"
            style={styles.backButton}
          />
          <Text style={styles.title}>Discover MeepleUps</Text>
          <Text style={styles.subtitle}>
            Enter your location to find public game nights nearby.
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.locationRow}>
            <Input
              placeholder="City, State or Address"
              value={location}
              onChangeText={handleLocationChange}
              style={styles.locationInput}
            />
            <Button
              label="📍"
              onPress={handleUseCurrentLocation}
              disabled={loading}
              title="Use current location"
              style={styles.locationButton}
            />
          </View>

          <Button
            label={loading ? 'Searching...' : 'Discover MeepleUps'}
            onPress={handleDiscoverEvents}
            disabled={loading}
            style={styles.fullButton}
          />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
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
        <Text style={styles.title}>Host a MeepleUp</Text>
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
              <AdvancedDateTimePicker
                value={eventDateTime}
                onChange={setEventDateTime}
                style={styles.dateTimePicker}
              />
            </View>

            {/* Location */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Location <Text style={styles.requiredAsterisk}>*</Text></Text>
              <Text style={styles.fieldExample}>Example: "Joe's Apartment" or "Nelson's Market, 1600 Railroad Ave"</Text>
              <Input
                placeholder="Joe's Apartment"
                value={eventGeneralLocation}
                onChangeText={(text) => {
                  setEventGeneralLocation(text);
                  setError('');
                }}
                style={styles.input}
              />
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Share exact address with members</Text>
                <Switch
                  value={shareExactAddress}
                  onValueChange={setShareExactAddress}
                  trackColor={{ false: '#ddd', true: '#d45d5d' }}
                  thumbColor="#fff"
                />
              </View>
              {shareExactAddress && (
                <Input
                  placeholder="Exact address (members only)"
                  value={eventExactLocation}
                  onChangeText={(text) => {
                    setEventExactLocation(text);
                    setError('');
                  }}
                  style={[styles.input, styles.indentedInput]}
                />
              )}
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
                    {whoCanJoin === 'private' 
                      ? 'Generates a join code for members' 
                      : 'Public event (coming in v2)'}
                  </Text>
                </View>
                <Switch
                  value={whoCanJoin === 'private'}
                  onValueChange={(value) => setWhoCanJoin(value ? 'private' : 'public')}
                  trackColor={{ false: '#ddd', true: '#d45d5d' }}
                  thumbColor="#fff"
                />
              </View>
              {whoCanJoin === 'private' && (
                <Text style={styles.fieldExample}>
                  A join code will be generated for this event
                </Text>
              )}
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
          label={loading ? 'Hosting...' : 'Host MeepleUp'}
          onPress={handleCreateEvent}
          disabled={loading}
          style={styles.fullButton}
        />
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
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
  optionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
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
  locationRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  locationInput: {
    flex: 1,
    marginRight: 12,
  },
  locationButton: {
    width: 60,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
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
  joinCodeFields: {
    marginBottom: 16,
  },
  joinCodeInput: {
    marginBottom: 12,
  },
  requiredAsterisk: {
    color: '#d45d5d',
  },
});

export default Onboarding;