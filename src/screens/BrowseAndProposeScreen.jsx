import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Platform, View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Image, Pressable } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useCollections } from '../context/CollectionsContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import Button from '../components/common/Button';
import GameCard from '../components/GameCard';
import GameDetailsModal from '../components/GameDetailsModal';
import UserProfileModal from '../components/UserProfileModal';
import Modal from '../components/common/Modal';
import { formatDate, formatTime } from '../utils/helpers';
import { theme, commonStyles } from '../utils/theme';
import { getGameDetails } from '../utils/api';
import { findGameSimilarities } from '../utils/gameSimilarities';
import PersonalMatchSettings from '../components/PersonalMatchSettings';
import BeepleAvatar from '../components/BeepleAvatar';
import { getVibeScore, calculateVibeScoresForGame } from '../services/vibeScores';
import { calculateVibeScore } from '../utils/vibeScore';

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
    console.log('[BrowseAndProposeScreen] Screen mounted/updated:', {
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
  const [currentPage, setCurrentPage] = useState(1);
  const [memberNames, setMemberNames] = useState({});
  const [memberAvatars, setMemberAvatars] = useState({});
  const [ratingModalGame, setRatingModalGame] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [gamesWithBggData, setGamesWithBggData] = useState({}); // { gameId: bggData }
  const [personalMatchGame, setPersonalMatchGame] = useState(null);
  const [showPersonalMatchModal, setShowPersonalMatchModal] = useState(false);
  const [personalMatchText, setPersonalMatchText] = useState(null);
  const [showPersonalMatchSettings, setShowPersonalMatchSettings] = useState(false);
  const [vibeScores, setVibeScores] = useState({}); // { gameId: score }
  
  // Get event dates
  const eventDates = useMemo(() => {
    console.log('[BrowseAndProposeScreen] Computing eventDates:', {
      hasEvent: !!event,
      eventId: event?.id,
      hasEventDates: !!event?.eventDates,
      eventDatesType: Array.isArray(event?.eventDates) ? 'array' : typeof event?.eventDates,
      eventDatesLength: Array.isArray(event?.eventDates) ? event.eventDates.length : 'N/A'
    });
    
    if (!event) {
      console.log('[BrowseAndProposeScreen] No event, returning empty eventDates');
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
        console.log(`[BrowseAndProposeScreen] Event date ${index}:`, {
          rawDate: ed.date,
          parsedDate: result.date,
          dateKey: result.date ? getDateKey(result.date) : null,
          isValid: result.date !== null
        });
        return result;
      }).filter(ed => ed.date !== null);
      
      console.log('[BrowseAndProposeScreen] Filtered eventDates:', {
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
      console.log('[BrowseAndProposeScreen] Using scheduledFor (legacy format):', event.scheduledFor);
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
        console.log('[BrowseAndProposeScreen] Created eventDates from scheduledFor:', {
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
    
    console.log('[BrowseAndProposeScreen] Returning empty eventDates');
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
    console.log('[BrowseAndProposeScreen] Selected date info:', {
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
    console.log('[BrowseAndProposeScreen] Calculating confirmedAttendees:', {
      dateIndex,
      hasSelectedDate: !!selectedDate,
      selectedDateValue: selectedDate?.date,
      membersCount: members.length,
      memberIds: members.map(m => m.userId),
      memberRSVPsKeys: Object.keys(memberRSVPs),
      userId
    });
    
    if (dateIndex === null || !selectedDate) {
      console.log('[BrowseAndProposeScreen] No dateIndex or selectedDate, returning empty');
      return [];
    }
    
    const dateKey = getDateKey(selectedDate.date);
    console.log('[BrowseAndProposeScreen] Using dateKey:', dateKey, 'for date:', selectedDate.date);
    
    const confirmed = members.filter(member => {
      const memberRsvps = memberRSVPs[member.userId] || {};
      console.log(`[BrowseAndProposeScreen] Checking member ${member.userId}:`, {
        memberRsvpsType: typeof memberRsvps,
        memberRsvps,
        dateKey
      });
      
      if (typeof memberRsvps === 'string') {
        const result = !selectedDate.date ? memberRsvps === 'going' : false;
        console.log(`[BrowseAndProposeScreen] Member ${member.userId} (legacy format): ${result}`);
        return result;
      }
      const status = memberRsvps[dateKey];
      const result = status === 'going';
      console.log(`[BrowseAndProposeScreen] Member ${member.userId} status for ${dateKey}: ${status}, confirmed: ${result}`);
      return result;
    });
    
    console.log('[BrowseAndProposeScreen] After filtering, confirmed count:', confirmed.length, 'userIds:', confirmed.map(c => c.userId));
    
    // Always include the logged-in user if they're a member and have confirmed for this date
    const isMember = members.some(m => m.userId === userId);
    console.log('[BrowseAndProposeScreen] Is logged-in user a member?', isMember, 'userId:', userId);
    
    if (isMember && userId) {
      const userIsInList = confirmed.some(m => m.userId === userId);
      console.log('[BrowseAndProposeScreen] Is user already in confirmed list?', userIsInList);
      
      if (!userIsInList) {
        const userRSVPs = memberRSVPs[userId] || {};
        console.log('[BrowseAndProposeScreen] User RSVPs:', {
          userRSVPs,
          userRSVPsType: typeof userRSVPs,
          dateKey
        });
        
        let userHasConfirmed = false;
        if (typeof userRSVPs === 'string') {
          userHasConfirmed = !selectedDate.date ? userRSVPs === 'going' : false;
          console.log('[BrowseAndProposeScreen] User has confirmed (legacy format)?', userHasConfirmed);
        } else {
          userHasConfirmed = userRSVPs[dateKey] === 'going';
          console.log('[BrowseAndProposeScreen] User has confirmed for', dateKey, '?', userHasConfirmed, 'status:', userRSVPs[dateKey]);
        }
        
        if (userHasConfirmed) {
          const userMember = members.find(m => m.userId === userId);
          console.log('[BrowseAndProposeScreen] Adding user to confirmed list:', !!userMember);
          if (userMember) {
            confirmed.push(userMember);
          }
        }
      }
    }
    
    console.log('[BrowseAndProposeScreen] Final confirmedAttendees count:', confirmed.length, 'userIds:', confirmed.map(c => c.userId));
    return confirmed;
  }, [members, memberRSVPs, dateIndex, selectedDate, userId]);
  
  // Aggregate games from confirmed attendees
  const aggregatedGames = useMemo(() => {
    if (!selectedDate) {
      console.log('[BrowseAndProposeScreen] No selectedDate, returning empty games');
      return [];
    }
    
    if (confirmedAttendees.length === 0) {
      console.log('[BrowseAndProposeScreen] No confirmed attendees, returning empty games');
      return [];
    }
    
    // Safety checks
    const safeCollections = collections || {};
    const safeMemberNames = memberNames || {};
    
    console.log('[BrowseAndProposeScreen] Aggregating games:', {
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
      
      console.log(`[BrowseAndProposeScreen] Processing attendee ${attendeeId}:`, {
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
    
    console.log('[BrowseAndProposeScreen] Aggregated games result:', {
      totalGames: result.length,
      gameIds: result.map(g => g.bggId || g.id).slice(0, 5)
    });
    
    return result;
  }, [confirmedAttendees, collections, memberNames, selectedDate]);

  // Load BGG data for aggregated games to get thumbnails and images
  useEffect(() => {
    if (!Array.isArray(aggregatedGames) || aggregatedGames.length === 0) {
      setGamesWithBggData({});
      return;
    }

    const loadBggData = async () => {
      const bggDataMap = {};
      
      // Load BGG data for games that don't already have it
      const gamesToLoad = aggregatedGames.filter(game => {
        const gameId = game.bggId || game.id;
        return gameId && !game._bggData && !gamesWithBggData[gameId];
      });

      if (gamesToLoad.length === 0) return;

      console.log('[BrowseAndProposeScreen] Loading BGG data for', gamesToLoad.length, 'games');

      // Load BGG data in parallel
      const loadPromises = gamesToLoad.map(async (game) => {
        const gameId = game.bggId || game.id;
        if (!gameId) return null;

        try {
          const bggData = await getGameDetails(gameId);
          if (bggData) {
            return { gameId, bggData };
          }
        } catch (error) {
          console.error(`[BrowseAndProposeScreen] Error loading BGG data for game ${gameId}:`, error);
        }
        return null;
      });

      const results = await Promise.all(loadPromises);
      results.forEach(result => {
        if (result) {
          bggDataMap[result.gameId] = result.bggData;
        }
      });

      if (Object.keys(bggDataMap).length > 0) {
        setGamesWithBggData(prev => ({ ...prev, ...bggDataMap }));
      }
    };

    loadBggData();
  }, [aggregatedGames]);

  // Enrich aggregated games with BGG data
  const enrichedGames = useMemo(() => {
    if (!Array.isArray(aggregatedGames) || aggregatedGames.length === 0) {
      return [];
    }

    return aggregatedGames.map(game => {
      const gameId = game.bggId || game.id;
      const bggData = game._bggData || (gameId ? gamesWithBggData[gameId] : null);
      
      if (bggData) {
        // Use thumbnail/image from BGG data if game doesn't have one stored
        const enrichedGame = {
          ...game,
          _bggData: bggData,
        };
        
        // Backfill thumbnail if missing
        if (bggData.thumbnail && !game.thumbnail && !game.bggThumbnail) {
          enrichedGame.thumbnail = bggData.thumbnail;
          enrichedGame.bggThumbnail = bggData.thumbnail;
        }
        
        // Backfill image if missing
        if (bggData.image && !game.image) {
          enrichedGame.image = bggData.image;
        }
        
        return enrichedGame;
      }
      
      return game;
    });
  }, [aggregatedGames, gamesWithBggData]);

  // Load vibe scores for games (both enriched games and proposed games)
  useEffect(() => {
    if (!eventId || !userId) {
      return;
    }

    const loadVibeScores = async () => {
      const scores = {};
      const allGamesToScore = [];
      
      // Add enriched games
      if (Array.isArray(enrichedGames) && enrichedGames.length > 0) {
        enrichedGames.forEach(game => {
          const gameId = game.bggId || game.id;
          if (gameId) {
            allGamesToScore.push({ gameId, game });
          }
        });
      }
      
      // Add proposed games
      if (Array.isArray(proposedGames) && proposedGames.length > 0) {
        proposedGames.forEach(proposal => {
          const gameId = proposal.gameId;
          if (gameId && !allGamesToScore.find(g => g.gameId === gameId)) {
            // Create a minimal game object for proposed games
            allGamesToScore.push({
              gameId,
              game: {
                bggId: gameId,
                id: gameId,
                title: proposal.gameName,
                image: proposal.gameImage,
              }
            });
          }
        });
      }
      
      if (allGamesToScore.length === 0) {
        return;
      }
      
      const userCollection = collections[userId] || [];
      if (userCollection.length === 0) {
        return;
      }
      
      const customWeights = user?.personalMatchWeights || null;
      
      for (const { gameId, game } of allGamesToScore) {
        try {
          // Try to get stored score first
          const storedScore = await getVibeScore(eventId, gameId, userId);
          if (storedScore !== null) {
            scores[gameId] = storedScore;
          } else {
            // Calculate on-demand if not stored
            // For proposed games, we might need to fetch game data
            let gameWithBggData = game._bggData ? game : { ...game, _bggData: gamesWithBggData[gameId] };
            
            // If still no BGG data, try to fetch it
            if (!gameWithBggData._bggData && gameId) {
              try {
                const bggData = await getGameDetails(gameId);
                if (bggData) {
                  gameWithBggData = { ...gameWithBggData, _bggData: bggData };
                }
              } catch (err) {
                // Continue without BGG data
              }
            }
            
            const score = calculateVibeScore(gameWithBggData, userCollection, customWeights);
            if (score !== null) {
              scores[gameId] = score;
              // Store it for future use (non-blocking)
              calculateVibeScoresForGame(eventId, gameId, gameWithBggData, collections, { [userId]: customWeights }).catch(err => {
                console.warn('[BrowseAndPropose] Error storing vibe score:', err);
              });
            }
          }
        } catch (error) {
          console.warn(`[BrowseAndPropose] Error loading vibe score for game ${gameId}:`, error);
        }
      }
      
      setVibeScores(scores);
    };

    loadVibeScores();
  }, [eventId, userId, enrichedGames, proposedGames, collections, user?.personalMatchWeights, gamesWithBggData]);

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
  
  // Paginated games (using enriched games with BGG data)
  const paginatedGames = useMemo(() => {
    if (!Array.isArray(enrichedGames) || enrichedGames.length === 0) return [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return enrichedGames.slice(startIndex, endIndex);
  }, [enrichedGames, currentPage]);
  
  const totalPages = Array.isArray(enrichedGames) ? Math.ceil(enrichedGames.length / ITEMS_PER_PAGE) : 0;
  
  // Load event data
  useEffect(() => {
    if (!eventId) return;
    
    const loadEvent = async () => {
      try {
        setLoading(true);
        console.log('[BrowseAndProposeScreen] Loading event:', eventId);
        const eventData = await getEventById(eventId);
        console.log('[BrowseAndProposeScreen] Event loaded:', {
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
    
    console.log('[BrowseAndProposeScreen] Setting up members listener for event:', event.id);
    console.log('[BrowseAndProposeScreen] Current user and event info:', {
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
          console.log('[BrowseAndProposeScreen] Member document does not exist, creating it...', {
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
            
            console.log('[BrowseAndProposeScreen] Member document created successfully');
          } else {
            console.warn('[BrowseAndProposeScreen] User is not a member, cannot create member document');
          }
        } else {
          console.log('[BrowseAndProposeScreen] Member document exists:', {
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
              console.log('[BrowseAndProposeScreen] Group document read successful:', {
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
        console.log('[BrowseAndProposeScreen] Setting up members listener after ensuring member document');
        unsubscribeMembers = db.collection('gamingGroups').doc(event.id)
          .collection('members')
          .onSnapshot(async (snapshot) => {
        console.log('[BrowseAndProposeScreen] Members snapshot received:', {
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
          console.log(`[BrowseAndProposeScreen] Processing member document ${userId}:`, {
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
            console.log(`[BrowseAndProposeScreen] Member ${userId} RSVPs (new format):`, rsvps[userId]);
          } else if (data.rsvpStatus) {
            // Legacy format: single rsvpStatus field
            rsvps[userId] = { default: data.rsvpStatus };
            console.log(`[BrowseAndProposeScreen] Member ${userId} RSVP (legacy format):`, rsvps[userId]);
          } else {
            rsvps[userId] = {};
            console.log(`[BrowseAndProposeScreen] Member ${userId} has no RSVP data`);
          }
          
          // Extract name and avatar from member document
          if (data.userName) {
            names[userId] = data.userName;
          }
          if (data.userAvatarUrl) {
            avatars[userId] = data.userAvatarUrl;
          }
        });
        
        console.log('[BrowseAndProposeScreen] Members loaded:', {
          count: membersList.length,
          memberIds: membersList.map(m => m.userId),
          rsvpsCount: Object.keys(rsvps).length,
          rsvpsKeys: Object.keys(rsvps),
          rsvpsData: rsvps,
          namesCount: Object.keys(names).length,
          avatarsCount: Object.keys(avatars).length
        });
        
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
        
        setMemberNames(names);
        setMemberAvatars(avatars);
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
            // Set empty arrays on error to prevent crashes
            setMembers([]);
            setMemberRSVPs({});
            setMemberNames({});
            setMemberAvatars({});
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
  
  // Load proposed games (nominations)
  useEffect(() => {
    if (!event?.id || !db) return;
    
    const unsubscribe = db.collection('gamingGroups').doc(event.id)
      .collection('nominations')
      .onSnapshot((snapshot) => {
        const proposalsMap = new Map();
        const userProposalsSet = new Set();
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          const gameId = data.gameId;
          
          if (!gameId) return;
          
          // Check if this is a rating document (has userId field) or a proposal document
          if (data.userId && data.userId !== data.nominatedBy) {
            // This is a rating document
            if (!proposalsMap.has(gameId)) {
              proposalsMap.set(gameId, {
                gameId,
                gameName: data.gameName || 'Unknown Game',
                gameImage: data.gameImage || null,
                proposedBy: data.nominatedBy || data.userId,
                ratings: {},
              });
            }
            const proposal = proposalsMap.get(gameId);
            proposal.ratings[data.userId] = data.rating;
          } else {
            // This is a proposal document
            if (!proposalsMap.has(gameId)) {
              proposalsMap.set(gameId, {
                gameId,
                gameName: data.gameName || 'Unknown Game',
                gameImage: data.gameImage || null,
                proposedBy: data.nominatedBy || data.userId || userId,
                ratings: {},
              });
            }
            
            // Check if this proposal is by the current user
            if (data.nominatedBy === userId || data.userId === userId) {
              userProposalsSet.add(gameId);
            }
          }
        });
        
        // Also load ratings separately
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.userId && data.userId !== data.nominatedBy && proposalsMap.has(data.gameId)) {
            const proposal = proposalsMap.get(data.gameId);
            proposal.ratings[data.userId] = data.rating;
          }
        });
        
        setProposedGames(Array.from(proposalsMap.values()));
        setUserProposals(userProposalsSet);
      });
    
    return unsubscribe;
  }, [event?.id, userId]);
  
  const handleOpenGameDetails = useCallback((game) => {
    setSelectedGame(game);
    setShowGameDetails(true);
  }, []);
  
  const handleProposeGame = async (game) => {
    console.log('[BrowseAndPropose] Propose game button clicked');
    console.log('[BrowseAndPropose] Initial checks:', {
      hasEvent: !!event,
      eventId: event?.id,
      hasDb: !!db,
      hasUserId: !!userId,
      userId,
      userProposalsCount: userProposals.size,
      gameId: game.bggId || game.id,
    });
    
    if (!event?.id || !db || !userId) {
      console.error('[BrowseAndPropose] Missing required data:', {
        eventId: event?.id,
        hasDb: !!db,
        userId,
      });
      return;
    }
    
    const gameId = game.bggId || game.id;
    
    if (userProposals.size >= 5) {
      Alert.alert('Limit Reached', 'You can only propose up to 5 games. Remove a proposal first to propose another game.');
      return;
    }
    
    try {
      // Check if user is a member - check member document first, then group document
      let hasMemberDoc = false;
      try {
        const memberDoc = await db.collection('gamingGroups').doc(event.id)
          .collection('members').doc(userId).get();
        hasMemberDoc = memberDoc.exists;
        console.log('[BrowseAndPropose] Member document check:', {
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
      
      console.log('[BrowseAndPropose] Membership check:', {
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
          
          console.log('[BrowseAndPropose] Created missing member document');
        } catch (memberDocError) {
          console.warn('[BrowseAndPropose] Error creating member document:', memberDocError);
          // Continue anyway - the user is still a member, just might have permission issues
        }
      }
      
      const proposalDoc = {
        gameId,
        gameName: game.title || 'Unknown Game',
        gameImage: game.image || game.thumbnail || null,
        nominatedBy: userId,
        createdAt: firebase.firestore.Timestamp.now(),
      };
      
      console.log('[BrowseAndPropose] Attempting to save proposal:', {
        eventId: event.id,
        gameId,
        proposalDoc,
        documentPath: `gamingGroups/${event.id}/nominations/${gameId}`,
      });
      
      // Ensure nominatedBy is explicitly set for Firestore rule validation
      const finalProposalDoc = {
        ...proposalDoc,
        nominatedBy: userId, // Explicitly ensure this field is set
      };
      
      await db.collection('gamingGroups').doc(event.id)
        .collection('nominations')
        .doc(gameId)
        .set(finalProposalDoc, { merge: true });
      
      console.log('[BrowseAndPropose] Proposal saved successfully');
      
      setUserProposals(prev => new Set([...prev, gameId]));
      setProposedGames(prev => {
        const exists = prev.some(n => n.gameId === gameId);
        if (exists) return prev;
        return [...prev, {
          gameId,
          gameName: proposalDoc.gameName,
          gameImage: proposalDoc.gameImage,
          proposedBy: userId,
          ratings: {},
        }];
      });
      
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
    setRatingModalGame(proposal);
    setShowRatingModal(true);
  };

  const handleCloseRatingModal = () => {
    setShowRatingModal(false);
    setRatingModalGame(null);
  };

  const handleOpenPersonalMatch = (game) => {
    if (!userId) {
      Alert.alert('Sign In Required', 'Please sign in to see Beeple\'s recommendations.');
      return;
    }
    
    const userCollection = collections[userId] || [];
    if (userCollection.length === 0) {
      Alert.alert('No Collection', 'Add games to your collection to see Beeple\'s recommendations.');
      return;
    }
    
    // Get BGG data for the game if not already loaded
    const gameWithBggData = game._bggData ? game : { ...game, _bggData: gamesWithBggData[game.bggId || game.id] };
    
    // Get user's custom weights if available
    const customWeights = user?.personalMatchWeights || null;
    
    const recommendation = findGameSimilarities(gameWithBggData, userCollection, customWeights);
    
    setPersonalMatchGame(game);
    setPersonalMatchText(recommendation);
    setShowPersonalMatchModal(true);
  };

  const handleClosePersonalMatchModal = () => {
    setShowPersonalMatchModal(false);
    setPersonalMatchGame(null);
    setPersonalMatchText(null);
  };

  const handleRateGame = async (gameId, newRating) => {
    if (!event?.id || !db || !userId) return;
    
    const proposal = proposedGames.find(p => p.gameId === gameId);
    if (!proposal) return;
    
    const userRating = proposal.ratings?.[userId] ?? null;
    
    // If clicking the same rating, clear it
    const ratingToSave = userRating === newRating ? null : newRating;
    
    try {
      if (ratingToSave === null) {
        // Clear the rating
        await db.collection('gamingGroups').doc(event.id)
          .collection('nominations')
          .doc(`${gameId}_${userId}`)
          .delete();
        
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
          updatedAt: firebase.firestore.Timestamp.now(),
        };
        
        await db.collection('gamingGroups').doc(event.id)
          .collection('nominations')
          .doc(`${gameId}_${userId}`)
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
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Event Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gaming Group Details</Text>
          <View style={styles.eventDetailsCard}>
            <Text style={styles.eventName}>{event.name}</Text>
            <View style={styles.eventDetailRow}>
              <Text style={styles.eventDetailLabel}>Date:</Text>
              <Text style={styles.eventDetailValue}>
                {selectedDate.date ? formatDate(selectedDate.date.toISOString()) : 'TBD'}
              </Text>
            </View>
            {selectedDate.startTime && (
              <View style={styles.eventDetailRow}>
                <Text style={styles.eventDetailLabel}>Time:</Text>
                <Text style={styles.eventDetailValue}>
                  {formatTime(selectedDate.startTime.toISOString())}
                  {selectedDate.endTime && ` - ${formatTime(selectedDate.endTime.toISOString())}`}
                </Text>
              </View>
            )}
            {selectedDate.location && (
              <View style={styles.eventDetailRow}>
                <Text style={styles.eventDetailLabel}>Location:</Text>
                <Text style={styles.eventDetailValue}>{selectedDate.location}</Text>
              </View>
            )}
            <View style={styles.eventDetailRow}>
              <Text style={styles.eventDetailLabel}>Confirmed Attendees:</Text>
              <Text style={styles.eventDetailValue}>
                {(() => {
                  const count = Array.isArray(confirmedAttendees) ? confirmedAttendees.length : 0;
                  console.log('[BrowseAndProposeScreen] Rendering confirmed attendees count:', count, 'confirmedAttendees:', confirmedAttendees);
                  return count;
                })()}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Proposed Games Section */}
        {proposedGames.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Proposed Games</Text>
            <Text style={styles.sectionCopy}>
              Rate each game to help decide what to play.
            </Text>
            {proposedGames.map((proposal) => {
              const gameId = proposal.gameId;
              const userRating = proposal.ratings?.[userId] ?? null;
              const proposerId = proposal.proposedBy;
              const proposerName = memberNames[proposerId] || proposerId;
              const proposerAvatar = memberAvatars[proposerId] || null;
              const proposalVibeScore = vibeScores[gameId];
              
              return (
                <View key={gameId} style={styles.proposedGameItem}>
                  <View style={styles.proposedGameHeader}>
                    {proposal.gameImage ? (
                      <Image 
                        source={{ uri: proposal.gameImage }} 
                        style={styles.proposedGameThumbnail}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.proposedGameThumbnailPlaceholder}>
                        <Text style={styles.proposedGameThumbnailText}>
                          {(proposal.gameName || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.proposedGameInfo}>
                      <View style={styles.proposedGameTitleRow}>
                        <Text style={styles.proposedGameTitle}>{proposal.gameName}</Text>
                        {userId && proposalVibeScore !== undefined && proposalVibeScore !== null && (
                          <View style={styles.proposedGameVibeScore}>
                            <Text style={styles.vibeScoreIconSmall}>📊</Text>
                            <Text style={styles.vibeScoreTextSmall}>{proposalVibeScore}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.proposedByContainer}>
                        <Text style={styles.proposedByLabel}>Proposed by </Text>
                        <TouchableOpacity
                          style={styles.proposedByUser}
                          onPress={() => {
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
                  </View>
                  
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
          <Text style={styles.sectionTitle}>Propose a Game</Text>
          <Text style={styles.sectionCopy}>
            {Array.isArray(enrichedGames) ? enrichedGames.length : 0} {Array.isArray(enrichedGames) && enrichedGames.length === 1 ? 'game' : 'games'} from {Array.isArray(confirmedAttendees) ? confirmedAttendees.length : 0} {Array.isArray(confirmedAttendees) && confirmedAttendees.length === 1 ? 'attendee' : 'attendees'}
          </Text>
          <Text style={styles.sectionCopy}>
            Tap "Beeple Recommends" on any game to see personalized recommendations based on your collection.
          </Text>
          
          {!Array.isArray(enrichedGames) || enrichedGames.length === 0 ? (
            <Text style={styles.emptyText}>No games found from confirmed attendees for this date.</Text>
          ) : (
            <>
              <View style={styles.gamesGrid}>
                {Array.isArray(paginatedGames) ? paginatedGames.map((game, idx) => {
                  const gameId = game.bggId || game.id;
                  const isProposedByUser = userProposals.has(gameId);
                  const isProposedByAnyone = proposedGames.some(n => n.gameId === gameId);
                  const canPropose = userProposals.size < 5 || isProposedByUser;
                  const owners = game._owners || [];
                  
                  const vibeScore = vibeScores[gameId];
                  
                  return (
                    <View key={gameId || `game-${idx}`} style={styles.gameCardWrapper}>
                      <View style={styles.selectableGameCardWrapper}>
                        <Pressable
                          onPress={() => handleOpenGameDetails(game)}
                          style={styles.gameCardPressable}
                          activeOpacity={0.7}
                        >
                          <GameCard 
                            game={game} 
                            preloadedBggData={game._bggData}
                            disableModal={true}
                            inGrid={true}
                          />
                        </Pressable>
                      </View>
                      {userId && vibeScore !== undefined && vibeScore !== null && (
                        <View style={styles.vibeScoreBadge}>
                          <Text style={styles.vibeScoreIcon}>📊</Text>
                          <Text style={styles.vibeScoreText}>{vibeScore}</Text>
                        </View>
                      )}
                      <View style={styles.gameActionsContainer}>
                        {!isProposedByUser && canPropose && (
                          <TouchableOpacity
                            style={styles.proposeGameButton}
                            onPress={() => handleProposeGame(game)}
                          >
                            <Text style={styles.proposeGameButtonText}>Propose</Text>
                          </TouchableOpacity>
                        )}
                        {isProposedByUser && (
                          <View style={styles.proposedBadge}>
                            <Text style={styles.proposedBadgeText}>Proposed</Text>
                          </View>
                        )}
                        {userId && (
                          <TouchableOpacity
                            style={styles.personalMatchButton}
                            onPress={() => handleOpenPersonalMatch(game)}
                          >
                            <Text style={styles.personalMatchButtonText}>Beeple Recommends</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }) : null}
              </View>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <View style={styles.paginationContainer}>
                  <TouchableOpacity
                    style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
                    onPress={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <Text style={[styles.paginationButtonText, currentPage === 1 && styles.paginationButtonTextDisabled]}>
                      Previous
                    </Text>
                  </TouchableOpacity>
                  
                  <Text style={styles.paginationText}>
                    Page {currentPage} of {totalPages}
                  </Text>
                  
                  <TouchableOpacity
                    style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
                    onPress={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <Text style={[styles.paginationButtonText, currentPage === totalPages && styles.paginationButtonTextDisabled]}>
                      Next
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
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
          }}
          owners={selectedGame._owners || []}
          eventId={eventId}
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

      {/* Beeple Recommends Modal */}
      {showPersonalMatchModal && personalMatchGame && (
        <Modal
          isOpen={showPersonalMatchModal}
          onClose={handleClosePersonalMatchModal}
          title={`Beeple Recommends: ${personalMatchGame.title || personalMatchGame.name || 'Game'}`}
        >
          <View style={styles.personalMatchModalContent}>
            <View style={styles.beepleHeader}>
              <BeepleAvatar size={50} />
              <View style={styles.beepleHeaderText}>
                <Text style={styles.beepleName}>Beeple</Text>
                <Text style={styles.beepleSubtitle}>Your Game Recommendation Bot</Text>
              </View>
            </View>
            {personalMatchText ? (
              <Text style={styles.personalMatchText}>{personalMatchText}</Text>
            ) : (
              <Text style={styles.personalMatchText}>
                Beep-Boop-Bop, I'm Beeple! I couldn't find strong similarities between this game and your collection. 
                Try adding more games to your collection so I can give you better recommendations!
              </Text>
            )}
            <TouchableOpacity
              style={styles.customizeWeightsLink}
              onPress={() => {
                setShowPersonalMatchModal(false);
                setShowPersonalMatchSettings(true);
              }}
            >
              <Text style={styles.customizeWeightsLinkText}>
                ⚙️ Customize Beeple's recommendation weights
              </Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* Beeple Recommends Settings Modal */}
      {showPersonalMatchSettings && (
        <Modal
          isOpen={showPersonalMatchSettings}
          onClose={() => {
            setShowPersonalMatchSettings(false);
            // Optionally reopen the personal match modal after closing settings
            // setShowPersonalMatchModal(true);
          }}
          title="Beeple's Recommendation Weights"
        >
          <PersonalMatchSettings
            onSave={() => {
              setShowPersonalMatchSettings(false);
              // Refresh the personal match if we had one open
              if (personalMatchGame) {
                const gameWithBggData = personalMatchGame._bggData 
                  ? personalMatchGame 
                  : { ...personalMatchGame, _bggData: gamesWithBggData[personalMatchGame.bggId || personalMatchGame.id] };
                const customWeights = user?.personalMatchWeights || null;
                const recommendation = findGameSimilarities(gameWithBggData, collections[userId] || [], customWeights);
                setPersonalMatchText(recommendation);
                setShowPersonalMatchModal(true);
              }
            }}
          />
        </Modal>
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
  proposedGameVibeScore: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.woodLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  vibeScoreIconSmall: {
    fontSize: 12,
    marginRight: 4,
  },
  vibeScoreTextSmall: {
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
  personalMatchButton: {
    backgroundColor: '#FF8C00',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 183, 156, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  personalMatchButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  personalMatchModalContent: {
    paddingVertical: theme.spacing.md,
  },
  beepleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
  },
  beepleHeaderText: {
    marginLeft: theme.spacing.md,
    flex: 1,
  },
  beepleName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  beepleSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  personalMatchText: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: 24,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  customizeWeightsLink: {
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.woodLight,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    alignItems: 'center',
  },
  customizeWeightsLinkText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.medium,
  },
  vibeScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.woodLight,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 183, 156, 0.5)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201, 183, 156, 0.5)',
  },
  vibeScoreIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  vibeScoreText: {
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
});

export default BrowseAndProposeScreen;

