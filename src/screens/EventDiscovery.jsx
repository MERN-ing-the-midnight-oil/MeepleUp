import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useAvailability } from '../context/AvailabilityContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ContactOrganizerForm from '../components/ContactOrganizerForm';
import { formatDate } from '../utils/helpers';

const EventDiscovery = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const {
    events,
    getMembershipStatus,
    submitContactRequest,
    membershipStatus,
  } = useEvents();
  const {
    matches: availabilityMatches,
    loading: availabilityLoading,
    slots: myAvailabilitySlots,
    isLooking: availabilityVisible,
  } = useAvailability();

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');

  const userId = user?.uid || user?.id || null;

  const publicEvents = useMemo(
    () => events.filter((event) => event.allowStrangerMessages),
    [events],
  );

  const scheduleMatches = useMemo(() => {
    if (!availabilityVisible || availabilityLoading) {
      return [];
    }
    return availabilityMatches || [];
  }, [availabilityMatches, availabilityLoading, availabilityVisible]);

  const formatTimeLabel = (value) => {
    if (!value) {
      return '';
    }
    const [hoursRaw, minutes] = value.split(':');
    const hours = Number(hoursRaw);
    if (!Number.isFinite(hours)) {
      return value;
    }
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const normalized = ((hours + 11) % 12) + 1;
    return `${normalized}:${minutes} ${suffix}`;
  };

  const formatDayLabel = (day) => {
    const lookup = {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday',
    };
    return lookup[day] || day;
  };

  const formatDistance = (value) => {
    if (value === null || value === undefined) {
      return null;
    }
    if (value < 0.1) {
      return '<0.1 mi apart';
    }
    return `${value.toFixed(1)} mi apart`;
  };

  const handleEnterEvent = (eventId) => {
    navigation.navigate('EventHub', { eventId });
  };

  const handleOpenContact = (event) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  const handleCloseModal = (force = false) => {
    if (contactLoading && !force) {
      return;
    }
    setSelectedEvent(null);
    setIsModalOpen(false);
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
        Alert.alert(
          'Couldn’t send request',
          'Double-check your details and try again.',
        );
        return;
      }

      setInfoMessage('Request sent! The organizer will follow up soon.');
      handleCloseModal(true);
    } catch (error) {
      Alert.alert(
        'Something went wrong',
        'We hit a snag while sending your message. Please try again.',
      );
      console.error(error);
    } finally {
      setContactLoading(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.title}>Find a Game Night</Text>
          <Text style={styles.subtitle}>
            Browse open events near you. Organizers share the exact meetup spot
            once they&apos;ve met you or confirmed details.
          </Text>
          {infoMessage ? <Text style={styles.info}>{infoMessage}</Text> : null}
        </View>

        <View style={styles.matchesSection}>
          <Text style={styles.matchesTitle}>Schedule Matches</Text>
          {!availabilityVisible ? (
            <Text style={styles.matchesHint}>
              Add recurring availability in your profile to start matching with nearby Meeples.
            </Text>
          ) : availabilityLoading ? (
            <Text style={styles.matchesHint}>Checking for overlapping availability…</Text>
          ) : myAvailabilitySlots.length === 0 ? (
            <Text style={styles.matchesHint}>
              Share at least one weekly time window to see who lines up with you.
            </Text>
          ) : scheduleMatches.length === 0 ? (
            <Text style={styles.matchesHint}>
              No overlapping windows yet. We&apos;ll keep checking as more Meeples share their schedule.
            </Text>
          ) : (
            scheduleMatches.map((match) => (
              <View key={match.userId} style={styles.matchCard}>
                <Text style={styles.matchName}>
                  {match.owner?.displayName || 'Meeple nearby'}
                </Text>
                <Text style={styles.matchSummary}>
                  {match.overlaps.length}{' '}
                  {match.overlaps.length === 1 ? 'matching window' : 'matching windows'}
                </Text>
                {match.overlaps.slice(0, 3).map((overlap) => {
                  const distanceLabel = formatDistance(overlap.distanceMiles);
                  return (
                    <Text key={`${match.userId}_${overlap.otherSlot.id}`} style={styles.matchLine}>
                      {formatDayLabel(overlap.mySlot.day)} · {formatTimeLabel(overlap.mySlot.startTime)} –
                      {` ${formatTimeLabel(overlap.mySlot.endTime)}`}
                      {distanceLabel ? ` • ${distanceLabel}` : ''}
                    </Text>
                  );
                })}
                {match.overlaps.length > 3 ? (
                  <Text style={styles.matchFootnote}>
                    +{match.overlaps.length - 3} more overlaps
                  </Text>
                ) : null}
                <Text style={styles.matchHint}>
                  Start a new event and invite them with your join code—your calendars already align.
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.content}>
          {publicEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nothing posted yet</Text>
              <Text style={styles.emptyCopy}>
                Check back soon—or start your own event and invite people with a
                private link.
              </Text>
              <Button
                label="Create an event"
                onPress={() => navigation.navigate('Home')}
                variant="outline"
                style={styles.emptyButton}
              />
            </View>
          ) : (
            publicEvents.map((event) => {
              const status = userId
                ? getMembershipStatus(event.id, userId)
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
                        {isMember ? 'Member' : 'Stranger access'}
                      </Text>
                    </View>
                  </View>

                  {event.scheduledFor ? (
                    <Text style={styles.meta}>
                      {formatDate(event.scheduledFor) ||
                        event.scheduledFor}
                    </Text>
                  ) : null}

                  <Text style={styles.meta}>
                    {isMember ? 'Exact location' : 'General area'}:{' '}
                    {locationDisplay || 'Details coming soon'}
                  </Text>

                  {event.description ? (
                    <Text style={styles.description}>{event.description}</Text>
                  ) : null}

                  {!isMember ? (
                    <Text style={styles.hint}>
                      Join in person first. Use “Contact organizer” to say hello
                      and plan your first meetup.
                    </Text>
                  ) : null}

                  <View style={styles.actions}>
                    {isMember ? (
                      <Button
                        label="Enter event hub"
                        onPress={() => handleEnterEvent(event.id)}
                        style={styles.actionButton}
                      />
                    ) : (
                      <>
                        <Pressable
                          style={({ pressed }) => [
                            styles.secondaryAction,
                            pressed && styles.secondaryActionPressed,
                          ]}
                          onPress={() => handleEnterEvent(event.id)}
                        >
                          <Text style={styles.secondaryActionText}>
                            Peek at event details
                          </Text>
                        </Pressable>
                        <Button
                          label="Contact organizer"
                          onPress={() => handleOpenContact(event)}
                          style={styles.actionButton}
                        />
                      </>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={
          selectedEvent
            ? `Introduce yourself to ${selectedEvent.name || 'the organizer'}`
            : 'Say hello'
        }
      >
        <ContactOrganizerForm
          onSubmit={handleContactSubmit}
          onCancel={handleCloseModal}
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
  hero: {
    padding: 20,
    paddingTop: 40,
    backgroundColor: '#f3f3f3',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#d45d5d',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#5b5b5b',
    lineHeight: 24,
  },
  info: {
    marginTop: 12,
    color: '#6c6c6c',
    fontSize: 14,
  },
  content: {
    padding: 20,
  },
  matchesSection: {
    padding: 20,
    paddingBottom: 0,
  },
  matchesTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#23395d',
    marginBottom: 12,
  },
  matchesHint: {
    fontSize: 14,
    color: '#4a4a4a',
    lineHeight: 20,
  },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d6e4ff',
    padding: 16,
    marginTop: 12,
  },
  matchName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#23395d',
  },
  matchSummary: {
    fontSize: 14,
    color: '#4a90e2',
    marginTop: 4,
    marginBottom: 8,
    fontWeight: '600',
  },
  matchLine: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  matchFootnote: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  matchHint: {
    fontSize: 13,
    color: '#4a4a4a',
    marginTop: 12,
  },
  emptyState: {
    padding: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyCopy: {
    fontSize: 15,
    color: '#666',
    marginBottom: 16,
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: 8,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    flexShrink: 1,
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
  hint: {
    marginTop: 12,
    fontSize: 13,
    color: '#8a6d3b',
    backgroundColor: '#fff7e6',
    borderRadius: 8,
    padding: 12,
    lineHeight: 18,
  },
  actions: {
    marginTop: 16,
  },
  actionButton: {
    width: '100%',
    marginTop: 12,
  },
  secondaryAction: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dae0e6',
  },
  secondaryActionPressed: {
    backgroundColor: '#f1f5f9',
  },
  secondaryActionText: {
    color: '#4a90e2',
    fontSize: 15,
    fontWeight: '500',
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
});

export default EventDiscovery;
