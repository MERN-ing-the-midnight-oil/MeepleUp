import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { validateJoinCode } from '../utils/api';
import { getUserLocation } from '../utils/helpers';
import Button from '../components/common/Button';
import Input from '../components/common/Input';

const Onboarding = () => {
  const navigation = useNavigation();
  const { user, updateUser } = useAuth();
  const { joinEventWithCode, createEvent } = useEvents();
  const [joinCode, setJoinCode] = useState('');
  const [location, setLocation] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventGeneralLocation, setEventGeneralLocation] = useState('');
  const [eventExactLocation, setEventExactLocation] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [mode, setMode] = useState('choice'); // 'choice', 'join', 'discover', 'create'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleModeChange = (nextMode) => {
    setError('');
    if (nextMode === 'choice') {
      setEventName('');
      setEventGeneralLocation('');
      setEventExactLocation('');
      setEventDate('');
      setEventDescription('');
    }
    setMode(nextMode);
  };

  const handleJoinCodeChange = (text) => {
    setJoinCode(text.toUpperCase());
    setError('');
  };

  const handleLocationChange = (text) => {
    setLocation(text);
    setError('');
  };

  const handleJoinByCode = async () => {
    if (!user) {
      setError('Please sign in before joining an event.');
      return;
    }

    if (!joinCode.trim()) {
      setError('Please enter a join code');
      return;
    }

    if (!validateJoinCode(joinCode)) {
      setError('Invalid join code format');
      return;
    }

    setLoading(true);
    try {
      const joinedEvent = joinEventWithCode(joinCode, user.uid);

      if (!joinedEvent) {
        setError('Event not found. Please check your join code.');
        setLoading(false);
        return;
      }

      navigation.replace('Home');
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscoverEvents = async () => {
    if (!user) {
      setError('Please sign in before discovering events.');
      return;
    }

    if (!location.trim()) {
      setError('Please enter your location');
      return;
    }

    setLoading(true);
    try {
      await updateUser({ location: location.trim() });
      navigation.replace('Discover');
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.error(err);
    } finally {
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

  const handleCreateEvent = async () => {
    if (!user) {
      setError('Please sign in before creating an event.');
      return;
    }

    if (!eventName.trim() || !eventGeneralLocation.trim() || !eventDate.trim()) {
      setError('Please fill in all event details.');
      return;
    }

    setLoading(true);
    try {
      const newEvent = createEvent({
        name: eventName.trim(),
        generalLocation: eventGeneralLocation.trim(),
        exactLocation: eventExactLocation.trim(),
        scheduledFor: eventDate.trim(),
        description: eventDescription.trim(),
        visibility: 'private',
        organizerId: user.uid,
      });

      setEventName('');
      setEventGeneralLocation('');
      setEventExactLocation('');
      setEventDate('');
      setEventDescription('');
      setError('');

      Alert.alert(
        'Event Created',
        `Share this membership link or code so trusted guests can join:\n\nCode: ${newEvent.joinCode}`,
        [
          {
            text: 'View Event',
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
      setError('Failed to create event. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'choice') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Welcome to MeepleUp!</Text>
          <Text style={styles.subtitle}>
            Connect with your board game community and discover game nights near you.
          </Text>
          
          <View style={styles.options}>
            <Pressable
              style={({ pressed }) => [
                styles.optionCard,
                pressed && styles.optionCardPressed,
              ]}
              onPress={() => handleModeChange('join')}
            >
              <Text style={styles.optionTitle}>Join with Code</Text>
              <Text style={styles.optionText}>
                Join an existing event with a code someone gave you.
              </Text>
            </Pressable>
            
            <Pressable
              style={({ pressed }) => [
                styles.optionCard,
                pressed && styles.optionCardPressed,
              ]}
              onPress={() => handleModeChange('discover')}
            >
              <Text style={styles.optionTitle}>Discover Events</Text>
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
              <Text style={styles.optionTitle}>Create an Event</Text>
              <Text style={styles.optionText}>
                Host your own game night and share a join code with friends.
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (mode === 'join') {
    return (
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
            Enter the join code provided by your game night organizer.
          </Text>
          
          {error && <Text style={styles.error}>{error}</Text>}
          
            <Input 
            placeholder="Enter 6-character join code"
                value={joinCode} 
            onChangeText={handleJoinCodeChange}
            maxLength={6}
            autoCapitalize="characters"
            style={styles.input}
          />
          
          <Button
            label={loading ? 'Joining...' : 'Join Event'}
            onPress={handleJoinByCode}
            disabled={loading}
            style={styles.fullButton}
          />
        </View>
      </ScrollView>
    );
  }

  if (mode === 'discover') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Button
            label="← Back"
            onPress={() => handleModeChange('choice')}
            variant="outline"
            style={styles.backButton}
          />
          <Text style={styles.title}>Discover Events</Text>
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
            label={loading ? 'Searching...' : 'Discover Events'}
            onPress={handleDiscoverEvents}
            disabled={loading}
            style={styles.fullButton}
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <Button
          label="← Back"
          onPress={() => handleModeChange('choice')}
          variant="outline"
          style={styles.backButton}
        />
        <Text style={styles.title}>Create an Event</Text>
        <Text style={styles.subtitle}>
          Fill in the details and we&apos;ll generate a join code to share with friends.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Input
          placeholder="Event name"
          value={eventName}
          onChangeText={(text) => {
            setEventName(text);
            setError('');
          }}
          style={styles.input}
        />
        <Input
          placeholder="General area (what strangers can see)"
          value={eventGeneralLocation}
          onChangeText={(text) => {
            setEventGeneralLocation(text);
            setError('');
          }}
          style={styles.input}
        />
        <Input
          placeholder="Exact meetup spot (members only)"
          value={eventExactLocation}
          onChangeText={(text) => {
            setEventExactLocation(text);
            setError('');
          }}
          style={styles.input}
        />
        <Input
          placeholder="Date & time (e.g. Friday 7pm)"
          value={eventDate}
          onChangeText={(text) => {
            setEventDate(text);
            setError('');
          }}
          style={styles.input}
        />
        <Input
          placeholder="Add a short description"
          value={eventDescription}
          onChangeText={(text) => {
            setEventDescription(text);
            setError('');
          }}
          style={styles.input}
        />

        <Button
          label={loading ? 'Creating...' : 'Create Event'}
          onPress={handleCreateEvent}
          disabled={loading}
          style={styles.fullButton}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
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
    marginBottom: 12,
    textAlign: 'center',
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
});

export default Onboarding;