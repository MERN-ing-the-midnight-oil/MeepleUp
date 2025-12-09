import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, KeyboardAvoidingView } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Share,
  Image,
  FlatList,
  Pressable,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useCollections } from '../context/CollectionsContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import CalendarDatePicker from '../components/common/CalendarDatePicker';
import GameCard from '../components/GameCard';
import GameDetailsModal from '../components/GameDetailsModal';
import { getGameById } from '../services/gameDatabase';
import { generateIcalEvent, downloadIcalFile, generateGoogleCalendarUrl } from '../utils/icalExport';
import { formatDate, formatTime } from '../utils/helpers';
import { getStarRating } from '../utils/gameBadges';
import { Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { notifyDiscussionActivity } from '../utils/notifications';
import RSVPManagementScreen from '../components/RSVPManagementScreen';
import UserProfileModal from '../components/UserProfileModal';
import { handleLeaveEvent as handleLeaveEventUtil } from '../components/LeaveEventButton';
import PrivateMessaging from '../components/PrivateMessaging';

// All game categories in order
const ALL_CATEGORIES = ['Strategy', 'Family', 'Party', 'War', 'Thematic', 'Abstract', 'Children', 'CCG', 'Other'];

// Platform-specific navigation hooks
let useNavigationHook;
let useRouteHook;
let useParamsHook;

if (Platform.OS === 'web') {
  try {
    const { useNavigate, useParams } = require('react-router-dom');
    useNavigationHook = () => ({ goBack: () => window.history.back() });
    useRouteHook = () => ({ params: {} });
    useParamsHook = useParams;
  } catch (e) {
    useNavigationHook = () => ({ goBack: () => {} });
    useRouteHook = () => ({ params: {} });
    useParamsHook = () => ({ eventId: null });
  }
} else {
  const { useNavigation, useRoute } = require('@react-navigation/native');
  useNavigationHook = useNavigation;
  useRouteHook = useRoute;
  useParamsHook = () => null;
}

const TABS = {
  EVENT: 'event',
  GAMES: 'games',
  DISCUSSION: 'discussion',
};

// Helper function to safely parse date values (handles ISO strings, Firestore Timestamps, Date objects, etc.)
const safeParseDate = (dateValue) => {
  if (!dateValue) return null;
  
  // If it's already a Date object and valid
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }
  
  // If it's a Firestore Timestamp
  if (dateValue && typeof dateValue.toDate === 'function') {
    try {
      const date = dateValue.toDate();
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      return null;
    }
  }
  
  // Try to parse as ISO string or other date string
  try {
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date;
  } catch (e) {
    return null;
  }
};

