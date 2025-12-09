import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TouchableOpacity } from 'react-native';
import RSVPButtons from './RSVPButtons';

/**
 * Shared Event Card Component
 * Displays event information in a card format
 * Used in both EventsScreen and Onboarding
 */
const EventCard = memo(({
  event,
  onPress,
  isOrganizer = false,
  style,
  currentUserId,
  onRSVP,
  memberRSVPs = {},
  organizerName = null,
  organizerAvatarUrl = null,
  onOrganizerPress = null,
  memberAvatars = {},
  memberNames = {},
  onMemberPress = null,
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
          </View>
        </View>

        {/* Organizer/Host Info */}
        {(organizerName || organizerAvatarUrl) && (
          <View style={styles.organizerContainer}>
            <Text style={styles.organizerLabel}>Organizer:</Text>
            {onOrganizerPress ? (
              <TouchableOpacity
                style={styles.organizerInfo}
                onPress={() => onOrganizerPress(event.organizerId, organizerName, organizerAvatarUrl)}
              >
                {organizerAvatarUrl ? (
                  <Image
                    source={{ uri: organizerAvatarUrl }}
                    style={styles.organizerAvatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.organizerAvatarPlaceholder}>
                    <Text style={styles.organizerAvatarInitial}>
                      {organizerName ? organizerName.charAt(0).toUpperCase() : '?'}
                    </Text>
                  </View>
                )}
                <Text style={styles.organizerName}>{organizerName || 'Unknown Organizer'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.organizerInfo}>
                {organizerAvatarUrl ? (
                  <Image
                    source={{ uri: organizerAvatarUrl }}
                    style={styles.organizerAvatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.organizerAvatarPlaceholder}>
                    <Text style={styles.organizerAvatarInitial}>
                      {organizerName ? organizerName.charAt(0).toUpperCase() : '?'}
                    </Text>
                  </View>
                )}
                <Text style={styles.organizerName}>{organizerName || 'Unknown Organizer'}</Text>
              </View>
            )}
          </View>
        )}
        
        {/* Member Avatars */}
        {event.members && event.members.length > 0 && (
          <View style={styles.membersContainer}>
            <Text style={styles.membersLabel}>Members:</Text>
            <View style={styles.memberAvatars}>
              {event.members
                .filter((member) => member.status === 'member')
                .map((member) => {
                  const avatarUrl = memberAvatars[member.userId];
                  const memberName = memberNames[member.userId] || member.userName || 'Unknown';
                  const hasPressHandler = onMemberPress && member.userId;
                  
                  const AvatarComponent = hasPressHandler ? TouchableOpacity : View;
                  
                  return (
                    <AvatarComponent
                      key={member.userId}
                      style={styles.memberAvatarContainer}
                      onPress={hasPressHandler ? () => onMemberPress(member.userId, memberName, avatarUrl) : undefined}
                    >
                      {avatarUrl ? (
                        <Image
                          source={{ uri: avatarUrl }}
                          style={styles.memberAvatar}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.memberAvatarPlaceholder}>
                          <Text style={styles.memberAvatarInitial}>
                            {memberName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </AvatarComponent>
                  );
                })}
            </View>
          </View>
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
    prevProps.onRSVP === nextProps.onRSVP &&
    prevProps.organizerName === nextProps.organizerName &&
    prevProps.organizerAvatarUrl === nextProps.organizerAvatarUrl &&
    JSON.stringify(prevProps.memberAvatars) === JSON.stringify(nextProps.memberAvatars) &&
    JSON.stringify(prevProps.memberNames) === JSON.stringify(nextProps.memberNames)
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
  locationInfo: {
    marginTop: 4,
  },
  locationLabel: {
    fontWeight: '600',
    color: '#333',
  },
  membersContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  membersLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  memberAvatars: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberAvatarContainer: {
    marginRight: 4,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  memberAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  memberAvatarInitial: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
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
  organizerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  organizerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  organizerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  organizerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  organizerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  organizerAvatarInitial: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  organizerName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
});

export default EventCard;

