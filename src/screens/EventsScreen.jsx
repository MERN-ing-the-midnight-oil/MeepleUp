import React, { useState, useMemo } from 'react';
import { Platform } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';

// Only import react-router-dom on web platform
let useNavigateHook;
if (Platform.OS === 'web') {
  try {
    const { useNavigate } = require('react-router-dom');
    useNavigateHook = useNavigate;
  } catch (e) {
    // react-router-dom not available
    useNavigateHook = () => () => {};
  }
} else {
  // React Native - return no-op function
  useNavigateHook = () => () => {};
}
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { formatDate } from '../utils/helpers';
import { validateJoinCode } from '../utils/api';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import ContactOrganizerForm from '../components/ContactOrganizerForm';

const EventsScreen = () => {
  const navigate = useNavigateHook();
  
  // If not on web, show a message that this screen is web-only
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Events</Text>
          <Text style={styles.subtitle}>
            Events management is available on the web version. Use the Collection or Profile screens on mobile.
          </Text>
        </View>
      </View>
    );
  }
  const { user } = useAuth();
  const {
    events,
    getUserEvents,
    createEvent,
    joinEventWithCode,
    getMembershipStatus,
    submitContactRequest,
    membershipStatus,
  } = useEvents();

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');

  // Event creation form state
  const [eventForm, setEventForm] = useState({
    name: '',
    generalLocation: '',
    scheduledFor: '',
    description: '',
  });

  const userIdentifier = user?.uid || user?.id;
  const userEvents = userIdentifier ? getUserEvents(userIdentifier) : [];

  const publicEvents = useMemo(
    () => events.filter((event) => event.allowStrangerMessages),
    [events],
  );

  const handleEventClick = (eventId) => {
    navigate(`/event/${eventId}`);
  };

  const handleJoinCodeChange = (text) => {
    setJoinCode(text.toUpperCase().trim());
    setJoinError('');
  };

  const handleJoinEvent = async () => {
    if (!userIdentifier) {
      setJoinError('Please sign in to join an event.');
      return;
    }

    if (!joinCode.trim()) {
      setJoinError('Please enter a join code');
      return;
    }

    if (!validateJoinCode(joinCode)) {
      setJoinError('Invalid join code format');
      return;
    }

    setJoinLoading(true);
    setJoinError('');

    try {
      const joinedEvent = joinEventWithCode(joinCode, userIdentifier);

      if (!joinedEvent) {
        setJoinError('Event not found. Please check your join code.');
        setJoinLoading(false);
        return;
      }

      setShowJoinModal(false);
      setJoinCode('');
      Alert.alert('Success', 'You have joined the event!');
    } catch (err) {
      setJoinError('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleCreateEvent = () => {
    if (!userIdentifier) {
      Alert.alert('Error', 'Please sign in to create an event.');
      return;
    }

    if (!eventForm.name.trim()) {
      Alert.alert('Error', 'Please enter an event name.');
      return;
    }

    const newEvent = createEvent({
      name: eventForm.name.trim(),
      generalLocation: eventForm.generalLocation.trim() || 'Location TBD',
      scheduledFor: eventForm.scheduledFor.trim() || '',
      description: eventForm.description.trim() || '',
      visibility: 'private',
    });

    setShowCreateModal(false);
    setEventForm({ name: '', generalLocation: '', scheduledFor: '', description: '' });
    Alert.alert('Event Created', `Your event "${newEvent.name}" has been created! Share join code: ${newEvent.joinCode}`);
  };

  const handleOpenContact = (event) => {
    setSelectedEvent(event);
    setShowContactModal(true);
  };

  const handleCloseContactModal = () => {
    setSelectedEvent(null);
    setShowContactModal(false);
  };

  const handleContactSubmit = async ({ name, email, message }) => {
    if (!selectedEvent) {
      return;
    }

    setContactLoading(true);
    try {
      const request = submitContactRequest(selectedEvent.id, {
        name,
        email,
        message,
      });

      if (!request) {
        Alert.alert('Couldn\'t send request', 'Double-check your details and try again.');
        return;
      }

      setInfoMessage('Request sent! The organizer will follow up soon.');
      handleCloseContactModal();
    } catch (error) {
      Alert.alert('Something went wrong', 'We hit a snag while sending your message. Please try again.');
      console.error(error);
    } finally {
      setContactLoading(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>My Events</Text>
          <Text style={styles.subtitle}>Manage your game night events</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            label="+ Create Event"
            onPress={() => setShowCreateModal(true)}
            style={styles.actionButton}
          />
          <Button
            label="Join Event"
            onPress={() => setShowJoinModal(true)}
            variant="outline"
            style={styles.actionButton}
          />
        </View>

        {/* User's Events */}
        {userEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.emptyText}>
              Create a new event or join one with a code.
            </Text>
          </View>
        ) : (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>My Events</Text>
            {userEvents.map((event) => {
              const memberCount = (event.members || []).filter(
                (member) => member.status === 'member',
              ).length;

              return (
                <Pressable
                  key={event.id}
                  style={styles.eventTile}
                  onPress={() => handleEventClick(event.id)}
                >
                  <View style={styles.eventHeader}>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventTitle}>
                        {event.name || 'Untitled Event'}
                      </Text>
                      <Text style={styles.eventMeta}>
                        {event.generalLocation || event.exactLocation || 'Location TBD'}
                      </Text>
                    </View>
                  </View>
                  {event.scheduledFor && (
                    <Text style={styles.eventDate}>
                      {formatDate(event.scheduledFor) || event.scheduledFor}
                    </Text>
                  )}
                  {event.members && (
                    <Text style={styles.eventMembers}>
                      {memberCount} member{memberCount !== 1 ? 's' : ''}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Public Events */}
        {publicEvents.length > 0 && (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>Discover Events</Text>
            {infoMessage ? (
              <View style={styles.infoMessage}>
                <Text style={styles.infoText}>{infoMessage}</Text>
              </View>
            ) : null}
            {publicEvents.map((event) => {
              const status = userIdentifier
                ? getMembershipStatus(event.id, userIdentifier)
                : membershipStatus.STRANGER;
              const isMember = status === membershipStatus.MEMBER;
              const locationDisplay = isMember
                ? event.exactLocation || event.generalLocation
                : event.generalLocation;

              return (
                <View key={event.id} style={styles.eventCard}>
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventTitle}>
                      {event.name || 'Untitled Event'}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        isMember ? styles.memberBadge : styles.strangerBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isMember && styles.memberBadgeText,
                        ]}
                      >
                        {isMember ? 'Member' : 'Public'}
                      </Text>
                    </View>
                  </View>

                  {event.scheduledFor ? (
                    <Text style={styles.meta}>
                      {formatDate(event.scheduledFor) || event.scheduledFor}
                    </Text>
                  ) : null}

                  <Text style={styles.meta}>
                    {isMember ? 'Location' : 'Area'}: {locationDisplay || 'Details coming soon'}
                  </Text>

                  {event.description ? (
                    <Text style={styles.description}>{event.description}</Text>
                  ) : null}

                  <View style={styles.cardActions}>
                    {isMember ? (
                      <Button
                        label="View Event"
                        onPress={() => handleEventClick(event.id)}
                        style={styles.cardButton}
                      />
                    ) : (
                      <>
                        <Pressable
                          style={styles.secondaryAction}
                          onPress={() => handleEventClick(event.id)}
                        >
                          <Text style={styles.secondaryActionText}>
                            View Details
                          </Text>
                        </Pressable>
                        <Button
                          label="Contact Organizer"
                          onPress={() => handleOpenContact(event)}
                          style={styles.cardButton}
                        />
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Join Event Modal */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => {
          setShowJoinModal(false);
          setJoinCode('');
          setJoinError('');
        }}
        title="Join Event"
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalText}>
            Enter the 6-character join code provided by the event organizer.
          </Text>
          <Input
            value={joinCode}
            onChangeText={handleJoinCodeChange}
            placeholder="Enter join code"
            autoCapitalize="characters"
            maxLength={6}
            style={styles.modalInput}
          />
          {joinError ? (
            <Text style={styles.errorText}>{joinError}</Text>
          ) : null}
          <View style={styles.modalActions}>
            <Button
              label={joinLoading ? 'Joining...' : 'Join Event'}
              onPress={handleJoinEvent}
              disabled={joinLoading || !joinCode.trim()}
              style={styles.modalButton}
            />
            <Button
              label="Cancel"
              onPress={() => {
                setShowJoinModal(false);
                setJoinCode('');
                setJoinError('');
              }}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* Create Event Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEventForm({ name: '', generalLocation: '', scheduledFor: '', description: '' });
        }}
        title="Create Event"
      >
        <View style={styles.modalContent}>
          <Input
            value={eventForm.name}
            onChangeText={(text) => setEventForm({ ...eventForm, name: text })}
            placeholder="Event name"
            style={styles.modalInput}
          />
          <Input
            value={eventForm.generalLocation}
            onChangeText={(text) => setEventForm({ ...eventForm, generalLocation: text })}
            placeholder="General location (e.g., Seattle, WA)"
            style={styles.modalInput}
          />
          <Input
            value={eventForm.scheduledFor}
            onChangeText={(text) => setEventForm({ ...eventForm, scheduledFor: text })}
            placeholder="Date & time (optional)"
            style={styles.modalInput}
          />
          <Input
            value={eventForm.description}
            onChangeText={(text) => setEventForm({ ...eventForm, description: text })}
            placeholder="Description (optional)"
            multiline
            numberOfLines={3}
            style={styles.modalInput}
          />
          <View style={styles.modalActions}>
            <Button
              label="Create Event"
              onPress={handleCreateEvent}
              style={styles.modalButton}
            />
            <Button
              label="Cancel"
              onPress={() => {
                setShowCreateModal(false);
                setEventForm({ name: '', generalLocation: '', scheduledFor: '', description: '' });
              }}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* Contact Organizer Modal */}
      <Modal
        isOpen={showContactModal}
        onClose={handleCloseContactModal}
        title={
          selectedEvent
            ? `Contact ${selectedEvent.name || 'the organizer'}`
            : 'Contact Organizer'
        }
      >
        <ContactOrganizerForm
          onSubmit={handleContactSubmit}
          onCancel={handleCloseContactModal}
          initialName={user?.name || ''}
          initialEmail={user?.email || ''}
          loading={contactLoading}
        />
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  actions: {
    flexDirection: 'row',
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  eventsSection: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  eventTile: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 14,
    color: '#666',
  },
  eventDate: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
  },
  eventMembers: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memberBadge: {
    backgroundColor: '#e7f5ff',
    borderColor: '#8cc3ff',
  },
  memberBadgeText: {
    color: '#1d5ebf',
  },
  strangerBadge: {
    backgroundColor: '#fff1f0',
    borderColor: '#ffb3ab',
  },
  meta: {
    fontSize: 14,
    color: '#4a4a4a',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: '#555',
    marginTop: 6,
    lineHeight: 20,
  },
  cardActions: {
    marginTop: 16,
  },
  cardButton: {
    width: '100%',
    marginTop: 12,
  },
  secondaryAction: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dae0e6',
    marginBottom: 12,
  },
  secondaryActionText: {
    color: '#4a90e2',
    fontSize: 15,
    fontWeight: '500',
  },
  infoMessage: {
    backgroundColor: '#d4edda',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    color: '#155724',
    fontSize: 14,
  },
  modalContent: {
    padding: 20,
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalInput: {
    marginBottom: 16,
  },
  modalActions: {
    marginTop: 8,
  },
  modalButton: {
    marginBottom: 12,
  },
  errorText: {
    color: '#d45d5d',
    fontSize: 14,
    marginBottom: 12,
  },
});

export default EventsScreen;