const EventHub = () => {
  const navigation = useNavigationHook();
  const route = useRouteHook();
  const params = useParamsHook();
  const { eventId } = params?.eventId ? params : (route?.params || {});

  const {
    getEventById,
    getMembershipStatus,
    membershipStatus,
    regenerateJoinCode,
    updateContactRequest,
    contactStatus,
    leaveEvent,
    archiveEvent,
    updateMemberRSVP,
    updateEventSchedule,
    updateEvent,
  } = useEvents();
  const { user } = useAuth();
  const { getUserCollection, getEventCollection, syncGamesForUsers, collections } = useCollections();

  const [activeTab, setActiveTab] = useState(TABS.EVENT);
  const [regenerateBusy, setRegenerateBusy] = useState(false);
  const [showEditSchedule, setShowEditSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    selectedDates: [], // Array of { date: Date, startTime: Date, endTime: Date, location: string, address: string, note: string }
    usualStartTime: new Date(new Date().setHours(18, 0, 0, 0)), // Default 6 PM
    usualEndTime: new Date(new Date().setHours(22, 0, 0, 0)), // Default 10 PM
    location: '', // Default location for all dates
    address: '', // Default address for all dates
  });
  const [editingDateIndex, setEditingDateIndex] = useState(null);
  const [showTimePicker, setShowTimePicker] = useState({ type: null, dateIndex: null }); // { type: 'start' | 'end' | 'usualStart' | 'usualEnd', dateIndex: number }
  const [selectedDateDetail, setSelectedDateDetail] = useState(null); // { date, startTime, endTime, location, address, note, index }
  const [highlightedDateIndex, setHighlightedDateIndex] = useState(null); // Index of date to highlight
  const scheduleScrollRef = useRef(null);
  const dateEntryPositions = useRef({}); // Map of index to Y position
  const scrollPositionRef = useRef(0); // Track scroll position to prevent jumps
  const editScheduleScrollRef = useRef(null); // Ref for Edit Schedule modal ScrollView
  const editScheduleDatePositions = useRef({}); // Map of index to Y position in Edit Schedule modal
  const [memberNames, setMemberNames] = useState({});
  const [memberRSVPs, setMemberRSVPs] = useState({}); // { [userId]: { [dateKey]: status } }
  const [memberAvatars, setMemberAvatars] = useState({});
  const [pinnedNotes, setPinnedNotes] = useState('');
  const [showEditPinnedNotes, setShowEditPinnedNotes] = useState(false);
  const [discussionMessages, setDiscussionMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [commentsByPost, setCommentsByPost] = useState({}); // { postId: [comments] }
  const [replyingTo, setReplyingTo] = useState(null); // { type: 'post' | 'comment', id: string, postId: string }
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState(null); // { type: 'post' | 'comment', id: string, postId: string, content: string }
  const [editText, setEditText] = useState('');
  const [showPrivateMessaging, setShowPrivateMessaging] = useState(false);
  // GamesTab state
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedGameBggData, setSelectedGameBggData] = useState(null);
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [showPlanningGamesModal, setShowPlanningGamesModal] = useState(false);
  const [selectedGamesForBringing, setSelectedGamesForBringing] = useState(new Set());
  const [planningGamesSearchQuery, setPlanningGamesSearchQuery] = useState('');
  const [gameInterests, setGameInterests] = useState({}); // { gameId: { userId: 'bringing' } }
  const [showSelectedGamesList, setShowSelectedGamesList] = useState(true);
  const [proposedGames, setProposedGames] = useState([]); // Array of { gameId, gameName, gameImage, proposedBy: userId, ratings: { userId: rating } }
  const [userProposals, setUserProposals] = useState(new Set()); // Set of gameIds user has proposed
  // Browse and Request state
  const [selectedAttendeeForBrowse, setSelectedAttendeeForBrowse] = useState(null); // { userId, userName, avatarUrl }
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null); // { userId, userName, avatarUrl }
  // RSVP Management
  const [showRSVPManagement, setShowRSVPManagement] = useState(false);
  const [showAttendeeCollectionModal, setShowAttendeeCollectionModal] = useState(false);
  // Default time and location editing
  const [editingDefaultTime, setEditingDefaultTime] = useState(false);
  const [editingDefaultLocation, setEditingDefaultLocation] = useState(false);
  const [defaultTimeForm, setDefaultTimeForm] = useState({
    usualStartTime: new Date(new Date().setHours(18, 0, 0, 0)),
    usualEndTime: new Date(new Date().setHours(22, 0, 0, 0)),
  });
  const [defaultLocationForm, setDefaultLocationForm] = useState({
    location: '',
    address: '',
  });
  const [showDefaultTimePicker, setShowDefaultTimePicker] = useState({ type: null });
  const [attendeeCollectionPage, setAttendeeCollectionPage] = useState(1);
  const [attendeeCategorySortPreference, setAttendeeCategorySortPreference] = useState({}); // { 'Strategy': 'rating' | 'title', ... }
  const [enrichedAttendeeGames, setEnrichedAttendeeGames] = useState([]);
  const GAMES_PER_PAGE = 30;
  // Game night date selection for aggregated collections
  const [selectedGameNightDateIndex, setSelectedGameNightDateIndex] = useState(null);

  const event = getEventById(eventId);
  const userId = user?.uid || user?.id || null;

  const memberStatus = event && userId
    ? getMembershipStatus(event.id, userId)
    : membershipStatus.STRANGER;
  const isMember = memberStatus === membershipStatus.MEMBER;
  const isOrganizer = event?.organizerId && event.organizerId === userId;

  const members = useMemo(
    () => (event?.members || []).filter((member) => member.status === membershipStatus.MEMBER),
    [event?.members, membershipStatus],
  );

  // Stable key representing the member IDs for this event.
  // Used to avoid infinite effect loops caused by changing array references.
  const memberIdsKey = useMemo(() => {
    if (!members.length) return '';
    const ids = members
      .map((m) => m.userId)
      .filter(Boolean)
      .sort();
    return ids.join(',');
  }, [members]);

  // Initialize schedule form when event loads
  useEffect(() => {
    if (event) {
      // Parse existing scheduledFor or eventDates
      let selectedDates = [];
      const defaultStartTime = new Date(new Date().setHours(18, 0, 0, 0));
      const defaultEndTime = new Date(new Date().setHours(22, 0, 0, 0));
      
      if (event.eventDates && Array.isArray(event.eventDates)) {
        // New format: array of dates with times and locations
        selectedDates = event.eventDates.map(ed => {
          const date = safeParseDate(ed.date);
          const startTime = safeParseDate(ed.startTime);
          const endTime = safeParseDate(ed.endTime);
          return {
            date: date && !isNaN(date.getTime()) ? date : new Date(),
            startTime: startTime && !isNaN(startTime.getTime()) ? startTime : defaultStartTime,
            endTime: endTime && !isNaN(endTime.getTime()) ? endTime : defaultEndTime,
            location: ed.location || ed.generalLocation || event.location || event.generalLocation || '',
            address: ed.address || ed.exactLocation || (event.address || event.exactLocation || ''),
            note: ed.note || '',
          };
        });
      } else if (event.scheduledFor) {
        // Old format: single date string
        try {
          const date = safeParseDate(event.scheduledFor);
          if (date && !isNaN(date.getTime())) {
            selectedDates = [{
              date: date,
              startTime: date,
              endTime: new Date(date.getTime() + 4 * 60 * 60 * 1000), // 4 hours later
              location: event.location || event.generalLocation || '',
              address: event.address || event.exactLocation || '',
              note: '',
            }];
          }
        } catch (e) {
          console.error('Error parsing scheduledFor:', e);
        }
      }
      
      setScheduleForm({
        selectedDates,
        usualStartTime: event.usualStartTime ? new Date(event.usualStartTime) : defaultStartTime,
        usualEndTime: event.usualEndTime ? new Date(event.usualEndTime) : defaultEndTime,
        location: event.location || event.generalLocation || '',
        address: event.address || event.exactLocation || '',
      });
      setPinnedNotes(event.description || '');
      
      // Initialize default time and location forms
      const defaultStart = event.usualStartTime ? new Date(event.usualStartTime) : defaultStartTime;
      const defaultEnd = event.usualEndTime ? new Date(event.usualEndTime) : defaultEndTime;
      setDefaultTimeForm({
        usualStartTime: defaultStart,
        usualEndTime: defaultEnd,
      });
      setDefaultLocationForm({
        location: event.location || event.generalLocation || '',
        address: event.address || event.exactLocation || '',
      });
    }
  }, [event]);

  // GamesTab-specific logic removed - will be rebuilt

  // Fetch member names, RSVP data, and avatars from Firestore
  useEffect(() => {
    if (!memberIdsKey || !db || !event?.id) return;

    const fetchMemberData = async () => {
      console.log('[EventHub] fetchMemberData starting', {
        memberCount: members.length,
        eventId: event?.id,
        currentUserId: user?.uid || user?.id,
        isAuthenticated: !!user,
      });
      
      const names = {};
      const rsvps = {};
      const avatars = {};
      
      for (const member of members) {
        if (!member.userId || names[member.userId]) continue;
        
        console.log(`[EventHub] Processing member: ${member.userId}`);
        
        // First check if this is the current user - use Auth context data
        if (user && member.userId === (user.uid || user.id)) {
          names[member.userId] = user.name || user.email || member.userId;
          avatars[member.userId] = user.photoURL || user.avatarUrl || null;
          // Still fetch RSVP from Firestore for current user
          try {
            if (event.id) {
              const memberDoc = await db.collection('gamingGroups').doc(event.id)
                .collection('members').doc(member.userId).get();
              
              if (memberDoc.exists) {
                const memberData = memberDoc.data();
                // Support both old format (rsvpStatus) and new format (rsvpStatuses)
                if (memberData.rsvpStatuses) {
                  rsvps[member.userId] = memberData.rsvpStatuses;
                } else if (memberData.rsvpStatus) {
                  // Backward compatibility: convert single status to date-specific
                  rsvps[member.userId] = { default: memberData.rsvpStatus };
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching RSVP for current user:`, error);
          }
          continue;
        }
        
        try {
          let avatarFound = false;
          
          // Get from members subcollection (has denormalized userName and rsvpStatus)
          if (event.id) {
            console.log(`[EventHub] Fetching member document: gamingGroups/${event.id}/members/${member.userId}`);
            try {
              const memberDoc = await db.collection('gamingGroups').doc(event.id)
                .collection('members').doc(member.userId).get();
              
              console.log(`[EventHub] Member document fetch result for ${member.userId}:`, {
                exists: memberDoc.exists,
                hasData: !!memberDoc.data(),
              });
              
              if (memberDoc.exists) {
                const memberData = memberDoc.data();
                console.log(`[EventHub] Member document data for ${member.userId}:`, {
                  hasUserName: !!memberData.userName,
                  hasUserAvatarUrl: !!memberData.userAvatarUrl,
                  hasRsvpStatus: !!memberData.rsvpStatus,
                  hasRsvpStatuses: !!memberData.rsvpStatuses,
                  userName: memberData.userName,
                  userAvatarUrl: memberData.userAvatarUrl ? memberData.userAvatarUrl.substring(0, 50) + '...' : null,
                });
                
                if (memberData.userName) {
                  names[member.userId] = memberData.userName;
                  console.log(`[EventHub] Set name from member doc for ${member.userId}: ${memberData.userName}`);
                }
                // Support both old format (rsvpStatus) and new format (rsvpStatuses)
                if (memberData.rsvpStatuses) {
                  rsvps[member.userId] = memberData.rsvpStatuses;
                  console.log(`[EventHub] Set RSVP statuses for ${member.userId}:`, memberData.rsvpStatuses);
                } else if (memberData.rsvpStatus) {
                  // Backward compatibility: convert single status to date-specific
                  rsvps[member.userId] = { default: memberData.rsvpStatus };
                  console.log(`[EventHub] Set RSVP status (legacy) for ${member.userId}: ${memberData.rsvpStatus}`);
                }
                if (memberData.userAvatarUrl && memberData.userAvatarUrl.trim() !== '') {
                  avatars[member.userId] = memberData.userAvatarUrl;
                  avatarFound = true;
                  console.log(`[EventHub] Found avatar in member doc for ${member.userId}`);
                } else {
                  console.log(`[EventHub] No avatar URL in member doc for ${member.userId}`);
                }
              } else {
                console.warn(`[EventHub] Member document does not exist for ${member.userId} in group ${event.id}`);
              }
            } catch (memberDocError) {
              console.error(`[EventHub] Error fetching member document for ${member.userId}:`, {
                error: memberDocError.message,
                code: memberDocError.code,
                isPermissionError: memberDocError.code === 'permission-denied' || memberDocError.message?.includes('permission'),
              });
            }
          } else {
            console.warn(`[EventHub] No event.id, cannot fetch member document for ${member.userId}`);
          }
          
          // Fallback to users collection if we didn't find avatar in member doc
          if (!avatarFound || !names[member.userId]) {
            console.log(`[EventHub] Attempting to fetch user document for ${member.userId}`, {
              needsName: !names[member.userId],
              needsAvatar: !avatarFound,
              currentUser: user?.uid || user?.id,
              isAuthenticated: !!user,
            });
            
            try {
              // Check authentication state before fetching
              if (!user || (!user.uid && !user.id)) {
                console.warn(`[EventHub] User not authenticated, cannot fetch user document for ${member.userId}`);
              }
              
              console.log(`[EventHub] Fetching from users collection: users/${member.userId}`);
              const userDoc = await db.collection('users').doc(member.userId).get();
              
              console.log(`[EventHub] User document fetch result for ${member.userId}:`, {
                exists: userDoc.exists,
                hasData: !!userDoc.data(),
                error: null,
              });
              
              if (userDoc.exists) {
                const userData = userDoc.data();
                console.log(`[EventHub] User document data for ${member.userId}:`, {
                  hasName: !!userData.name,
                  hasEmail: !!userData.email,
                  hasAvatarUrl: !!userData.avatarUrl,
                  avatarUrlLength: userData.avatarUrl?.length || 0,
                });
                
                if (!names[member.userId]) {
                  names[member.userId] = userData.name || userData.email || member.userId;
                  console.log(`[EventHub] Set name for ${member.userId}: ${names[member.userId]}`);
                }
                if (!avatarFound) {
                  if (userData.avatarUrl && userData.avatarUrl.trim() !== '') {
                    avatars[member.userId] = userData.avatarUrl;
                    console.log(`[EventHub] Found avatar URL for ${member.userId}: ${userData.avatarUrl.substring(0, 50)}...`);
                    
                    // Update member document to cache the avatar URL for future fetches
                    if (event.id) {
                      try {
                        const memberDocRef = db.collection('gamingGroups').doc(event.id)
                          .collection('members').doc(member.userId);
                        await memberDocRef.set({
                          userAvatarUrl: userData.avatarUrl,
                        }, { merge: true });
                        console.log(`[EventHub] Cached avatar URL in member document for ${member.userId}`);
                      } catch (updateError) {
                        // Silently fail - this is just a cache optimization
                        console.error(`[EventHub] Error updating member avatar cache for ${member.userId}:`, updateError);
                      }
                    }
                  } else {
                    avatars[member.userId] = null;
                    console.log(`[EventHub] No avatar URL found in user document for ${member.userId}`);
                  }
                }
              } else {
                // Document doesn't exist - use fallback values
                console.warn(`[EventHub] User document does not exist for ${member.userId}`);
                if (!names[member.userId]) {
                  names[member.userId] = member.userId;
                }
                if (!avatarFound) {
                  avatars[member.userId] = null;
                }
              }
            } catch (userFetchError) {
              // Handle permission errors or other issues when fetching user document
              console.error(`[EventHub] Error fetching user document for ${member.userId}:`, {
                error: userFetchError.message,
                code: userFetchError.code,
                stack: userFetchError.stack,
                isPermissionError: userFetchError.code === 'permission-denied' || userFetchError.message?.includes('permission'),
              });
              
              // Use fallback values
              if (!names[member.userId]) {
                names[member.userId] = member.userId;
              }
              if (!avatarFound) {
                avatars[member.userId] = null;
              }
            }
          } else {
            console.log(`[EventHub] Skipping users collection fetch for ${member.userId} - already have name and avatar`);
          }
        } catch (error) {
          console.error(`Error fetching data for user ${member.userId}:`, error);
          names[member.userId] = member.userId;
          avatars[member.userId] = null;
        }
      }
      
      console.log('[EventHub] fetchMemberData complete', {
        namesCount: Object.keys(names).length,
        rsvpsCount: Object.keys(rsvps).length,
        avatarsCount: Object.keys(avatars).length,
        userIds: Object.keys(names),
        names: names,
        avatars: Object.keys(avatars).reduce((acc, userId) => {
          acc[userId] = avatars[userId] ? `found (${avatars[userId].substring(0, 30)}...)` : 'not found';
          return acc;
        }, {}),
        rsvps: rsvps,
      });
      setMemberNames(names);
      setMemberRSVPs(prev => {
        const updated = { ...prev, ...rsvps };
        console.log('[EventHub] memberRSVPs updated, total count:', Object.keys(updated).length);
        return updated;
      });
      setMemberAvatars(avatars);
    };

    fetchMemberData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIdsKey, event?.id, user?.uid, user?.id]);

  // Fetch current user's RSVP from Firestore
  useEffect(() => {
    if (!userId || !event?.id || !db) return;

    const fetchCurrentUserRSVP = async () => {
      try {
        const memberDoc = await db.collection('gamingGroups').doc(event.id)
          .collection('members').doc(userId).get();
        
        if (memberDoc.exists) {
          const memberData = memberDoc.data();
          // Support both old format (rsvpStatus) and new format (rsvpStatuses)
          if (memberData.rsvpStatuses) {
            setMemberRSVPs(prev => ({
              ...prev,
              [userId]: memberData.rsvpStatuses,
            }));
          } else if (memberData.rsvpStatus) {
            // Backward compatibility: convert single status to date-specific
            setMemberRSVPs(prev => ({
              ...prev,
              [userId]: { default: memberData.rsvpStatus },
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching current user RSVP:', error);
      }
    };

    fetchCurrentUserRSVP();
  }, [userId, event?.id]);

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

  // Helper to get date key from event date
  const getDateKey = (eventDate) => {
    if (!eventDate) return 'default';
    const date = eventDate instanceof Date ? eventDate : new Date(eventDate);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  };

  // Helper to get RSVP status for a specific date
  const getRSVPForDate = (userId, eventDate) => {
    const userRSVPs = memberRSVPs[userId] || {};
    if (typeof userRSVPs === 'string') {
      // Backward compatibility: old format with single status
      return eventDate ? null : userRSVPs;
    }
    const dateKey = getDateKey(eventDate);
    return userRSVPs[dateKey] || null;
  };

  // Helper to get members who are "going" or "maybe" for a specific date
  const getAttendingMembersForDate = (eventDate) => {
    if (!eventDate) return [];
    try {
      const dateKey = getDateKey(eventDate);
      const attending = members.filter((member) => {
        if (!member || !member.userId) return false;
        try {
          const memberRsvps = memberRSVPs[member.userId] || {};
          if (typeof memberRsvps === 'string') {
            // Backward compatibility: old format
            return eventDate ? false : (memberRsvps === 'going' || memberRsvps === 'maybe');
          }
          const status = memberRsvps[dateKey];
          return status === 'going' || status === 'maybe';
        } catch (err) {
          console.error('Error checking member RSVP:', err, member);
          return false;
        }
      });
      return attending;
    } catch (err) {
      console.error('Error in getAttendingMembersForDate:', err, eventDate);
      return [];
    }
  };

  const handleRSVP = async (status, eventDate = null, e = null) => {
    if (!userId || !isMember) {
      Alert.alert('Error', 'You must be a member to RSVP.');
      return;
    }

    // Prevent default button behavior that might cause scroll jump
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }

    const rsvpSettings = event.rsvpSettings || { enabled: true, allowMaybe: true, attendanceLimit: null };
    
    // Check if maybe is allowed
    if (status === 'maybe' && !rsvpSettings.allowMaybe) {
      Alert.alert('Error', 'Maybe option is not enabled for this event.');
      return;
    }

    // Check attendance limit
    if (status === 'going' && rsvpSettings.attendanceLimit) {
      const dateKey = getDateKey(eventDate);
      const goingCount = members.filter((m) => {
        const memberRsvps = memberRSVPs[m.userId] || {};
        if (typeof memberRsvps === 'string') return memberRsvps === 'going';
        return memberRsvps[dateKey] === 'going';
      }).length;
      
      if (goingCount >= rsvpSettings.attendanceLimit && getRSVPForDate(userId, eventDate) !== 'going') {
        Alert.alert(
          'Event Full',
          `This event has reached its attendance limit of ${rsvpSettings.attendanceLimit}. You will be added to the waitlist.`
        );
      }
    }

    // Capture previous status and scroll position before optimistic update
    const dateKey = getDateKey(eventDate);
    const previousStatus = getRSVPForDate(userId, eventDate);
    const savedScroll = scrollPositionRef.current;

    // Optimistically update local state immediately
    setMemberRSVPs(prev => {
      const userRSVPs = prev[userId] || {};
      const updatedUserRSVPs = typeof userRSVPs === 'string' 
        ? { default: userRSVPs } 
        : { ...userRSVPs };
      updatedUserRSVPs[dateKey] = status;
      return {
        ...prev,
        [userId]: updatedUserRSVPs,
      };
    });

    // Restore scroll position after React has painted the update
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scheduleScrollRef.current && savedScroll > 0) {
          scheduleScrollRef.current.scrollTo({
            y: savedScroll,
            animated: false,
          });
        }
      });
    });

    // Update context asynchronously
    try {
      await updateMemberRSVP(event.id, userId, status, eventDate);
    } catch (error) {
      // Revert optimistic update on error - restore previous status
      setMemberRSVPs(prev => {
        const userRSVPs = prev[userId] || {};
        const updatedUserRSVPs = typeof userRSVPs === 'string' 
          ? { default: userRSVPs } 
          : { ...userRSVPs };
        
        if (previousStatus) {
          updatedUserRSVPs[dateKey] = previousStatus;
        } else {
          delete updatedUserRSVPs[dateKey];
        }
        
        // Clean up if no RSVPs remain
        if (Object.keys(updatedUserRSVPs).length === 0) {
          const { [userId]: _, ...rest } = prev;
          return rest;
        }
        
        return {
          ...prev,
          [userId]: updatedUserRSVPs,
        };
      });
      Alert.alert('Error', error.message || 'Failed to update RSVP. Please try again.');
      console.error(error);
    }
  };

  const handleEditSchedule = async () => {
    if (!isOrganizer) {
      Alert.alert('Error', 'Only the organizer can edit the schedule.');
      return;
    }

    if (scheduleForm.selectedDates.length === 0) {
      Alert.alert('Error', 'Please select at least one date for the event.');
      return;
    }

    try {
      // Convert dates to ISO strings for storage
      const eventDates = scheduleForm.selectedDates.map(d => ({
        date: d.date.toISOString(),
        startTime: d.startTime.toISOString(),
        endTime: d.endTime.toISOString(),
        location: d.location || scheduleForm.location || '',
        address: d.address || d.exactLocation || scheduleForm.address || scheduleForm.exactLocation || '',
        note: d.note || '',
      }));

      const updateData = {
        eventDates,
        usualStartTime: scheduleForm.usualStartTime.toISOString(),
        usualEndTime: scheduleForm.usualEndTime.toISOString(),
        // Keep scheduledFor for backward compatibility (use first date)
        scheduledFor: scheduleForm.selectedDates[0]?.date.toISOString() || '',
      };

      await updateEventSchedule(event.id, userId, updateData);
      setShowEditSchedule(false);
      Alert.alert('Success', 'Schedule updated successfully.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update schedule. Please try again.');
      console.error(error);
    }
  };

  const handleSaveDefaultTime = async () => {
    if (!isOrganizer) {
      Alert.alert('Error', 'Only the organizer can edit the default time.');
      return;
    }

    try {
      const updateData = {
        usualStartTime: defaultTimeForm.usualStartTime.toISOString(),
        usualEndTime: defaultTimeForm.usualEndTime.toISOString(),
      };

      await updateEventSchedule(event.id, userId, updateData);
      setEditingDefaultTime(false);
      Alert.alert('Success', 'Default time updated successfully.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update default time. Please try again.');
      console.error(error);
    }
  };

  const handleSaveDefaultLocation = async () => {
    if (!isOrganizer) {
      Alert.alert('Error', 'Only the organizer can edit the default location.');
      return;
    }

    try {
      const updateData = {
        location: defaultLocationForm.location,
        address: defaultLocationForm.address,
      };

      await updateEventSchedule(event.id, userId, updateData);
      setEditingDefaultLocation(false);
      Alert.alert('Success', 'Default location updated successfully.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update default location. Please try again.');
      console.error(error);
    }
  };

  const handleDefaultTimeChange = (event, date, type) => {
    if (Platform.OS === 'android') {
      setShowDefaultTimePicker({ type: null });
      if (event.type === 'dismissed') {
        return;
      }
    }
    
    if (!date) return;
    
    setDefaultTimeForm({
      ...defaultTimeForm,
      [type === 'usualStart' ? 'usualStartTime' : 'usualEndTime']: date,
    });
    
    if (Platform.OS === 'ios') {
      // On iOS, we keep the picker open until user clicks Done
    }
  };

  const handleDatesChange = (dates) => {
    // Dates are now objects with { date, startTime, endTime, location, address, note } structure
    // Ensure new dates get default location values if not set
    const datesWithLocations = dates.map(d => ({
      ...d,
      location: d.location !== undefined ? d.location : scheduleForm.location,
      address: d.address !== undefined ? d.address : (d.exactLocation !== undefined ? d.exactLocation : scheduleForm.address),
      note: d.note !== undefined ? d.note : '',
    }));
    setScheduleForm({ ...scheduleForm, selectedDates: datesWithLocations });
  };

  const handleTimeChange = (event, date, type, dateIndex) => {
    if (Platform.OS === 'android') {
      setShowTimePicker({ type: null, dateIndex: null });
      if (event.type === 'dismissed') {
        return;
      }
    }
    
    if (!date) return;
    
    if (type === 'usualStart' || type === 'usualEnd') {
      // Update usual time
      setScheduleForm({
        ...scheduleForm,
        [type === 'usualStart' ? 'usualStartTime' : 'usualEndTime']: date,
        // Update all dates that haven't been individually edited
        selectedDates: scheduleForm.selectedDates.map((d, idx) => {
          // Only update if this date hasn't been individually edited
          // For now, we'll update all dates when usual time changes
          const newDate = new Date(d.date);
          if (type === 'usualStart') {
            newDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
            return { ...d, startTime: newDate };
          } else {
            newDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
            return { ...d, endTime: newDate };
          }
        }),
      });
    } else if (type === 'start' || type === 'end') {
      // Update individual date time
      const updatedDates = [...scheduleForm.selectedDates];
      if (dateIndex !== null && updatedDates[dateIndex]) {
        const newTime = new Date(updatedDates[dateIndex].date);
        newTime.setHours(date.getHours(), date.getMinutes(), 0, 0);
        updatedDates[dateIndex] = {
          ...updatedDates[dateIndex],
          [type === 'start' ? 'startTime' : 'endTime']: newTime,
        };
        setScheduleForm({ ...scheduleForm, selectedDates: updatedDates });
      }
    }
    
    if (Platform.OS === 'ios') {
      // On iOS, we keep the picker open until user clicks Done
    }
  };

  const handleShareInvite = async () => {
    try {
      const shareMessage = `Join my MeepleUp "${event.name}"!\n\nJoin code: ${event.joinCode}`;
      await Share.share({
        message: shareMessage,
        title: `Join ${event.name} on MeepleUp`,
      });
    } catch (error) {
      console.error('Error sharing invite:', error);
    }
  };

  const handleRegenerateJoinCode = () => {
    if (regenerateBusy) {
      return;
    }

    Alert.alert(
      'Create a fresh invite code?',
      'Anyone with the old code will no longer be able to join once you refresh it.',
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
                `Your new join code is: ${newCode}`,
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

  const handleExportToCalendar = async () => {
    if (!event) {
      Alert.alert('Error', 'Event not found.');
      return;
    }

    if (Platform.OS !== 'web') {
      const googleCalendarUrl = generateGoogleCalendarUrl(event);
      
      Alert.alert(
        'Add to Calendar',
        'How would you like to add this event?',
        [
          {
            text: 'Open in Google Calendar',
            onPress: async () => {
              try {
                const supported = await Linking.canOpenURL(googleCalendarUrl);
                if (supported) {
                  await Linking.openURL(googleCalendarUrl);
                } else {
                  Alert.alert('Error', 'Unable to open Google Calendar. Please make sure the Google Calendar app is installed.');
                }
              } catch (error) {
                console.error('Error opening Google Calendar:', error);
                Alert.alert('Error', 'Unable to open Google Calendar.');
              }
            },
          },
          {
            text: 'Share .ics File',
            onPress: async () => {
              await handleShareIcsFile();
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    try {
      const icalContent = generateIcalEvent(event);
      const safeName = (event.name || 'MeepleUp').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeName}.ics`;
      downloadIcalFile(icalContent, filename);
      Alert.alert('Exported!', `"${event.name}" has been exported. The .ics file should download automatically.`);
    } catch (error) {
      console.error('Error exporting to calendar:', error);
      Alert.alert('Error', 'Failed to export event to calendar. Please try again.');
    }
  };

  const handleShareIcsFile = async () => {
    if (!event) return;

    try {
      const icalContent = generateIcalEvent(event);
      const safeName = (event.name || 'MeepleUp').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeName}.ics`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, icalContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/calendar',
          dialogTitle: `Export ${event.name} to Calendar`,
        });
      }
    } catch (error) {
      console.error('Error sharing ICS file:', error);
      Alert.alert('Error', 'Failed to share calendar file. Please try again.');
    }
  };

  const getRSVPStatusLabel = (status) => {
    switch (status) {
      case 'going':
        return 'Going';
      case 'maybe':
        return 'Maybe';
      case 'not-going':
        return "Can't Make It";
      default:
        return 'Not Responded';
    }
  };

  const getRSVPCounts = () => {
    const counts = { going: 0, maybe: 0, 'not-going': 0, none: 0 };
    members.forEach((member) => {
      const status = memberRSVPs[member.userId] || null;
      if (status) {
        counts[status] = (counts[status] || 0) + 1;
      } else {
        counts.none += 1;
      }
    });
    return counts;
  };

  // Helper function to get members by RSVP status
  const getMembersByRSVPStatus = (status) => {
    return members.filter((member) => {
      const memberStatus = memberRSVPs[member.userId] || null;
      return memberStatus === status;
    });
  };

  // Helper function to check if avatar URL is valid
  const isValidAvatarUrl = (url) => {
    return url && typeof url === 'string' && url.trim() !== '';
  };

  const rsvpCounts = getRSVPCounts();
  // For backward compatibility, get default RSVP
  const userRsvps = memberRSVPs[userId] || {};
  const currentUserRSVP = typeof userRsvps === 'string' ? userRsvps : (userRsvps.default || null);

  // Event Tab Component (combined Schedule and Members)
  const EventTab = () => {
    if (!event) {
      return (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
          <View style={styles.section}>
            <Text>Loading event...</Text>
          </View>
        </ScrollView>
      );
    }
    
    return (
      <ScrollView 
        ref={scheduleScrollRef}
        style={styles.tabContent} 
        contentContainerStyle={styles.tabContentContainer}
        onScroll={(event) => {
          scrollPositionRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {/* Invite Guests Section */}
        {isOrganizer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invite Guests</Text>
            <View style={styles.inviteBlock}>
              <Text style={styles.inviteLabel}>Current join code</Text>
              <Text style={styles.inviteCode}>{event.joinCode}</Text>
              <Button
                label="Share invite code"
                onPress={handleShareInvite}
                style={styles.primaryAction}
              />
              <Button
                label={regenerateBusy ? 'Refreshing...' : 'Refresh invite code'}
                onPress={handleRegenerateJoinCode}
                style={styles.primaryAction}
                disabled={regenerateBusy}
                variant="outline"
              />
            </View>
          </View>
        )}

        {/* Members Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members ({members.length})</Text>
          {members.length === 0 ? (
            <Text style={styles.sectionCopy}>
              No members yet. Invite trusted players to join.
            </Text>
          ) : (
            members.map((member) => {
              const displayName = memberNames[member.userId] || member.userId;
              const isCurrentUser = member.userId === userId;
              const avatarUrl = memberAvatars[member.userId];
              const hasValidAvatar = isValidAvatarUrl(avatarUrl);

              return (
                <View key={member.userId} style={styles.memberCard}>
                  <TouchableOpacity
                    style={styles.memberAvatarContainer}
                    onPress={() => setSelectedUserForProfile({
                      userId: member.userId,
                      userName: displayName,
                      avatarUrl: avatarUrl
                    })}
                  >
                    {hasValidAvatar ? (
                      <Image 
                        source={{ uri: avatarUrl }} 
                        style={styles.memberAvatar}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.memberAvatarPlaceholder}>
                        <Text style={styles.memberAvatarInitial}>
                          {displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {member.role === 'organizer' ? '👑 ' : ''}{displayName}
                      {isCurrentUser && ' (You)'}
                    </Text>
                    <Text style={styles.memberRole}>
                      {member.role === 'organizer' ? 'Organizer' : 'Member'}
                    </Text>
                  </View>
                  {isOrganizer && !isCurrentUser && member.role !== 'organizer' && (
                    <TouchableOpacity
                      style={styles.removeMemberButton}
                      onPress={() => {
                        Alert.alert(
                          'Remove Member?',
                          `Are you sure you want to remove ${displayName} from this MeepleUp?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await leaveEvent(event.id, member.userId);
                                  Alert.alert('Member Removed', `${displayName} has been removed from the MeepleUp.`);
                                } catch (error) {
                                  Alert.alert('Error', 'Failed to remove member. Please try again.');
                                  console.error(error);
                                }
                              },
                            },
                          ],
                        );
                      }}
                    >
                      <Text style={styles.removeMemberText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Default Time and Location Section - Only for Organizers */}
        {isOrganizer && (
          <View style={styles.section}>
            {/* Default Time */}
            <View style={styles.defaultSettingRow}>
              <Text style={styles.defaultSettingLabel}>Default Time</Text>
              {editingDefaultTime ? (
                <View style={styles.defaultSettingEdit}>
                  <View style={styles.timeRow}>
                    <View style={styles.timeInputContainer}>
                      <Text style={styles.timeLabel}>Start</Text>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() => setShowDefaultTimePicker({ type: 'usualStart' })}
                      >
                        <Text style={styles.timeButtonText}>
                          {defaultTimeForm.usualStartTime.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.timeInputContainer}>
                      <Text style={styles.timeLabel}>End</Text>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() => setShowDefaultTimePicker({ type: 'usualEnd' })}
                      >
                        <Text style={styles.timeButtonText}>
                          {defaultTimeForm.usualEndTime.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.defaultSettingActions}>
                    <Button
                      label="Save"
                      onPress={handleSaveDefaultTime}
                      style={styles.defaultSettingButton}
                    />
                    <Button
                      label="Cancel"
                      onPress={() => {
                        setEditingDefaultTime(false);
                        // Reset to current values
                        const defaultStart = event.usualStartTime ? new Date(event.usualStartTime) : new Date(new Date().setHours(18, 0, 0, 0));
                        const defaultEnd = event.usualEndTime ? new Date(event.usualEndTime) : new Date(new Date().setHours(22, 0, 0, 0));
                        setDefaultTimeForm({
                          usualStartTime: defaultStart,
                          usualEndTime: defaultEnd,
                        });
                      }}
                      variant="outline"
                      style={styles.defaultSettingButton}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.defaultSettingDisplay}>
                  <Text style={styles.defaultSettingValue}>
                    {(() => {
                      const start = event.usualStartTime ? new Date(event.usualStartTime) : new Date(new Date().setHours(18, 0, 0, 0));
                      const end = event.usualEndTime ? new Date(event.usualEndTime) : new Date(new Date().setHours(22, 0, 0, 0));
                      return `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                    })()}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setEditingDefaultTime(true)}
                    style={styles.editIconButton}
                  >
                    <Text style={styles.editIconText}>✏️</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Default Location */}
            <View style={styles.defaultSettingRow}>
              <Text style={styles.defaultSettingLabel}>Default Location</Text>
              {editingDefaultLocation ? (
                <View style={styles.defaultSettingEdit}>
                  <Input
                    value={defaultLocationForm.location}
                    onChangeText={(text) => setDefaultLocationForm({ ...defaultLocationForm, location: text })}
                    placeholder="e.g., Jason's house"
                    style={styles.defaultSettingInput}
                  />
                  <Input
                    value={defaultLocationForm.address}
                    onChangeText={(text) => setDefaultLocationForm({ ...defaultLocationForm, address: text })}
                    placeholder="e.g., 123 Tolkien Dr."
                    style={styles.defaultSettingInput}
                  />
                  <View style={styles.defaultSettingActions}>
                    <Button
                      label="Save"
                      onPress={handleSaveDefaultLocation}
                      style={styles.defaultSettingButton}
                    />
                    <Button
                      label="Cancel"
                      onPress={() => {
                        setEditingDefaultLocation(false);
                        // Reset to current values
                        setDefaultLocationForm({
                          location: event.location || event.generalLocation || '',
                          address: event.address || event.exactLocation || '',
                        });
                      }}
                      variant="outline"
                      style={styles.defaultSettingButton}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.defaultSettingDisplay}>
                  <View style={styles.defaultSettingValueContainer}>
                    <Text style={styles.defaultSettingValue}>
                      {event.location || event.generalLocation || 'Not set'}
                    </Text>
                    {(event.address || event.exactLocation) && (
                      <Text style={styles.defaultSettingSubValue}>
                        {event.address || event.exactLocation}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => setEditingDefaultLocation(true)}
                    style={styles.editIconButton}
                  >
                    <Text style={styles.editIconText}>✏️</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Event Details & RSVP</Text>
            <View style={styles.sectionHeaderActions}>
              {isOrganizer && (
                <Button
                  label="Manage RSVPs"
                  onPress={() => setShowRSVPManagement(true)}
                  variant="outline"
                  style={styles.manageRSVPButton}
                />
              )}
              {event.scheduledFor && (
                <Button
                  label="Export to Calendar"
                  onPress={handleExportToCalendar}
                  variant="outline"
                  style={styles.exportButton}
                />
              )}
            </View>
          </View>
        
        {isOrganizer && (
          <View style={styles.editScheduleButtonContainer}>
            <Button
              label="Edit Schedule"
              onPress={() => setShowEditSchedule(true)}
              variant="outline"
              style={styles.editButton}
            />
          </View>
        )}
        
        <View style={styles.scheduleInfo}>
          <Text style={styles.scheduleLabel}>Date & Time</Text>
          {event.eventDates && Array.isArray(event.eventDates) && event.eventDates.length > 0 ? (
            <View>
              {event.eventDates.map((ed, index) => {
                const date = safeParseDate(ed.date);
                const startTime = safeParseDate(ed.startTime);
                const endTime = safeParseDate(ed.endTime);
                
                if (!date || isNaN(date.getTime())) return null;
                
                const dateStr = formatDate(date.toISOString());
                let timeStr = '';
                if (startTime && !isNaN(startTime.getTime()) && endTime && !isNaN(endTime.getTime())) {
                  timeStr = `${formatTime(startTime.toISOString())} - ${formatTime(endTime.toISOString())}`;
                } else if (startTime && !isNaN(startTime.getTime())) {
                  timeStr = formatTime(startTime.toISOString());
                }
                
                const location = ed.location || ed.generalLocation || event.location || event.generalLocation || '';
                const address = ed.address || ed.exactLocation || (isMember ? (event.address || event.exactLocation) : null);
                const note = ed.note || '';
                const rsvpSettings = event.rsvpSettings || { enabled: true, allowMaybe: true, attendanceLimit: null };
                const showRSVPForDate = isMember && rsvpSettings.enabled;
                const dateRSVP = getRSVPForDate(userId, date);
                
                return (
                  <View
                    key={index}
                    style={styles.dateEntryContainer}
                    onLayout={(event) => {
                      const { y } = event.nativeEvent.layout;
                      dateEntryPositions.current[index] = y;
                    }}
                  >
                    <View style={styles.dateEntryContent}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.dateTimeEntry,
                          pressed && styles.dateTimeEntryPressed,
                          highlightedDateIndex === index && styles.dateTimeEntryHighlighted,
                        ]}
                        onPress={() => {
                          setSelectedDateDetail({
                            date,
                            startTime,
                            endTime,
                            location,
                            address,
                            note,
                            index,
                          });
                          setHighlightedDateIndex(index);
                          // Scroll to this date entry
                          setTimeout(() => {
                            const position = dateEntryPositions.current[index];
                            if (position !== undefined && scheduleScrollRef.current) {
                              scheduleScrollRef.current.scrollTo({
                                y: Math.max(0, position - 20), // Add some padding from top
                                animated: true,
                              });
                            }
                          }, 100);
                          // Clear highlight after 3 seconds
                          setTimeout(() => {
                            setHighlightedDateIndex(null);
                          }, 3000);
                        }}
                      >
                        <Text style={styles.scheduleValue}>
                          {dateStr}{timeStr ? ` (${timeStr})` : ''}
                        </Text>
                        {location && (
                          <Text style={styles.scheduleLocation}>{location}</Text>
                        )}
                      </Pressable>
                      
                      {/* Show attending members for this date */}
                      {(() => {
                        try {
                          const attendingMembers = getAttendingMembersForDate(date);
                          if (!attendingMembers || attendingMembers.length === 0) return null;
                          
                          return (
                            <View style={styles.attendingMembersContainer}>
                              <Text style={styles.attendingMembersLabel}>
                                {attendingMembers.length} {attendingMembers.length === 1 ? 'person' : 'people'} attending:
                              </Text>
                              <View style={styles.attendingMembersAvatars}>
                                {attendingMembers.map((member) => {
                                  if (!member || !member.userId) return null;
                                  try {
                                    const displayName = memberNames[member.userId] || member.userId;
                                    const avatarUrl = memberAvatars[member.userId];
                                    const hasValidAvatar = isValidAvatarUrl(avatarUrl);
                                    const memberRsvps = memberRSVPs[member.userId] || {};
                                    const dateKey = getDateKey(date);
                                    const memberStatus = typeof memberRsvps === 'string' 
                                      ? (date ? null : memberRsvps)
                                      : (memberRsvps[dateKey] || null);
                                    
                                    return (
                                      <TouchableOpacity
                                        key={member.userId}
                                        style={styles.attendingMemberAvatar}
                                        onPress={() => setSelectedUserForProfile({
                                          userId: member.userId,
                                          userName: displayName,
                                          avatarUrl: avatarUrl
                                        })}
                                      >
                                        {hasValidAvatar ? (
                                          <Image
                                            source={{ uri: avatarUrl }}
                                            style={styles.attendingAvatarImage}
                                            resizeMode="cover"
                                          />
                                        ) : (
                                          <View style={styles.attendingAvatarPlaceholder}>
                                            <Text style={styles.attendingAvatarInitial}>
                                              {displayName.charAt(0).toUpperCase()}
                                            </Text>
                                          </View>
                                        )}
                                        {memberStatus === 'going' && (
                                          <View style={styles.goingBadge}>
                                            <Text style={styles.goingBadgeText}>✓</Text>
                                          </View>
                                        )}
                                        {memberStatus === 'maybe' && (
                                          <View style={styles.maybeBadge}>
                                            <Text style={styles.maybeBadgeText}>?</Text>
                                          </View>
                                        )}
                                      </TouchableOpacity>
                                    );
                                  } catch (err) {
                                    console.error('Error rendering attending member:', err, member);
                                    return null;
                                  }
                                })}
                              </View>
                            </View>
                          );
                        } catch (err) {
                          console.error('Error rendering attending members:', err, date);
                          return null;
                        }
                      })()}
                      
                      {showRSVPForDate && (
                        <View style={styles.dateRSVPContainer}>
                          <Text style={styles.dateRSVPLabel}>Your RSVP:</Text>
                          <View style={styles.dateRSVPButtons}>
                            <Button
                              label="Going"
                              onPress={(e) => {
                                e?.preventDefault?.();
                                e?.stopPropagation?.();
                                handleRSVP('going', date, e);
                              }}
                              variant={dateRSVP === 'going' ? 'primary' : 'outline'}
                              style={styles.dateRSVPButton}
                              textStyle={styles.dateRSVPButtonText}
                            />
                            {rsvpSettings.allowMaybe && (
                              <Button
                                label="Maybe"
                                onPress={(e) => {
                                  e?.preventDefault?.();
                                  e?.stopPropagation?.();
                                  handleRSVP('maybe', date, e);
                                }}
                                variant={dateRSVP === 'maybe' ? 'primary' : 'outline'}
                                style={styles.dateRSVPButton}
                                textStyle={styles.dateRSVPButtonText}
                              />
                            )}
                            <Button
                              label="Can't Make It"
                              onPress={(e) => {
                                e?.preventDefault?.();
                                e?.stopPropagation?.();
                                handleRSVP('not-going', date, e);
                              }}
                              variant={dateRSVP === 'not-going' ? 'primary' : 'outline'}
                              style={styles.dateRSVPButton}
                              textStyle={styles.dateRSVPButtonText}
                            />
                          </View>
                          {dateRSVP && (
                            <Text style={styles.dateRSVPStatus}>
                              Status: {getRSVPStatusLabel(dateRSVP)}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : event.scheduledFor ? (
            (() => {
              const date = safeParseDate(event.scheduledFor);
              const rsvpSettings = event.rsvpSettings || { enabled: true, allowMaybe: true, attendanceLimit: null };
              const showRSVPForDate = isMember && rsvpSettings.enabled;
              const dateRSVP = date ? getRSVPForDate(userId, date) : null;
              
              return (
                <View style={styles.dateEntryContainer}>
                  <View style={styles.dateEntryContent}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.dateTimeEntry,
                        pressed && styles.dateTimeEntryPressed,
                      ]}
                      onPress={() => {
                        if (date && !isNaN(date.getTime())) {
                          const startTime = safeParseDate(event.scheduledFor);
                          setSelectedDateDetail({
                            date,
                            startTime: startTime && !isNaN(startTime.getTime()) ? startTime : null,
                            endTime: null,
                            location: event.location || event.generalLocation || '',
                            address: isMember ? (event.address || event.exactLocation || '') : null,
                            note: '',
                            index: 0,
                          });
                        }
                      }}
                    >
                      <Text style={styles.scheduleValue}>
                        {(() => {
                          if (!date || isNaN(date.getTime())) {
                            return 'Date and time to be announced';
                          }
                          const dateStr = formatDate(date.toISOString());
                          const timeStr = formatTime(date.toISOString());
                          return `${dateStr} (${timeStr})`;
                        })()}
                      </Text>
                      {(event.location || event.generalLocation) && (
                        <Text style={styles.scheduleLocation}>{event.location || event.generalLocation}</Text>
                      )}
                    </Pressable>
                    {showRSVPForDate && date && (
                      <View style={styles.dateRSVPContainer}>
                        <Text style={styles.dateRSVPLabel}>Your RSVP:</Text>
                        <View style={styles.dateRSVPButtons}>
                          <Button
                            label="Going"
                            onPress={() => handleRSVP('going', date)}
                            variant={dateRSVP === 'going' ? 'primary' : 'outline'}
                            style={styles.dateRSVPButton}
                            textStyle={styles.dateRSVPButtonText}
                          />
                          {rsvpSettings.allowMaybe && (
                            <Button
                              label="Maybe"
                              onPress={() => handleRSVP('maybe', date)}
                              variant={dateRSVP === 'maybe' ? 'primary' : 'outline'}
                              style={styles.dateRSVPButton}
                              textStyle={styles.dateRSVPButtonText}
                            />
                          )}
                          <Button
                            label="Can't Make It"
                            onPress={() => handleRSVP('not-going', date)}
                            variant={dateRSVP === 'not-going' ? 'primary' : 'outline'}
                            style={styles.dateRSVPButton}
                            textStyle={styles.dateRSVPButtonText}
                          />
                        </View>
                        {dateRSVP && (
                          <Text style={styles.dateRSVPStatus}>
                            Status: {getRSVPStatusLabel(dateRSVP)}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })()
          ) : (
            <Text style={styles.scheduleValue}>Date and time to be announced</Text>
          )}
        </View>

        {isOrganizer && (
          <Button
            label="Edit Schedule"
            onPress={() => setShowEditSchedule(true)}
            variant="outline"
            style={styles.editButton}
          />
        )}
      </View>

      {/* Archive Section - Combined with Event Details */}
      {isOrganizer && (
        <View style={styles.section}>
          <Button
            label="Archive MeepleUp"
            onPress={handleArchiveEvent}
            variant="outline"
            style={styles.dangerAction}
          />
          <Text style={styles.sectionHint}>
            Archiving will hide this MeepleUp from all members. You can restore it later from your archived MeepleUps.
          </Text>
        </View>
      )}

      {/* RSVP Summary - Only show if no event dates (backward compatibility) */}
      {isMember && !event.eventDates && (() => {
        const rsvpSettings = event.rsvpSettings || { enabled: true, allowMaybe: true, attendanceLimit: null };
        if (!rsvpSettings.enabled) return null;
        
        const defaultRSVP = getRSVPForDate(userId, null);
        
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your RSVP</Text>
            <Text style={styles.sectionCopy}>
              Status: <Text style={styles.bold}>{getRSVPStatusLabel(defaultRSVP)}</Text>
            </Text>
            
            {rsvpSettings.attendanceLimit && (
              <View style={styles.rsvpLimitInfo}>
                <Text style={styles.rsvpLimitText}>
                  Attendance: {rsvpCounts.going}/{rsvpSettings.attendanceLimit}
                  {rsvpCounts.going >= rsvpSettings.attendanceLimit && defaultRSVP !== 'going' && (
                    <Text style={styles.waitlistText}> (Waitlisted)</Text>
                  )}
                </Text>
              </View>
            )}
            
            <View style={styles.rsvpButtons}>
              <Button
                label="Going"
                onPress={(e) => {
                  e?.preventDefault?.();
                  e?.stopPropagation?.();
                  handleRSVP('going', null, e);
                }}
                variant={defaultRSVP === 'going' ? 'primary' : 'outline'}
                style={styles.rsvpButton}
                textStyle={styles.rsvpButtonText}
              />
              {rsvpSettings.allowMaybe && (
                <Button
                  label="Maybe"
                  onPress={(e) => {
                    e?.preventDefault?.();
                    e?.stopPropagation?.();
                    handleRSVP('maybe', null, e);
                  }}
                  variant={defaultRSVP === 'maybe' ? 'primary' : 'outline'}
                  style={styles.rsvpButton}
                  textStyle={styles.rsvpButtonText}
                />
              )}
              <Button
                label="Can't Make It"
                onPress={(e) => {
                  e?.preventDefault?.();
                  e?.stopPropagation?.();
                  handleRSVP('not-going', null, e);
                }}
                variant={defaultRSVP === 'not-going' ? 'primary' : 'outline'}
                style={styles.rsvpButton}
                textStyle={styles.rsvpButtonText}
              />
            </View>
          </View>
        );
      })()}

      {/* Leave MeepleUp Section - Only for non-organizer members */}
      {isMember && !isOrganizer && (
        <View style={styles.section}>
          <Button
            label="Leave MeepleUp"
            onPress={() => handleLeaveEventUtil(event.id, userId, leaveEvent, getEventById)}
            variant="outline"
            style={styles.dangerAction}
          />
          <Text style={styles.sectionHint}>
            You will need to get a new invitation to rejoin this MeepleUp.
          </Text>
        </View>
      )}

      </ScrollView>
    );
  };

  // Fetch discussion posts from Firestore with real-time listener
  useEffect(() => {
    if (!event?.id || !db || !isMember) {
      // Clear messages if user is not a member
      setDiscussionMessages([]);
      return;
    }

    console.log('[EventHub] Setting up real-time listener for discussion posts, eventId:', event.id, 'isMember:', isMember);

    // Set up real-time listener for posts
    const postsRef = db.collection('gamingGroups').doc(event.id)
      .collection('posts')
      .limit(100); // Get more than we need, then filter

    const unsubscribe = postsRef.onSnapshot(
      (snapshot) => {
        console.log('[EventHub] Discussion posts snapshot received, docs:', snapshot.docs.length);
        
        const posts = [];
        
        for (const doc of snapshot.docs) {
          const data = doc.data();
          // Filter out deleted posts
          if (data.deleted === true) continue;
          
          posts.push({
            id: doc.id,
            userId: data.userId,
            userName: data.userName || 'Unknown',
            content: data.content,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || null,
            edited: data.edited || false,
            pinned: data.pinned || false,
          });
        }
        
        // Sort manually: pinned first, then by date (newest first)
        posts.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        // Limit to 50 most recent after sorting
        console.log('[EventHub] Setting discussion messages, count:', posts.slice(0, 50).length);
        setDiscussionMessages(posts.slice(0, 50));
      },
      (error) => {
        console.error('[EventHub] Error in discussion posts listener:', error);
        // If query fails, just show empty state
        setDiscussionMessages([]);
      }
    );

    // Cleanup listener on unmount or when dependencies change
    return () => {
      console.log('[EventHub] Cleaning up discussion posts listener');
      unsubscribe();
    };
  }, [event?.id, isMember, db]);

  // Fetch comments for all posts with real-time listeners
  useEffect(() => {
    if (!event?.id || !db || !isMember || discussionMessages.length === 0) {
      setCommentsByPost({});
      return;
    }

    console.log('[EventHub] Setting up comment listeners for', discussionMessages.length, 'posts');

    const unsubscribes = [];

    // Set up listeners for each post
    discussionMessages.forEach((post) => {
      const commentsRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(post.id)
        .collection('comments')
        .limit(500); // Get enough for deep nesting

      const unsubscribe = commentsRef.onSnapshot(
        (snapshot) => {
          console.log(`[EventHub] Comments snapshot for post ${post.id}, docs:`, snapshot.docs.length);
          
          const comments = [];
          
          for (const doc of snapshot.docs) {
            const data = doc.data();
            // Filter out deleted comments
            if (data.deleted === true) continue;
            
            comments.push({
              id: doc.id,
              postId: post.id,
              parentCommentId: data.parentCommentId || null, // null for top-level, commentId for nested
              userId: data.userId,
              userName: data.userName || 'Unknown',
              userAvatarUrl: data.userAvatarUrl || null,
              content: data.content,
              createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || null,
              edited: data.edited || false,
            });
          }
          
          // Sort by creation time
          comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          
          setCommentsByPost(prev => ({
            ...prev,
            [post.id]: comments,
          }));
        },
        (error) => {
          console.error(`[EventHub] Error in comments listener for post ${post.id}:`, error);
        }
      );

      unsubscribes.push(unsubscribe);
    });

    // Cleanup all listeners
    return () => {
      console.log('[EventHub] Cleaning up comment listeners');
      unsubscribes.forEach(unsub => unsub());
    };
  }, [event?.id, isMember, db, discussionMessages]);

  // Build comment tree structure (parent -> children)
  const buildCommentTree = useCallback((comments) => {
    if (!comments || comments.length === 0) return [];
    
    // Create a map of commentId -> comment
    const commentMap = new Map();
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, children: [] });
    });
    
    // Build tree structure
    const rootComments = [];
    commentMap.forEach((comment) => {
      if (comment.parentCommentId) {
        // This is a nested comment
        const parent = commentMap.get(comment.parentCommentId);
        if (parent) {
          parent.children.push(comment);
        } else {
          // Parent not found (might be deleted), treat as root
          rootComments.push(comment);
        }
      } else {
        // This is a top-level comment
        rootComments.push(comment);
      }
    });
    
    // Sort root comments by date
    rootComments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    return rootComments;
  }, []);

  // Handler for posting comments/replies
  const handlePostComment = useCallback(async () => {
    if (!replyText.trim() || !userId || !event?.id || !db || !replyingTo) {
      return;
    }

    try {
      const { type, id, postId } = replyingTo;
      
      const commentsRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(postId)
        .collection('comments');
      
      const commentData = {
        postId,
        parentCommentId: type === 'comment' ? id : null, // null for post replies, commentId for comment replies
        userId,
        userName: user?.name || user?.email || 'Unknown',
        userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
        content: replyText.trim(),
        createdAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now(),
        edited: false,
        deleted: false,
      };

      const commentDocRef = await commentsRef.add(commentData);
      
      // Get post author ID for notification
      let postAuthorId = null;
      let parentCommentAuthorId = null;
      try {
        const postRef = db.collection('gamingGroups').doc(event.id)
          .collection('posts').doc(postId);
        const postDoc = await postRef.get();
        if (postDoc.exists) {
          postAuthorId = postDoc.data().userId;
        }
        
        // If replying to a comment, get the parent comment author
        if (type === 'comment') {
          const parentCommentRef = db.collection('gamingGroups').doc(event.id)
            .collection('posts').doc(postId)
            .collection('comments').doc(id);
          const parentCommentDoc = await parentCommentRef.get();
          if (parentCommentDoc.exists) {
            parentCommentAuthorId = parentCommentDoc.data().userId;
          }
        }
      } catch (error) {
        console.error('Error fetching post/comment data for notification:', error);
      }
      
      // Update post comment count
      const postRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(postId);
      await postRef.update({
        commentCount: firebase.firestore.FieldValue.increment(1),
        updatedAt: firebase.firestore.Timestamp.now(),
      });
      
      // Notify members about new comment
      try {
        await notifyDiscussionActivity(event.id, userId, {
          type: 'new_comment',
          postId: postId,
          commentId: commentDocRef.id,
          postAuthorId: postAuthorId,
          parentCommentAuthorId: parentCommentAuthorId,
          fromUserName: user?.name || user?.email || 'Unknown',
          message: `${user?.name || 'Someone'} commented in the Discussion section`,
        });
      } catch (notifError) {
        console.error('Error sending Discussion notification:', notifError);
        // Don't fail the comment creation if notification fails
      }
      
      setReplyText('');
      setReplyingTo(null);
    } catch (error) {
      console.error('Error posting comment:', error);
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    }
  }, [replyText, userId, event?.id, db, replyingTo, user?.name, user?.email]);

  // Handler for posting messages - memoized to prevent recreation
  const handlePostMessage = useCallback(async () => {
    if (!newMessage.trim() || !userId || !event?.id || !db) {
      return;
    }

    try {
      const postsRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts');
      
      const postData = {
        userId,
        userName: user?.name || user?.email || 'Unknown',
        userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
        content: newMessage.trim(),
        likeCount: 0,
        commentCount: 0,
        createdAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now(),
        edited: false,
        deleted: false,
        pinned: false,
      };

      const docRef = await postsRef.add(postData);
      
      // Notify members about new post
      try {
        await notifyDiscussionActivity(event.id, userId, {
          type: 'new_post',
          postId: docRef.id,
          fromUserName: user?.name || user?.email || 'Unknown',
          message: `${user?.name || 'Someone'} posted in the Discussion section`,
        });
      } catch (notifError) {
        console.error('Error sending Discussion notification:', notifError);
        // Don't fail the post creation if notification fails
      }
      
      // Add to local state
      setDiscussionMessages(prev => [{
        id: docRef.id,
        userId,
        userName: user?.name || user?.email || 'Unknown',
        content: newMessage.trim(),
        createdAt: new Date().toISOString(),
        pinned: false,
      }, ...prev]);
      
      setNewMessage('');
    } catch (error) {
      console.error('Error posting message:', error);
      Alert.alert('Error', 'Failed to post message. Please try again.');
    }
  }, [newMessage, userId, event?.id, db, user?.name, user?.email]);

  // Handler for editing posts
  const handleEditPost = useCallback(async (postId, newContent) => {
    if (!newContent.trim() || !userId || !event?.id || !db) {
      return;
    }

    try {
      const postRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(postId);
      
      await postRef.update({
        content: newContent.trim(),
        edited: true,
        updatedAt: firebase.firestore.Timestamp.now(),
      });
      
      // Update local state
      setDiscussionMessages(prev => prev.map(msg => 
        msg.id === postId 
          ? { ...msg, content: newContent.trim(), edited: true, updatedAt: new Date().toISOString() }
          : msg
      ));
      
      setEditing(null);
      setEditText('');
    } catch (error) {
      console.error('Error editing post:', error);
      Alert.alert('Error', 'Failed to edit post. Please try again.');
    }
  }, [userId, event?.id, db]);

  // Handler for deleting posts
  const handleDeletePost = useCallback(async (postId) => {
    if (!userId || !event?.id || !db) {
      return;
    }

    Alert.alert(
      'Delete Post?',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const postRef = db.collection('gamingGroups').doc(event.id)
                .collection('posts').doc(postId);
              
              await postRef.update({
                deleted: true,
                updatedAt: firebase.firestore.Timestamp.now(),
              });
              
              // Update local state - filter out deleted post
              setDiscussionMessages(prev => prev.filter(msg => msg.id !== postId));
            } catch (error) {
              console.error('Error deleting post:', error);
              Alert.alert('Error', 'Failed to delete post. Please try again.');
            }
          },
        },
      ]
    );
  }, [userId, event?.id, db]);

  // Handler for editing comments
  const handleEditComment = useCallback(async (postId, commentId, newContent) => {
    if (!newContent.trim() || !userId || !event?.id || !db) {
      return;
    }

    try {
      const commentRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(postId)
        .collection('comments').doc(commentId);
      
      await commentRef.update({
        content: newContent.trim(),
        edited: true,
        updatedAt: firebase.firestore.Timestamp.now(),
      });
      
      // Update local state
      setCommentsByPost(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).map(comment =>
          comment.id === commentId
            ? { ...comment, content: newContent.trim(), edited: true, updatedAt: new Date().toISOString() }
            : comment
        ),
      }));
      
      setEditing(null);
      setEditText('');
    } catch (error) {
      console.error('Error editing comment:', error);
      Alert.alert('Error', 'Failed to edit comment. Please try again.');
    }
  }, [userId, event?.id, db]);

  // Handler for deleting comments
  const handleDeleteComment = useCallback(async (postId, commentId) => {
    if (!userId || !event?.id || !db) {
      return;
    }

    Alert.alert(
      'Delete Comment?',
      'Are you sure you want to delete this comment? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const commentRef = db.collection('gamingGroups').doc(event.id)
                .collection('posts').doc(postId)
                .collection('comments').doc(commentId);
              
              await commentRef.update({
                deleted: true,
                updatedAt: firebase.firestore.Timestamp.now(),
              });
              
              // Update local state - filter out deleted comment
              setCommentsByPost(prev => ({
                ...prev,
                [postId]: (prev[postId] || []).filter(comment => comment.id !== commentId),
              }));
              
              // Update post comment count
              const postRef = db.collection('gamingGroups').doc(event.id)
                .collection('posts').doc(postId);
              await postRef.update({
                commentCount: firebase.firestore.FieldValue.increment(-1),
                updatedAt: firebase.firestore.Timestamp.now(),
              });
            } catch (error) {
              console.error('Error deleting comment:', error);
              Alert.alert('Error', 'Failed to delete comment. Please try again.');
            }
          },
        },
      ]
    );
  }, [userId, event?.id, db]);

  // Reply Input Component - separate to prevent re-render issues
  const ReplyInput = React.memo(({ replyingTo, replyText, setReplyText, onCancel, onSubmit, postComments }) => {
    const inputRef = useRef(null);
    
    useEffect(() => {
      if (replyingTo && inputRef.current) {
        const timer = setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [replyingTo]);
    
    if (!replyingTo) return null;
    
    return (
      <View style={styles.replyInputContainer}>
        <Text style={styles.replyingToLabel}>
          {replyingTo.type === 'comment' 
            ? `Replying to ${postComments?.find(c => c.id === replyingTo.id)?.userName || 'comment'}`
            : 'Replying to post'}
        </Text>
        <Input
          ref={inputRef}
          value={replyText}
          onChangeText={setReplyText}
          placeholder="Write a reply..."
          multiline
          style={styles.replyInputField}
        />
        <View style={styles.replyActions}>
          <Button
            label="Cancel"
            onPress={onCancel}
            variant="outline"
            style={styles.replyCancelButton}
          />
          <Button
            label="Post Reply"
            onPress={onSubmit}
            disabled={!replyText.trim()}
            style={styles.replyPostButton}
          />
        </View>
      </View>
    );
  });

  // Recursive Comment Thread Component
  const CommentThread = useCallback(({ comment, depth = 0, postId, maxDepth = 10, commentsByPost }) => {
    const isNested = depth > 0;
    const canNest = depth < maxDepth;
    const isReplyingToThis = replyingTo && replyingTo.type === 'comment' && replyingTo.id === comment.id;
    const isEditingThis = editing && editing.type === 'comment' && editing.id === comment.id;
    const isOwner = comment.userId === userId;
    const postComments = commentsByPost || [];
    
    return (
      <View key={comment.id} style={[styles.commentContainer, isNested && styles.nestedComment]}>
        <View style={[styles.commentCard, { marginLeft: depth * 16 }]}>
          <View style={styles.commentHeader}>
            <TouchableOpacity
              onPress={() => setSelectedUserForProfile({
                userId: comment.userId,
                userName: comment.userName,
                avatarUrl: comment.userAvatarUrl
              })}
            >
              {comment.userAvatarUrl ? (
                <Image 
                  source={{ uri: comment.userAvatarUrl }} 
                  style={styles.commentAvatar}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.commentAvatarPlaceholder}>
                  <Text style={styles.commentAvatarInitial}>
                    {comment.userName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.commentHeaderText}>
              <Text style={styles.commentAuthor}>{comment.userName}</Text>
              <Text style={styles.commentTime}>
                {formatDate(comment.createdAt)}
                {comment.edited && comment.updatedAt && (
                  <Text style={styles.editedLabel}> • edited {formatDate(comment.updatedAt)}</Text>
                )}
              </Text>
            </View>
          </View>
          
          {isEditingThis ? (
            <View style={styles.editContainer}>
              <Input
                value={editText}
                onChangeText={setEditText}
                placeholder="Edit your comment..."
                multiline
                style={styles.editInputField}
              />
              <View style={styles.editActions}>
                <Button
                  label="Cancel"
                  onPress={() => {
                    setEditing(null);
                    setEditText('');
                  }}
                  variant="outline"
                  style={styles.editCancelButton}
                />
                <Button
                  label="Save"
                  onPress={() => handleEditComment(postId, comment.id, editText)}
                  disabled={!editText.trim()}
                  style={styles.editSaveButton}
                />
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.commentContent}>{comment.content}</Text>
              <View style={styles.commentActions}>
                {isMember && canNest && (
                  <TouchableOpacity
                    style={styles.replyButton}
                    onPress={() => setReplyingTo({ type: 'comment', id: comment.id, postId })}
                  >
                    <Text style={styles.replyButtonText}>Reply</Text>
                  </TouchableOpacity>
                )}
                {isOwner && (
                  <>
                    <TouchableOpacity
                      style={styles.editDeleteButton}
                      onPress={() => {
                        setEditing({ type: 'comment', id: comment.id, postId, content: comment.content });
                        setEditText(comment.content);
                      }}
                    >
                      <Text style={styles.editDeleteButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editDeleteButton}
                      onPress={() => handleDeleteComment(postId, comment.id)}
                    >
                      <Text style={[styles.editDeleteButtonText, styles.deleteButtonText]}>Delete</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}
        </View>
        
        {/* Reply Input for this comment */}
        {isReplyingToThis && (
          <View style={{ marginLeft: (depth + 1) * 16 }}>
            <ReplyInput
              replyingTo={replyingTo}
              replyText={replyText}
              setReplyText={setReplyText}
              onCancel={() => {
                setReplyingTo(null);
                setReplyText('');
              }}
              onSubmit={handlePostComment}
              postComments={commentsByPost}
            />
          </View>
        )}
        
        {/* Render nested comments */}
        {comment.children && comment.children.length > 0 && (
          <View style={styles.commentChildren}>
            {comment.children.map((child) => (
              <CommentThread
                key={child.id}
                comment={child}
                depth={depth + 1}
                postId={postId}
                maxDepth={maxDepth}
                commentsByPost={postComments}
              />
            ))}
          </View>
        )}
      </View>
    );
  }, [isMember, userId, setReplyingTo, replyingTo, replyText, setReplyText, handlePostComment, editing, editText, setEditText, setEditing, handleEditComment, handleDeleteComment]);

  // Discussion Tab Component - memoized to prevent re-creation on every render
  const DiscussionTab = useMemo(() => {
    // Show private messaging if toggled
    if (showPrivateMessaging && isMember) {
      return (
        <View style={styles.tabContent}>
          <PrivateMessaging eventId={event?.id} members={members} />
        </View>
      );
    }

    // Separate pinned and regular messages
    const pinnedMessages = discussionMessages.filter(m => m.pinned);
    const regularMessages = discussionMessages.filter(m => !m.pinned);

    return (
      <ScrollView 
        style={styles.tabContent}
        contentContainerStyle={styles.discussionScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Pinned Notes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pinned Notes</Text>
            {isOrganizer && (
              <TouchableOpacity
                onPress={() => setShowEditPinnedNotes(true)}
                style={styles.editLink}
              >
                <Text style={styles.editLinkText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.sectionCopy}>
            {pinnedNotes || (isOrganizer ? 'Add notes about parking, what to bring, house rules, etc.' : 'No pinned notes yet.')}
          </Text>
        </View>

        {/* Pinned Messages */}
        {pinnedMessages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📌 Pinned Messages</Text>
            {pinnedMessages.map((message) => {
              const postComments = commentsByPost[message.id] || [];
              const commentTree = buildCommentTree(postComments);
              
              return (
                <View key={`pinned-${message.id}`} style={styles.postContainer}>
                  <View style={[styles.messageCard, styles.pinnedMessageCard]}>
                    <View style={styles.messageHeader}>
                      <Text style={styles.messageAuthor}>{message.userName}</Text>
                      <Text style={styles.messageTime}>
                        {formatDate(message.createdAt)}
                        {message.edited && message.updatedAt && (
                          <Text style={styles.editedLabel}> • edited {formatDate(message.updatedAt)}</Text>
                        )}
                      </Text>
                    </View>
                    
                    {editing && editing.type === 'post' && editing.id === message.id ? (
                      <View style={styles.editContainer}>
                        <Input
                          value={editText}
                          onChangeText={setEditText}
                          placeholder="Edit your post..."
                          multiline
                          style={styles.editInputField}
                        />
                        <View style={styles.editActions}>
                          <Button
                            label="Cancel"
                            onPress={() => {
                              setEditing(null);
                              setEditText('');
                            }}
                            variant="outline"
                            style={styles.editCancelButton}
                          />
                          <Button
                            label="Save"
                            onPress={() => handleEditPost(message.id, editText)}
                            disabled={!editText.trim()}
                            style={styles.editSaveButton}
                          />
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.messageContent}>{message.content}</Text>
                        <View style={styles.postActions}>
                          {isMember && (
                            <TouchableOpacity
                              style={styles.replyButton}
                              onPress={() => {
                                setReplyingTo({ type: 'post', id: message.id, postId: message.id });
                              }}
                            >
                              <Text style={styles.replyButtonText}>
                                {postComments.length > 0 ? `${postComments.length} comment${postComments.length !== 1 ? 's' : ''} • Reply` : 'Reply'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {message.userId === userId && (
                            <>
                              <TouchableOpacity
                                style={styles.editDeleteButton}
                                onPress={() => {
                                  setEditing({ type: 'post', id: message.id, postId: message.id, content: message.content });
                                  setEditText(message.content);
                                }}
                              >
                                <Text style={styles.editDeleteButtonText}>Edit</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.editDeleteButton}
                                onPress={() => handleDeletePost(message.id)}
                              >
                                <Text style={[styles.editDeleteButtonText, styles.deleteButtonText]}>Delete</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                  
                  {/* Comment Thread */}
                  {commentTree.length > 0 && (
                    <View style={styles.commentsSection}>
                      {commentTree.map((comment) => (
                        <CommentThread
                          key={comment.id}
                          comment={comment}
                          depth={0}
                          postId={message.id}
                          maxDepth={10}
                          commentsByPost={postComments}
                        />
                      ))}
                    </View>
                  )}
                  
                  {/* Reply Input for this post */}
                  {replyingTo && replyingTo.postId === message.id && replyingTo.type === 'post' && (
                    <ReplyInput
                      replyingTo={replyingTo}
                      replyText={replyText}
                      setReplyText={setReplyText}
                      onCancel={() => {
                        setReplyingTo(null);
                        setReplyText('');
                      }}
                      onSubmit={handlePostComment}
                      postComments={postComments}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Discussion Messages */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Discussion</Text>
            {isMember && (
              <TouchableOpacity
                onPress={() => setShowPrivateMessaging(!showPrivateMessaging)}
                style={styles.privateMessageButton}
              >
                <Text style={styles.privateMessageButtonText}>
                  {showPrivateMessaging ? 'Public Discussion' : 'Private Messages'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {regularMessages.length === 0 && pinnedMessages.length === 0 ? (
            <Text style={styles.sectionCopy}>
              No messages yet. Start the conversation!
            </Text>
          ) : (
            regularMessages.map((message) => {
              const postComments = commentsByPost[message.id] || [];
              const commentTree = buildCommentTree(postComments);
              
              return (
                <View key={`regular-${message.id}`} style={styles.postContainer}>
                  <View style={styles.messageCard}>
                    <View style={styles.messageHeader}>
                      <Text style={styles.messageAuthor}>{message.userName}</Text>
                      <Text style={styles.messageTime}>
                        {formatDate(message.createdAt)}
                        {message.edited && message.updatedAt && (
                          <Text style={styles.editedLabel}> • edited {formatDate(message.updatedAt)}</Text>
                        )}
                      </Text>
                    </View>
                    
                    {editing && editing.type === 'post' && editing.id === message.id ? (
                      <View style={styles.editContainer}>
                        <Input
                          value={editText}
                          onChangeText={setEditText}
                          placeholder="Edit your post..."
                          multiline
                          style={styles.editInputField}
                        />
                        <View style={styles.editActions}>
                          <Button
                            label="Cancel"
                            onPress={() => {
                              setEditing(null);
                              setEditText('');
                            }}
                            variant="outline"
                            style={styles.editCancelButton}
                          />
                          <Button
                            label="Save"
                            onPress={() => handleEditPost(message.id, editText)}
                            disabled={!editText.trim()}
                            style={styles.editSaveButton}
                          />
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.messageContent}>{message.content}</Text>
                        <View style={styles.postActions}>
                          {isMember && (
                            <TouchableOpacity
                              style={styles.replyButton}
                              onPress={() => {
                                setReplyingTo({ type: 'post', id: message.id, postId: message.id });
                              }}
                            >
                              <Text style={styles.replyButtonText}>
                                {postComments.length > 0 ? `${postComments.length} comment${postComments.length !== 1 ? 's' : ''} • Reply` : 'Reply'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {message.userId === userId && (
                            <>
                              <TouchableOpacity
                                style={styles.editDeleteButton}
                                onPress={() => {
                                  setEditing({ type: 'post', id: message.id, postId: message.id, content: message.content });
                                  setEditText(message.content);
                                }}
                              >
                                <Text style={styles.editDeleteButtonText}>Edit</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.editDeleteButton}
                                onPress={() => handleDeletePost(message.id)}
                              >
                                <Text style={[styles.editDeleteButtonText, styles.deleteButtonText]}>Delete</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                  
                  {/* Comment Thread */}
                  {commentTree.length > 0 && (
                    <View style={styles.commentsSection}>
                      {commentTree.map((comment) => (
                        <CommentThread
                          key={comment.id}
                          comment={comment}
                          depth={0}
                          postId={message.id}
                          maxDepth={10}
                          commentsByPost={postComments}
                        />
                      ))}
                    </View>
                  )}
                  
                  {/* Reply Input for this post */}
                  {replyingTo && replyingTo.postId === message.id && replyingTo.type === 'post' && (
                    <ReplyInput
                      replyingTo={replyingTo}
                      replyText={replyText}
                      setReplyText={setReplyText}
                      onCancel={() => {
                        setReplyingTo(null);
                        setReplyText('');
                      }}
                      onSubmit={handlePostComment}
                      postComments={postComments}
                    />
                  )}
                </View>
              );
            })
          )}

          {/* New Post Input */}
          {isMember && !replyingTo && (
            <View style={styles.messageInput}>
              <Input
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Start a new discussion..."
                multiline
                style={styles.messageInputField}
              />
              <Button
                label="Post"
                onPress={handlePostMessage}
                disabled={!newMessage.trim()}
                style={styles.postButton}
              />
            </View>
          )}
        </View>
      </ScrollView>
    );
  }, [
    showPrivateMessaging,
    isMember,
    event?.id,
    members,
    discussionMessages,
    pinnedNotes,
    isOrganizer,
    newMessage,
    handlePostMessage,
    commentsByPost,
    buildCommentTree,
    CommentThread,
    replyingTo,
    replyText, // Needed for ReplyInput to update, but ReplyInput is memoized so it won't cause full re-render
    handlePostComment,
    ReplyInput,
    editing,
    editText,
    setEditText,
    setEditing,
    handleEditPost,
    handleDeletePost,
    userId,
  ]);

  // ONE-TIME sync when event loads
  useEffect(() => {
    if (!event?.id || !members.length || !syncGamesForUsers) return;

    const memberIds = members
      .map(m => m.userId)
      .filter(Boolean);
    
    if (memberIds.length > 0) {
      console.log('[EventHub] Syncing games for event members (one-time)');
      syncGamesForUsers(memberIds);
    }
  }, [event?.id]); // ONLY when event ID changes

  // Sync collection for selected attendee when Browse and Request modal opens
  useEffect(() => {
    if (!showAttendeeCollectionModal || !selectedAttendeeForBrowse || !syncGamesForUsers) return;
    
    const attendeeId = selectedAttendeeForBrowse.userId;
    if (attendeeId && attendeeId !== userId) {
      console.log('[EventHub] Syncing collection for attendee:', attendeeId);
      syncGamesForUsers([attendeeId]);
    }
  }, [showAttendeeCollectionModal, selectedAttendeeForBrowse, syncGamesForUsers, userId]);

  // Enrich attendee games with category data when modal opens
  useEffect(() => {
    if (!showAttendeeCollectionModal || !selectedAttendeeForBrowse) {
      setEnrichedAttendeeGames([]);
      return;
    }

    const attendeeGames = collections[selectedAttendeeForBrowse.userId] || [];
    if (attendeeGames.length === 0) {
      setEnrichedAttendeeGames([]);
      return;
    }

    const enrichGames = async () => {
      const enriched = await Promise.all(
        attendeeGames.map(async (game) => {
          if (game.bggId) {
            try {
              const bggData = await getGameById(game.bggId);
              if (bggData) {
                const rating = bggData.average ? getStarRating(bggData.average) : 0;
                const primaryCategory = bggData.strategyGamesRank ? 'Strategy' :
                                      bggData.familyGamesRank ? 'Family' :
                                      bggData.partyGamesRank ? 'Party' :
                                      bggData.wargamesRank ? 'War' :
                                      bggData.thematicRank ? 'Thematic' :
                                      bggData.abstractsRank ? 'Abstract' :
                                      bggData.childrensGamesRank ? 'Children' :
                                      bggData.cgsRank ? 'CCG' : 'Other';
                return {
                  ...game,
                  _bggData: bggData,
                  _rating: rating,
                  _primaryCategory: primaryCategory,
                };
              }
            } catch (error) {
              console.error(`[EventHub] Error loading BGG data for game:`, error);
            }
          }
          return {
            ...game,
            _rating: 0,
            _primaryCategory: 'Other',
          };
        })
      );
      setEnrichedAttendeeGames(enriched);
    };

    enrichGames();
  }, [showAttendeeCollectionModal, selectedAttendeeForBrowse, collections]);

  // Group enriched attendee games by category
  const attendeeGamesByCategory = useMemo(() => {
    const grouped = {};
    ALL_CATEGORIES.forEach(cat => {
      grouped[cat] = [];
    });

    enrichedAttendeeGames.forEach(game => {
      const category = game._primaryCategory || 'Other';
      if (grouped[category]) {
        grouped[category].push(game);
      } else {
        grouped['Other'].push(game);
      }
    });

    // Sort each category based on user preference
    ALL_CATEGORIES.forEach(cat => {
      const games = grouped[cat] || [];
      const sortMode = attendeeCategorySortPreference[cat] || 'rating';
      
      games.sort((a, b) => {
        if (sortMode === 'rating') {
          return (b._rating || 0) - (a._rating || 0);
        } else {
          return (a.title || '').localeCompare(b.title || '');
        }
      });
    });

    return grouped;
  }, [enrichedAttendeeGames, attendeeCategorySortPreference]);

  // Toggle category sort preference for attendee games
  const toggleAttendeeCategorySort = useCallback((category) => {
    setAttendeeCategorySortPreference(prev => {
      const current = prev[category] || 'rating';
      return {
        ...prev,
        [category]: current === 'rating' ? 'title' : 'rating'
      };
    });
  }, []);

  // RSVP key - stable string (used by Schedule tab)
  const rsvpKey = useMemo(() => {
    return Object.keys(memberRSVPs)
      .sort()
      .map(uid => `${uid}:${memberRSVPs[uid]}`)
      .join('|');
  }, [memberRSVPs]);

  // Load game interests from Firestore (which games users are bringing)
  useEffect(() => {
    if (!event?.id || !db || !isMember) {
      setGameInterests({});
      return;
    }

    const gameStatusRef = db.collection('gamingGroups').doc(event.id)
      .collection('gameStatus');

    const unsubscribe = gameStatusRef.onSnapshot(
      (snapshot) => {
        const interests = {};
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const gameId = data.gameId;
          const userId = data.userId;
          const status = data.status; // 'bringing', 'want-to-play', 'open-to'

          if (!interests[gameId]) {
            interests[gameId] = {};
          }
          interests[gameId][userId] = status;
        });
        setGameInterests(interests);
      },
      (error) => {
        console.error('Error loading game interests:', error);
      }
    );

    return () => unsubscribe();
  }, [event?.id, db, isMember]);

  // Initialize selected games when modal opens (pre-select games already marked as bringing)
  useEffect(() => {
    if (showPlanningGamesModal && userId) {
      const alreadyBringing = new Set();
      // gameInterests keys are already using BGG ID or game.id as stored in Firestore
      Object.keys(gameInterests).forEach(gameId => {
        if (gameInterests[gameId]?.[userId] === 'bringing') {
          alreadyBringing.add(gameId);
        }
      });
      setSelectedGamesForBringing(alreadyBringing);
      setShowSelectedGamesList(true); // Show list by default when modal opens
    } else if (!showPlanningGamesModal) {
      setSelectedGamesForBringing(new Set());
      setPlanningGamesSearchQuery('');
      setShowSelectedGamesList(true); // Reset to show when modal closes
    }
  }, [showPlanningGamesModal, gameInterests, userId]);

  // Handler to save selected games as "bringing"
  const handleSavePlanningGames = useCallback(async () => {
    if (!userId || !event?.id || !db || !isMember) {
      Alert.alert('Error', 'Unable to save games. Please try again.');
      return;
    }

    try {
      const gameStatusRef = db.collection('gamingGroups').doc(event.id)
        .collection('gameStatus');

      // Get current games marked as bringing by this user
      const currentBringing = new Set();
      Object.keys(gameInterests).forEach(gameId => {
        if (gameInterests[gameId]?.[userId] === 'bringing') {
          currentBringing.add(gameId);
        }
      });

      // Remove games that were unselected
      const toRemove = Array.from(currentBringing).filter(
        gameId => !selectedGamesForBringing.has(gameId)
      );

      // Add games that were newly selected
      const toAdd = Array.from(selectedGamesForBringing).filter(
        gameId => !currentBringing.has(gameId)
      );

      // Batch operations
      const batch = db.batch();

      // Remove unselected games
      toRemove.forEach(gameId => {
        const docRef = gameStatusRef.doc(`${gameId}_${userId}`);
        batch.delete(docRef);
      });

      // Add newly selected games
      toAdd.forEach(gameId => {
        const docRef = gameStatusRef.doc(`${gameId}_${userId}`);
        batch.set(docRef, {
          gameId,
          userId,
          status: 'bringing',
          updatedAt: firebase.firestore.Timestamp.now(),
        });
      });

      await batch.commit();
      setShowPlanningGamesModal(false);
      Alert.alert('Success', 'Your planned games have been saved!');
    } catch (error) {
      console.error('Error saving planning games:', error);
      Alert.alert('Error', 'Failed to save games. Please try again.');
    }
  }, [userId, event?.id, db, isMember, selectedGamesForBringing, gameInterests]);

  // Create a stable key from collections to avoid infinite loops
  // Only recompute when memberIdsKey changes (not when members array reference changes)
  const collectionsKey = useMemo(() => {
    if (!collections || !memberIdsKey) return '';
    const memberIds = memberIdsKey.split(',').filter(Boolean);
    const keys = memberIds.map(uid => {
      const games = collections[uid] || [];
      const gameIds = games.map(g => (g.bggId || g.id)).filter(Boolean).sort();
      return `${uid}:${gameIds.join(',')}`;
    });
    if (userId && collections[userId]) {
      const userGames = collections[userId] || [];
      const userGameIds = userGames.map(g => (g.bggId || g.id)).filter(Boolean).sort();
      keys.push(`user:${userGameIds.join(',')}`);
    }
    return keys.join('|');
  }, [collections, memberIdsKey, userId]);

  // Stable handler for search input to prevent focus loss
  const handleSearchChange = useCallback((text) => {
    setPlanningGamesSearchQuery(text);
  }, []);

  // Handler to open game details modal
  const handleOpenGameDetails = useCallback(async (game) => {
    console.log('[EventHub] handleOpenGameDetails called with game:', game?.title, 'game object:', game);
    if (!game) {
      console.warn('[EventHub] handleOpenGameDetails called with null/undefined game');
      return;
    }
    
    // Close attendee collection modal if open (to avoid modal conflicts)
    if (showAttendeeCollectionModal) {
      console.log('[EventHub] Closing attendee collection modal');
      setShowAttendeeCollectionModal(false);
      // Small delay to ensure modal closes before opening new one
      setTimeout(() => {
        setSelectedGame(game);
        setIsGameModalOpen(true);
        console.log('[EventHub] Set selectedGame and isGameModalOpen to true');
      }, 100);
    } else {
      setSelectedGame(game);
      setIsGameModalOpen(true);
      console.log('[EventHub] Set selectedGame and isGameModalOpen to true');
    }
    
    // Load BGG data if available
    if (game.bggId) {
      try {
        const bggData = await getGameById(game.bggId);
        setSelectedGameBggData(bggData);
        console.log('[EventHub] Loaded BGG data for game:', game.title);
      } catch (error) {
        console.error('Error loading BGG data:', error);
        setSelectedGameBggData(null);
      }
    } else {
      setSelectedGameBggData(null);
    }
  }, [showAttendeeCollectionModal]);

  // Games Tab Component - Rebuilt from scratch
  // Memoize to prevent recreation on every render (which causes modal to remount)
  const GamesTab = React.useMemo(() => {
    const GamesTabComponent = () => {
      // Use the shared handleOpenGameDetails from parent scope
    // Get user's games
    const myGames = userId ? (collections[userId] || []) : [];

    // Filter games for the modal (no sorting - keep original order)
    const filteredGames = useMemo(() => {
      if (!myGames.length) return [];
      
      // Apply search filter only
      if (planningGamesSearchQuery.trim()) {
        const query = planningGamesSearchQuery.toLowerCase().trim();
        return myGames.filter(game => 
          (game.title || '').toLowerCase().includes(query)
        );
      }
      
      return myGames;
    }, [myGames, planningGamesSearchQuery]);

    // Lazy update expected games - only recompute when gameInterests changes
    const [expectedGames, setExpectedGames] = useState([]);
    const gameInterestsKeyRef = useRef('');
    
    useEffect(() => {
      // Create a stable key from gameInterests to detect actual changes
      const gameInterestsKey = JSON.stringify(gameInterests);
      
      // Only update if gameInterests actually changed
      if (gameInterestsKey === gameInterestsKeyRef.current) {
        return;
      }
      
      gameInterestsKeyRef.current = gameInterestsKey;
      
      // Skip computation if we don't have required data
      if (!event?.id || !members.length || !collections) {
        setExpectedGames([]);
        return;
      }
      
      // Compute expected games lazily
      const computeExpectedGames = async () => {
        const expected = [];
        const seenGameIds = new Set();
        
        // Helper to fetch game from Firestore
        const fetchGameFromFirestore = async (gameId, userId) => {
          if (!db || !gameId || !userId) return null;
          
          const gameIdStr = String(gameId);
          
          try {
            // First try by document ID (most direct) - convert gameId to string
            const gameDocById = await db.collection('userGames').doc(userId)
              .collection('games')
              .doc(gameIdStr)
              .get();
            
            if (gameDocById.exists) {
              const data = gameDocById.data();
              const docId = gameDocById.id;
              const title = data.title || data.gameName || null;
              if (title && title !== 'Unknown Game') {
                console.log(`[ExpectedGames] Found game by docId ${gameIdStr} for user ${userId}: ${title}`);
                return {
                  id: docId,
                  title: title,
                  bggId: data.bggId || null,
                  image: data.image || data.bggImage || null,
                  thumbnail: data.thumbnail || data.bggThumbnail || null,
                  bggThumbnail: data.bggThumbnail || data.thumbnail || null,
                  description: data.description || '',
                  yearPublished: data.yearPublished || null,
                  minPlayers: data.minPlayers || null,
                  maxPlayers: data.maxPlayers || null,
                  playingTime: data.playingTime || null,
                  bggRating: data.bggRating || null,
                  userRating: data.userRating || null,
                  numplays: data.numplays || null,
                  teachingStatus: data.teachingStatus || null,
                  addedAt: data.addedAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                  source: data.source || 'manual',
                  updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.lastUpdatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                };
              }
            }
            
            // If document ID didn't work, try by bggId (if gameId looks like a number)
            // Try both as string and as number
            const gameIdNum = !isNaN(parseInt(gameIdStr)) ? parseInt(gameIdStr) : null;
            if (gameIdNum !== null) {
              // Try as string first
              let gameDoc = await db.collection('userGames').doc(userId)
                .collection('games')
                .where('bggId', '==', gameIdStr)
                .limit(1)
                .get();
              
              // If not found, try as number
              if (gameDoc.empty) {
                gameDoc = await db.collection('userGames').doc(userId)
                  .collection('games')
                  .where('bggId', '==', gameIdNum)
                  .limit(1)
                  .get();
              }
              
              if (!gameDoc.empty) {
                const data = gameDoc.docs[0].data();
                const docId = gameDoc.docs[0].id;
                const title = data.title || data.gameName || null;
                if (title && title !== 'Unknown Game') {
                  console.log(`[ExpectedGames] Found game by bggId ${gameIdStr} for user ${userId}: ${title}`);
                  return {
                    id: docId,
                    title: title,
                    bggId: data.bggId || gameIdNum,
                    image: data.image || data.bggImage || null,
                    thumbnail: data.thumbnail || data.bggThumbnail || null,
                    bggThumbnail: data.bggThumbnail || data.thumbnail || null,
                    description: data.description || '',
                    yearPublished: data.yearPublished || null,
                    minPlayers: data.minPlayers || null,
                    maxPlayers: data.maxPlayers || null,
                    playingTime: data.playingTime || null,
                    bggRating: data.bggRating || null,
                    userRating: data.userRating || null,
                    numplays: data.numplays || null,
                    teachingStatus: data.teachingStatus || null,
                    addedAt: data.addedAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    source: data.source || 'manual',
                    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.lastUpdatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                  };
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching game ${gameIdStr} from Firestore for user ${userId}:`, error);
          }
          return null;
        };
        
        // Get all games that are marked as "bringing"
        const gamePromises = Object.keys(gameInterests).map(async (gameId) => {
          const statuses = gameInterests[gameId] || {};
          const bringingUserIds = Object.keys(statuses).filter(
            uid => statuses[uid] === 'bringing'
          );
          
          if (bringingUserIds.length === 0 || seenGameIds.has(gameId)) {
            return null;
          }
          
          // Find the game in any user's collection
          // Match by BGG ID first, then fallback to game.id
          let gameData = null;
          for (const member of members) {
            const memberGames = collections[member.userId] || [];
            const found = memberGames.find(g => {
              const gId = g.bggId || g.id;
              return gId === gameId;
            });
            if (found) {
              gameData = found;
              break;
            }
          }
          
          // Also check current user's collection
          if (!gameData && userId) {
            const userGames = collections[userId] || [];
            gameData = userGames.find(g => {
              const gId = g.bggId || g.id;
              return gId === gameId;
            });
          }
          
          // If not found in collections, fetch from Firestore (from the first user bringing it)
          if (!gameData && db && bringingUserIds.length > 0) {
            // Try to fetch from each user bringing it until we find it
            for (const fetchFromUserId of bringingUserIds) {
              gameData = await fetchGameFromFirestore(gameId, fetchFromUserId);
              if (gameData && gameData.title && gameData.title !== 'Unknown Game' && gameData.title !== `Game ${gameId}`) {
                console.log(`[ExpectedGames] Found game ${gameId} for user ${fetchFromUserId}:`, gameData.title);
                break;
              }
            }
            
            // If still no good data, try fetching all games from the user and matching
            if ((!gameData || !gameData.title || gameData.title === 'Unknown Game' || gameData.title === `Game ${gameId}`) && bringingUserIds.length > 0) {
              try {
                const fetchFromUserId = bringingUserIds[0];
                console.log(`[ExpectedGames] Fetching all games for user ${fetchFromUserId} to find gameId ${gameId}`);
                const allGamesSnapshot = await db.collection('userGames').doc(fetchFromUserId)
                  .collection('games')
                  .get();
                
                if (!allGamesSnapshot.empty) {
                  console.log(`[ExpectedGames] Found ${allGamesSnapshot.docs.length} games for user ${fetchFromUserId}`);
                  for (const doc of allGamesSnapshot.docs) {
                    const data = doc.data();
                    const docId = doc.id;
                    const dataBggId = data.bggId || null;
                    
                    // Match by document ID or bggId (convert to string for comparison)
                    const gameIdStr = String(gameId);
                    const docIdStr = String(docId);
                    const dataBggIdStr = dataBggId ? String(dataBggId) : null;
                    
                    if (docIdStr === gameIdStr || dataBggIdStr === gameIdStr) {
                      console.log(`[ExpectedGames] Matched game! docId: ${docId}, bggId: ${dataBggId}, title: ${data.title || data.gameName}`);
                      gameData = {
                        id: docId,
                        title: data.title || data.gameName || 'Unknown Game',
                        bggId: dataBggId || (typeof gameId === 'string' && !isNaN(parseInt(gameId)) ? gameId : null),
                        image: data.image || data.bggImage || null,
                        thumbnail: data.thumbnail || data.bggThumbnail || null,
                        bggThumbnail: data.bggThumbnail || data.thumbnail || null,
                        description: data.description || '',
                        yearPublished: data.yearPublished || null,
                        minPlayers: data.minPlayers || null,
                        maxPlayers: data.maxPlayers || null,
                        playingTime: data.playingTime || null,
                        bggRating: data.bggRating || null,
                        userRating: data.userRating || null,
                        numplays: data.numplays || null,
                        teachingStatus: data.teachingStatus || null,
                        addedAt: data.addedAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                        source: data.source || 'manual',
                        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.lastUpdatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                      };
                      break;
                    }
                  }
                }
              } catch (error) {
                console.error(`Error fetching all games for user ${bringingUserIds[0]}:`, error);
              }
            }
          }
          
          // Only add game if we have valid game data with a real title
          if (gameData && gameData.title && gameData.title !== 'Unknown Game' && gameData.title !== `Game ${gameId}`) {
            seenGameIds.add(gameId);
            return {
              ...gameData,
              bringingBy: bringingUserIds.map(uid => ({
                userId: uid,
                userName: uid === userId 
                  ? (user?.name || user?.email || userId) 
                  : (memberNames[uid] || uid),
              })),
            };
          } else {
            console.warn(`[ExpectedGames] Could not find valid game data for gameId ${gameId}. gameData:`, gameData);
          }
          
          return null;
        });
        
        const results = await Promise.all(gamePromises);
        const validGames = results.filter(g => g !== null);
        setExpectedGames(validGames);
      };
      
      computeExpectedGames();
    }, [gameInterests, event?.id, members, collections, userId, user, memberNames]);

    // Load proposals from Firestore
    useEffect(() => {
      if (!event?.id || !db || !isMember) return;
      
      const loadProposals = async () => {
        try {
          const proposalsSnapshot = await db.collection('gamingGroups').doc(event.id)
            .collection('nominations').get(); // Keep collection name as 'nominations' for backward compatibility
            
          const proposalsMap = new Map();
          const userProps = new Set();
          
          proposalsSnapshot.forEach(doc => {
            const data = doc.data();
            const gameId = data.gameId;
            
            if (!gameId) return;
            
            // Check if this is a proposal document (document ID is just the gameId, not gameId_userId)
            const isProposalDoc = doc.id === gameId;
            
            // Track user's proposals - check both proposal documents and rating documents
            if (data.nominatedBy === userId) {
              userProps.add(gameId);
            }
            
            // Initialize or update proposal
            if (!proposalsMap.has(gameId)) {
              // Create proposal entry - use data from proposal document if available
              proposalsMap.set(gameId, {
                gameId,
                gameName: data.gameName || 'Unknown Game',
                gameImage: data.gameImage || null,
                proposedBy: data.nominatedBy || null, // Keep field name for backward compatibility
                ratings: {},
              });
            } else {
              // Update existing proposal with better data if this is the proposal document
              // (proposal documents have more complete info than rating documents)
              if (isProposalDoc && data.nominatedBy) {
                const existing = proposalsMap.get(gameId);
                proposalsMap.set(gameId, {
                  ...existing,
                  gameName: data.gameName || existing.gameName || 'Unknown Game',
                  gameImage: data.gameImage || existing.gameImage || null,
                  proposedBy: data.nominatedBy || existing.proposedBy,
                });
              }
            }
            
            // Add rating if this is a rating document (has userId and rating)
            if (data.userId && data.rating !== undefined) {
              const proposal = proposalsMap.get(gameId);
              if (proposal) {
                proposal.ratings[data.userId] = data.rating;
                // Also ensure proposedBy is set from rating document if not already set
                if (!proposal.proposedBy && data.nominatedBy) {
                  proposal.proposedBy = data.nominatedBy;
                }
                // Update game info from rating document if missing
                if (!proposal.gameName || proposal.gameName === 'Unknown Game') {
                  proposal.gameName = data.gameName || proposal.gameName || 'Unknown Game';
                }
                if (!proposal.gameImage) {
                  proposal.gameImage = data.gameImage || proposal.gameImage || null;
                }
              }
            }
          });
          
          // Filter out any proposals without a proposedBy (shouldn't happen, but safety check)
          const allProposals = Array.from(proposalsMap.values());
          const validProposals = allProposals.filter(p => p.proposedBy);
          const invalidProposals = allProposals.filter(p => !p.proposedBy);
          
          if (invalidProposals.length > 0) {
            console.warn(`[Gameplan] Found ${invalidProposals.length} proposals without proposedBy:`, invalidProposals);
          }
          
          console.log(`[Gameplan] Loaded ${validProposals.length} proposed games (out of ${allProposals.length} total) for event ${event.id}, userId: ${userId}`);
          setProposedGames(validProposals);
          setUserProposals(userProps);
        } catch (error) {
          console.error('Error loading proposals:', error);
          // Set empty arrays on error to prevent stale data
          setProposedGames([]);
          setUserProposals(new Set());
        }
      };

      loadProposals();
    }, [event?.id, db, isMember, userId]);

    const toggleGameSelection = (gameId) => {
      setSelectedGamesForBringing(prev => {
        const next = new Set(prev);
        if (next.has(gameId)) {
          next.delete(gameId);
        } else {
          next.add(gameId);
        }
        return next;
      });
    };

    // Get available event dates for date selector
    const eventDates = useMemo(() => {
      if (!event) return [];
      
      if (event.eventDates && Array.isArray(event.eventDates)) {
        return event.eventDates.map((ed, index) => {
          const date = safeParseDate(ed.date);
          return {
            index,
            date: date && !isNaN(date.getTime()) ? date : null,
            dateString: ed.date,
            startTime: safeParseDate(ed.startTime),
            endTime: safeParseDate(ed.endTime),
            location: ed.location || ed.generalLocation || event.location || event.generalLocation || '',
          };
        }).filter(ed => ed.date !== null);
      } else if (event.scheduledFor) {
        const date = safeParseDate(event.scheduledFor);
        if (date && !isNaN(date.getTime())) {
          return [{
            index: 0,
            date,
            dateString: event.scheduledFor,
            startTime: date,
            endTime: date,
            location: event.location || event.generalLocation || '',
          }];
        }
      }
      
      return [];
    }, [event]);

    // Auto-select first date if available and none selected
    useEffect(() => {
      if (eventDates.length > 0 && selectedGameNightDateIndex === null) {
        setSelectedGameNightDateIndex(0);
      }
    }, [eventDates.length, selectedGameNightDateIndex]);

    // Get confirmed attendees for selected date (those with rsvpStatus === 'going')
    const confirmedAttendees = useMemo(() => {
      if (selectedGameNightDateIndex === null) return [];
      
      return members.filter(member => {
        const rsvpStatus = memberRSVPs[member.userId];
        // Consider 'going' as confirmed. For now, RSVPs are global, not per-date
        return rsvpStatus === 'going';
      });
    }, [members, memberRSVPs, selectedGameNightDateIndex]);

    // Aggregate games from confirmed attendees with owner info
    const aggregatedGames = useMemo(() => {
      if (selectedGameNightDateIndex === null || confirmedAttendees.length === 0) return [];
      
      const gamesMap = new Map(); // Key: gameId (bggId or id), Value: { game, owners: [names] }
      
      confirmedAttendees.forEach(attendee => {
        const attendeeId = attendee.userId;
        const attendeeName = memberNames[attendeeId] || attendeeId;
        const attendeeGames = collections[attendeeId] || [];
        
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
      return Array.from(gamesMap.values()).map(item => ({
        ...item.game,
        _owners: item.owners, // Store owners as a special field
      }));
    }, [confirmedAttendees, collections, memberNames, selectedGameNightDateIndex]);

    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
        {/* Browse and Propose Section */}
        {isMember && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse and Propose</Text>
            <Text style={styles.sectionCopy}>
              Select a game night date to see all games owned by confirmed attendees. Propose up to 5 games you'd like to play.
            </Text>
            
            {/* Date Selector */}
            {eventDates.length > 0 ? (
              <>
                <Text style={styles.dateSelectorLabel}>Select Game Night Date:</Text>
                <View style={styles.dateSelectorContainer}>
                  {eventDates.map((ed, index) => {
                    const isSelected = selectedGameNightDateIndex === index;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.dateSelectorButton,
                          isSelected && styles.dateSelectorButtonActive,
                        ]}
                        onPress={() => setSelectedGameNightDateIndex(index)}
                      >
                        <Text
                          style={[
                            styles.dateSelectorButtonText,
                            isSelected && styles.dateSelectorButtonTextActive,
                          ]}
                        >
                          {ed.date ? formatDate(ed.date.toISOString()) : 'Invalid Date'}
                        </Text>
                        {ed.startTime && (
                          <Text
                            style={[
                              styles.dateSelectorButtonTime,
                              isSelected && styles.dateSelectorButtonTimeActive,
                            ]}
                          >
                            {formatTime(ed.startTime.toISOString())}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Aggregated Games Display */}
                {selectedGameNightDateIndex !== null && (
                  <>
                    {confirmedAttendees.length === 0 ? (
                      <Text style={styles.sectionCopy}>
                        No confirmed attendees yet. Ask members to RSVP!
                      </Text>
                    ) : aggregatedGames.length === 0 ? (
                      <Text style={styles.sectionCopy}>
                        No games found from confirmed attendees for this date.
                      </Text>
                    ) : (
                      <>
                        <Text style={styles.aggregatedGamesHeader}>
                          {aggregatedGames.length} {aggregatedGames.length === 1 ? 'game' : 'games'} from {confirmedAttendees.length} {confirmedAttendees.length === 1 ? 'attendee' : 'attendees'}
                        </Text>
                        <View style={styles.aggregatedGamesGrid}>
                          {aggregatedGames.map((game, idx) => {
                            const gameId = game.bggId || game.id;
                            const isProposedByUser = userProposals.has(gameId);
                            const isProposedByAnyone = proposedGames.some(n => n.gameId === gameId);
                            const canPropose = userProposals.size < 5 || isProposedByUser;
                            const owners = game._owners || [];
                            
                            return (
                              <View key={gameId || `game-${idx}`} style={styles.aggregatedGameCardWrapper}>
                                <Pressable
                                  onPress={() => {
                                    handleOpenGameDetails(game);
                                  }}
                                  style={styles.selectableGameCardWrapper}
                                  activeOpacity={0.7}
                                >
                                  <GameCard 
                                    game={game} 
                                    preloadedBggData={game._bggData}
                                    disableModal={true}
                                  />
                                  {/* Owner Names */}
                                  {owners.length > 0 && (
                                    <View style={styles.gameOwnerNames}>
                                      <Text style={styles.gameOwnerNamesText} numberOfLines={2}>
                                        {owners.join(', ')}
                                      </Text>
                                    </View>
                                  )}
                                </Pressable>
                                {!isProposedByUser && canPropose && (
                                  <TouchableOpacity
                                    style={styles.proposeGameButton}
                                    onPress={async () => {
                                      if (!event?.id || !db || !userId) return;
                                      
                                      if (userProposals.size >= 5) {
                                        Alert.alert('Limit Reached', 'You can only propose up to 5 games. Remove a proposal first to propose another game.');
                                        return;
                                      }
                                      
                                      try {
                                        const proposalDoc = {
                                          gameId,
                                          gameName: game.title || 'Unknown Game',
                                          gameImage: game.image || game.thumbnail || null,
                                          nominatedBy: userId,
                                          createdAt: firebase.firestore.Timestamp.now(),
                                        };
                                        
                                        await db.collection('gamingGroups').doc(event.id)
                                          .collection('nominations')
                                          .doc(gameId)
                                          .set(proposalDoc, { merge: true });
                                        
                                        setUserProposals(prev => new Set([...prev, gameId]));
                                        setProposedGames(prev => [...prev, {
                                          gameId,
                                          gameName: proposalDoc.gameName,
                                          gameImage: proposalDoc.gameImage,
                                          proposedBy: userId,
                                          ratings: {},
                                        }]);
                                        
                                        Alert.alert('Success', 'Game proposed successfully!');
                                      } catch (error) {
                                        console.error('Error proposing game:', error);
                                        Alert.alert('Error', 'Failed to propose game. Please try again.');
                                      }
                                    }}
                                  >
                                    <Text style={styles.proposeGameButtonText}>Propose</Text>
                                  </TouchableOpacity>
                                )}
                                {isProposedByUser && (
                                  <View style={styles.proposedBadge}>
                                    <Text style={styles.proposedBadgeText}>Proposed</Text>
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </>
                    )}
                  </>
                )}
              </>
            ) : (
              <Text style={styles.sectionCopy}>
                No game night dates scheduled yet. Ask the organizer to add dates!
              </Text>
            )}
          </View>
        )}

        {/* Proposed to Play Next Section */}
        {isMember && proposedGames.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Proposed to Play Next</Text>
            <Text style={styles.sectionCopy}>
              Games proposed for the next game night. Rate each game to help decide what to play.
            </Text>
            {proposedGames.map((proposal) => {
              const gameId = proposal.gameId;
              const userRating = proposal.ratings?.[userId] ?? null;
              
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
                      <Text style={styles.proposedGameTitle}>{proposal.gameName}</Text>
                      <Text style={styles.proposedGameSubtext}>
                        Proposed by {memberNames[proposal.proposedBy] || proposal.proposedBy}
                                    </Text>
                                  </View>
                              </View>
                  
                  {/* Rating Buttons */}
                  <View style={styles.ratingButtonsContainer}>
                    {[
                      { value: 3, label: '⭐⭐⭐', text: 'I really want to play this game' },
                      { value: 2, label: '⭐⭐', text: 'I want to play this game' },
                      { value: 1, label: '⭐', text: 'I am fine with playing this game' },
                      { value: 0, label: '⚪', text: 'I am not sure about this game' },
                      { value: -1, label: '👎', text: 'I would rather not play this game' },
                    ].map(({ value, label, text }) => (
                    <TouchableOpacity
                        key={value}
                        style={[
                          styles.ratingButton,
                          userRating === value && styles.ratingButtonActive
                        ]}
                        onPress={async () => {
                          if (!event?.id || !db || !userId) return;
                          
                          // If clicking the same rating, allow clearing it by setting to null
                          const newRating = userRating === value ? null : value;
                          
                          try {
                            if (newRating === null) {
                              // Clear the rating by deleting the document
                              await db.collection('gamingGroups').doc(event.id)
                                .collection('nominations')
                                .doc(`${gameId}_${userId}`)
                                .delete();
                              
                              // Update local state to remove rating
                              setProposedGames(prev => prev.map(n => {
                                if (n.gameId === gameId) {
                                  const newRatings = { ...n.ratings };
                                  delete newRatings[userId];
                                  return {
                                    ...n,
                                    ratings: newRatings
                                  };
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
                                rating: newRating,
                                nominatedBy: proposal.proposedBy, // Keep field name for backward compatibility
                                updatedAt: firebase.firestore.Timestamp.now(),
                              };
                              
                              await db.collection('gamingGroups').doc(event.id)
                                .collection('nominations')
                                .doc(`${gameId}_${userId}`)
                                .set(ratingDoc, { merge: true });
                              
                              // Update local state
                              setProposedGames(prev => prev.map(n => {
                                if (n.gameId === gameId) {
                                  return {
                                    ...n,
                                    ratings: { ...n.ratings, [userId]: newRating }
                                  };
                                }
                                return n;
                              }));
                            }
                        } catch (error) {
                            console.error('Error saving rating:', error);
                            Alert.alert('Error', 'Failed to save rating. Please try again.');
                          }
                        }}
                      >
                        <View style={styles.ratingButtonContent}>
                          <Text style={[
                            styles.ratingButtonLabel,
                            userRating === value && styles.ratingButtonLabelActive
                          ]}>
                            {label}
                          </Text>
                          <Text style={[
                            styles.ratingButtonText,
                            userRating === value && styles.ratingButtonTextActive
                          ]}>
                            {text}
                          </Text>
                        </View>
                    </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}


        {/* Planning Games Modal */}
        <Modal
          isOpen={showPlanningGamesModal}
          onClose={() => setShowPlanningGamesModal(false)}
          title="Add games"
          fullScreen={true}
        >
          <View style={styles.fullScreenModalContent}>
            {/* Search Box */}
            <View style={styles.modalFieldContainer}>
              <Input
                key="planning-games-search"
                placeholder="Search games by title..."
                value={planningGamesSearchQuery}
                onChangeText={handleSearchChange}
                style={styles.modalInput}
                autoCapitalize="none"
              />
              </View>


            {/* Games Grid */}
            {filteredGames.length === 0 ? (
              <View style={styles.emptyStateContainer}>
            <Text style={styles.sectionCopy}>
                  {planningGamesSearchQuery.trim() 
                    ? 'No games found matching your search.' 
                    : 'No games in your collection yet.'}
            </Text>
            <Button
              onPress={() => setShowPlanningGamesModal(false)}
              label="Back"
              style={styles.emptyStateBackButton}
            />
              </View>
          ) : (
              <FlatList
                data={filteredGames}
                keyExtractor={(item) => {
                  const key = item.bggId || item.id;
                  return key ? key.toString() : `game-${Math.random()}`;
                }}
                renderItem={({ item }) => {
                  const gameId = item.bggId || item.id;
                  const isSelected = selectedGamesForBringing.has(gameId);
                  return (
                    <View style={styles.selectableGameCardWrapper}>
                      <Pressable
                        onPress={() => {
                          console.log('[EventHub] Toggling game selection for:', gameId);
                          toggleGameSelection(gameId);
                        }}
                        style={{ width: '100%' }}
                      >
                        <GameCard 
                          game={item} 
                          preloadedBggData={item._bggData}
                          disableModal={true}
                        />
                      </Pressable>
                      {isSelected && (
                        <View style={styles.selectedOverlay}>
                          <Text style={styles.selectedCheckmark}>✓</Text>
                        </View>
                      )}
                      {isSelected && (
                        <View style={styles.selectedBorder} />
                      )}
                    </View>
                  );
                }}
                numColumns={3}
                columnWrapperStyle={styles.gameCardRow}
                contentContainerStyle={styles.gameCardContainer}
                scrollEnabled={true}
                style={styles.fullScreenGamesList}
              />
            )}

            {/* Submit Button - Fixed at bottom */}
            <View style={styles.modalButtonContainer}>
              <Button
                onPress={handleSavePlanningGames}
                label="Add games"
                style={styles.modalButton}
                disabled={selectedGamesForBringing.size === 0}
              />
        </View>
          </View>
        </Modal>
      </ScrollView>
    );
    };
    return GamesTabComponent;
  }, [userId, collections, planningGamesSearchQuery, selectedGamesForBringing, showPlanningGamesModal, isMember, gameInterests, event?.id, event, members, user, memberNames, memberRSVPs, selectedGameNightDateIndex, proposedGames, userProposals, handleSearchChange, handleSavePlanningGames, handleOpenGameDetails]);


  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{event.name || 'MeepleUp Hub'}</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === TABS.EVENT && styles.tabActive]}
          onPress={() => setActiveTab(TABS.EVENT)}
        >
          <Text style={[styles.tabText, activeTab === TABS.EVENT && styles.tabTextActive]}>
            Event
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === TABS.GAMES && styles.tabActive]}
          onPress={() => setActiveTab(TABS.GAMES)}
        >
          <Text style={[styles.tabText, activeTab === TABS.GAMES && styles.tabTextActive]}>
            Gameplan
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === TABS.DISCUSSION && styles.tabActive]}
          onPress={() => setActiveTab(TABS.DISCUSSION)}
        >
          <Text style={[styles.tabText, activeTab === TABS.DISCUSSION && styles.tabTextActive]}>
            Discussion
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === TABS.EVENT && <EventTab />}
      {activeTab === TABS.GAMES && <GamesTab />}
      {activeTab === TABS.DISCUSSION && DiscussionTab}

      {/* Game Details Modal */}
      {selectedGame && (
        <GameDetailsModal
          game={selectedGame}
          isOpen={isGameModalOpen}
          onClose={() => {
            console.log('[EventHub] Closing game details modal');
            setIsGameModalOpen(false);
            setSelectedGame(null);
            setSelectedGameBggData(null);
          }}
          preloadedBggData={selectedGameBggData}
          eventMembers={isMember ? members : null}
          memberNames={memberNames}
          eventId={event?.id}
        />
      )}

      {/* Attendee Collection Modal */}
      <Modal
        isOpen={showAttendeeCollectionModal}
        onClose={() => {
          setShowAttendeeCollectionModal(false);
          setSelectedAttendeeForBrowse(null);
          setAttendeeCollectionPage(1);
        }}
        title={selectedAttendeeForBrowse?.userName || 'Collection'}
        fullScreen={true}
      >
        {selectedAttendeeForBrowse && (() => {
          const attendeeGames = collections[selectedAttendeeForBrowse.userId] || [];
          
          return (
            <View style={styles.fullScreenModalContent}>
              {/* Attendee Header */}
              <View style={styles.attendeeModalHeader}>
                {selectedAttendeeForBrowse.avatarUrl ? (
                  <Image 
                    source={{ uri: selectedAttendeeForBrowse.avatarUrl }} 
                    style={styles.attendeeModalAvatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.attendeeModalAvatarPlaceholder}>
                    <Text style={styles.attendeeModalAvatarInitial}>
                      {selectedAttendeeForBrowse.userName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.attendeeModalInfo}>
                <Text style={styles.attendeeModalName}>
                  {selectedAttendeeForBrowse.userName}'s Collection
                </Text>
                <Text style={styles.attendeeModalGameCount}>
                  {attendeeGames.length} {attendeeGames.length === 1 ? 'game' : 'games'}
                </Text>
                <Text style={styles.attendeeModalHint}>
                    Tap any game to view details. Use "Propose Game" to propose up to 5 games for the next game night.
                </Text>
                </View>
              </View>

              {/* Games by Category */}
              {enrichedAttendeeGames.length === 0 ? (
                <View style={styles.emptyStateContainer}>
                  <Text style={styles.sectionCopy}>
                    No games in this collection yet.
                  </Text>
                </View>
              ) : (
                <ScrollView 
                  style={styles.fullScreenGamesList}
                  contentContainerStyle={styles.categoryContent}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  {ALL_CATEGORIES.map((category) => {
                    const games = attendeeGamesByCategory[category] || [];
                    const sortMode = attendeeCategorySortPreference[category] || 'rating';
                    return (
                      <View key={category} style={styles.categorySection}>
                        <View style={styles.categoryHeader}>
                          <Text style={styles.categoryTitle}>
                            {category} ({games.length})
                          </Text>
                          {games.length > 0 && (
                            <View style={styles.categorySortToggleContainer}>
                              <Pressable
                                style={[styles.categorySortToggleOption, sortMode === 'rating' && styles.categorySortToggleOptionActive]}
                                onPress={() => setAttendeeCategorySortPreference(prev => ({ ...prev, [category]: 'rating' }))}
                              >
                                <Text style={[styles.categorySortToggleOptionText, sortMode === 'rating' && styles.categorySortToggleOptionTextActive]}>
                                  ⭐ Rating
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[styles.categorySortToggleOption, sortMode === 'title' && styles.categorySortToggleOptionActive]}
                                onPress={() => setAttendeeCategorySortPreference(prev => ({ ...prev, [category]: 'title' }))}
                              >
                                <Text style={[styles.categorySortToggleOptionText, sortMode === 'title' && styles.categorySortToggleOptionTextActive]}>
                                  A-Z
                                </Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                        {games.length > 0 ? (
                          <View style={styles.categoryGamesGrid}>
                            {games.map((game, index) => {
                              const gameId = game.bggId || game.id;
                              const isProposedByUser = userProposals.has(gameId);
                              const isProposedByAnyone = proposedGames.some(n => n.gameId === gameId);
                              const canPropose = userProposals.size < 5 || isProposedByUser;
                              
                              return (
                                <View key={game.bggId || game.id || `game-${index}`} style={styles.gameCardWithPropose}>
                              <Pressable
                                onPress={() => {
                                  console.log('[EventHub] Opening game details for:', game.title);
                                  // Add owner info to the game object so GameDetailsModal can identify the owner
                                  const gameWithOwner = {
                                    ...game,
                                    _ownerId: selectedAttendeeForBrowse.userId,
                                    _ownerName: selectedAttendeeForBrowse.userName,
                                  };
                                  handleOpenGameDetails(gameWithOwner);
                                }}
                                style={styles.selectableGameCardWrapper}
                                activeOpacity={0.7}
                              >
                                <GameCard 
                                  game={game} 
                                  preloadedBggData={game._bggData}
                                  disableModal={true}
                                />
                              </Pressable>
                                  {!isProposedByUser && canPropose && (
                                    <TouchableOpacity
                                      style={styles.proposeGameButton}
                                      onPress={async () => {
                                        if (!event?.id || !db || !userId) return;
                                        
                                        if (userProposals.size >= 5) {
                                          Alert.alert('Limit Reached', 'You can only propose up to 5 games. Remove a proposal first to propose another game.');
                                          return;
                                        }
                                        
                                        try {
                                          const proposalDoc = {
                                            gameId,
                                            gameName: game.title || 'Unknown Game',
                                            gameImage: game.image || game.thumbnail || null,
                                            nominatedBy: userId, // Keep field name for backward compatibility
                                            createdAt: firebase.firestore.Timestamp.now(),
                                          };
                                          
                                          await db.collection('gamingGroups').doc(event.id)
                                            .collection('nominations')
                                            .doc(gameId)
                                            .set(proposalDoc, { merge: true });
                                          
                                          // Update local state
                                          setUserProposals(prev => new Set([...prev, gameId]));
                                          setProposedGames(prev => {
                                            const exists = prev.some(n => n.gameId === gameId);
                                            if (exists) return prev;
                                            return [...prev, {
                                              gameId,
                                              gameName: game.title || 'Unknown Game',
                                              gameImage: game.image || game.thumbnail || null,
                                              proposedBy: userId,
                                              ratings: {},
                                            }];
                                          });
                                          
                                          Alert.alert('Game Proposed', `${game.title || 'Game'} has been proposed!`);
                                        } catch (error) {
                                          console.error('Error proposing game:', error);
                                          Alert.alert('Error', 'Failed to propose game. Please try again.');
                                        }
                                      }}
                                    >
                                      <Text style={styles.proposeGameButtonText}>Propose Game</Text>
                                    </TouchableOpacity>
                                  )}
                                  {isProposedByUser && (
                                    <View style={styles.proposedBadge}>
                                      <Text style={styles.proposedBadgeText}>✓ You Proposed This</Text>
                                    </View>
                                  )}
                                  {isProposedByAnyone && !isProposedByUser && (
                                    <View style={styles.proposedByOthersBadge}>
                                      <Text style={styles.proposedByOthersBadgeText}>Already Proposed</Text>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        ) : (
                          <Text style={styles.emptyCategoryText}>No games in this category</Text>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          );
        })()}
      </Modal>

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

      {/* Edit Schedule Modal */}
      {/* RSVP Management Modal */}
      {showRSVPManagement && (
        <Modal
          isOpen={showRSVPManagement}
          onClose={() => setShowRSVPManagement(false)}
          title="RSVP Management"
          style={styles.fullScreenModal}
        >
          <RSVPManagementScreen
            eventId={eventId}
            onClose={() => setShowRSVPManagement(false)}
          />
        </Modal>
      )}

      {/* RSVP Management Modal */}
      {showRSVPManagement && eventId && (
        <Modal
          isOpen={showRSVPManagement}
          onClose={() => setShowRSVPManagement(false)}
          title="RSVP Management"
          fullScreen={true}
        >
          <RSVPManagementScreen
            eventId={eventId}
            onClose={() => setShowRSVPManagement(false)}
          />
        </Modal>
      )}

      <Modal
        isOpen={showEditSchedule}
        onClose={() => setShowEditSchedule(false)}
        title="Edit Schedule"
        fullScreen={true}
      >
        <ScrollView 
          ref={editScheduleScrollRef}
          style={styles.modalContent} 
          contentContainerStyle={styles.modalScrollContent}
        >
          {/* Calendar Date Picker */}
          <View style={styles.modalFieldContainer}>
            <Text style={styles.fieldLabel}>Select Event Dates</Text>
            <Text style={styles.fieldHint}>
              Scroll through the calendar to see the next 12 months. Long-press a date to select it (highlighted in green). Tap a selected date to view its details.
            </Text>
            <CalendarDatePicker
              selectedDates={scheduleForm.selectedDates}
              onDatesChange={handleDatesChange}
              minDate={new Date()}
              usualStartTime={scheduleForm.usualStartTime}
              usualEndTime={scheduleForm.usualEndTime}
              onDateTimeEdit={(dateIndex, timeType) => {
                // When user taps on a time in the calendar, open the time picker
                setShowTimePicker({ type: timeType || 'start', dateIndex });
              }}
              onDatePress={(dateIndex, dateInfo) => {
                // When user taps a selected date in the calendar, scroll to its details in the Edit Schedule modal
                if (scheduleForm.selectedDates && scheduleForm.selectedDates[dateIndex]) {
                  const dateItem = scheduleForm.selectedDates[dateIndex];
                  
                  // Scroll to this date's details section in the modal
                  setTimeout(() => {
                    const position = editScheduleDatePositions.current[dateIndex];
                    if (position !== undefined && editScheduleScrollRef.current) {
                      editScheduleScrollRef.current.scrollTo({
                        y: Math.max(0, position - 20), // Add some padding from top
                        animated: true,
                      });
                    }
                  }, 100);
                }
              }}
            />
          </View>

          {/* Location Fields for Each Date */}
          {scheduleForm.selectedDates.length > 0 && (
            <View style={styles.modalFieldContainer}>
              <Text style={styles.fieldLabel}>Location for Each Date</Text>
              <Text style={styles.fieldHint}>
                You can specify different locations for each date, or leave blank to use the default location.
              </Text>
              {scheduleForm.selectedDates.map((dateItem, index) => {
                const dateStr = dateItem.date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                return (
                  <View 
                    key={index} 
                    style={styles.dateLocationContainer}
                    onLayout={(event) => {
                      const { y } = event.nativeEvent.layout;
                      editScheduleDatePositions.current[index] = y;
                    }}
                  >
                    <Text style={styles.dateLocationLabel}>{dateStr}</Text>
                    <Input
                      value={dateItem.location || ''}
                      onChangeText={(text) => {
                        const updatedDates = [...scheduleForm.selectedDates];
                        updatedDates[index] = { ...updatedDates[index], location: text };
                        setScheduleForm({ ...scheduleForm, selectedDates: updatedDates });
                      }}
                      placeholder={`Location (default: ${scheduleForm.location || 'not set'})`}
                      style={styles.modalInput}
                    />
                    <Input
                      value={dateItem.address || dateItem.exactLocation || ''}
                      onChangeText={(text) => {
                        const updatedDates = [...scheduleForm.selectedDates];
                        updatedDates[index] = { ...updatedDates[index], address: text, exactLocation: text };
                        setScheduleForm({ ...scheduleForm, selectedDates: updatedDates });
                      }}
                      placeholder={`Address (default: ${scheduleForm.address || scheduleForm.exactLocation || 'not set'})`}
                      style={styles.modalInput}
                    />
                    <Input
                      value={dateItem.note || ''}
                      onChangeText={(text) => {
                        const updatedDates = [...scheduleForm.selectedDates];
                        updatedDates[index] = { ...updatedDates[index], note: text };
                        setScheduleForm({ ...scheduleForm, selectedDates: updatedDates });
                      }}
                      placeholder="Optional note for this date"
                      multiline
                      style={styles.modalInput}
                    />
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.modalActions}>
            <Button
              label="Save"
              onPress={handleEditSchedule}
              style={styles.modalButton}
            />
            <Button
              label="Cancel"
              onPress={() => setShowEditSchedule(false)}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </ScrollView>

        {/* Time Picker Modal */}
        {showTimePicker.type && (
          Platform.OS === 'ios' ? (
            <Modal
              isOpen={true}
              onClose={() => setShowTimePicker({ type: null, dateIndex: null })}
              title={
                showTimePicker.type === 'usualStart' ? 'Usual Start Time' :
                showTimePicker.type === 'usualEnd' ? 'Usual End Time' :
                showTimePicker.type === 'start' ? 'Start Time' :
                'End Time'
              }
            >
              <View style={styles.timePickerModalContent}>
                <DateTimePicker
                  value={
                    showTimePicker.type === 'usualStart' ? scheduleForm.usualStartTime :
                    showTimePicker.type === 'usualEnd' ? scheduleForm.usualEndTime :
                    showTimePicker.dateIndex !== null && scheduleForm.selectedDates[showTimePicker.dateIndex]
                      ? (showTimePicker.type === 'start' 
                          ? scheduleForm.selectedDates[showTimePicker.dateIndex].startTime
                          : scheduleForm.selectedDates[showTimePicker.dateIndex].endTime)
                      : new Date()
                  }
                  mode="time"
                  display="spinner"
                  is24Hour={false}
                  onChange={(event, date) => {
                    if (date) {
                      handleTimeChange(event, date, showTimePicker.type, showTimePicker.dateIndex);
                    }
                  }}
                  style={{ width: '100%', height: 200 }}
                />
                <View style={styles.iosPickerActions}>
                  <Button
                    label="Done"
                    onPress={() => setShowTimePicker({ type: null, dateIndex: null })}
                    style={styles.modalButton}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            showTimePicker.type && (
              <DateTimePicker
                value={
                  showTimePicker.type === 'usualStart' ? scheduleForm.usualStartTime :
                  showTimePicker.type === 'usualEnd' ? scheduleForm.usualEndTime :
                  showTimePicker.dateIndex !== null && scheduleForm.selectedDates[showTimePicker.dateIndex]
                    ? (showTimePicker.type === 'start' 
                        ? scheduleForm.selectedDates[showTimePicker.dateIndex].startTime
                        : scheduleForm.selectedDates[showTimePicker.dateIndex].endTime)
                    : new Date()
                }
                mode="time"
                display="default"
                is24Hour={false}
                onChange={(event, date) => {
                  handleTimeChange(event, date, showTimePicker.type, showTimePicker.dateIndex);
                }}
              />
            )
          )
        )}
      </Modal>

      {/* Default Time Picker Modal */}
      {showDefaultTimePicker.type && (
        Platform.OS === 'ios' ? (
          <Modal
            isOpen={true}
            onClose={() => setShowDefaultTimePicker({ type: null })}
            title={
              showDefaultTimePicker.type === 'usualStart' ? 'Default Start Time' :
              'Default End Time'
            }
          >
            <View style={styles.timePickerModalContent}>
              <DateTimePicker
                value={
                  showDefaultTimePicker.type === 'usualStart' 
                    ? defaultTimeForm.usualStartTime
                    : defaultTimeForm.usualEndTime
                }
                mode="time"
                display="spinner"
                is24Hour={false}
                onChange={(event, date) => {
                  if (date) {
                    handleDefaultTimeChange(event, date, showDefaultTimePicker.type);
                  }
                }}
                style={{ width: '100%', height: 200 }}
              />
              <View style={styles.iosPickerActions}>
                <Button
                  label="Done"
                  onPress={() => setShowDefaultTimePicker({ type: null })}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </Modal>
        ) : (
          showDefaultTimePicker.type && (
            <DateTimePicker
              value={
                showDefaultTimePicker.type === 'usualStart' 
                  ? defaultTimeForm.usualStartTime
                  : defaultTimeForm.usualEndTime
              }
              mode="time"
              display="default"
              is24Hour={false}
              onChange={(event, date) => {
                handleDefaultTimeChange(event, date, showDefaultTimePicker.type);
              }}
            />
          )
        )
      )}

      {/* Date Detail Modal */}
      <Modal
        isOpen={selectedDateDetail !== null}
        onClose={() => setSelectedDateDetail(null)}
        title="Event Date Details"
      >
        {selectedDateDetail && (
          <View style={styles.dateDetailModalContent}>
            <View style={styles.dateDetailSection}>
              <Text style={styles.dateDetailLabel}>Date</Text>
              <Text style={styles.dateDetailValue}>
                {formatDate(selectedDateDetail.date.toISOString())}
              </Text>
            </View>

            {selectedDateDetail.startTime && !isNaN(selectedDateDetail.startTime.getTime()) && (
              <View style={styles.dateDetailSection}>
                <Text style={styles.dateDetailLabel}>Start Time</Text>
                <Text style={styles.dateDetailValue}>
                  {formatTime(selectedDateDetail.startTime.toISOString())}
                </Text>
              </View>
            )}

            {selectedDateDetail.endTime && !isNaN(selectedDateDetail.endTime.getTime()) && (
              <View style={styles.dateDetailSection}>
                <Text style={styles.dateDetailLabel}>End Time</Text>
                <Text style={styles.dateDetailValue}>
                  {formatTime(selectedDateDetail.endTime.toISOString())}
                </Text>
              </View>
            )}

            {selectedDateDetail.location && (
              <View style={styles.dateDetailSection}>
                <Text style={styles.dateDetailLabel}>Location</Text>
                <Text style={styles.dateDetailValue}>
                  {selectedDateDetail.location}
                </Text>
              </View>
            )}

            {isMember && (selectedDateDetail.address || selectedDateDetail.exactLocation) && (
              <View style={styles.dateDetailSection}>
                <Text style={styles.dateDetailLabel}>Address</Text>
                <Text style={styles.dateDetailValue}>
                  {selectedDateDetail.address || selectedDateDetail.exactLocation}
                </Text>
              </View>
            )}

            {!selectedDateDetail.location && !selectedDateDetail.address && !selectedDateDetail.exactLocation && (
              <View style={styles.dateDetailSection}>
                <Text style={styles.dateDetailValue}>
                  Location to be announced
                </Text>
              </View>
            )}

            {selectedDateDetail.note && (
              <View style={styles.dateDetailSection}>
                <Text style={styles.dateDetailLabel}>Note</Text>
                <Text style={styles.dateDetailValue}>
                  {selectedDateDetail.note}
                </Text>
              </View>
            )}

            <View style={styles.dateDetailActions}>
              <Button
                label="Close"
                onPress={() => setSelectedDateDetail(null)}
                style={styles.modalButton}
              />
            </View>
          </View>
        )}
      </Modal>

      {/* Edit Pinned Notes Modal */}
      <Modal
        isOpen={showEditPinnedNotes}
        onClose={() => setShowEditPinnedNotes(false)}
        title="Edit Pinned Notes"
      >
        <View style={styles.modalContent}>
          <View style={styles.modalFieldContainer}>
            <Input
              value={pinnedNotes}
              onChangeText={setPinnedNotes}
              placeholder="Add notes about parking, what to bring, house rules, etc."
              multiline
              numberOfLines={6}
              style={styles.modalInput}
            />
          </View>
          <View style={styles.modalActions}>
            <Button
              label="Save"
              onPress={async () => {
                try {
                  // Update local state
                  await updateEvent(event.id, { description: pinnedNotes });
                  
                  // Update Firestore if available
                  if (db && event.id) {
                    await db.collection('gamingGroups').doc(event.id).update({
                      description: pinnedNotes,
                      updatedAt: firebase.firestore.Timestamp.now(),
                    });
                  }
                  
                  setShowEditPinnedNotes(false);
                  Alert.alert('Success', 'Pinned notes updated successfully.');
                } catch (error) {
                  Alert.alert('Error', 'Failed to update pinned notes. Please try again.');
                  console.error(error);
                }
              }}
              style={styles.modalButton}
            />
            <Button
              label="Cancel"
              onPress={() => setShowEditPinnedNotes(false)}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
    );
  };

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    flexDirection: 'column',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d45d5d',
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#d45d5d',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#d45d5d',
    fontWeight: '600',
  },
  discussionScrollContent: {
    paddingBottom: 100,
  },
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    paddingBottom: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    margin: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2f2f2f',
    flex: 1,
  },
  privateMessageButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  privateMessageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionCopy: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 6,
  },
  defaultSettingRow: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  defaultSettingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  defaultSettingDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  defaultSettingValueContainer: {
    flex: 1,
    marginRight: 12,
  },
  defaultSettingValue: {
    fontSize: 16,
    color: '#2f2f2f',
    marginBottom: 4,
  },
  defaultSettingSubValue: {
    fontSize: 14,
    color: '#666',
  },
  editIconButton: {
    padding: 8,
  },
  editIconText: {
    fontSize: 18,
  },
  defaultSettingEdit: {
    marginTop: 8,
  },
  defaultSettingInput: {
    marginBottom: 12,
  },
  defaultSettingActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  defaultSettingButton: {
    flex: 1,
  },
  scheduleInfo: {
    marginBottom: 16,
  },
  scheduleLabel: {
    fontSize: 18,
    textTransform: 'uppercase',
    color: '#666',
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: '600',
  },
  scheduleValue: {
    fontSize: 16,
    color: '#2f2f2f',
    fontWeight: '500',
  },
  highlight: {
    fontWeight: '600',
    color: '#1f4f8c',
    marginTop: 4,
  },
  dateTimeEntry: {
    marginBottom: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  dateTimeEntryPressed: {
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  dateTimeEntryHighlighted: {
    backgroundColor: '#e8f5e9',
    borderWidth: 2,
    borderColor: '#4caf50',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  exactLocationText: {
    marginTop: 4,
    fontSize: 13,
  },
  dateLocationContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateLocationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  dateDetailModalContent: {
    padding: 20,
  },
  dateDetailSection: {
    marginBottom: 20,
  },
  dateDetailLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#666',
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: '600',
  },
  dateDetailValue: {
    fontSize: 16,
    color: '#2f2f2f',
    fontWeight: '500',
  },
  dateDetailActions: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  manageRSVPButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 120,
  },
  exportButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 140,
  },
  scheduleLocation: {
    fontSize: 18,
    color: '#666',
    marginTop: 4,
    fontWeight: '600',
  },
  dateEntryContainer: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#fafafa',
    overflow: 'hidden',
  },
  dateEntryContent: {
    padding: 12,
  },
  attendingMembersContainer: {
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  attendingMembersLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  attendingMembersAvatars: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attendingMemberAvatar: {
    position: 'relative',
  },
  attendingAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  attendingAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  attendingAvatarInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  goingBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4caf50',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goingBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  maybeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ff9800',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  maybeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  dateRSVPContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0e8ff',
  },
  dateRSVPLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  dateRSVPButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  dateRSVPButton: {
    flex: 1,
    padding: 8,
    minHeight: 36,
  },
  dateRSVPButtonText: {
    fontSize: 14,
  },
  dateRSVPStatus: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  rsvpLimitInfo: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
  },
  rsvpLimitText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  waitlistText: {
    color: '#d45d5d',
    fontWeight: '600',
  },
  fullScreenModal: {
    height: '90%',
  },
  editButton: {
    marginTop: 12,
  },
  editScheduleButtonContainer: {
    marginBottom: 16,
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  rsvpButton: {
    flex: 1,
    padding: 8,
    minHeight: 36,
  },
  rsvpButtonText: {
    fontSize: 14,
  },
  rsvpSummary: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  rsvpSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 8,
  },
  rsvpSummaryItem: {
    fontSize: 14,
    color: '#444',
    marginBottom: 4,
  },
  rsvpSummaryCategory: {
    marginBottom: 12,
  },
  rsvpSummaryAvatars: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginLeft: -4,
  },
  rsvpSummaryAvatarContainer: {
    marginLeft: 4,
    marginBottom: 4,
  },
  rsvpSummaryAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
  },
  rsvpSummaryAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4a90e2',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rsvpSummaryAvatarInitial: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  bold: {
    fontWeight: '600',
  },
  editLink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editLinkText: {
    color: '#d45d5d',
    fontSize: 14,
    fontWeight: '500',
  },
  messageCard: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  pinnedMessageCard: {
    backgroundColor: '#fff7e6',
    borderLeftWidth: 3,
    borderLeftColor: '#ffa500',
  },
  messageAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 12,
    color: '#999',
  },
  messageInput: {
    marginTop: 16,
  },
  messageInputField: {
    marginBottom: 12,
  },
  postButton: {
    marginTop: 8,
  },
  postContainer: {
    marginBottom: 24,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentContainer: {
    marginTop: 12,
  },
  nestedComment: {
    marginLeft: 0,
  },
  commentCard: {
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#d45d5d',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  commentAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  commentAvatarInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  commentHeaderText: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2f2f2f',
  },
  commentTime: {
    fontSize: 11,
    color: '#999',
  },
  commentContent: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 4,
  },
  commentChildren: {
    marginTop: 8,
    marginLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#e0e0e0',
    paddingLeft: 12,
  },
  commentsSection: {
    marginTop: 12,
    marginLeft: 0,
  },
  replyButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  replyButtonText: {
    fontSize: 13,
    color: '#d45d5d',
    fontWeight: '500',
  },
  replyInputContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  replyingToLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  replyInputField: {
    marginBottom: 8,
  },
  replyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  replyCancelButton: {
    flex: 1,
  },
  replyPostButton: {
    flex: 1,
  },
  editedLabel: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  editDeleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editDeleteButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  deleteButtonText: {
    color: '#d45d5d',
  },
  editContainer: {
    marginTop: 8,
  },
  editInputField: {
    marginBottom: 8,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editCancelButton: {
    flex: 1,
  },
  editSaveButton: {
    flex: 1,
  },
  memberCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  memberAvatarContainer: {
    marginRight: 12,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4a90e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarInitial: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 4,
  },
  memberRole: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  memberRSVP: {
    fontSize: 13,
    color: '#d45d5d',
    fontWeight: '500',
  },
  removeMemberButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff5f5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d45d5d',
  },
  removeMemberText: {
    color: '#d45d5d',
    fontSize: 13,
    fontWeight: '500',
  },
  adminSection: {
    paddingTop: 20,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  inviteBlock: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#c7d4ff',
    backgroundColor: '#eef3ff',
    marginTop: 12,
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
  primaryAction: {
    marginTop: 16,
  },
  dangerAction: {
    marginTop: 8,
    borderColor: '#d45d5d',
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
  modalContent: {
    padding: 20,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  timeInputContainer: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  timeButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2f2f2f',
  },
  dateItem: {
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateItemDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 8,
  },
  dateItemTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateTimeButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d45d5d',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  dateTimeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#d45d5d',
  },
  dateTimeSeparator: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  iosPickerActions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  timePickerModalContent: {
    padding: 20,
    minHeight: 280,
  },
  modalFieldContainer: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 0,
  },
  fieldHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginBottom: 0,
  },
  modalInput: {
    marginBottom: 0,
  },
  modalActions: {
    marginTop: 8,
  },
  modalButton: {
    marginBottom: 12,
  },
  modalButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: -2 },
    elevation: 5,
  },
  planningGamesLink: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#eef3ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d4ff',
  },
  planningGamesLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2a75',
    textAlign: 'center',
  },
  fullScreenModalContent: {
    flex: 1,
    padding: 20,
    paddingTop: 0,
    minHeight: 0, // Important for ScrollView to work properly
  },
  fullScreenGamesList: {
    flex: 1,
    marginBottom: 80, // Space for fixed button
    minHeight: 0, // Important for ScrollView to work properly
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateBackButton: {
    marginTop: 24,
    minWidth: 120,
  },
  selectableGameCardWrapper: {
    position: 'relative',
    width: '31%',
    alignSelf: 'flex-start',
    zIndex: 1,
  },
  selectedBorder: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 4,
    borderColor: '#4a5ec5',
    borderRadius: 16,
    zIndex: 5,
    backgroundColor: 'rgba(74, 94, 197, 0.1)',
  },
  selectedOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4a5ec5',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  selectedCheckmark: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  selectedGamesListContainer: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedGamesListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedGamesListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2f2f2f',
  },
  selectedGamesListToggle: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  selectedGamesList: {
    maxHeight: 120,
  },
  selectedGamesListContent: {
    paddingBottom: 4,
  },
  selectedGameListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    marginBottom: 6,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#4a5ec5',
  },
  selectedGameListItemTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#2f2f2f',
    flex: 1,
    marginRight: 8,
  },
  removeGameButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  removeGameButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  expectedGameItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  expectedGameContent: {
    flex: 1,
  },
  expectedGameThumbnail: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#f5f5f5',
  },
  expectedGameThumbnailPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expectedGameThumbnailPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#999',
  },
  expectedGameTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2f2f2f',
    marginBottom: 12,
  },
  expectedGameBringingSection: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  expectedGameBringingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4a5ec5',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expectedGameBringingAvatars: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: -8,
  },
  expectedGameBringingNames: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  expectedGameFeelingsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  expectedGameFeelingsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4a90e2',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expectedGameFeelingItem: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  expectedGameFeelingMember: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  expectedGameFeelingAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
  },
  expectedGameFeelingAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4a90e2',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expectedGameFeelingAvatarInitial: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  expectedGameFeelingName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  expectedGameFeelingBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  expectedGameFeelingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#e8f4fd',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a90e2',
  },
  expectedGameFeelingBadgeText: {
    fontSize: 12,
    color: '#4a90e2',
    fontWeight: '500',
  },
  expectedGameAvatarContainer: {
    marginRight: -8,
  },
  expectedGameAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
  },
  expectedGameAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4a5ec5',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expectedGameAvatarInitial: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  expectedGameDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  expectedGameDeleteText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  content: {
    padding: 20,
    paddingTop: 40,
  },
  gameItem: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  gameItemHeader: {
    marginBottom: 8,
  },
  gameItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 4,
  },
  gameItemOwners: {
    fontSize: 12,
    color: '#666',
  },
  gameStatusCounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  gameStatusCount: {
    fontSize: 12,
    color: '#666',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  gameStatusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gameStatusButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  gameStatusButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  gameStatusButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  gameStatusButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  expectedGameDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  expectedGameDeleteText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  expectedGameMeta: {
    gap: 4,
  },
  expectedGameBringingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  expectedGameBringingLabel: {
    fontSize: 13,
    color: '#4a90e2',
    fontWeight: '500',
    marginRight: 8,
  },
  expectedGameOwners: {
    fontSize: 12,
    color: '#666',
  },
  expectedGameArrow: {
    fontSize: 18,
    color: '#999',
    marginLeft: 12,
  },
  expandLinkText: {
    fontSize: 14,
    color: '#4a90e2',
    fontWeight: '500',
  },
  gamesCountText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  myGamesList: {
    marginTop: 12,
    gap: 8,
  },
  myGameItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  myGameContent: {
    flex: 1,
  },
  myGameTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 4,
  },
  myGameStatus: {
    fontSize: 12,
    color: '#4a90e2',
    fontWeight: '500',
  },
  myGameMarkButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  myGameMarkButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  myGameMarkButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  myGameMarkButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  sortContainer: {
    marginTop: 12,
    marginBottom: 16,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  sortButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  sortButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  sortButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 16,
  },
  paginationButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a90e2',
    backgroundColor: '#fff',
  },
  paginationButtonDisabled: {
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  paginationButtonText: {
    fontSize: 14,
    color: '#4a90e2',
    fontWeight: '500',
  },
  paginationButtonTextDisabled: {
    color: '#999',
  },
  paginationInfo: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  gameCardContainer: {
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  gameCardRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    gap: 8,
    alignItems: 'flex-start',
  },
  attendeesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  attendeeCard: {
    width: '30%',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  attendeeAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
  },
  attendeeAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4a90e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  attendeeAvatarInitial: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  attendeeName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  attendeeGameCount: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  dateSelectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
  },
  dateSelectorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  dateSelectorButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    alignItems: 'center',
    minWidth: 120,
  },
  dateSelectorButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  dateSelectorButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  dateSelectorButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  dateSelectorButtonTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  dateSelectorButtonTimeActive: {
    color: '#4a90e2',
  },
  aggregatedGamesHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
    marginBottom: 12,
  },
  aggregatedGamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  aggregatedGameCardWrapper: {
    width: '31%',
    position: 'relative',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  gameOwnerNames: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: '#f8f9fa',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    marginTop: -4,
  },
  gameOwnerNamesText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  proposeGameButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#4a90e2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    zIndex: 10,
  },
  proposeGameButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  proposedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#4caf50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
  },
  proposedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  attendeeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  attendeeModalInfo: {
    flex: 1,
    marginLeft: 16,
  },
  attendeeModalAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  attendeeModalAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4a90e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  attendeeModalAvatarInitial: {
    fontSize: 32,
    fontWeight: '600',
    color: '#fff',
  },
  attendeeModalName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  attendeeModalGameCount: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  attendeeModalHint: {
    fontSize: 12,
    color: '#4a90e2',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  paginationControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  categoryContent: {
    paddingBottom: 10,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 2,
    borderBottomColor: '#4a90e2',
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  categorySortToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
    gap: 0,
  },
  categorySortToggleOption: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  categorySortToggleOptionActive: {
    backgroundColor: '#4a90e2',
  },
  categorySortToggleOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  categorySortToggleOptionTextActive: {
    fontWeight: '600',
    color: '#fff',
  },
  categoryGamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  emptyCategoryText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  proposedGameItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
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
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  proposedGameThumbnailText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#999',
  },
  proposedGameInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  proposedGameTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  proposedGameSubtext: {
    fontSize: 12,
    color: '#666',
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
  gameCardWithPropose: {
    position: 'relative',
    marginBottom: 12,
  },
  proposeGameButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    width: '100%',
  },
  proposeGameButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  proposedBadge: {
    backgroundColor: '#28a745',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    width: '100%',
  },
  proposedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  proposedByOthersBadge: {
    backgroundColor: '#6c757d',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    width: '100%',
  },
  proposedByOthersBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  starRatingContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  starRatingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  starRatingStars: {
    flexDirection: 'row',
    gap: 4,
  },
  starButton: {
    padding: 4,
  },
  starIcon: {
    fontSize: 24,
    color: '#ccc',
  },
  starIconFilled: {
    color: '#FFA500',
  },
});

export default EventHub;
