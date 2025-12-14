import React, { memo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TouchableOpacity } from 'react-native';
import { theme, commonStyles } from '../utils/theme';
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

  // Automatically minimize cards with one or fewer confirmed attendees
  const shouldBeMinimized = rsvpCounts.going <= 1;
  const [isExpanded, setIsExpanded] = useState(!shouldBeMinimized);
  const prevGoingCountRef = useRef(rsvpCounts.going);

  // Auto-collapse when RSVP count drops from > 1 to <= 1
  useEffect(() => {
    const prevGoing = prevGoingCountRef.current;
    const currentGoing = rsvpCounts.going;
    
    // If count dropped from > 1 to <= 1, auto-collapse
    if (prevGoing > 1 && currentGoing <= 1 && isExpanded) {
      setIsExpanded(false);
    }
    
    prevGoingCountRef.current = currentGoing;
  }, [rsvpCounts.going, isExpanded]);

  const toggleExpanded = (e) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

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
            <View style={styles.titleRow}>
              <Text style={styles.title}>
                {event.name || 'Untitled MeepleUp'}
              </Text>
              {shouldBeMinimized && (
                <TouchableOpacity
                  onPress={toggleExpanded}
                  style={styles.expandButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.expandIcon}>
                    {isExpanded ? '▼' : '▶'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Expanded content */}
        {isExpanded && (
          <>
        
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
          </>
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
    JSON.stringify(prevProps.memberAvatars) === JSON.stringify(nextProps.memberAvatars) &&
    JSON.stringify(prevProps.memberNames) === JSON.stringify(nextProps.memberNames)
  );
});

EventCard.displayName = 'EventCard';

const styles = StyleSheet.create({
  card: {
    ...commonStyles.card,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    marginBottom: theme.spacing.md,
  },
  cardContent: {
    padding: theme.spacing.lg,
  },
  cardPressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  info: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    flex: 1,
  },
  expandButton: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
  },
  expandIcon: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  meta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  locationInfo: {
    marginTop: theme.spacing.xs,
  },
  locationLabel: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  membersContainer: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
  },
  membersLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  memberAvatars: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  memberAvatarContainer: {
    marginRight: theme.spacing.xs,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.colors.surfaceColor,
    ...theme.shadows.soft,
  },
  memberAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.meepleRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surfaceColor,
    ...theme.shadows.soft,
  },
  memberAvatarInitial: {
    fontSize: theme.typography.fontSize.base,
    color: '#fff',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  rsvpInfo: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
  },
  rsvpStatus: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  rsvpCounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  rsvpCount: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  rsvpLimit: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  rsvpButtonsContainer: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
    backgroundColor: theme.colors.woodLight,
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rsvpButton: {
    flex: 1,
  },
});

export default EventCard;

