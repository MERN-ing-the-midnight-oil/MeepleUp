import React, { memo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
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
  navigation = null, // Navigation object for icon links
}) => {
  const memberCount = (event.members || []).filter(
    (member) => {
      const memberId = member.userId || member.id;
      return memberId && (member.status === 'member' || !member.status || member.status === undefined);
    }
  ).length;
  
  // Dynamic font sizing for title - start with larger default for readability
  const baseFontSize = theme.typography.fontSize['2xl'];
  const defaultFontSize = baseFontSize * 1.2; // 20% larger for better readability
  const [titleFontSize, setTitleFontSize] = useState(defaultFontSize);
  const titleContainerRef = useRef(null);
  const containerWidthRef = useRef(0);

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
  
  // Animation values for card press effects
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  // Base rotation: 5 degrees for a subtle tilted card look (consistent across all cards)
  const baseRotation = '5deg';

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


  // Handle card press animation
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      tension: 400,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 400,
      friction: 6,
    }).start();
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

  // Format next event date if available
  const formatNextDate = () => {
    if (event.eventDates && event.eventDates.length > 0) {
      const nextDate = event.eventDates[0];
      if (nextDate.date) {
        const date = new Date(nextDate.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }
    if (event.scheduledFor) {
      const date = new Date(event.scheduledFor);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return null;
  };

  const nextDateStr = formatNextDate();
  
  // Calculate optimal font size - only shrink if necessary, otherwise use larger default
  const calculateOptimalFontSize = (containerWidth) => {
    if (!containerWidth || containerWidth === 0) return;
    
    const titleText = event.name || 'Untitled MeepleUp';
    const baseFontSize = theme.typography.fontSize['2xl'];
    // Use a larger default size that's more readable
    const defaultFontSize = baseFontSize * 1.2; // 20% larger than base for better readability
    const minFontSize = baseFontSize * 0.6; // Only shrink to 60% minimum (was 40%)
    const maxFontSize = baseFontSize * 2.5;
    
    // Account for padding and expand button space
    const availableWidth = containerWidth - (shouldBeMinimized ? 40 : 0) - 16; // 16px for padding
    
    // Estimate based on text length (more accurate for bold text)
    // Bold text typically uses ~0.7x font size per character
    const avgCharWidth = defaultFontSize * 0.7;
    const textLength = titleText.length;
    const estimatedTextWidth = textLength * avgCharWidth;
    
    // Only shrink if the text would overflow
    if (estimatedTextWidth > availableWidth) {
      // Calculate minimum size needed to fit
      let optimalSize = (availableWidth / estimatedTextWidth) * defaultFontSize;
      // Clamp to minimum
      optimalSize = Math.max(minFontSize, Math.min(maxFontSize, optimalSize));
      setTitleFontSize(optimalSize);
    } else {
      // Use the larger default size if it fits
      setTitleFontSize(defaultFontSize);
    }
  };

  // Navigation handlers for corner icons
  const handleGameplanPress = (e) => {
    e.stopPropagation();
    if (navigation && event?.id) {
      navigation.navigate('EventHub', {
        eventId: event.id,
        tab: 'gameplan',
      });
    }
  };

  const handleTableTalkPress = (e) => {
    e.stopPropagation();
    if (navigation && event?.id) {
      navigation.navigate('EventHub', {
        eventId: event.id,
        tab: 'discussion', // TABS.DISCUSSION = 'discussion'
      });
    }
  };

  const animatedCardStyle = {
    transform: [
      { rotate: baseRotation }, // 10 degree tilt for playful card look
      { scale: scaleAnim }
    ],
  };

  // Ensure borderRadius is preserved from component's internal styles
  // This prevents passed styles from overriding the rounded corners
  // The borderRadius is applied last to ensure it always wins
  const finalStyle = [
    styles.card,
    ...(style ? [style] : []),
    { borderRadius: styles.card.borderRadius }, // Force borderRadius to be preserved
    animatedCardStyle
  ];

  return (
    <Animated.View style={finalStyle}>
      {/* Board game card background with beautiful color fade */}
      <LinearGradient
        colors={['#fff8f0', '#f5e6d3', '#e8d4b8', '#f5e6d3', '#fff8f0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        locations={[0, 0.3, 0.5, 0.7, 1]}
        style={styles.cardBackground}
      >
        {/* Corner decoration icons */}
        <TouchableOpacity 
          style={styles.cornerTopLeft}
          onPress={handleGameplanPress}
          disabled={!navigation || !event?.id}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <FontAwesome5 name="dice" size={20} color={theme.colors.meepleRed} />
        </TouchableOpacity>
        <View style={styles.cornerTopRight}>
          <MaterialIcons name="groups" size={18} color={theme.colors.feltGreen} />
          {memberCount > 0 && (
            <Text style={styles.cornerBadgeText}>{memberCount}</Text>
          )}
        </View>
        <View style={styles.cornerBottomLeft}>
          {nextDateStr && (
            <MaterialIcons name="event" size={18} color={theme.colors.woodDark} />
          )}
        </View>
        <TouchableOpacity 
          style={styles.cornerBottomRight}
          onPress={handleTableTalkPress}
          disabled={!navigation || !event?.id}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <FontAwesome5 name="gamepad" size={18} color={theme.colors.meepleYellow} solid />
        </TouchableOpacity>

        <Pressable
          style={styles.cardContent}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={styles.header}>
            <View style={styles.info}>
              <View style={styles.titleRow}>
                <View 
                  ref={titleContainerRef}
                  style={styles.titleContainer}
                  onLayout={(e) => {
                    const { width } = e.nativeEvent.layout;
                    containerWidthRef.current = width;
                    if (width > 0) {
                      calculateOptimalFontSize(width);
                    }
                  }}
                >
                  <Text 
                    style={[styles.title, { fontSize: titleFontSize }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit={false}
                  >
                    {event.name || 'Untitled MeepleUp'}
                  </Text>
                  {/* Colorful bold underline with multiple lines */}
                  <View style={styles.titleUnderlineContainer}>
                    <LinearGradient
                      colors={[theme.colors.meepleRed, theme.colors.meepleYellow, theme.colors.feltGreen]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.underlineGradient}
                    />
                    <LinearGradient
                      colors={[theme.colors.feltGreen, theme.colors.meepleYellow, theme.colors.meepleRed]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.underlineGradient, styles.underlineGradientSecond]}
                    />
                  </View>
                </View>
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
              {nextDateStr && (
                <View style={styles.dateBadge}>
                  <MaterialIcons name="calendar-today" size={14} color={theme.colors.meepleRed} />
                  <Text style={styles.dateText}>{nextDateStr}</Text>
                </View>
              )}
            </View>
          </View>


        {/* Expanded content */}
        {isExpanded && (
          <>

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
      </LinearGradient>

      {/* RSVP Buttons - Self-contained component that doesn't trigger parent re-renders */}
      {showRSVPButtons && (
        <View style={styles.rsvpButtonsWrapper}>
          <RSVPButtons
            currentStatus={currentUserRSVP}
            allowMaybe={rsvpSettings.allowMaybe}
            eventId={event.id}
          />
        </View>
      )}
    </Animated.View>
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
    marginBottom: theme.spacing.lg,
    borderRadius: 20, // Rounded corners - increased for visibility (was 16px)
    overflow: 'hidden', // Keep hidden to maintain rounded corners
    // Thick board game card border
    borderWidth: 6,
    borderColor: theme.colors.woodDark,
    borderStyle: 'solid', // Ensure border renders properly
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8, // Android shadow
    aspectRatio: 2, // 2:1 width to height ratio (will be overridden when dropdown is open)
  },
  cardBackground: {
    position: 'relative',
    minHeight: 120,
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: 14, // Account for 6px border (20px outer - 6px = 14px inner radius)
    overflow: 'hidden', // Ensure content respects rounded corners
  },
  cardContent: {
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xl + 16, // Extra padding to account for top corner icons (increased from 8)
    paddingLeft: theme.spacing.xl + 16, // Extra padding on left to account for dice icon
    paddingBottom: theme.spacing.xl + 40, // Extra padding to account for bottom corner icons (32px icon + 8px spacing)
  },
  // Corner icon decorations
  cornerTopLeft: {
    position: 'absolute',
    top: 12, // Increased from 8 for more spacing
    left: 12, // Increased from 8 for more spacing
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    padding: 4, // Add padding around the icon
  },
  cornerTopRight: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    paddingHorizontal: 6,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  cornerBadgeText: {
    fontSize: 12,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.feltGreen,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 4, // Positioned closer to bottom but within card bounds
    left: 4, // Positioned closer to left but within card bounds
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 4, // Positioned closer to bottom but within card bounds
    right: 4, // Positioned closer to right but within card bounds
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    marginBottom: theme.spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    // Text will adjust to fit available space
    includeFontPadding: false, // Remove extra padding for more accurate sizing
  },
  titleUnderlineContainer: {
    marginTop: 4,
    gap: 2,
  },
  underlineGradient: {
    height: 3,
    borderRadius: 1.5,
  },
  underlineGradientSecond: {
    height: 2,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.woodLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    marginTop: theme.spacing.xs,
  },
  dateText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.meepleRed,
    marginLeft: theme.spacing.xs,
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
  rsvpButtonsWrapper: {
    borderTopWidth: 3,
    borderTopColor: theme.colors.woodDark,
    backgroundColor: theme.colors.woodLight,
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

