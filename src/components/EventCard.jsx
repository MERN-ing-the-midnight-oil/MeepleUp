import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { formatDate } from '../utils/helpers';
import RSVPButtons from './RSVPButtons';

/**
 * Shared Event Card Component
 * Displays event information in a card format
 * Used in both EventsScreen and Onboarding
 */
const EventCard = memo(({
  event,
  onPress,
  onLeave,
  showLeaveButton = false,
  isOrganizer = false,
  style,
  currentUserId,
  onRSVP,
  memberRSVPs = {},
}) => {
  const memberCount = (event.members || []).filter(
    (member) => member.status === 'member',
  ).length;

  const currentUserRSVP = currentUserId ? (memberRSVPs[currentUserId] || null) : null;
  const rsvpSettings = event.rsvpSettings || { enabled: true, allowMaybe: true, attendanceLimit: null };
  
  // Get RSVP counts
  const rsvpCounts = (event.members || []).reduce((acc, member) => {
    const status = memberRSVPs[member.userId] || null;
    if (status === 'going') acc.going += 1;
    else if (status === 'maybe') acc.maybe += 1;
    else if (status === 'not-going') acc.notGoing += 1;
    else acc.none += 1;
    return acc;
  }, { going: 0, maybe: 0, notGoing: 0, none: 0 });

  const isMember = currentUserId && (event.members || []).some(m => m.userId === currentUserId);
  const showRSVPButtons = isMember && rsvpSettings.enabled && onRSVP;

  const getRSVPStatusLabel = (status) => {
    if (!status) return 'Not RSVP\'d';
    switch (status) {
      case 'going': return 'Going';
      case 'maybe': return 'Maybe';
      case 'not-going': return 'Can\'t Make It';
      default: return 'Not RSVP\'d';
    }
  };

  return (
    <View style={[styles.card, style]}>
      <Pressable
        style={({ pressed }) => [
          styles.cardContent,
          pressed && styles.cardPressed,
        ]}
        onPress={onPress}
      >
        <View style={styles.header}>
          <View style={styles.info}>
            <Text style={styles.title}>
              {event.name || 'Untitled MeepleUp'}
            </Text>
            <Text style={styles.meta}>
              {event.generalLocation || event.exactLocation || 'Location TBD'}
            </Text>
          </View>
        </View>
        
        {event.scheduledFor && (
          <Text style={styles.date}>
            {formatDate(event.scheduledFor) || event.scheduledFor}
          </Text>
        )}
        
        {event.members && (
          <Text style={styles.members}>
            {memberCount} member{memberCount !== 1 ? 's' : ''}
          </Text>
        )}

        {/* RSVP Status and Counts */}
        {rsvpSettings.enabled && (
          <View style={styles.rsvpInfo}>
            {currentUserRSVP && (
              <Text style={styles.rsvpStatus}>
                Your RSVP: {getRSVPStatusLabel(currentUserRSVP)}
              </Text>
            )}
            <View style={styles.rsvpCounts}>
              {rsvpCounts.going > 0 && (
                <Text style={styles.rsvpCount}>✓ {rsvpCounts.going} Going</Text>
              )}
              {rsvpSettings.allowMaybe && rsvpCounts.maybe > 0 && (
                <Text style={styles.rsvpCount}>? {rsvpCounts.maybe} Maybe</Text>
              )}
              {rsvpSettings.attendanceLimit && (
                <Text style={styles.rsvpLimit}>
                  Limit: {rsvpCounts.going}/{rsvpSettings.attendanceLimit}
                </Text>
              )}
            </View>
          </View>
        )}
      </Pressable>

      {/* RSVP Buttons - Self-contained component that doesn't trigger parent re-renders */}
      {showRSVPButtons && (
        <RSVPButtons
          currentStatus={currentUserRSVP}
          allowMaybe={rsvpSettings.allowMaybe}
          eventId={event.id}
        />
      )}
      
      {showLeaveButton && !isOrganizer && onLeave && (
        <Pressable
          style={styles.leaveButton}
          onPress={(e) => {
            e.stopPropagation();
            onLeave(event.id);
          }}
        >
          <Text style={styles.leaveButtonText}>Leave</Text>
        </Pressable>
      )}
    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: return true if props are equal (skip re-render)
  // Only re-render if relevant props actually changed
  const prevRSVP = (prevProps.memberRSVPs && prevProps.currentUserId) 
    ? (prevProps.memberRSVPs[prevProps.currentUserId] || null)
    : null;
  const nextRSVP = (nextProps.memberRSVPs && nextProps.currentUserId)
    ? (nextProps.memberRSVPs[nextProps.currentUserId] || null)
    : null;
  
  return (
    prevProps.event.id === nextProps.event.id &&
    prevProps.event.name === nextProps.event.name &&
    prevProps.event.scheduledFor === nextProps.event.scheduledFor &&
    prevProps.event.rsvpSettings === nextProps.event.rsvpSettings &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevRSVP === nextRSVP &&
    prevProps.isOrganizer === nextProps.isOrganizer &&
    prevProps.showLeaveButton === nextProps.showLeaveButton &&
    prevProps.onRSVP === nextProps.onRSVP
  );
});

EventCard.displayName = 'EventCard';

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  cardPressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  meta: {
    fontSize: 14,
    color: '#666',
  },
  date: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
  },
  members: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
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
  rsvpInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  rsvpStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  rsvpCounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  rsvpCount: {
    fontSize: 12,
    color: '#666',
  },
  rsvpLimit: {
    fontSize: 12,
    color: '#d45d5d',
    fontWeight: '600',
  },
  rsvpButtonsContainer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  rsvpButton: {
    flex: 1,
  },
});

export default EventCard;

