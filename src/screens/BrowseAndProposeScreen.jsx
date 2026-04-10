import React, { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { Platform, View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Image, Pressable, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useCollections } from '../context/CollectionsContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import Button from '../components/common/Button';
import GameCollectionView from '../components/GameCollectionView';
import GameDetailsModal from '../components/GameDetailsModal';
import UserProfileModal from '../components/UserProfileModal';
import Modal from '../components/common/Modal';
import { formatDate, formatTime } from '../utils/helpers';
import { theme, commonStyles } from '../utils/theme';
import BeepleRecommendations from '../components/BeepleRecommendations';
import BeepleGameOptimizer from '../components/BeepleGameOptimizer';
import { getMatchScore, calculateMatchScoresForGame } from '../services/matchScores';
import { preCalculateAllMatches, calculateGameScore } from '../utils/optimizedRecommendations';
import { createNotification } from '../utils/notifications';
import logger from '../utils/logger';

// Platform-specific navigation hooks
let useNavigationHook;
let useParamsHook;

if (Platform.OS === 'web') {
  try {
    const { useNavigate, useParams } = require('react-router-dom');
    useNavigationHook = () => ({ goBack: () => window.history.back() });
    useParamsHook = useParams;
  } catch (e) {
    useNavigationHook = () => ({ goBack: () => {} });
    useParamsHook = () => ({ eventId: null, dateIndex: null });
  }
} else {
  const { useNavigation, useRoute } = require('@react-navigation/native');
  useNavigationHook = useNavigation;
  useParamsHook = () => {
    const route = useRoute();
    return route.params || {};
  };
}

// Helper function to safely parse date values
const safeParseDate = (dateValue) => {
  if (!dateValue) return null;
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }
  if (dateValue && typeof dateValue.toDate === 'function') {
    try {
      const date = dateValue.toDate();
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      return null;
    }
  }
  try {
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date;
  } catch (e) {
    return null;
  }
};

// Helper to get date key from event date
const getDateKey = (eventDate) => {
  if (!eventDate) return 'default';
  const date = eventDate instanceof Date ? eventDate : new Date(eventDate);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
};

const ITEMS_PER_PAGE = 20;

