import React, { useMemo, useState, useEffect } from 'react';
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
import { db } from '../config/firebase';
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
    leaveEvent,
    archiveEvent,
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

  const [memberNames, setMemberNames] = useState({});

  const members = useMemo(
    () => (event?.members || []).filter((member) => member.status === membershipStatus.MEMBER),
    [event, membershipStatus],
  );

  // Fetch user names for all members
  useEffect(() => {
    if (!members.length || !db || !event?.id) return;

    const fetchMemberNames = async () => {
      const names = {};
      
      for (const member of members) {
        if (!member.userId || names[member.userId]) continue;
        
        // First check if this is the current user - use Auth context data
        if (user && member.userId === (user.uid || user.id)) {
          names[member.userId] = user.name || user.email || member.userId;
          continue;
        }
        
        try {
          // First try to get from members subcollection (has denormalized userName)
          if (event.id) {
            const memberDoc = await db.collection('gamingGroups').doc(event.id)
              .collection('members').doc(member.userId).get();
            
            if (memberDoc.exists) {
              const memberData = memberDoc.data();
              if (memberData.userName) {
                names[member.userId] = memberData.userName;
                continue;
              }
            }
          }
          
          // Fallback to users collection
          const userDoc = await db.collection('users').doc(member.userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            names[member.userId] = userData.name || userData.email || member.userId;
          } else {
            // Fallback to userId if no profile found
            names[member.userId] = member.userId;
          }
        } catch (error) {
          console.error(`Error fetching name for user ${member.userId}:`, error);
          // Fallback to userId on error
          names[member.userId] = member.userId;
        }
      }
      
      setMemberNames(names);
    };

    fetchMemberNames();
  }, [members, event?.id, user]);

  if (!event) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>MeepleUp Hub</Text>
          <Text style={styles.subtitle}>
            We couldn&apos;t find that MeepleUp. It may have been removed or you might not have
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

  // Encode join code for URLs (replace spaces with hyphens for cleaner URLs)
  const encodedJoinCode = (event.joinCode || '').replace(/\s+/g, '-');
  const deepLink = `meepleup://join/${encodedJoinCode}`;
  const webLink = `https://meepleup.app/join/${encodedJoinCode}`;

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
              const newEncodedCode = newCode.replace(/\s+/g, '-');
              Alert.alert(
                'New code ready',
                `Share this invite:\n\nCode: ${newCode}\nDeep link: ${deepLink.replace(encodedJoinCode, newEncodedCode)}`,
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

  const handleLeaveEvent = () => {
    if (!userId) {
      Alert.alert('Error', 'You must be signed in to leave a MeepleUp.');
      return;
    }

    Alert.alert(
      'Leave MeepleUp?',
      `Are you sure you want to leave "${event.name}"? You'll need a join code to rejoin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave MeepleUp',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveEvent(event.id, userId);
              Alert.alert('Left MeepleUp', 'You have left the MeepleUp.', [
                {
                  text: 'OK',
                  onPress: () => navigation.goBack(),
                },
              ]);
            } catch (error) {
              Alert.alert('Error', 'Failed to leave MeepleUp. Please try again.');
              console.error(error);
            }
          },
        },
      ],
    );
  };

  const handleArchiveEvent = () => {
    if (!userId || !isOrganizer) {
      Alert.alert('Error', 'Only the organizer can archive a MeepleUp.');
      return;
    }

    Alert.alert(
      'Archive MeepleUp?',
      `Are you sure you want to archive "${event.name}"? This will hide it from all members. You can restore it later from your archived MeepleUps.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive MeepleUp',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveEvent(event.id, userId);
              Alert.alert('MeepleUp Archived', 'The MeepleUp has been archived. You can restore it from your archived MeepleUps section.', [
                {
                  text: 'OK',
                  onPress: () => navigation.goBack(),
                },
              ]);
            } catch (error) {
              const errorMessage = error.message || 'Failed to archive MeepleUp. Please try again.';
              Alert.alert('Error', errorMessage);
              console.error(error);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{event.name || 'MeepleUp Hub'}</Text>
        <Text style={styles.subtitle}>
          {isMember
            ? 'Your MeepleUp space with members-only details.'
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
            <Text style={styles.sectionTitle}>MeepleUp details</Text>
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
              members.map((member) => {
                const displayName = memberNames[member.userId] || member.userId;
                return (
                  <Text key={member.userId} style={styles.sectionCopy}>
                    {member.role === 'organizer' ? 'Organizer' : 'Member'} • {displayName}
                  </Text>
                );
              })
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

        {/* Leave/Archive Actions */}
        {isMember && !isOrganizer ? (
          <View style={styles.section}>
            <Button
              label="Leave MeepleUp"
              onPress={handleLeaveEvent}
              variant="outline"
              style={styles.dangerAction}
            />
          </View>
        ) : null}

        {isOrganizer ? (
          <View style={styles.section}>
            <Button
              label="Archive MeepleUp"
              onPress={handleArchiveEvent}
              variant="outline"
              style={styles.dangerAction}
            />
            <Text style={styles.sectionHint}>
              Archiving will hide this MeepleUp from all members. This action cannot be undone.
            </Text>
          </View>
        ) : null}
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
  dangerAction: {
    marginTop: 8,
    borderColor: '#d45d5d',
  },
});

export default EventHub;
