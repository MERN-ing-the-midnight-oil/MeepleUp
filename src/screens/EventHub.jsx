import React, { useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import Button from '../components/common/Button';

const EventHub = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { eventId } = route.params || {};

  const {
    getEventById,
    getMembershipStatus,
    membershipStatus,
    regenerateJoinCode,
    updateContactRequest,
    contactStatus,
  } = useEvents();
  const { user } = useAuth();

  const [regenerateBusy, setRegenerateBusy] = useState(false);

  const event = getEventById(eventId);
  const userId = user?.uid || user?.id || null;

  const memberStatus = event && userId
    ? getMembershipStatus(event.id, userId)
    : membershipStatus.STRANGER;
  const isMember = memberStatus === membershipStatus.MEMBER;
  const isOrganizer = event?.organizerId && event.organizerId === userId;

  const members = useMemo(
    () => (event?.members || []).filter((member) => member.status === membershipStatus.MEMBER),
    [event, membershipStatus],
  );

  if (!event) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Event Hub</Text>
          <Text style={styles.subtitle}>
            We couldn&apos;t find that event. It may have been removed or you might not have
            permission to view it yet.
          </Text>
          <Button
            label="Go back"
            onPress={() => navigation.goBack()}
            style={styles.primaryAction}
          />
        </View>
      </ScrollView>
    );
  }

  const deepLink = `meepleup://join/${event.joinCode}`;
  const webLink = `https://meepleup.app/join/${event.joinCode}`;

  const handleRegenerateJoinCode = () => {
    if (regenerateBusy) {
      return;
    }

    Alert.alert(
      'Create a fresh invite code?',
      'Anyone with the old link will no longer be able to join once you refresh it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate new code',
          style: 'destructive',
          onPress: async () => {
            try {
              setRegenerateBusy(true);
              const newCode = regenerateJoinCode(event.id);
              Alert.alert(
                'New code ready',
                `Share this invite:\n\nCode: ${newCode}\nDeep link: ${deepLink.replace(event.joinCode, newCode)}`,
              );
            } catch (error) {
              Alert.alert('Could not refresh', 'Please try again in a moment.');
              console.error(error);
            } finally {
              setRegenerateBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleMarkResponded = (requestId) => {
    updateContactRequest(event.id, requestId, { status: contactStatus.RESPONDED });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{event.name || 'Event Hub'}</Text>
        <Text style={styles.subtitle}>
          {isMember
            ? 'Your event space with members-only details.'
            : 'Organizers share full details once they grant you membership.'}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <Text style={styles.sectionCopy}>
            {event.scheduledFor || 'Date and time to be announced'}
          </Text>
          <Text style={styles.sectionCopy}>
            General area: {event.generalLocation || 'Organizer will confirm'}
          </Text>
          {isMember ? (
            <Text style={[styles.sectionCopy, styles.highlight]}>
              Exact meetup spot: {event.exactLocation || 'Organizer will confirm'}
            </Text>
          ) : (
            <Text style={styles.sectionHint}>
              Meet the organizer first to get the exact meetup spot and member-only chat.
            </Text>
          )}
        </View>

        {isMember ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Event details</Text>
            <Text style={styles.sectionCopy}>
              {event.description ||
                'Add notes about what to bring, parking tips, or table preferences.'}
            </Text>
          </View>
        ) : null}

        {isOrganizer ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invite trusted guests</Text>
            <View style={styles.inviteBlock}>
              <Text style={styles.inviteLabel}>Current join code</Text>
              <Text style={styles.inviteCode}>{event.joinCode}</Text>
              <Text style={styles.inviteLabel}>Deep link</Text>
              <Text style={styles.link}>{deepLink}</Text>
              <Text style={styles.link}>{webLink}</Text>
              <Text style={styles.sectionHint}>
                Show it as a QR code, text it after you meet someone, or drop it in an email.
              </Text>
              <Button
                label={regenerateBusy ? 'Refreshing...' : 'Refresh invite code'}
                onPress={handleRegenerateJoinCode}
                style={styles.primaryAction}
                disabled={regenerateBusy}
              />
            </View>
          </View>
        ) : null}

        {isOrganizer ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact requests</Text>
            {event.contactRequests.length === 0 ? (
              <Text style={styles.sectionCopy}>
                No one has reached out yet. Share your public listing so strangers can find you.
              </Text>
            ) : (
              event.contactRequests.map((request) => (
                <View key={request.id} style={styles.requestCard}>
                  <Text style={styles.requestName}>{request.name}</Text>
                  <Text style={styles.requestMeta}>{request.email}</Text>
                  <Text style={styles.requestMessage}>{request.message}</Text>
                  <View style={styles.requestFooter}>
                    <Text style={styles.requestStatus}>
                      Status: {request.status === contactStatus.PENDING ? 'Awaiting reply' : 'Responded'}
                    </Text>
                    {request.status === contactStatus.PENDING ? (
                      <TouchableOpacity
                        style={styles.requestAction}
                        onPress={() => handleMarkResponded(request.id)}
                      >
                        <Text style={styles.requestActionText}>Mark responded</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {isMember ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Members ({members.length})</Text>
            {members.length === 0 ? (
              <Text style={styles.sectionCopy}>
                Invite trusted players so they can see everyone&apos;s collections and coordinate.
              </Text>
            ) : (
              members.map((member) => (
                <Text key={member.userId} style={styles.sectionCopy}>
                  {member.role === 'organizer' ? 'Organizer' : 'Member'} • {member.userId}
                </Text>
              ))
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Members</Text>
            <Text style={styles.sectionCopy}>
              The roster stays private. Ask the organizer for the invite link after you connect.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
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
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 12,
  },
  sectionCopy: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 13,
    color: '#8a6d3b',
    backgroundColor: '#fff7e6',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    lineHeight: 18,
  },
  highlight: {
    fontWeight: '600',
    color: '#1f4f8c',
  },
  inviteBlock: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#c7d4ff',
    backgroundColor: '#eef3ff',
  },
  inviteLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#4a5ec5',
    letterSpacing: 1,
    marginTop: 8,
  },
  inviteCode: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2a75',
    letterSpacing: 2,
    marginTop: 4,
  },
  link: {
    fontSize: 14,
    color: '#1f2a75',
    marginTop: 6,
  },
  primaryAction: {
    marginTop: 16,
  },
  requestCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fafbff',
  },
  requestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  requestMeta: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 2,
  },
  requestMessage: {
    marginTop: 10,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  requestFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestStatus: {
    fontSize: 13,
    color: '#2563eb',
  },
  requestAction: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  requestActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});

export default EventHub;