const BrowseAndProposeScreen = () => {
  const navigation = useNavigationHook();
  const params = useParamsHook();
  const { user } = useAuth();
  const userId = user?.uid || user?.id;
  const { getEventById } = useEvents();
  const { collections } = useCollections();
  
  const eventId = params?.eventId;
  const rawDateIndex = params?.dateIndex;
  const parsedDateIndex = rawDateIndex === undefined || rawDateIndex === null
    ? null
    : Number(rawDateIndex);
  const dateIndex = Number.isNaN(parsedDateIndex) ? null : parsedDateIndex;
  
  // Log when screen mounts or params change
  useEffect(() => {
    logger.debug('[BrowseAndProposeScreen] Screen mounted/updated:', {
      eventId,
      dateIndex,
      params,
      platform: Platform.OS,
      hasUserId: !!userId
    });
  }, [eventId, dateIndex, params, userId]);
  
  const [event, setEvent] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberRSVPs, setMemberRSVPs] = useState({});
  const [proposedGames, setProposedGames] = useState([]);
  const [userProposals, setUserProposals] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState(null);
  const [showGameDetails, setShowGameDetails] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [memberNames, setMemberNames] = useState({});
  const [memberAvatars, setMemberAvatars] = useState({});
  const [ratingModalGame, setRatingModalGame] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [matchScores, setMatchScores] = useState({}); // { gameId: score }
  const matchScoresRef = useRef({}); // Ref to track current scores without dependency
  const [userProposalLimit, setUserProposalLimit] = useState(5); // Default to 5
  const [selectedOwner, setSelectedOwner] = useState(null); // userId of selected owner for filtering
  const { width } = useWindowDimensions();
  
  // Refs to maintain scroll position when proposedGames updates
  const scrollViewRef = useRef(null);
  const scrollPositionRef = useRef(0);
  
  // Track cleanup attempts to prevent infinite loops
  const cleanupAttemptedRef = useRef(new Set()); // Track gameIds we've tried to clean up
  const aggregatedGamesHashRef = useRef(''); // Track hash of aggregatedGames to detect actual changes
  const proposedGamesForCleanupRef = useRef(proposedGames); // Track current proposedGames to avoid stale closures
  const isMountedRef = useRef(true); // Track if component is mounted
  
  // Track component mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Update ref when proposedGames changes (but don't trigger cleanup on this change)
  useEffect(() => {
    proposedGamesForCleanupRef.current = proposedGames;
  }, [proposedGames]);
  
  // Track scroll position
  const handleScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset?.y ?? 0;
    if (offsetY >= 0) {
      scrollPositionRef.current = offsetY;
    }
  }, []);
  
  // Restore scroll position when proposedGames changes
  // Use useLayoutEffect to restore synchronously before paint, preventing visible jumps
  const previousProposedGamesCountRef = useRef(proposedGames.length);
  useLayoutEffect(() => {
    const currentCount = proposedGames.length;
    const countChanged = currentCount !== previousProposedGamesCountRef.current;
    previousProposedGamesCountRef.current = currentCount;
    
    if (countChanged && scrollViewRef.current && scrollPositionRef.current > 0) {
      // Restore synchronously before paint to prevent visible jump
      scrollViewRef.current.scrollTo({
        y: scrollPositionRef.current,
        animated: false,
      });
      
      // Backup restore after paint
      requestAnimationFrame(() => {
        if (scrollViewRef.current && scrollPositionRef.current > 0) {
          scrollViewRef.current.scrollTo({
            y: scrollPositionRef.current,
            animated: false,
          });
        }
      });
    }
  }, [proposedGames.length]);
  
  // Helper function to check if a game is favorited by the current user
  const isGameFavorited = useCallback((game) => {
    if (!userId || !game) return false;
    
    const gameId = game.bggId || game.id;
    if (!gameId) return game.isFavorite || false;
    
    // Convert to string for consistent comparison
    const gameIdStr = String(gameId);
    const gameBggIdStr = game.bggId ? String(game.bggId) : null;
    
    const userGames = collections[userId] || [];
    const userGame = userGames.find(g => {
      // Try to match by bggId first (most reliable)
      if (gameBggIdStr && g.bggId) {
        return String(g.bggId) === gameBggIdStr;
      }
      // Fall back to matching by any ID
      const gId = g.bggId || g.id;
      if (gId) {
        return String(gId) === gameIdStr;
      }
      return false;
    });
    
    return userGame?.isFavorite ?? game?.isFavorite ?? false;
  }, [userId, collections]);
  
  // Get event dates
  const eventDates = useMemo(() => {
    logger.debug('[BrowseAndProposeScreen] Computing eventDates:', {
      hasEvent: !!event,
      eventId: event?.id,
      hasEventDates: !!event?.eventDates,
      eventDatesType: Array.isArray(event?.eventDates) ? 'array' : typeof event?.eventDates,
      eventDatesLength: Array.isArray(event?.eventDates) ? event.eventDates.length : 'N/A'
    });
    
    if (!event) {
      logger.debug('[BrowseAndProposeScreen] No event, returning empty eventDates');
      return [];
    }
    
    if (event.eventDates && Array.isArray(event.eventDates)) {
      const dates = event.eventDates.map((ed, index) => {
        const date = safeParseDate(ed.date);
        const result = {
          index,
          date: date && !isNaN(date.getTime()) ? date : null,
          dateString: ed.date,
          startTime: safeParseDate(ed.startTime),
          endTime: safeParseDate(ed.endTime),
          location: ed.location || ed.generalLocation || event.location || event.generalLocation || '',
        };
        logger.debug(`[BrowseAndProposeScreen] Event date ${index}:`, {
          rawDate: ed.date,
          parsedDate: result.date,
          dateKey: result.date ? getDateKey(result.date) : null,
          isValid: result.date !== null
        });
        return result;
      }).filter(ed => ed.date !== null);
      
      logger.debug('[BrowseAndProposeScreen] Filtered eventDates:', {
        count: dates.length,
        dates: dates.map(d => ({
          index: d.index,
          date: d.date,
          dateKey: getDateKey(d.date),
          dateString: d.dateString
        }))
      });
      
      return dates;
    } else if (event.scheduledFor) {
      logger.debug('[BrowseAndProposeScreen] Using scheduledFor (legacy format):', event.scheduledFor);
      const date = safeParseDate(event.scheduledFor);
      if (date && !isNaN(date.getTime())) {
        const result = [{
          index: 0,
          date,
          dateString: event.scheduledFor,
          startTime: null,
          endTime: null,
          location: event.location || event.generalLocation || '',
        }];
        logger.debug('[BrowseAndProposeScreen] Created eventDates from scheduledFor:', {
          dateKey: getDateKey(date),
          date: date
        });
        return result;
      } else {
        console.warn('[BrowseAndProposeScreen] scheduledFor could not be parsed:', event.scheduledFor);
      }
    } else {
      console.warn('[BrowseAndProposeScreen] No eventDates or scheduledFor found in event');
    }
    
    logger.debug('[BrowseAndProposeScreen] Returning empty eventDates');
    return [];
  }, [event]);
  
  const normalizedDateIndex =
    dateIndex !== null &&
    Number.isInteger(dateIndex) &&
    dateIndex >= 0 &&
    dateIndex < eventDates.length
      ? dateIndex
      : (eventDates.length > 0 ? 0 : null);
  const selectedDate =
    normalizedDateIndex !== null && eventDates[normalizedDateIndex]
      ? eventDates[normalizedDateIndex]
      : null;
  
  // Log selected date info
  useEffect(() => {
    logger.debug('[BrowseAndProposeScreen] Selected date info:', {
      dateIndex,
      normalizedDateIndex,
      eventDatesCount: eventDates.length,
      hasSelectedDate: !!selectedDate,
      selectedDateValue: selectedDate?.date,
      selectedDateString: selectedDate?.date ? new Date(selectedDate.date).toISOString() : null,
      selectedDateKey: selectedDate?.date ? getDateKey(selectedDate.date) : null
    });
  }, [dateIndex, normalizedDateIndex, selectedDate, eventDates.length]);
  
  // Get confirmed attendees for selected date
  const confirmedAttendees = useMemo(() => {
    if (dateIndex === null || !selectedDate) {
      return [];
    }
    
    const dateKey = getDateKey(selectedDate.date);
    
    const confirmed = members.filter(member => {
      const memberRsvps = memberRSVPs[member.userId] || {};
      
      if (typeof memberRsvps === 'string') {
        // Legacy format: if memberRsvps is 'going', they're confirmed for all dates
        return memberRsvps === 'going';
      }
      return memberRsvps[dateKey] === 'going';
    });
    
    // Always include the logged-in user if they're a member and have confirmed for this date
    const isMember = members.some(m => m.userId === userId);
    
    if (isMember && userId && !confirmed.some(m => m.userId === userId)) {
        const userRSVPs = memberRSVPs[userId] || {};
        let userHasConfirmed = false;
      
        if (typeof userRSVPs === 'string') {
        // Legacy format: if userRSVPs is 'going', they're confirmed for all dates
        userHasConfirmed = userRSVPs === 'going';
        } else {
          userHasConfirmed = userRSVPs[dateKey] === 'going';
        }
        
        if (userHasConfirmed) {
          const userMember = members.find(m => m.userId === userId);
          if (userMember) {
            confirmed.push(userMember);
          }
      } else {
        console.warn('[RSVP Check] User NOT confirmed for date:', {
          userId,
          dateKey,
          userRSVPsType: typeof userRSVPs,
          userRSVPs: typeof userRSVPs === 'object' ? userRSVPs : userRSVPs,
          statusForDate: typeof userRSVPs === 'object' ? userRSVPs[dateKey] : 'N/A'
        });
      }
    }
    
    logger.debug('[RSVP Check] Confirmed attendees:', {
      count: confirmed.length,
      userIds: confirmed.map(c => c.userId),
      currentUserIncluded: confirmed.some(c => c.userId === userId),
      dateKey
    });
    
    return confirmed;
  }, [members, memberRSVPs, dateIndex, selectedDate, userId]);
  
  // Aggregate games from confirmed attendees
  const aggregatedGames = useMemo(() => {
    if (!selectedDate) {
      logger.debug('[BrowseAndProposeScreen] No selectedDate, returning empty games');
      return [];
    }
    
    if (confirmedAttendees.length === 0) {
      logger.debug('[BrowseAndProposeScreen] No confirmed attendees, returning empty games');
      return [];
    }
    
    // Safety checks
    const safeCollections = collections || {};
    const safeMemberNames = memberNames || {};
    
    logger.debug('[BrowseAndProposeScreen] Aggregating games:', {
      confirmedAttendeesCount: confirmedAttendees.length,
      confirmedAttendeeIds: confirmedAttendees.map(a => a.userId),
      collectionsKeys: Object.keys(safeCollections),
      memberNamesKeys: Object.keys(safeMemberNames)
    });
    
    const gamesMap = new Map(); // Key: gameId (bggId or id), Value: { game, owners: [names] }
    
    confirmedAttendees.forEach(attendee => {
      const attendeeId = attendee.userId;
      if (!attendeeId) return;
      
      const attendeeName = safeMemberNames[attendeeId] || attendeeId;
      const attendeeGames = Array.isArray(safeCollections[attendeeId]) ? safeCollections[attendeeId] : [];
      
      logger.debug(`[BrowseAndProposeScreen] Processing attendee ${attendeeId}:`, {
        name: attendeeName,
        gamesCount: attendeeGames.length
      });
      
      attendeeGames.forEach(game => {
        const gameId = game.bggId || game.id;
        if (!gameId) return;
        
        const gameKey = String(gameId);
        
        if (gamesMap.has(gameKey)) {
          // Game already exists, add owner
          const existing = gamesMap.get(gameKey);
          if (!existing.owners.includes(attendeeName)) {
            existing.owners.push(attendeeName);
          }
        } else {
          // New game, add with owner
          gamesMap.set(gameKey, {
            game: { ...game },
            owners: [attendeeName],
          });
        }
      });
    });
    
    // Convert map to array
    const result = Array.from(gamesMap.values()).map(item => ({
      ...item.game,
      _owners: item.owners || [],
    }));
    
    logger.debug('[BrowseAndProposeScreen] Aggregated games result:', {
      totalGames: result.length,
      gameIds: result.map(g => g.bggId || g.id).slice(0, 5)
    });
    
    return result;
  }, [confirmedAttendees, collections, memberNames, selectedDate]);

  // Filter proposals to only include games owned by confirmed attendees for the selected date
  // Since proposals are now date-specific, we just need to filter by game availability
  const filteredProposals = useMemo(() => {
    if (!selectedDate || confirmedAttendees.length === 0) {
      return [];
    }

    // Create a map of gameId -> game from aggregatedGames for quick lookup
    const gamesByGameId = new Map();
    aggregatedGames.forEach(game => {
      const gameId = String(game.bggId || game.id);
      if (gameId) {
        gamesByGameId.set(gameId, game);
      }
    });

    return proposedGames.filter(proposal => {
      const gameId = String(proposal.gameId || '');
      const game = gamesByGameId.get(gameId);
      
      // Only include proposals for games in aggregatedGames (owned by confirmed attendees)
      return !!game;
    });
  }, [proposedGames, aggregatedGames, confirmedAttendees, selectedDate]);

  // Cleanup orphaned proposals when aggregatedGames changes (e.g., when owners change RSVP)
  // IMPORTANT: Only depend on aggregatedGames, not proposedGames, to avoid loops
  useEffect(() => {
    if (!event?.id || !db || !selectedDate) {
      // Reset tracking when dependencies become invalid
      cleanupAttemptedRef.current.clear();
      aggregatedGamesHashRef.current = '';
      return;
    }
    
    const dateKey = getDateKey(selectedDate.date);
    
    // Create a hash of aggregatedGames to detect actual changes
    // Include dateKey in hash so we reset when date changes
    const availableGameIds = new Set(
      aggregatedGames.map(g => String(g.bggId || g.id))
    );
    const aggregatedGamesHash = `${dateKey}:${Array.from(availableGameIds).sort().join(',')}`;
    
    // Only proceed if aggregatedGames or date actually changed
    if (aggregatedGamesHashRef.current === aggregatedGamesHash) {
      return;
    }
    
    // Update the hash
    aggregatedGamesHashRef.current = aggregatedGamesHash;
    
    // Clear cleanup tracking when aggregatedGames or date changes
    cleanupAttemptedRef.current.clear();
    
    // Find proposals for games that are no longer in aggregatedGames
    // Use ref to get current proposedGames without depending on it (prevents loop)
    const currentProposedGames = proposedGamesForCleanupRef.current;
    const orphanedProposals = currentProposedGames.filter(proposal => {
      const gameId = String(proposal.gameId || '');
      return !availableGameIds.has(gameId);
    });
    
    if (orphanedProposals.length === 0) return;
    
    // Filter out proposals we've already tried to clean up (to avoid retrying failed ones)
    const newOrphanedProposals = orphanedProposals.filter(proposal => {
      const gameId = String(proposal.gameId || '');
      return !cleanupAttemptedRef.current.has(gameId);
    });
    
    if (newOrphanedProposals.length === 0) return;
    
    // Clean up orphaned proposals
    const cleanup = async () => {
      logger.debug(`[BrowseAndProposeScreen] Cleaning up ${newOrphanedProposals.length} orphaned proposals for date ${dateKey}`);
      
      for (const proposal of newOrphanedProposals) {
        const gameId = String(proposal.gameId || '');
        const proposalDocId = `${dateKey}_${gameId}`;
        
        // Mark as attempted immediately to prevent retries
        cleanupAttemptedRef.current.add(gameId);
        
        try {
          // Delete the proposal document
          await db.collection('gamingGroups').doc(event.id)
            .collection('nominations').doc(proposalDocId)
            .delete();
          
          // Delete all rating documents for this proposal
          // Rating documents have userId field, proposal documents don't
          const ratingsSnapshot = await db.collection('gamingGroups').doc(event.id)
            .collection('nominations')
            .where('dateKey', '==', dateKey)
            .where('gameId', '==', gameId)
            .get();
          
          const batch = db.batch();
          ratingsSnapshot.forEach(doc => {
            const data = doc.data();
            // Only delete rating documents (they have userId field, proposals don't)
            if (data.userId && data.userId !== data.nominatedBy) {
              batch.delete(doc.ref);
            }
          });
          
          if (ratingsSnapshot.size > 0) {
            await batch.commit();
          }
          
          logger.debug(`[BrowseAndProposeScreen] Successfully cleaned up proposal for ${gameId}`);
        } catch (error) {
          console.error(`[BrowseAndProposeScreen] Error cleaning up proposal for ${gameId}:`, error);
          // Don't remove from cleanupAttemptedRef - we'll skip retrying this one
          // to prevent infinite loops when permissions are insufficient
        }
      }
    };
    
    cleanup();
  }, [aggregatedGames, event?.id, selectedDate, db]); // Removed proposedGames from dependencies
  // Enrich games with category data (games should already have category rank fields)
  const enrichedGames = useMemo(() => {
    const memoStartTime = performance.now();
    if (!Array.isArray(aggregatedGames) || aggregatedGames.length === 0) {
      logger.debug('[BrowseAndProposeScreen] enrichedGames useMemo: returning empty array');
      return [];
    }
    
    const result = aggregatedGames.map(game => {
      // Helper to get category from rank fields
      const getCategoryFromRanks = (data) => {
        if (!data) return 'Other';
        return data.strategyGamesRank ? 'Strategy' :
               data.familyGamesRank ? 'Family' :
               data.partyGamesRank ? 'Party' :
               data.wargamesRank ? 'War' :
               data.thematicRank ? 'Thematic' :
               data.abstractsRank ? 'Abstract' :
               data.childrensGamesRank ? 'Children' :
               data.cgsRank ? 'CCG' : 'Other';
      };
      
      // Games should already have category rank fields when stored
      const hasCategoryRanks = game.strategyGamesRank !== undefined || game.familyGamesRank !== undefined || game.partyGamesRank !== undefined;
      const effectiveBggData = hasCategoryRanks ? game : null;
      
      if (effectiveBggData) {
        const primaryCategory = getCategoryFromRanks(effectiveBggData);
        
        return {
          ...game,
          _primaryCategory: primaryCategory,
        };
      }
      
      return {
        ...game,
        _primaryCategory: 'Other',
      };
    });
    
    const memoTime = performance.now() - memoStartTime;
    logger.debug('[BrowseAndProposeScreen] enrichedGames useMemo complete:', {
      inputCount: aggregatedGames.length,
      outputCount: result.length,
      timeMs: memoTime.toFixed(2),
    });
    
    return result;
  }, [aggregatedGames]);

  // Load match scores for games (both enriched games and proposed games)
  // Use refs to track previous values and prevent unnecessary recalculations
  const enrichedGamesRef = useRef(enrichedGames);
  const proposedGamesRef = useRef(proposedGames);
  const collectionsRef = useRef(collections);
  const personalMatchWeightsRef = useRef(user?.personalMatchWeights);
  const matchScoresCalculationInProgressRef = useRef(false);
  
  // Update refs when values change - log if collections object reference changes unnecessarily
  useEffect(() => {
    enrichedGamesRef.current = enrichedGames;
  }, [enrichedGames]);
  
  useEffect(() => {
    proposedGamesRef.current = proposedGames;
  }, [proposedGames]);
  
  useEffect(() => {
    // Check if collections object reference changed but content is the same
    const prevCollections = collectionsRef.current;
    if (prevCollections && collections) {
      const prevKeys = Object.keys(prevCollections);
      const currKeys = Object.keys(collections);
      if (prevKeys.length === currKeys.length && 
          prevKeys.every(key => prevCollections[key] === collections[key])) {
        // Collections content is the same, but reference changed - this is a performance issue
        console.warn('[BrowseAndPropose] Collections object reference changed but content is identical - potential performance issue');
      }
    }
    collectionsRef.current = collections;
  }, [collections]);
  
  useEffect(() => {
    personalMatchWeightsRef.current = user?.personalMatchWeights;
  }, [user?.personalMatchWeights]);

  useEffect(() => {
    if (!eventId || !userId) {
      return;
    }

    // Prevent multiple simultaneous calculations
    if (matchScoresCalculationInProgressRef.current) {
      logger.debug('[BrowseAndPropose] Match scores calculation already in progress, skipping');
      return;
    }

    const loadMatchScores = async () => {
      const startTime = performance.now();
      logger.debug('[BrowseAndPropose] Starting match scores calculation', {
        enrichedGamesCount: enrichedGamesRef.current?.length || 0,
        proposedGamesCount: proposedGamesRef.current?.length || 0,
      });
      
      matchScoresCalculationInProgressRef.current = true;
      
      try {
        // Use ref to get current scores without dependency
        const scores = { ...matchScoresRef.current }; // Start with existing scores to avoid recalculating
        const allGamesToScore = [];
        const gamesNeedingCalculation = [];
        
        // Add enriched games
        if (Array.isArray(enrichedGamesRef.current) && enrichedGamesRef.current.length > 0) {
          enrichedGamesRef.current.forEach(game => {
            const gameId = game.bggId || game.id;
            if (gameId) {
              const gameIdStr = String(gameId);
              // Only process if we don't already have a score
              if (!scores[gameIdStr]) {
                allGamesToScore.push({ gameId: gameIdStr, game });
              }
            }
          });
        }
        
        // Add proposed games
        if (Array.isArray(proposedGamesRef.current) && proposedGamesRef.current.length > 0) {
          proposedGamesRef.current.forEach(proposal => {
            const gameId = proposal.gameId;
            if (gameId) {
              const gameIdStr = String(gameId);
              if (!scores[gameIdStr] && !allGamesToScore.find(g => g.gameId === gameIdStr)) {
                // Create a minimal game object for proposed games
                allGamesToScore.push({
                  gameId: gameIdStr,
                  game: {
                    bggId: gameId,
                    id: gameId,
                    title: proposal.gameName,
                    image: proposal.gameImage,
                  }
                });
              }
            }
          });
        }
        
        if (allGamesToScore.length === 0) {
          logger.debug('[BrowseAndPropose] No new games to score');
          matchScoresCalculationInProgressRef.current = false;
          return; // All scores already calculated or no games
        }
        
        const userCollection = collectionsRef.current[userId] || [];
        if (userCollection.length === 0) {
          logger.debug('[BrowseAndPropose] User collection is empty');
          matchScoresCalculationInProgressRef.current = false;
          return;
        }
        
        const customWeights = personalMatchWeightsRef.current || null;
        const weights = customWeights || {
          publisher: 3,
          mechanics: 3,
          category: 2,
          complexity: 1.5,
          favorite: 2,
        };
        
        logger.debug('[BrowseAndPropose] Processing match scores', {
          gamesToScore: allGamesToScore.length,
          userCollectionSize: userCollection.length,
        });
        
        // First, batch check for stored scores
        const storedScorePromises = allGamesToScore.map(async ({ gameId, game }) => {
          try {
            const storedScore = await getMatchScore(eventId, gameId, userId);
            if (storedScore !== null) {
              const scoreNum = typeof storedScore === 'number' ? storedScore : Number(storedScore);
              if (!isNaN(scoreNum)) {
                return { gameId, score: scoreNum, hasScore: true };
              }
            }
            return { gameId, game, hasScore: false };
          } catch (error) {
            console.warn(`[BrowseAndPropose] Error getting stored score for game ${gameId}:`, error);
            return { gameId, game, hasScore: false };
          }
        });
        
        const storedScoreResults = await Promise.all(storedScorePromises);
        
        // Add stored scores to results and collect games that need calculation
        storedScoreResults.forEach(result => {
          if (result.hasScore) {
            scores[result.gameId] = result.score;
          } else {
            gamesNeedingCalculation.push(result);
          }
        });
        
        logger.debug('[BrowseAndPropose] Stored scores found', {
          storedCount: Object.keys(scores).length,
          needsCalculation: gamesNeedingCalculation.length,
        });
        
        // Batch process games that need calculation
        // Games already have BGG data from import, no need to fetch
        if (gamesNeedingCalculation.length > 0) {
          // Batch calculate all matches at once (much more efficient)
          const gamesToCalculate = gamesNeedingCalculation.filter(({ game }) => game && game._bggData);
          if (gamesToCalculate.length > 0) {
            logger.debug('[BrowseAndPropose] Calculating match scores for', gamesToCalculate.length, 'games');
            const calculationStartTime = performance.now();
            
            const preCalculatedMatches = preCalculateAllMatches(
              gamesToCalculate.map(({ game }) => game),
              userCollection
            );
            
            // Calculate scores for all games
            gamesToCalculate.forEach(({ gameId, game }) => {
              const matches = preCalculatedMatches.get(gameId);
              if (matches) {
                const score = calculateGameScore(matches, weights, game);
                if (score !== null && score > 0) {
                  const scoreNum = typeof score === 'number' ? score : Number(score);
                  if (!isNaN(scoreNum)) {
                    scores[gameId] = scoreNum;
                    // Store it for future use (non-blocking)
                    calculateMatchScoresForGame(eventId, gameId, game, collectionsRef.current, { [userId]: customWeights }).catch(err => {
                      if (__DEV__) {
                        console.warn('[BrowseAndPropose] Error storing match score:', err);
                      }
                    });
                  }
                }
              }
            });
            
            const calculationTime = performance.now() - calculationStartTime;
            logger.debug('[BrowseAndPropose] Match score calculation completed', {
              timeMs: calculationTime.toFixed(2),
              gamesCalculated: gamesToCalculate.length,
            });
          }
        }
        
        // Only update state if we have new scores
        const hasNewScores = Object.keys(scores).some(key => matchScoresRef.current[key] !== scores[key]) || 
                           Object.keys(scores).length > Object.keys(matchScoresRef.current).length;
        
        if (hasNewScores) {
          matchScoresRef.current = scores; // Update ref
          setMatchScores(scores);
          const totalTime = performance.now() - startTime;
          logger.debug('[BrowseAndPropose] Match scores updated', {
            totalTimeMs: totalTime.toFixed(2),
            scoresCount: Object.keys(scores).length,
          });
        } else {
          logger.debug('[BrowseAndPropose] No new scores to update');
        }
      } catch (error) {
        console.error('[BrowseAndPropose] Error in loadMatchScores:', error);
      } finally {
        matchScoresCalculationInProgressRef.current = false;
      }
    };

    // Debounce the calculation to prevent rapid-fire updates
    const timeoutId = setTimeout(() => {
      loadMatchScores();
    }, 300); // Wait 300ms after dependencies change

    return () => {
      clearTimeout(timeoutId);
    };
  }, [eventId, userId]); // Only depend on eventId and userId, use refs for the rest
  
  // Keep ref in sync with state
  useEffect(() => {
    matchScoresRef.current = matchScores;
  }, [matchScores]);

  // Helper to get rating label
  const getRatingLabel = (rating) => {
    const ratingLabels = {
      3: '⭐⭐⭐ I really want to play this game',
      2: '⭐⭐ I want to play this game',
      1: '⭐ I am fine with playing this game',
      0: '⚪ I am not sure about this game',
      '-1': '😞 I would rather not play this game',
    };
    return ratingLabels[rating] || '';
  };
  
  // Note: Sorting, filtering, and category grouping are now handled by GameCollectionView
  
  // Reset selected owner when needed (GameCollectionView handles sort/category state)
  // Note: No longer managing sortBy, searchQuery, selectedCategory, categorySortPreference here
  
  // Reset to page 1 when selected owner changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedOwner]);
  
  // Get all unique owners from games owned by confirmed attendees (for owner filter)
  const uniqueOwners = useMemo(() => {
    if (!Array.isArray(enrichedGames) || enrichedGames.length === 0) {
      return [];
    }
    
    // Get all owner names from games
    const ownerNamesSet = new Set();
    enrichedGames.forEach(game => {
      const owners = game._owners || [];
      owners.forEach(ownerName => {
        if (ownerName) {
          ownerNamesSet.add(ownerName);
        }
      });
    });
    
    // Map owner names to confirmed attendees (only include owners who RSVP'd "Going")
    const ownersList = [];
    confirmedAttendees.forEach(attendee => {
      const attendeeId = attendee.userId;
      if (!attendeeId) return;
      
      const attendeeName = memberNames[attendeeId] || attendeeId;
      if (ownerNamesSet.has(attendeeName)) {
        ownersList.push({
          userId: attendeeId,
          name: attendeeName,
          avatarUrl: memberAvatars[attendeeId] || null,
        });
      }
    });
    
    // Sort by name for consistent display
    ownersList.sort((a, b) => a.name.localeCompare(b.name));
    
    return ownersList;
  }, [enrichedGames, confirmedAttendees, memberNames, memberAvatars]);

  // Filter games by selected owner if owner filter is active
  const gamesToDisplay = useMemo(() => {
    if (!selectedOwner) return enrichedGames;
    const selectedOwnerName = memberNames[selectedOwner] || '';
    return enrichedGames.filter(game => {
      const owners = game._owners || [];
      return owners.includes(selectedOwnerName);
    });
  }, [enrichedGames, selectedOwner, memberNames]);

  // Create owners map for GameCollectionView
  const ownersMap = useMemo(() => {
    const map = {};
    gamesToDisplay.forEach(game => {
      const gameId = String(game.bggId || game.id);
      map[gameId] = game._owners || [];
    });
    return map;
  }, [gamesToDisplay]);
  
  // Load event data
  useEffect(() => {
    if (!eventId) return;
    
    const loadEvent = async () => {
      try {
        setLoading(true);
        logger.debug('[BrowseAndProposeScreen] Loading event:', eventId);
        const eventData = await getEventById(eventId);
        logger.debug('[BrowseAndProposeScreen] Event loaded:', {
          hasEventData: !!eventData,
          eventId: eventData?.id,
          eventName: eventData?.name,
          hasEventDates: !!eventData?.eventDates,
          eventDatesCount: Array.isArray(eventData?.eventDates) ? eventData.eventDates.length : 'N/A',
          eventDates: eventData?.eventDates,
          organizerId: eventData?.organizerId,
          membersCount: Array.isArray(eventData?.members) ? eventData.members.length : 'N/A',
          memberIds: eventData?.members?.map(m => m.userId) || [],
          currentUserId: userId,
          isCurrentUserInMembers: eventData?.members?.some(m => m.userId === userId) || false,
          isCurrentUserOrganizer: eventData?.organizerId === userId
        });
        if (eventData) {
          setEvent(eventData);
        } else {
          console.warn('[BrowseAndProposeScreen] No event data returned for eventId:', eventId);
        }
      } catch (error) {
        console.error('[BrowseAndProposeScreen] Error loading event:', {
          error,
          errorCode: error?.code,
          errorMessage: error?.message,
          eventId
        });
        Alert.alert('Error', 'Failed to load event. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    loadEvent();
  }, [eventId, getEventById]);
  
  // Load members and RSVPs
  // Note: RSVPs are stored in the members document itself (rsvpStatus, rsvpStatuses fields)
  useEffect(() => {
    if (!event?.id || !db) return;
    
    logger.debug('[BrowseAndProposeScreen] Setting up members listener for event:', event.id);
    logger.debug('[BrowseAndProposeScreen] Current user and event info:', {
      userId,
      eventId: event.id,
      eventOrganizerId: event?.organizerId,
      eventMemberIds: event?.members?.map(m => m.userId) || [],
      isCurrentUserOrganizer: event?.organizerId === userId,
      isCurrentUserInEventMembers: event?.members?.some(m => m.userId === userId) || false,
      eventMembersCount: event?.members?.length || 0
    });
    
    // Check if member document exists, and create it if missing
    // This is critical for Firestore rules to work - user must have a member document to read members
    const ensureMemberDocument = async () => {
      try {
        const memberDocRef = db.collection('gamingGroups').doc(event.id)
          .collection('members').doc(userId);
        
        const memberDoc = await memberDocRef.get();
        
        if (!memberDoc.exists) {
          logger.debug('[BrowseAndProposeScreen] Member document does not exist, creating it...', {
            eventId: event.id,
            userId,
            isInMemberIds: event?.members?.some(m => m.userId === userId) || false,
            isOrganizer: event?.organizerId === userId
          });
          
          // Only create if user is actually a member (in memberIds or is organizer)
          const isInMemberIds = event?.members?.some(m => m.userId === userId) || false;
          const isOrganizer = event?.organizerId === userId;
          
          if (isInMemberIds || isOrganizer) {
            const userName = user?.name || user?.email || userId;
            const userAvatarUrl = user?.photoURL || user?.avatarUrl || null;
            
            await memberDocRef.set({
              userId,
              userName: userName || userId,
              userAvatarUrl: userAvatarUrl || null,
              role: isOrganizer ? 'organizer' : 'member',
              joinedAt: firebase.firestore.Timestamp.now(),
              rsvpStatus: null,
              rsvpStatuses: {},
            }, { merge: true });
            
            logger.debug('[BrowseAndProposeScreen] Member document created successfully');
          } else {
            console.warn('[BrowseAndProposeScreen] User is not a member, cannot create member document');
          }
        } else {
          logger.debug('[BrowseAndProposeScreen] Member document exists:', {
            eventId: event.id,
            userId,
            hasData: !!memberDoc.data()
          });
        }
      } catch (error) {
        console.error('[BrowseAndProposeScreen] Error ensuring member document:', {
          error,
          errorCode: error?.code,
          errorMessage: error?.message,
          eventId: event.id,
          userId
        });
      }
    };
    
    // Set up members listener after ensuring member document exists
    // This is critical - the Firestore rule requires the member document to exist
    let unsubscribeMembers = null;
    
    ensureMemberDocument()
      .then(() => {
        // Also try to check if user can read the group document directly
        return db.collection('gamingGroups').doc(event.id).get()
          .then((groupDoc) => {
            if (groupDoc.exists) {
              const groupData = groupDoc.data();
              logger.debug('[BrowseAndProposeScreen] Group document read successful:', {
                groupId: event.id,
                memberIds: groupData.memberIds || [],
                isActive: groupData.isActive,
                deletedAt: groupData.deletedAt,
                isCurrentUserInMemberIds: (groupData.memberIds || []).includes(userId),
                isCurrentUserOrganizer: groupData.organizerId === userId
              });
            } else {
              console.warn('[BrowseAndProposeScreen] Group document does not exist:', event.id);
            }
          })
          .catch((error) => {
            console.error('[BrowseAndProposeScreen] Error reading group document:', {
              error,
              errorCode: error?.code,
              errorMessage: error?.message
            });
          });
      })
      .then(() => {
        // Now set up the members listener after member document is ensured
        logger.debug('[BrowseAndProposeScreen] Setting up members listener after ensuring member document');
        unsubscribeMembers = db.collection('gamingGroups').doc(event.id)
          .collection('members')
          .onSnapshot(async (snapshot) => {
        logger.debug('[BrowseAndProposeScreen] Members snapshot received:', {
          size: snapshot.size,
          empty: snapshot.empty,
          eventId: event.id,
          hasMetadata: !!snapshot.metadata,
          fromCache: snapshot.metadata?.fromCache,
          hasPendingWrites: snapshot.metadata?.hasPendingWrites
        });
        
        const membersList = [];
        const rsvps = {};
        const names = {};
        const avatars = {};
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          const userId = doc.id;
          logger.debug(`[BrowseAndProposeScreen] Processing member document ${userId}:`, {
            hasRsvpStatuses: !!data.rsvpStatuses,
            hasRsvpStatus: !!data.rsvpStatus,
            rsvpStatuses: data.rsvpStatuses,
            rsvpStatus: data.rsvpStatus,
            userName: data.userName,
            hasUserAvatarUrl: !!data.userAvatarUrl
          });
          
          membersList.push({ id: userId, userId, ...data });
          
          // Extract RSVP data from member document
          if (data.rsvpStatuses && typeof data.rsvpStatuses === 'object') {
            // New format: rsvpStatuses is an object with date keys
            rsvps[userId] = { ...data.rsvpStatuses };
            logger.debug(`[BrowseAndProposeScreen] Member ${userId} RSVPs (new format):`, rsvps[userId]);
          } else if (data.rsvpStatus) {
            // Legacy format: single rsvpStatus field
            rsvps[userId] = { default: data.rsvpStatus };
            logger.debug(`[BrowseAndProposeScreen] Member ${userId} RSVP (legacy format):`, rsvps[userId]);
          } else {
            rsvps[userId] = {};
            logger.debug(`[BrowseAndProposeScreen] Member ${userId} has no RSVP data`);
          }
          
          // Extract name and avatar from member document
          if (data.userName) {
            names[userId] = data.userName;
          }
          if (data.userAvatarUrl) {
            avatars[userId] = data.userAvatarUrl;
          }
        });
        
        logger.debug('[BrowseAndProposeScreen] Members loaded:', {
          count: membersList.length,
          memberIds: membersList.map(m => m.userId),
          rsvpsCount: Object.keys(rsvps).length,
          rsvpsKeys: Object.keys(rsvps),
          rsvpsData: rsvps,
          namesCount: Object.keys(names).length,
          avatarsCount: Object.keys(avatars).length
        });
        
        // Only update state if component is still mounted
        if (!isMountedRef.current) return;
        
        setMembers(membersList);
        setMemberRSVPs(rsvps);
        
        // Fetch missing names and avatars from users collection
        const userIdsToFetch = membersList
          .map(m => m.userId)
          .filter(uid => !names[uid] || !avatars[uid]);
        
        if (userIdsToFetch.length > 0) {
          try {
            const userDocs = await Promise.all(
              userIdsToFetch.map(uid => 
                db.collection('users').doc(uid).get().catch(() => null)
              )
            );
            
            userDocs.forEach((userDoc, index) => {
              if (userDoc && userDoc.exists) {
                const userData = userDoc.data();
                const uid = userIdsToFetch[index];
                if (!names[uid] && userData.name) {
                  names[uid] = userData.name;
                }
                if (!avatars[uid] && (userData.avatarUrl || userData.photoURL)) {
                  avatars[uid] = userData.avatarUrl || userData.photoURL;
                }
              }
            });
          } catch (error) {
            console.error('[BrowseAndProposeScreen] Error fetching user data:', error);
          }
        }
        
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setMemberNames(names);
          setMemberAvatars(avatars);
          
          // Get user's proposal limit from members
          if (userId) {
            const userMember = membersList.find(m => m.userId === userId);
            const proposalLimit = userMember?.proposalLimit !== undefined ? userMember.proposalLimit : 5;
            setUserProposalLimit(proposalLimit);
          }
        }
          }, (error) => {
            console.error('[BrowseAndProposeScreen] Error loading members:', {
              error,
              errorCode: error?.code,
              errorMessage: error?.message,
              errorStack: error?.stack,
              eventId: event?.id,
              hasDb: !!db,
              userId
            });
            // Set empty arrays on error to prevent crashes (only if mounted)
            if (isMountedRef.current) {
              setMembers([]);
              setMemberRSVPs({});
              setMemberNames({});
              setMemberAvatars({});
            }
          });
      })
      .catch((error) => {
        console.error('[BrowseAndProposeScreen] Error setting up members listener:', {
          error,
          errorCode: error?.code,
          errorMessage: error?.message,
          eventId: event.id,
          userId
        });
      });
    
    return () => {
      if (unsubscribeMembers) {
        unsubscribeMembers();
      }
    };
  }, [event?.id, db, userId, user]);
  
  // Load proposed games (nominations) for the selected date
  useEffect(() => {
    if (!event?.id || !db || !selectedDate) {
      setProposedGames([]);
      setUserProposals(new Set());
      return;
    }
    
    const dateKey = getDateKey(selectedDate.date);
    
    // Query proposals for this specific date using dateKey prefix
    // Document IDs are in format: {dateKey}_{gameId} for proposals
    // and {dateKey}_{gameId}_{userId} for ratings
    const unsubscribe = db.collection('gamingGroups').doc(event.id)
      .collection('nominations')
      .where('dateKey', '==', dateKey)
      .onSnapshot((snapshot) => {
        const proposalsMap = new Map();
        const userProposalsSet = new Set();
        
        // First pass: collect all proposal documents (base proposals)
        snapshot.forEach((doc) => {
          const data = doc.data();
          const gameId = data.gameId;
          const docDateKey = data.dateKey;
          
          if (!gameId || docDateKey !== dateKey) return;
          
          // Check if this is a proposal document (not a rating document)
          // Rating documents have userId that differs from nominatedBy
          const isRatingDoc = data.userId && data.userId !== data.nominatedBy;
          
          if (!isRatingDoc) {
            // This is a proposal document (base proposal)
            if (!proposalsMap.has(gameId)) {
              proposalsMap.set(gameId, {
                gameId,
                gameName: data.gameName || 'Unknown Game',
                gameImage: data.gameImage || null,
                proposedBy: data.nominatedBy || data.userId || userId,
                dateKey: docDateKey,
                ratings: {},
              });
            }
            
            // Check if this proposal is by the current user
            if (data.nominatedBy === userId || data.userId === userId) {
              userProposalsSet.add(gameId);
            }
          }
        });
        
        // Second pass: collect all rating documents and attach them to proposals
        snapshot.forEach((doc) => {
          const data = doc.data();
          const gameId = data.gameId;
          const docDateKey = data.dateKey;
          
          if (!gameId || docDateKey !== dateKey) return;
          
          // Check if this is a rating document
          const isRatingDoc = data.userId && data.userId !== data.nominatedBy;
          
          if (isRatingDoc) {
            // This is a rating document - ensure proposal exists
            if (!proposalsMap.has(gameId)) {
              // Create proposal entry from rating document if proposal doesn't exist
              proposalsMap.set(gameId, {
                gameId,
                gameName: data.gameName || 'Unknown Game',
                gameImage: data.gameImage || null,
                proposedBy: data.nominatedBy || userId,
                dateKey: docDateKey,
                ratings: {},
              });
            }
            
            // Add rating to the proposal
            const proposal = proposalsMap.get(gameId);
            if (data.rating !== null && data.rating !== undefined) {
              proposal.ratings[data.userId] = data.rating;
            }
          }
        });
        
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setProposedGames(Array.from(proposalsMap.values()));
          setUserProposals(userProposalsSet);
        }
      }, (error) => {
        console.error('[BrowseAndProposeScreen] Error loading proposals:', error);
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setProposedGames([]);
          setUserProposals(new Set());
        }
      });
    
    return unsubscribe;
  }, [event?.id, selectedDate, userId, db]);
  
  const handleOpenGameDetails = useCallback((game) => {
    setSelectedGame(game);
    setSelectedProposalId(null); // Clear proposalId when opening from regular game list
    setShowGameDetails(true);
  }, []);
  
  // Helper to convert a proposal to a game object for the details modal
  const handleOpenProposedGameDetails = useCallback(async (proposal) => {
    const gameId = proposal.gameId;
    if (!gameId || !selectedDate) return;
    
    // Calculate proposalId (same format as used when creating proposals)
    const dateKey = getDateKey(selectedDate.date);
    const proposalId = `${dateKey}_${gameId}`;
    
    // First, check if this game is already in enrichedGames (from Everyone's Games)
    const existingGame = enrichedGames.find(g => {
      const gId = g.bggId || g.id;
      return gId && String(gId) === String(gameId);
    });
    
    if (existingGame) {
      // Use the existing game data - it already has BGG data loaded
      setSelectedGame(existingGame);
      setSelectedProposalId(proposalId);
      setShowGameDetails(true);
      return;
    }
    
    // Create a game object from the proposal (game not found in enrichedGames)
    const gameObject = {
      id: gameId,
      bggId: gameId,
      title: proposal.gameName || 'Unknown Game',
      image: proposal.gameImage || null,
      thumbnail: proposal.gameImage || null,
    };
    
    setSelectedGame(gameObject);
    setSelectedProposalId(proposalId);
    setShowGameDetails(true);
  }, [enrichedGames, selectedDate]);
  
  // Helper function to find game owner user IDs
  const findGameOwnerUserIds = (game, memberNames, members) => {
    const owners = game._owners || [];
    if (owners.length === 0) {
      return [];
    }
    
    // Map owner names to user IDs
    const ownerUserIds = [];
    for (const ownerName of owners) {
      // Find member with matching name
      const member = members.find(m => {
        const memberName = memberNames[m.userId] || m.userName || '';
        return memberName === ownerName;
      });
      
      if (member && member.userId) {
        ownerUserIds.push(member.userId);
      }
    }
    
    return ownerUserIds;
  };

  // Helper function to notify game owners about a proposal
  const notifyGameOwnersAboutProposal = async (
    eventId,
    game,
    proposerUserId,
    memberNames,
    members,
    gameName,
    eventName
  ) => {
    if (!eventId || !game || !db) {
      console.warn('[notifyGameOwnersAboutProposal] Missing required parameters');
      return;
    }

    // Find game owner user IDs
    const ownerUserIds = findGameOwnerUserIds(game, memberNames, members);
    
    if (ownerUserIds.length === 0) {
      logger.debug('[notifyGameOwnersAboutProposal] No game owners found');
      return;
    }

    // Get proposer's name
    const proposerName = memberNames[proposerUserId] || user?.name || 'Someone';
    
    // Use provided event name or default
    const meepleUpName = eventName || 'your MeepleUp';

    // Notify each owner
    for (const ownerUserId of ownerUserIds) {
      // Skip if the proposer is the owner
      if (ownerUserId === proposerUserId) {
        continue;
      }

      try {
        // Create in-app notification
        await createNotification(ownerUserId, {
          type: 'game_proposed',
          groupId: eventId,
          fromUserId: proposerUserId,
          fromUserName: proposerName,
          message: `${proposerName} proposed ${gameName} for your next meeting. You might want to bring it in case the group decides to play it!`,
        });

        // Note: Direct messaging has been removed. Game owners are notified via in-app notifications only.
      } catch (notifyError) {
        console.error(`[notifyGameOwnersAboutProposal] Error notifying owner ${ownerUserId}:`, notifyError);
        // Continue with other owners even if one fails
      }
    }
  };

  const handleProposeGame = async (game) => {
    logger.debug('[BrowseAndPropose] Propose game button clicked');
    logger.debug('[BrowseAndPropose] Initial checks:', {
      hasEvent: !!event,
      eventId: event?.id,
      hasDb: !!db,
      hasUserId: !!userId,
      userId,
      userProposalsCount: userProposals.size,
      gameId: game.bggId || game.id,
      hasSelectedDate: !!selectedDate,
      dateKey: selectedDate ? getDateKey(selectedDate.date) : null,
    });
    
    // Validate that we have a selected date
    if (!selectedDate) {
      Alert.alert('Error', 'Please select a date to propose a game.');
      return;
    }
    
    // Validate that the game is in aggregatedGames (owned by confirmed attendees)
    const gameId = String(game.bggId || game.id);
    const isGameAvailable = aggregatedGames.some(g => String(g.bggId || g.id) === gameId);
    if (!isGameAvailable) {
      Alert.alert('Error', 'This game is not available for this date. Only games owned by confirmed attendees can be proposed.');
      return;
    }
    
    // Validate that the current user is a confirmed attendee
    const userIsAttending = confirmedAttendees.some(a => a.userId === userId);
    if (!userIsAttending) {
      Alert.alert('Error', 'You must be confirmed as attending this date to propose games.');
      return;
    }
    
    if (!event?.id || !db || !userId) {
      console.error('[BrowseAndPropose] Missing required data:', {
        eventId: event?.id,
        hasDb: !!db,
        userId,
      });
      return;
    }
    
    if (userProposals.size >= userProposalLimit) {
      Alert.alert('Limit Reached', `You can only propose up to ${userProposalLimit} game${userProposalLimit !== 1 ? 's' : ''}. Remove a proposal first to propose another game.`);
      return;
    }
    
    try {
      // Check if user is a member - check member document first, then group document
      let hasMemberDoc = false;
      try {
        const memberDoc = await db.collection('gamingGroups').doc(event.id)
          .collection('members').doc(userId).get();
        hasMemberDoc = memberDoc.exists;
        logger.debug('[BrowseAndPropose] Member document check:', {
          exists: hasMemberDoc,
          data: hasMemberDoc ? memberDoc.data() : null,
        });
      } catch (memberDocError) {
        console.warn('[BrowseAndPropose] Error checking member document:', memberDocError);
      }
      
      // Also check group document for memberIds
      const groupDoc = await db.collection('gamingGroups').doc(event.id).get();
      const groupData = groupDoc.data();
      const memberIds = groupData?.memberIds || [];
      const isInMemberIds = memberIds.includes(userId);
      const isOrganizer = groupData?.organizerId === userId;
      const isUserMember = hasMemberDoc || isInMemberIds || isOrganizer;
      
      logger.debug('[BrowseAndPropose] Membership check:', {
        eventId: event.id,
        userId,
        hasMemberDoc,
        memberIds,
        organizerId: groupData?.organizerId,
        isUserMember,
        isOrganizer,
        isInMemberIds,
      });
      
      if (!isUserMember) {
        console.error('[BrowseAndPropose] User is not a member of the group');
        Alert.alert('Error', 'You must be a member of this MeepleUp to propose games.');
        return;
      }
      
      // Ensure member document exists - create it if missing
      // This is needed for Firestore rules to work properly
      if (!hasMemberDoc && (isInMemberIds || isOrganizer)) {
        try {
          const membersRef = db.collection('gamingGroups').doc(event.id)
            .collection('members').doc(userId);
          
          // Get user data
          const userName = user?.name || user?.email || userId;
          const userAvatarUrl = user?.photoURL || user?.avatarUrl || null;
          
          await membersRef.set({
            userId,
            userName: userName || userId,
            userAvatarUrl: userAvatarUrl || null,
            role: isOrganizer ? 'organizer' : 'member',
            joinedAt: firebase.firestore.Timestamp.now(),
            rsvpStatus: null,
            rsvpStatuses: {},
          }, { merge: true });
          
          logger.debug('[BrowseAndPropose] Created missing member document');
        } catch (memberDocError) {
          console.warn('[BrowseAndPropose] Error creating member document:', memberDocError);
          // Continue anyway - the user is still a member, just might have permission issues
        }
      }
      
      const dateKey = getDateKey(selectedDate.date);
      
      const proposalDoc = {
        gameId,
        gameName: game.title || 'Unknown Game',
        gameImage: game.image || game.thumbnail || null,
        nominatedBy: userId,
        dateKey, // Store dateKey for querying
        createdAt: firebase.firestore.Timestamp.now(),
      };
      
      // Use dateKey in document ID to make proposals date-specific
      const proposalDocId = `${dateKey}_${gameId}`;
      
      logger.debug('[BrowseAndPropose] Attempting to save proposal:', {
        eventId: event.id,
        gameId,
        dateKey,
        proposalDocId,
        proposalDoc,
        documentPath: `gamingGroups/${event.id}/nominations/${proposalDocId}`,
      });
      
      // Ensure nominatedBy is explicitly set for Firestore rule validation
      const finalProposalDoc = {
        ...proposalDoc,
        nominatedBy: userId, // Explicitly ensure this field is set
      };
      
      await db.collection('gamingGroups').doc(event.id)
        .collection('nominations')
        .doc(proposalDocId)
        .set(finalProposalDoc, { merge: true });
      
      logger.debug('[BrowseAndPropose] Proposal saved successfully');
      
      // Note: userProposals and proposedGames will be updated via the snapshot listener
      // No need to manually update state here
      
      // Notify game owners about the proposal
      try {
        await notifyGameOwnersAboutProposal(
          event.id,
          game,
          userId,
          memberNames,
          members,
          proposalDoc.gameName,
          event.name
        );
      } catch (notifyError) {
        console.error('[BrowseAndPropose] Error notifying game owners:', notifyError);
        // Don't fail the proposal if notification fails
      }
      
      Alert.alert('Success', 'Game proposed successfully!');
    } catch (error) {
      console.error('[BrowseAndPropose] Error proposing game:', error);
      console.error('[BrowseAndPropose] Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
        eventId: event?.id,
        userId,
        gameId: game.bggId || game.id,
      });
      Alert.alert('Error', `Failed to propose game: ${error.message || 'Please try again.'}`);
    }
  };
  
  const handleOpenRatingModal = (proposal) => {
    // Find the latest proposal data from proposedGames to ensure we have the most up-to-date ratings
    const latestProposal = proposedGames.find(p => p.gameId === proposal.gameId) || proposal;
    setRatingModalGame(latestProposal);
    setShowRatingModal(true);
  };

  const handleCloseRatingModal = () => {
    setShowRatingModal(false);
    setRatingModalGame(null);
  };

  // Note: Category rendering functions are now handled by GameCollectionView
  
  // Keep ratingModalGame in sync with proposedGames when it's open
  useEffect(() => {
    if (showRatingModal && ratingModalGame) {
      const latestProposal = proposedGames.find(p => p.gameId === ratingModalGame.gameId);
      if (latestProposal) {
        // Only update if ratings have changed to avoid unnecessary re-renders
        const currentRating = ratingModalGame.ratings?.[userId] ?? null;
        const latestRating = latestProposal.ratings?.[userId] ?? null;
        if (currentRating !== latestRating || 
            JSON.stringify(ratingModalGame.ratings) !== JSON.stringify(latestProposal.ratings)) {
          setRatingModalGame(latestProposal);
        }
      }
    }
  }, [proposedGames, showRatingModal, ratingModalGame, userId]);


  const handleRateGame = async (gameId, newRating) => {
    if (!event?.id || !db || !userId || !selectedDate) return;
    
    const proposal = proposedGames.find(p => p.gameId === gameId);
    if (!proposal) return;
    
    const dateKey = proposal.dateKey || getDateKey(selectedDate.date);
    
    const userRating = proposal.ratings?.[userId] ?? null;
    
    // If clicking the same rating, clear it
    const ratingToSave = userRating === newRating ? null : newRating;
    
    try {
      // Rating document ID format: {dateKey}_{gameId}_{userId}
      const ratingDocId = `${dateKey}_${gameId}_${userId}`;
      
      if (ratingToSave === null) {
        // Clear the rating
        await db.collection('gamingGroups').doc(event.id)
          .collection('nominations')
          .doc(ratingDocId)
          .delete();
        
        // Note: State will be updated via snapshot listener, but update optimistically
        setProposedGames(prev => prev.map(n => {
          if (n.gameId === gameId) {
            const newRatings = { ...n.ratings };
            delete newRatings[userId];
            return { ...n, ratings: newRatings };
          }
          return n;
        }));
      } else {
        // Set new rating
        const ratingDoc = {
          gameId,
          gameName: proposal.gameName,
          gameImage: proposal.gameImage,
          userId,
          rating: ratingToSave,
          nominatedBy: proposal.proposedBy,
          dateKey, // Include dateKey for querying
          updatedAt: firebase.firestore.Timestamp.now(),
        };
        
        await db.collection('gamingGroups').doc(event.id)
          .collection('nominations')
          .doc(ratingDocId)
          .set(ratingDoc, { merge: true });
        
        setProposedGames(prev => prev.map(n => {
          if (n.gameId === gameId) {
            return { ...n, ratings: { ...n.ratings, [userId]: ratingToSave } };
          }
          return n;
        }));
      }
      
      // Close modal after rating
      handleCloseRatingModal();
    } catch (error) {
      console.error('Error saving rating:', error);
      Alert.alert('Error', 'Failed to save rating. Please try again.');
    }
  };
  
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }
  
  if (!event || !selectedDate) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.errorText}>Event or date not found.</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Browse and Propose</Text>
        <View style={styles.headerSpacer} />
      </View>
      
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {/* Beeple Game Optimizer */}
        {filteredProposals.length > 0 && confirmedAttendees.length > 0 && (
          <View style={styles.section}>
            <BeepleGameOptimizer
              proposedGames={filteredProposals}
              confirmedAttendees={confirmedAttendees}
              memberRSVPs={memberRSVPs}
              memberNames={memberNames}
              memberAvatars={memberAvatars}
              eventId={eventId}
              eventName={event?.name}
              selectedDate={selectedDate}
            />
          </View>
        )}

        {/* Proposed Games Section */}
        {filteredProposals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Games Proposed for {selectedDate?.date ? formatDate(selectedDate.date.toISOString()) : 'this event'}
            </Text>
            <Text style={styles.sectionCopy}>
              Rate each game to help decide what to play.
            </Text>
            {filteredProposals.map((proposal) => {
              // Ensure gameId is always a string
              const rawGameId = proposal.gameId;
              const gameId = rawGameId ? String(rawGameId) : null;
              
              // Debug logging if gameId is not a simple value
              if (gameId && (typeof rawGameId === 'object' || Array.isArray(rawGameId))) {
                console.warn('[BrowseAndPropose] gameId is not a primitive:', {
                  rawGameId,
                  rawGameIdType: typeof rawGameId,
                  convertedGameId: gameId,
                  proposal
                });
              }
              
              if (!gameId) {
                console.warn('[BrowseAndPropose] Missing gameId in proposal:', proposal);
              }
              
              const userRating = proposal.ratings?.[userId] ?? null;
              const proposerId = proposal.proposedBy;
              // Ensure proposerName is always a string
              const rawProposerName = memberNames[proposerId] || proposerId;
              const proposerName = typeof rawProposerName === 'string' ? rawProposerName : String(rawProposerName || proposerId || 'Unknown');
              
              // Debug if proposerName is not a string
              if (typeof rawProposerName !== 'string' && rawProposerName !== null && rawProposerName !== undefined) {
                console.warn('[BrowseAndPropose] proposerName is not a string:', {
                  proposerId,
                  rawProposerName,
                  rawProposerNameType: typeof rawProposerName,
                  convertedProposerName: proposerName
                });
              }
              
              const proposerAvatar = memberAvatars[proposerId] || null;
              const proposalMatchScore = gameId ? matchScores[gameId] : undefined;
              
              // Debug logging to catch type issues
              if (proposalMatchScore !== undefined && proposalMatchScore !== null && typeof proposalMatchScore !== 'number' && typeof proposalMatchScore !== 'string') {
                console.warn('[BrowseAndPropose] Invalid proposalMatchScore type:', {
                  gameId,
                  proposalMatchScore,
                  proposalMatchScoreType: typeof proposalMatchScore,
                  proposalMatchScoreValue: JSON.stringify(proposalMatchScore)
                });
              }
              
              return (
                <View key={gameId} style={styles.proposedGameItem}>
                  <Pressable
                    onPress={() => handleOpenProposedGameDetails(proposal)}
                    style={styles.proposedGameHeader}
                    android_ripple={{ color: 'rgba(0, 0, 0, 0.1)' }}
                  >
                    {proposal.gameImage ? (
                      <Image 
                        source={{ uri: proposal.gameImage }} 
                        style={styles.proposedGameThumbnail}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.proposedGameThumbnailPlaceholder}>
                        <Text style={styles.proposedGameThumbnailText}>
                          {(() => {
                            const gameName = typeof proposal.gameName === 'string' ? proposal.gameName : String(proposal.gameName || '?');
                            return gameName.charAt(0).toUpperCase();
                          })()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.proposedGameInfo}>
                      <View style={styles.proposedGameTitleRow}>
                        <Text style={styles.proposedGameTitle}>
                          {typeof proposal.gameName === 'string' ? proposal.gameName : String(proposal.gameName || 'Unknown Game')}
                        </Text>
                        {userId && proposalMatchScore !== undefined && proposalMatchScore !== null && !isGameFavorited({ bggId: gameId, id: gameId }) && (
                          <View style={styles.proposedGameMatchScore}>
                            <Text style={styles.matchScoreIconSmall}>💘</Text>
                            <Text style={styles.matchScoreTextSmall}>
                              {typeof proposalMatchScore === 'object' ? JSON.stringify(proposalMatchScore) : String(Math.round(Number(proposalMatchScore) || 0))}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.proposedByContainer}>
                        <Text style={styles.proposedByLabel}>Proposed by </Text>
                        <TouchableOpacity
                          style={styles.proposedByUser}
                          onPress={(e) => {
                            e.stopPropagation(); // Prevent triggering the parent Pressable
                            if (proposerId) {
                              setSelectedUserForProfile({
                                userId: proposerId,
                                userName: proposerName,
                                avatarUrl: proposerAvatar,
                              });
                            }
                          }}
                        >
                          {proposerAvatar ? (
                            <Image
                              source={{ uri: proposerAvatar }}
                              style={styles.proposerAvatar}
                            />
                          ) : (
                            <View style={styles.proposerAvatarPlaceholder}>
                              <Text style={styles.proposerAvatarInitial}>
                                {proposerName.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.proposedByUserName}>{proposerName}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Pressable>
                  
                  {/* Collapsed Rating Display */}
                  <View style={styles.ratingDisplayContainer}>
                    {userRating !== null ? (
                      <View style={styles.userRatingDisplay}>
                        <Text style={styles.userRatingLabel}>Your rating:</Text>
                        <Text style={styles.userRatingText}>{getRatingLabel(userRating)}</Text>
                        <TouchableOpacity
                          style={styles.changeRatingButton}
                          onPress={() => handleOpenRatingModal(proposal)}
                        >
                          <Text style={styles.changeRatingButtonText}>Change rating</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.rateButton}
                        onPress={() => handleOpenRatingModal(proposal)}
                      >
                        <Text style={styles.rateButtonText}>Weigh in on this game</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        
        {/* Super Collection Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginBottom: theme.spacing.sm }]}>
              Propose a game for {selectedDate?.date ? formatDate(selectedDate.date.toISOString()) : 'this event'}.
            </Text>
          
          {/* Beeple Recommendations */}
          {userId && Array.isArray(enrichedGames) && enrichedGames.length > 0 && collections[userId] && collections[userId].length > 0 && (
            <BeepleRecommendations 
              games={enrichedGames}
              userCollection={collections[userId] || []}
              onProposeGame={handleProposeGame}
              userProposals={Array.from(userProposals)}
              eventId={eventId}
            />
          )}
          
          {!Array.isArray(enrichedGames) || enrichedGames.length === 0 ? (
            <Text style={styles.emptyText}>No games found from confirmed attendees for this date.</Text>
          ) : (
            <>
                    {/* Everyone's Games - using shared GameCollectionView component */}
                    <GameCollectionView
                      games={gamesToDisplay}
                      onGamePress={handleOpenGameDetails}
                      showMatchScores={!!userId && Object.keys(matchScores).length > 0}
                      matchScores={matchScores}
                      showOwners={true}
                      ownersMap={ownersMap}
                      usePagination={true}
                      itemsPerPage={ITEMS_PER_PAGE}
                      defaultSortBy="category"
                      availableSorts={[
                        'rating',
                        'category',
                        'title',
                        ...(userId && Object.keys(matchScores).length > 0 ? ['matchScore'] : []),
                        'owner'
                      ]}
                      showSearch={true}
                      showSortOptions={true}
                      headerTitle="Everyone's Games"
                      uniqueOwnersForFilter={uniqueOwners}
                      selectedOwner={selectedOwner}
                      onOwnerFilterChange={setSelectedOwner}
                    />
            </>
          )}
        </View>
      </ScrollView>
      
      {/* Game Details Modal */}
      {showGameDetails && selectedGame && (
        <GameDetailsModal
          game={selectedGame}
          isOpen={showGameDetails}
          onClose={() => {
            setShowGameDetails(false);
            setSelectedGame(null);
            setSelectedProposalId(null);
          }}
          preloadedBggData={selectedGame._bggData}
          owners={selectedGame._owners || []}
          eventId={eventId}
          onProposeGame={handleProposeGame}
          userProposals={Array.from(userProposals)}
          userProposalLimit={userProposalLimit}
          proposalId={selectedProposalId}
          selectedDate={selectedDate}
          eventMembers={members}
          memberNames={memberNames}
        />
      )}

      {/* Rating Modal */}
      {showRatingModal && ratingModalGame && (
        <Modal
          isOpen={showRatingModal}
          onClose={handleCloseRatingModal}
          title={`Rate: ${ratingModalGame.gameName}`}
        >
          <View style={styles.ratingModalContent}>
            <Text style={styles.ratingModalInstructions}>
              How do you feel about playing this game?
            </Text>
            <View style={styles.ratingModalButtonsContainer}>
              {[
                { value: 3, label: '⭐⭐⭐', text: 'I really want to play this game' },
                { value: 2, label: '⭐⭐', text: 'I want to play this game' },
                { value: 1, label: '⭐', text: 'I am fine with playing this game' },
                { value: 0, label: '⚪', text: 'I am not sure about this game' },
                { value: -1, label: '😞', text: 'I would rather not play this game' },
              ].map(({ value, label, text }) => {
                const currentRating = ratingModalGame.ratings?.[userId] ?? null;
                const isActive = currentRating === value;
                
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.ratingModalButton,
                      isActive && styles.ratingModalButtonActive
                    ]}
                    onPress={() => handleRateGame(ratingModalGame.gameId, value)}
                  >
                    <View style={styles.ratingModalButtonContent}>
                      <Text style={[
                        styles.ratingModalButtonLabel,
                        isActive && styles.ratingModalButtonLabelActive
                      ]}>
                        {label}
                      </Text>
                      <Text style={[
                        styles.ratingModalButtonText,
                        isActive && styles.ratingModalButtonTextActive
                      ]}>
                        {text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {ratingModalGame.ratings?.[userId] !== null && ratingModalGame.ratings?.[userId] !== undefined && (
              <TouchableOpacity
                style={styles.clearRatingButton}
                onPress={() => handleRateGame(ratingModalGame.gameId, ratingModalGame.ratings[userId])}
              >
                <Text style={styles.clearRatingButtonText}>Clear rating</Text>
              </TouchableOpacity>
            )}
          </View>
        </Modal>
      )}

      {/* User Profile Modal */}
      {selectedUserForProfile && (
        <UserProfileModal
          isOpen={!!selectedUserForProfile}
          onClose={() => setSelectedUserForProfile(null)}
          userId={selectedUserForProfile.userId}
          userName={selectedUserForProfile.userName}
          avatarUrl={selectedUserForProfile.avatarUrl}
        />
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgColor,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceColor,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    ...(Platform.OS === 'web' ? { paddingTop: theme.spacing.xl } : {}),
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  backButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  headerSpacer: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing['2xl'],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  sectionCopy: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing['2xl'],
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.error,
    textAlign: 'center',
    marginTop: theme.spacing['2xl'],
  },
  eventDetailsCard: {
    ...commonStyles.card,
  },
  eventName: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  eventDetailRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
  },
  eventDetailLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    width: 120,
  },
  eventDetailValue: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  proposedGameItem: {
    ...commonStyles.card,
    marginBottom: theme.spacing.lg,
  },
  proposedGameHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  proposedGameThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  proposedGameThumbnailPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.woodMedium,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  proposedGameThumbnailText: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
  },
  proposedGameInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  proposedGameTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  proposedGameTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  proposedGameMatchScore: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.woodLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  matchScoreIconSmall: {
    fontSize: 16,
    marginRight: 4,
  },
  matchScoreTextSmall: {
    fontSize: 12,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  proposedGameSubtext: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  proposedByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  proposedByLabel: {
    fontSize: 12,
    color: '#666',
  },
  proposedByUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  proposerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  proposerAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proposerAvatarInitial: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  proposedByUserName: {
    fontSize: 12,
    color: '#4a90e2',
    fontWeight: '500',
  },
  proposerWarningContainer: {
    marginTop: 6,
    padding: 8,
    backgroundColor: '#fff3cd',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#ffc107',
  },
  proposerWarningText: {
    fontSize: 12,
    color: '#856404',
    fontStyle: 'italic',
  },
  ratingDisplayContainer: {
    marginTop: 12,
  },
  userRatingDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  userRatingLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  userRatingText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  changeRatingButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  changeRatingButtonText: {
    fontSize: 12,
    color: '#4a90e2',
    fontWeight: '500',
  },
  rateButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#4a90e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  ratingButtonsContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  ratingButton: {
    width: '100%',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  ratingButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  ratingButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ratingButtonLabel: {
    fontSize: 20,
    minWidth: 50,
  },
  ratingButtonLabelActive: {
    opacity: 1,
  },
  ratingButtonText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    textAlign: 'left',
  },
  ratingButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  ratingModalContent: {
    paddingVertical: 8,
  },
  ratingModalInstructions: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  ratingModalButtonsContainer: {
    flexDirection: 'column',
    gap: 12,
    marginBottom: 16,
  },
  ratingModalButton: {
    width: '100%',
    padding: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  ratingModalButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  ratingModalButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ratingModalButtonLabel: {
    fontSize: 24,
    minWidth: 60,
  },
  ratingModalButtonLabelActive: {
    opacity: 1,
  },
  ratingModalButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
    textAlign: 'left',
  },
  ratingModalButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  clearRatingButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  clearRatingButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  gamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
    marginBottom: 16,
  },
  gameCardWrapper: {
    width: '32%',
    marginBottom: theme.spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  gameActionsContainer: {
    width: '100%',
  },
  selectableGameCardWrapper: {
    width: '100%',
    marginBottom: -theme.spacing.md, // Counteract GameCard's marginBottom to connect button flush
    overflow: 'hidden', // Clip the negative margin cleanly
  },
  gameCardPressable: {
    width: '100%',
  },
  proposeGameButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 183, 156, 0.5)', // Subtle border matching card border for visual continuity
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  matchScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.woodLight,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 183, 156, 0.5)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201, 183, 156, 0.5)',
  },
  matchScoreIcon: {
    fontSize: 18,
    marginRight: 4,
  },
  matchScoreText: {
    fontSize: 12,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  proposeGameButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  proposedBadge: {
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 183, 156, 0.5)', // Subtle border matching card border for visual continuity
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  proposedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 16,
  },
  paginationButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#dc2626',
    borderRadius: 6,
  },
  paginationButtonDisabled: {
    backgroundColor: '#ccc',
  },
  paginationButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  paginationButtonTextDisabled: {
    color: '#999',
  },
  paginationText: {
    fontSize: 14,
    color: '#666',
  },
  everyonesGamesTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  sortingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  sortingLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginRight: theme.spacing.xs,
  },
  sortingButtons: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  sortButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.bgColor,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  sortButtonActive: {
    backgroundColor: theme.colors.meepleRed,
    borderColor: theme.colors.meepleRed,
  },
  sortButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  sortButtonTextActive: {
    color: '#fff',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  ownerFilterContainer: {
    marginBottom: theme.spacing.md,
  },
  ownerFilterLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: theme.spacing.sm,
  },
  ownerButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  ownerButtonWrapper: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  ownerButtonWrapperSelected: {
    // Additional styling for selected wrapper if needed
  },
  ownerButton: {
    position: 'relative',
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
    backgroundColor: theme.colors.bgColor,
  },
  ownerButtonSelected: {
    borderColor: theme.colors.meepleRed,
    borderWidth: 3,
  },
  ownerButtonAvatar: {
    width: '100%',
    height: '100%',
  },
  ownerButtonAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.woodMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ownerButtonAvatarInitial: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  ownerButtonCheckmark: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.meepleRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.bgColor,
  },
  ownerButtonCheckmarkText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: theme.typography.fontWeight.bold,
  },
  ownerButtonName: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    textAlign: 'center',
    maxWidth: 60,
  },
  ownerButtonNameSelected: {
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  clearOwnerFilterButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.bgColor,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    marginTop: theme.spacing.xs,
  },
  clearOwnerFilterButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  searchContainer: {
    marginBottom: theme.spacing.md,
  },
  searchInput: {
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: theme.colors.meepleRed,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    fontWeight: theme.typography.fontWeight.medium,
  },
  categoryButtonsContainer: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceColor,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    marginBottom: theme.spacing.md,
  },
  categoryButtonsScrollContent: {
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  categoryButton: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.woodLight,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    marginRight: theme.spacing.sm,
  },
  categoryButtonActive: {
    backgroundColor: theme.colors.meepleRed,
    borderColor: theme.colors.meepleRed,
  },
  categoryButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  categoryButtonTextActive: {
    color: '#fff',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  categorySection: {
    marginBottom: theme.spacing['2xl'],
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceColor,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.meepleRed,
    marginBottom: theme.spacing.md,
  },
  categoryTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  categorySortToggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    padding: 2,
    gap: 0,
  },
  categorySortToggleOption: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  categorySortToggleOptionActive: {
    backgroundColor: theme.colors.meepleRed,
  },
  categorySortToggleOptionText: {
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  categorySortToggleOptionTextActive: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  categoryGamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  emptyCollection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
});

export default BrowseAndProposeScreen;

