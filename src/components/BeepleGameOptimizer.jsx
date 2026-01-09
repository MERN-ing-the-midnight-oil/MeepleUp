import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { optimizeGameSchedule, generateScheduleSummary } from '../utils/gameOptimizer';
import { getGameDetails } from '../utils/api';
import { theme } from '../utils/theme';
import BeepleAvatar from './BeepleAvatar';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import { BEEPLE_USER_ID } from '../utils/constants';
import { notifyMentions } from '../utils/notifications';

/**
 * Maps rating value (3, 2, 1, 0, -1) to interest level string
 */
const mapRatingToInterest = (rating) => {
  switch (rating) {
    case 3:
      return 'really-want';
    case 2:
      return 'interested';
    case 1:
      return 'maybe';
    case -1:
      return 'rather-not';
    default:
      return null; // 0 or null = no vote
  }
};

/**
 * BeepleGameOptimizer Component
 * Displays optimized game suggestions based on member votes and RSVPs
 */
const BeepleGameOptimizer = ({
  proposedGames = [],
  confirmedAttendees = [],
  memberRSVPs = {},
  memberNames = {},
  memberAvatars = {},
  eventId,
  eventName,
  selectedDate,
}) => {
  const { user } = useAuth();
  const userId = user?.uid || user?.id;
  const [gameDetails, setGameDetails] = useState({}); // { gameId: gameData }
  const [loading, setLoading] = useState(false);
  const [optimizedSchedule, setOptimizedSchedule] = useState([]);
  const [scheduleSummary, setScheduleSummary] = useState(null);
  const [nudging, setNudging] = useState(false);

  // Get attendee user IDs
  const attendeeIds = useMemo(() => {
    return confirmedAttendees.map(a => a.userId || a.id).filter(Boolean);
  }, [confirmedAttendees]);

  // Convert proposed games to format expected by optimizer
  const gamesForOptimizer = useMemo(() => {
    if (!proposedGames || proposedGames.length === 0 || attendeeIds.length === 0) {
      return [];
    }

    return proposedGames.map(proposal => {
      const gameId = String(proposal.gameId);
      const gameData = gameDetails[gameId] || {};
      
      // Map ratings to interests format
      const interests = {};
      if (proposal.ratings) {
        Object.entries(proposal.ratings).forEach(([userId, rating]) => {
          const interest = mapRatingToInterest(rating);
          if (interest) {
            interests[userId] = interest;
          }
        });
      }

      return {
        bggId: gameId,
        id: gameId,
        title: proposal.gameName || gameData.name || 'Unknown Game',
        image: proposal.gameImage || gameData.image || gameData.thumbnail || null,
        thumbnail: proposal.gameImage || gameData.thumbnail || gameData.image || null,
        minPlayers: gameData.minPlayers || null,
        maxPlayers: gameData.maxPlayers || null,
        bestPlayerCount: gameData.bestPlayerCount || null,
        playingTime: gameData.playingTime || 60, // Default to 60 minutes if not available
        interests, // Interest levels from ratings
        _proposal: proposal, // Keep reference to original proposal
      };
    });
  }, [proposedGames, gameDetails, attendeeIds]);

  // Load game details for proposed games
  useEffect(() => {
    if (!proposedGames || proposedGames.length === 0) {
      setGameDetails({});
      return;
    }

    const loadGameDetails = async () => {
      setLoading(true);
      const details = {};
      
      const loadPromises = proposedGames.map(async (proposal) => {
        const gameId = String(proposal.gameId);
        if (details[gameId]) return; // Already loaded
        
        try {
          const gameData = await getGameDetails(gameId);
          if (gameData) {
            details[gameId] = gameData;
          }
        } catch (error) {
          console.warn(`[BeepleGameOptimizer] Error loading game details for ${gameId}:`, error);
        }
      });

      await Promise.all(loadPromises);
      setGameDetails(prev => ({ ...prev, ...details }));
      setLoading(false);
    };

    loadGameDetails();
  }, [proposedGames]);

  // Run optimizer when games are ready
  useEffect(() => {
    if (gamesForOptimizer.length === 0 || attendeeIds.length === 0 || loading) {
      setOptimizedSchedule([]);
      setScheduleSummary(null);
      return;
    }

    // Calculate event duration (default to 4 hours if not available)
    const eventDurationMinutes = selectedDate?.startTime && selectedDate?.endTime
      ? Math.max(240, Math.round((selectedDate.endTime - selectedDate.startTime) / (1000 * 60)))
      : 240;

    try {
      const schedule = optimizeGameSchedule(
        gamesForOptimizer,
        attendeeIds,
        eventDurationMinutes,
        {
          prioritizeBestPlayerCount: true,
          allowParallelGames: true,
        }
      );

      setOptimizedSchedule(schedule);
      const summary = generateScheduleSummary(schedule, attendeeIds.length);
      setScheduleSummary(summary);
    } catch (error) {
      console.error('[BeepleGameOptimizer] Error running optimizer:', error);
      setOptimizedSchedule([]);
      setScheduleSummary(null);
    }
  }, [gamesForOptimizer, attendeeIds, loading, selectedDate]);

  // Find players who haven't RSVP'd or voted
  const playersNeedingResponse = useMemo(() => {
    const needingRSVP = [];
    const needingVotes = [];

    if (!selectedDate || attendeeIds.length === 0) {
      return { needingRSVP: [], needingVotes: [] };
    }

    // Calculate dateKey same way as BrowseAndProposeScreen (YYYY-MM-DD format)
    const eventDate = selectedDate?.date;
    const dateKey = eventDate
      ? (eventDate instanceof Date ? eventDate : new Date(eventDate)).toISOString().split('T')[0]
      : 'default';

    attendeeIds.forEach(attendeeId => {
      const name = memberNames[attendeeId] || attendeeId;
      const avatar = memberAvatars[attendeeId] || null;

      // Check RSVP status
      const rsvpStatus = memberRSVPs[attendeeId];
      let hasRSVP = false;
      
      if (typeof rsvpStatus === 'string') {
        hasRSVP = rsvpStatus === 'going' || rsvpStatus === 'maybe';
      } else if (rsvpStatus && typeof rsvpStatus === 'object') {
        hasRSVP = rsvpStatus[dateKey] === 'going' || rsvpStatus[dateKey] === 'maybe';
      }

      // Check if they've voted on any proposed games
      const hasVoted = proposedGames.some(proposal => {
        return proposal.ratings && proposal.ratings[attendeeId] !== null && proposal.ratings[attendeeId] !== undefined;
      });

      if (!hasRSVP) {
        needingRSVP.push({ userId: attendeeId, name, avatar });
      }
      if (!hasVoted && proposedGames.length > 0) {
        needingVotes.push({ userId: attendeeId, name, avatar });
      }
    });

    return { needingRSVP, needingVotes };
  }, [attendeeIds, memberRSVPs, memberNames, memberAvatars, selectedDate, proposedGames]);

  // Handle nudging players
  const handleNudge = async (players, type) => {
    if (!eventId || !userId || players.length === 0 || !db) {
      return;
    }

    setNudging(true);
    const eventNameDisplay = eventName || 'your game night';
    const dateStr = selectedDate?.date
      ? new Date(selectedDate.date).toLocaleDateString()
      : 'this event';

    try {
      const postsRef = db.collection('gamingGroups').doc(eventId).collection('posts');
      const createdPosts = [];

      // Create a post for each player being nudged
      for (const player of players) {
        try {
          let message = '';
          if (type === 'rsvp') {
            message = `@${player.name} Just a friendly reminder that we're still waiting to hear if you'll be joining us for ${eventNameDisplay} on ${dateStr}. Could you please RSVP?`;
          } else if (type === 'vote') {
            message = `@${player.name} We've got some games proposed for ${eventNameDisplay} on ${dateStr}, but we haven't heard your thoughts yet. Could you please weigh in on the proposed games? Your input helps us pick the best games to play!`;
          }

          if (message) {
            const postData = {
              userId: BEEPLE_USER_ID,
              userName: 'Beeple',
              userAvatarUrl: null,
              content: message,
              photoUrl: null,
              likeCount: 0,
              commentCount: 0,
              createdAt: firebase.firestore.Timestamp.now(),
              updatedAt: firebase.firestore.Timestamp.now(),
              edited: false,
              deleted: false,
              pinned: false,
            };

            const postDocRef = await postsRef.add(postData);
            const postId = postDocRef.id;
            createdPosts.push({ postId, playerName: player.name });

            // Notify the mentioned user
            try {
              await notifyMentions(
                eventId,
                postId,
                message,
                BEEPLE_USER_ID,
                'Beeple',
                eventName || 'MeepleUp'
              );
            } catch (mentionError) {
              console.error(`[BeepleGameOptimizer] Error notifying mention for ${player.name}:`, mentionError);
            }
          }
        } catch (error) {
          console.error(`[BeepleGameOptimizer] Error creating nudge post for ${player.userId}:`, error);
        }
      }

      if (createdPosts.length > 0) {
        const playerNames = createdPosts.map(p => p.playerName).join(', ');
        const action = type === 'rsvp' ? 'RSVP reminders' : 'voting reminders';
        Alert.alert('Nudge sent!', `I've posted ${action} mentioning ${playerNames} in Tabletalk.`);
      } else {
        Alert.alert('Error', 'Failed to create nudge posts. Please try again.');
      }
    } catch (error) {
      console.error('[BeepleGameOptimizer] Error sending nudges:', error);
      Alert.alert('Error', 'Failed to send nudges. Please try again.');
    } finally {
      setNudging(false);
    }
  };

  // Don't render if no proposed games or no attendees
  if (!proposedGames || proposedGames.length === 0 || attendeeIds.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.beepleContainer}>
          <BeepleAvatar size={60} />
        </View>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Hi, I'm Beeple!</Text>
          <Text style={styles.headerSubtitle}>Your Game Interest Summarizer</Text>
        </View>
      </View>

      {loading && (
        <Text style={styles.loadingText}>Analyzing games and preferences...</Text>
      )}

      {!loading && optimizedSchedule.length === 0 && (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>
            I couldn't create an optimized schedule. This might be because:
          </Text>
          <Text style={styles.messageText}>
            • Not enough games have been voted on yet
          </Text>
          <Text style={styles.messageText}>
            • Games don't match the number of players
          </Text>
          <Text style={styles.messageText}>
            • Some games were marked "rather not play"
          </Text>
        </View>
      )}

      {!loading && optimizedSchedule.length > 0 && (
        <>
          <View style={styles.scheduleContainer}>
            <Text style={styles.scheduleTitle}>
              {(() => {
                if (!selectedDate?.date) {
                  return "Based on group feedback so far,I'm currently suggesting your group start gameplay with the following games:";
                }
                const date = new Date(selectedDate.date);
                const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
                const dateFormatted = date.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                });
                return `I'm currently suggesting your group start gameplay on ${weekday}, ${dateFormatted} with the following game(s):`;
              })()}
            </Text>
            
            {optimizedSchedule.map((scheduleItem, index) => {
              const game = scheduleItem.game;
              const gameDetailsData = gameDetails[game.bggId] || {};
              
              return (
                <View key={game.bggId || index} style={styles.scheduleItem}>
                  <View style={styles.scheduleItemHeader}>
                    <Text style={styles.scheduleItemNumber}>{index + 1}</Text>
                    <Text style={styles.scheduleItemTitle}>{game.title}</Text>
                  </View>
                  
                  {scheduleItem.isPartOfSplit && scheduleItem.splitInfo && (
                    <Text style={styles.splitInfo}>
                      Part of split group ({scheduleItem.recommendedPlayers} players)
                    </Text>
                  )}
                  
                  <View style={styles.scheduleItemDetails}>
                    <Text style={styles.scheduleItemDetail}>
                      ⏱ {scheduleItem.estimatedDuration} min
                    </Text>
                    {scheduleItem.recommendedPlayers && (
                      <Text style={styles.scheduleItemDetail}>
                        👥 {scheduleItem.recommendedPlayers} players
                      </Text>
                    )}
                    {scheduleItem.game.scores && (
                      <Text style={styles.scheduleItemDetail}>
                        💚 Score: {Math.round(scheduleItem.game.scores.overall * 100)}%
                      </Text>
                    )}
                  </View>

                  {/* Show why this game was chosen */}
                  {scheduleItem.game.scores && (
                    <View style={styles.reasonContainer}>
                      <Text style={styles.reasonTitle}>Why this game:</Text>
                      {scheduleItem.game.scores.isInPerfectCombo && (
                        <Text style={styles.reasonText}>
                          ✨ Perfect player count match!
                        </Text>
                      )}
                      {scheduleItem.game.scores.interestScore > 0.7 && (
                        <Text style={styles.reasonText}>
                          ❤️ High interest from the group
                        </Text>
                      )}
                      {scheduleItem.game.scores.playerFitness === 1.0 && (
                        <Text style={styles.reasonText}>
                          🎯 Ideal for {attendeeIds.length} players
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {scheduleSummary && (
              <View style={styles.summaryContainer}>
                <Text style={styles.summaryText}>
                  {scheduleSummary.message}
                </Text>
                {scheduleSummary.hasSplitGames && (
                  <Text style={styles.summaryText}>
                    Groups can split up to play different games simultaneously.
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Players needing response */}
          {(playersNeedingResponse.needingRSVP.length > 0 || playersNeedingResponse.needingVotes.length > 0) && (
            <View style={styles.playersNeedingResponse}>
              <Text style={styles.playersNeedingResponseTitle}>
                Still waiting to hear from:
              </Text>
              
              {playersNeedingResponse.needingRSVP.length > 0 && (
                <View style={styles.playerGroup}>
                  <Text style={styles.playerGroupLabel}>Haven't RSVP'd:</Text>
                  <Text style={styles.playerNames}>
                    {playersNeedingResponse.needingRSVP.map(p => p.name).join(', ')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.nudgeButton, nudging && styles.nudgeButtonDisabled]}
                    onPress={() => handleNudge(playersNeedingResponse.needingRSVP, 'rsvp')}
                    disabled={nudging}
                  >
                    <Text style={styles.nudgeButtonText}>
                      {nudging ? 'Sending...' : 'Should I nudge them?'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {playersNeedingResponse.needingVotes.length > 0 && (
                <View style={styles.playerGroup}>
                  <Text style={styles.playerGroupLabel}>Haven't voted on games:</Text>
                  <Text style={styles.playerNames}>
                    {playersNeedingResponse.needingVotes.map(p => p.name).join(', ')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.nudgeButton, nudging && styles.nudgeButtonDisabled]}
                    onPress={() => handleNudge(playersNeedingResponse.needingVotes, 'vote')}
                    disabled={nudging}
                  >
                    <Text style={styles.nudgeButtonText}>
                      {nudging ? 'Sending...' : 'Should I nudge them?'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  beepleContainer: {
    marginRight: theme.spacing.md,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    padding: theme.spacing.md,
  },
  messageContainer: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  messageText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  scheduleContainer: {
    marginBottom: theme.spacing.lg,
  },
  scheduleTitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    lineHeight: 22,
  },
  scheduleItem: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.meepleRed,
  },
  scheduleItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  scheduleItemNumber: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    marginRight: theme.spacing.sm,
    width: 30,
  },
  scheduleItemTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  splitInfo: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.meepleRed,
    fontStyle: 'italic',
    marginBottom: theme.spacing.xs,
  },
  scheduleItemDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  scheduleItemDetail: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  reasonContainer: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodLight,
  },
  reasonTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  reasonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  summaryContainer: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  summaryText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  playersNeedingResponse: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderTopWidth: 2,
    borderTopColor: theme.colors.woodMedium,
  },
  playersNeedingResponseTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  playerGroup: {
    marginBottom: theme.spacing.md,
  },
  playerGroupLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  playerNames: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  nudgeButton: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignSelf: 'flex-start',
  },
  nudgeButtonDisabled: {
    opacity: 0.6,
  },
  nudgeButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
});

export default BeepleGameOptimizer;

