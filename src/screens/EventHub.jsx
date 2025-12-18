import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, KeyboardAvoidingView, Dimensions } from 'react-native';
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
import { notifyDiscussionActivity, notifyGameOwner } from '../utils/notifications';
import RSVPManagementScreen from '../components/RSVPManagementScreen';
import UserProfileModal from '../components/UserProfileModal';
import { handleLeaveEvent as handleLeaveEventUtil } from '../components/LeaveEventButton';
import PrivateMessaging from '../components/PrivateMessaging';
import { getBlockedUsers } from '../services/blocking';
import { pickAndUploadImage } from '../utils/imageUpload';
import { checkPhotoUploadLimit, incrementPhotoUploadCount } from '../utils/photoUploadTracking';
import { theme, commonStyles } from '../utils/theme';
import GearIcon from '../components/GearIcon';

// All game categories in order
const ALL_CATEGORIES = ['Strategy', 'Family', 'Party', 'War', 'Thematic', 'Abstract', 'Children', 'CCG', 'Other'];

// Platform-specific navigation hooks
let useNavigationHook;
let useRouteHook;
let useParamsHook;
let useNavigateHook;

if (Platform.OS === 'web') {
  try {
    const { useNavigate, useParams } = require('react-router-dom');
    useNavigationHook = () => ({ goBack: () => window.history.back() });
    useRouteHook = () => ({ params: {} });
    useParamsHook = useParams;
    useNavigateHook = useNavigate; // useNavigate is already a hook
  } catch (e) {
    useNavigationHook = () => ({ goBack: () => {} });
    useRouteHook = () => ({ params: {} });
    useParamsHook = () => ({ eventId: null });
    useNavigateHook = () => () => {};
  }
} else {
  const { useNavigation, useRoute } = require('@react-navigation/native');
  useNavigationHook = useNavigation;
  useRouteHook = useRoute;
  useParamsHook = () => null;
  useNavigateHook = () => null;
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
  const navigate = useNavigateHook();
  const route = useRouteHook();
  const params = useParamsHook();
  const { eventId } = params?.eventId ? params : (route?.params || {});

  // Determine initial tab from URL
  const getInitialTab = () => {
    if (Platform.OS === 'web') {
      // Check for hash (#gameplan) or query param (?tab=gameplan)
      if (typeof window !== 'undefined') {
        const hash = window.location.hash;
        const searchParams = new URLSearchParams(window.location.search);
        if (hash === '#gameplan' || searchParams.get('tab') === 'gameplan') {
          return TABS.GAMES;
        }
      }
    } else {
      // On mobile, check route params
      const routeParams = route?.params || {};
      if (routeParams.tab === 'gameplan') {
        return TABS.GAMES;
      }
    }
    return TABS.EVENT;
  };

  const {
    getEventById,
    getMembershipStatus,
    membershipStatus,
    addJoinCode,
    deleteJoinCode,
    updateContactRequest,
    contactStatus,
    leaveEvent,
    archiveEvent,
    updateMemberRSVP,
    updateEventSchedule,
    updateEvent,
    updateMemberRole,
    updateMemberJoinCodePermission,
    memberRoles,
  } = useEvents();
  const { user } = useAuth();
  const { getUserCollection, getEventCollection, syncGamesForUsers, collections } = useCollections();

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [addCodeBusy, setAddCodeBusy] = useState(false);
  const [deletingCodes, setDeletingCodes] = useState(new Set()); // Track which codes are being deleted
  const [showEditSchedule, setShowEditSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    selectedDates: [], // Array of { date: Date, startTime: Date, endTime: Date, location: string, address: string, note: string }
    usualStartTime: null, // Optional - no default
    usualEndTime: null, // Optional - no default
    location: '', // Default location for all dates
    address: '', // Default address for all dates
  });
  const [editingDateIndex, setEditingDateIndex] = useState(null);
  const [showTimePicker, setShowTimePicker] = useState({ type: null, dateIndex: null }); // { type: 'start' | 'end' | 'usualStart' | 'usualEnd', dateIndex: number }
  const [selectedDateDetail, setSelectedDateDetail] = useState(null); // { date, startTime, endTime, location, address, note, index }
  const [showDateDetailModal, setShowDateDetailModal] = useState(false); // Show modal when date is clicked
  const [isEditingDateDetail, setIsEditingDateDetail] = useState(false); // Track if we're editing a date detail
  const [editingDateDetailField, setEditingDateDetailField] = useState(null); // 'date' | 'startTime' | 'endTime' | 'location' | 'address' | 'note' | null
  const [editingDateDetailForm, setEditingDateDetailForm] = useState({
    date: null,
    startTime: null,
    endTime: null,
    location: '',
    address: '',
    note: '',
  });
  const [showDateDetailTimePicker, setShowDateDetailTimePicker] = useState({ type: null }); // { type: 'date' | 'startTime' | 'endTime' }
  const [highlightedDateIndex, setHighlightedDateIndex] = useState(null); // Index of date to highlight
  const scheduleScrollRef = useRef(null);
  const dateEntryPositions = useRef({}); // Map of index to Y position
  const scrollPositionRef = useRef(0); // Track scroll position to prevent jumps
  const editScheduleScrollRef = useRef(null); // Ref for Edit Schedule modal ScrollView
  const editScheduleDatePositions = useRef({}); // Map of index to Y position in Edit Schedule modal
  const isUpdatingRSVPRef = useRef(false); // Track if RSVP update is in progress to prevent modal from closing
  const [memberNames, setMemberNames] = useState({});
  const [memberRSVPs, setMemberRSVPs] = useState({}); // { [userId]: { [dateKey]: status } }
  const [memberAvatars, setMemberAvatars] = useState({});
  const memberDataFetchInProgressRef = useRef(false); // Prevent concurrent fetches
  const [pinnedNotes, setPinnedNotes] = useState('');
  const [showEditPinnedNotes, setShowEditPinnedNotes] = useState(false);
  const [discussionMessages, setDiscussionMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null); // { uri: string, uploading: boolean }
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
    usualStartTime: null,
    usualEndTime: null,
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
  const [showNoConfirmedAttendeesModal, setShowNoConfirmedAttendeesModal] = useState(false);
  const [selectedMemberForAction, setSelectedMemberForAction] = useState(null); // { userId, displayName, role, canShareJoinCode }
  // Collapsible sections state
  const [isInviteGuestsExpanded, setIsInviteGuestsExpanded] = useState(false);
  const [isMembersExpanded, setIsMembersExpanded] = useState(false);
  // Past events modal state
  const [showPastEventsModal, setShowPastEventsModal] = useState(false);

  const event = getEventById(eventId);
  const userId = user?.uid || user?.id || null;

  const memberStatus = event && userId
    ? getMembershipStatus(event.id, userId)
    : membershipStatus.STRANGER;
  const isMember = memberStatus === membershipStatus.MEMBER;
  const isOrganizer = event?.organizerId && event.organizerId === userId;
  // Check if user is organizer or co-organizer (has organizer role)
  const currentUserMember = event?.members?.find(m => m.userId === userId);
  const isOrganizerOrCoOrganizer = isOrganizer || currentUserMember?.role === memberRoles?.ORGANIZER;

  // Memoize members array to prevent unnecessary re-renders
  // Create stable array reference - only change if member userIds actually change
  const members = useMemo(() => {
    if (!event?.members) return [];
    return (event.members || []).filter((member) => member.status === membershipStatus.MEMBER);
  }, [event?.members, membershipStatus]);

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

  // Check for hash/query param to set initial tab (e.g., #gameplan)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hash = window.location.hash;
      const searchParams = new URLSearchParams(window.location.search);
      if (hash === '#gameplan' || searchParams.get('tab') === 'gameplan') {
        setActiveTab(TABS.GAMES);
      }
    } else {
      // On mobile, check route params
      const routeParams = route?.params || {};
      if (routeParams.tab === 'gameplan') {
        setActiveTab(TABS.GAMES);
      }
    }
  }, [route]);

  // Separate past and future events
  const { futureEvents, pastEvents } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare dates only (ignore time)
    
    const future = [];
    const past = [];
    
    if (event?.eventDates && Array.isArray(event.eventDates)) {
      event.eventDates.forEach((ed, idx) => {
        const date = safeParseDate(ed.date);
        if (date && !isNaN(date.getTime())) {
          const eventDate = new Date(date);
          eventDate.setHours(0, 0, 0, 0);
          if (eventDate >= now) {
            future.push({ ...ed, originalIndex: idx });
          } else {
            past.push({ ...ed, originalIndex: idx });
          }
        }
      });
    } else if (event?.scheduledFor) {
      // Handle backward-compatible single scheduledFor date
      const date = safeParseDate(event.scheduledFor);
      if (date && !isNaN(date.getTime())) {
        const eventDate = new Date(date);
        eventDate.setHours(0, 0, 0, 0);
        const ed = {
          date: event.scheduledFor,
          startTime: event.scheduledFor,
          location: event.location || event.generalLocation || '',
          address: event.address || event.exactLocation || '',
          note: '',
          originalIndex: 0,
        };
        if (eventDate >= now) {
          future.push(ed);
        } else {
          past.push(ed);
        }
      }
    }
    
    return { futureEvents: future, pastEvents: past };
  }, [event?.eventDates, event?.scheduledFor, event?.location, event?.generalLocation, event?.address, event?.exactLocation]);

  // Convert futureEvents to calendar format for CalendarDatePicker
  const calendarDates = useMemo(() => {
    return futureEvents.map((ed) => {
      const date = safeParseDate(ed.date);
      const startTime = safeParseDate(ed.startTime);
      const endTime = safeParseDate(ed.endTime);
      
      if (!date || isNaN(date.getTime())) return null;
      
      return {
        date: date instanceof Date ? date : new Date(date),
        startTime: startTime && !isNaN(startTime.getTime()) 
          ? (startTime instanceof Date ? startTime : new Date(startTime))
          : new Date(date),
        endTime: endTime && !isNaN(endTime.getTime())
          ? (endTime instanceof Date ? endTime : new Date(endTime))
          : new Date(date),
        originalIndex: ed.originalIndex,
        location: ed.location || ed.generalLocation || event.location || event.generalLocation || '',
        address: ed.address || ed.exactLocation || '',
        note: ed.note || '',
      };
    }).filter(Boolean);
  }, [futureEvents, event?.location, event?.generalLocation, event?.address, event?.exactLocation]);

  // Initialize date detail form when selectedDateDetail changes
  useEffect(() => {
    if (selectedDateDetail) {
      setEditingDateDetailForm({
        date: selectedDateDetail.date ? new Date(selectedDateDetail.date) : null,
        startTime: selectedDateDetail.startTime && !isNaN(selectedDateDetail.startTime.getTime())
          ? new Date(selectedDateDetail.startTime)
          : null,
        endTime: selectedDateDetail.endTime && !isNaN(selectedDateDetail.endTime.getTime())
          ? new Date(selectedDateDetail.endTime)
          : null,
        location: selectedDateDetail.location || '',
        address: selectedDateDetail.address || selectedDateDetail.exactLocation || '',
        note: selectedDateDetail.note || '',
      });
      setEditingDateDetailField(null);
    }
  }, [selectedDateDetail]);

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
          // Silently handle parsing errors
        }
      }
      
      setScheduleForm({
        selectedDates,
        usualStartTime: event.usualStartTime ? new Date(event.usualStartTime) : null,
        usualEndTime: event.usualEndTime ? new Date(event.usualEndTime) : null,
        location: event.location || event.generalLocation || '',
        address: event.address || event.exactLocation || '',
      });
      setPinnedNotes(event.description || '');
      
      // Initialize default time and location forms
      const defaultStart = event.usualStartTime ? new Date(event.usualStartTime) : null;
      const defaultEnd = event.usualEndTime ? new Date(event.usualEndTime) : null;
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

    // Prevent concurrent fetches
    if (memberDataFetchInProgressRef.current) {
      console.log('[EventHub] Member data fetch already in progress, skipping');
      return;
    }

    const fetchMemberData = async () => {
      memberDataFetchInProgressRef.current = true;
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
                        // Only log if it's not a permission error (permission errors are expected if user is not organizer)
                        if (updateError.code !== 'permission-denied') {
                          console.error(`[EventHub] Error updating member avatar cache for ${member.userId}:`, updateError);
                        }
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
      // Only update memberNames if it actually changed
      setMemberNames(prev => {
        const safePrev = prev || {};
        const safeNames = names || {};
        const prevKey = JSON.stringify(Object.keys(safePrev).sort().map(k => `${k}:${safePrev[k]}`));
        const newKey = JSON.stringify(Object.keys(safeNames).sort().map(k => `${k}:${safeNames[k]}`));
        if (prevKey === newKey) {
          return safePrev; // No change, return previous object
        }
        return safeNames;
      });
      
      setMemberRSVPs(prev => {
        // Ensure rsvps is always an object
        const safeRsvps = rsvps || {};
        const safePrev = prev || {};
        const updated = { ...safePrev, ...safeRsvps };
        // Only update if RSVPs actually changed
        const prevKey = JSON.stringify(Object.keys(safePrev).sort().map(k => `${k}:${JSON.stringify(safePrev[k])}`));
        const newKey = JSON.stringify(Object.keys(updated).sort().map(k => `${k}:${JSON.stringify(updated[k])}`));
        if (prevKey === newKey) {
          return safePrev; // No change, return previous object
        }
        console.log('[EventHub] memberRSVPs updated, total count:', Object.keys(updated).length);
        return updated;
      });
      
      // Only update memberAvatars if it actually changed
      setMemberAvatars(prev => {
        const safePrev = prev || {};
        const safeAvatars = avatars || {};
        const prevKey = JSON.stringify(Object.keys(safePrev).sort().map(k => `${k}:${safePrev[k]}`));
        const newKey = JSON.stringify(Object.keys(safeAvatars).sort().map(k => `${k}:${safeAvatars[k]}`));
        if (prevKey === newKey) {
          return safePrev; // No change, return previous object
        }
        return safeAvatars;
      });
      
      memberDataFetchInProgressRef.current = false; // Release lock
    };

    fetchMemberData().catch((error) => {
      console.error('[EventHub] Error in fetchMemberData:', error);
      memberDataFetchInProgressRef.current = false; // Ensure lock is released even on error
    });
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
            label="⬅️ Go back"
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

    // Check if the status is actually changing
    if (previousStatus === status) {
      console.log('[EventHub] RSVP status unchanged, skipping update');
      return; // No change, exit early to prevent unnecessary updates
    }

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
    isUpdatingRSVPRef.current = true;
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
    } finally {
      // Reset the flag after a short delay to allow state updates to complete
      setTimeout(() => {
        isUpdatingRSVPRef.current = false;
      }, 100);
    }
  };

  const handleSaveDateDetailField = async (fieldName) => {
    if (!isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers and co-organizers can edit date details.');
      return;
    }

    if (!selectedDateDetail || selectedDateDetail.index === undefined) {
      Alert.alert('Error', 'Invalid date selection.');
      return;
    }

    // Validate required fields
    if (fieldName === 'date' && !editingDateDetailForm.date) {
      Alert.alert('Error', 'Date is required.');
      return;
    }

    try {
      // Check if we're in Edit Schedule context
      if (selectedDateDetail.isEditScheduleContext) {
        // Update scheduleForm.selectedDates
        const updatedDates = [...scheduleForm.selectedDates];
        const currentDate = updatedDates[selectedDateDetail.index];
        
        // Check if date changed
        const oldDate = currentDate.date instanceof Date ? currentDate.date : new Date(currentDate.date);
        const newDate = editingDateDetailForm.date instanceof Date 
          ? editingDateDetailForm.date 
          : (editingDateDetailForm.date ? new Date(editingDateDetailForm.date) : oldDate);
        const dateChanged = getDateKey(oldDate) !== getDateKey(newDate);
        
        // Ensure all date objects are proper Date instances
        const updatedDate = {
          ...currentDate,
          date: newDate instanceof Date ? newDate : new Date(newDate),
          startTime: editingDateDetailForm.startTime !== null 
            ? (editingDateDetailForm.startTime instanceof Date ? editingDateDetailForm.startTime : new Date(editingDateDetailForm.startTime))
            : (currentDate.startTime instanceof Date ? currentDate.startTime : new Date(currentDate.startTime)),
          endTime: editingDateDetailForm.endTime !== null 
            ? (editingDateDetailForm.endTime instanceof Date ? editingDateDetailForm.endTime : new Date(editingDateDetailForm.endTime))
            : (currentDate.endTime instanceof Date ? currentDate.endTime : new Date(currentDate.endTime)),
          location: editingDateDetailForm.location !== undefined ? editingDateDetailForm.location : currentDate.location,
          address: editingDateDetailForm.address !== undefined ? editingDateDetailForm.address : currentDate.address,
          note: editingDateDetailForm.note !== undefined ? editingDateDetailForm.note : currentDate.note,
        };
        
        // If date changed, we need to remove the old date and add the new one (to unhighlight old, highlight new)
        if (dateChanged) {
          try {
            // Remove the old date entry
            updatedDates.splice(selectedDateDetail.index, 1);
            // Add the new date entry
            updatedDates.push(updatedDate);
            // Sort dates chronologically
            updatedDates.sort((a, b) => {
              const dateA = a.date instanceof Date ? a.date : new Date(a.date);
              const dateB = b.date instanceof Date ? b.date : new Date(b.date);
              return dateA.getTime() - dateB.getTime();
            });
            
            // Find the new index
            const newIndex = updatedDates.findIndex(sd => {
              const sdDate = sd.date instanceof Date ? sd.date : new Date(sd.date);
              return getDateKey(sdDate) === getDateKey(newDate);
            });
            
            console.log('[EventHub] Date changed in Edit Schedule context:', {
              oldDate: oldDate.toISOString(),
              newDate: newDate.toISOString(),
              oldIndex: selectedDateDetail.index,
              newIndex: newIndex,
              totalDates: updatedDates.length,
            });
            
            setScheduleForm({ ...scheduleForm, selectedDates: updatedDates });
            
            // Update selectedDateDetail with new index
            setSelectedDateDetail({
              ...updatedDate,
              index: newIndex !== -1 ? newIndex : updatedDates.length - 1,
              isEditScheduleContext: true,
            });
          } catch (error) {
            console.error('[EventHub] Error updating date in Edit Schedule context:', error);
            throw error;
          }
        } else {
          // Date didn't change, just update in place
          try {
            updatedDates[selectedDateDetail.index] = updatedDate;
            setScheduleForm({ ...scheduleForm, selectedDates: updatedDates });
            
            // Update selectedDateDetail for display
            setSelectedDateDetail({
              ...updatedDate,
              index: selectedDateDetail.index,
              isEditScheduleContext: true,
            });
          } catch (error) {
            console.error('[EventHub] Error updating date in place:', error);
            throw error;
          }
        }
      } else {
        // Original behavior: update main event dates (from read-only calendar view)
        const currentEventDates = event?.eventDates || [];
      const updatedEventDates = [...currentEventDates];
      const currentDate = updatedEventDates[selectedDateDetail.index] || {};
      
        // Check if date changed - if so, we need to update the calendar
        const oldDate = currentDate.date ? new Date(currentDate.date) : null;
        const newDate = editingDateDetailForm.date;
        const dateChanged = oldDate && newDate && oldDate.getTime() !== newDate.getTime();
        
      const updatedDate = {
        ...currentDate,
        date: editingDateDetailForm.date ? editingDateDetailForm.date.toISOString() : currentDate.date,
        startTime: editingDateDetailForm.startTime ? editingDateDetailForm.startTime.toISOString() : currentDate.startTime,
        endTime: editingDateDetailForm.endTime ? editingDateDetailForm.endTime.toISOString() : currentDate.endTime,
        location: editingDateDetailForm.location !== undefined ? editingDateDetailForm.location : currentDate.location,
        address: editingDateDetailForm.address !== undefined ? editingDateDetailForm.address : currentDate.address,
        exactLocation: editingDateDetailForm.address !== undefined ? editingDateDetailForm.address : (currentDate.exactLocation || currentDate.address),
        note: editingDateDetailForm.note !== undefined ? editingDateDetailForm.note : currentDate.note,
      };
      
      updatedEventDates[selectedDateDetail.index] = updatedDate;
      await updateEventSchedule(event.id, userId, {
        eventDates: updatedEventDates,
      });

        // Update scheduleForm to reflect the change in the calendar (for organizers)
        // This ensures the editable calendar shows the updated date
        if (isOrganizerOrCoOrganizer) {
          const updatedScheduleDates = [...scheduleForm.selectedDates];
          
          // Find the date in scheduleForm by matching the original date or index
          let scheduleDateIndex = -1;
          if (selectedDateDetail.index !== undefined) {
            // Try to find by original index first (if it matches)
            const originalDate = oldDate || (currentDate.date ? new Date(currentDate.date) : null);
            if (originalDate && updatedScheduleDates[selectedDateDetail.index]) {
              const existingDate = updatedScheduleDates[selectedDateDetail.index].date instanceof Date 
                ? updatedScheduleDates[selectedDateDetail.index].date 
                : new Date(updatedScheduleDates[selectedDateDetail.index].date);
              if (getDateKey(existingDate) === getDateKey(originalDate)) {
                scheduleDateIndex = selectedDateDetail.index;
              }
            }
          }
          
          // If not found by index, try to find by date key
          if (scheduleDateIndex === -1) {
            const originalDate = oldDate || (currentDate.date ? new Date(currentDate.date) : null);
            if (originalDate) {
              scheduleDateIndex = updatedScheduleDates.findIndex(sd => {
                const sdDate = sd.date instanceof Date ? sd.date : new Date(sd.date);
                return getDateKey(sdDate) === getDateKey(originalDate);
              });
            }
          }
          
          if (scheduleDateIndex !== -1) {
            // Update the existing date entry
            const scheduleDate = updatedScheduleDates[scheduleDateIndex];
            const newDateObj = newDate || scheduleDate.date;
            const newStartTime = editingDateDetailForm.startTime !== null 
              ? (editingDateDetailForm.startTime instanceof Date ? editingDateDetailForm.startTime : new Date(editingDateDetailForm.startTime))
              : scheduleDate.startTime;
            const newEndTime = editingDateDetailForm.endTime !== null 
              ? (editingDateDetailForm.endTime instanceof Date ? editingDateDetailForm.endTime : new Date(editingDateDetailForm.endTime))
              : scheduleDate.endTime;
            
            updatedScheduleDates[scheduleDateIndex] = {
              ...scheduleDate,
              date: newDateObj instanceof Date ? newDateObj : new Date(newDateObj),
              startTime: newStartTime instanceof Date ? newStartTime : new Date(newStartTime),
              endTime: newEndTime instanceof Date ? newEndTime : new Date(newEndTime),
              location: editingDateDetailForm.location !== undefined ? editingDateDetailForm.location : scheduleDate.location,
              address: editingDateDetailForm.address !== undefined ? editingDateDetailForm.address : scheduleDate.address,
              note: editingDateDetailForm.note !== undefined ? editingDateDetailForm.note : scheduleDate.note,
            };
            
            // If date changed, sort the dates
            if (dateChanged) {
              updatedScheduleDates.sort((a, b) => {
                const dateA = a.date instanceof Date ? a.date : new Date(a.date);
                const dateB = b.date instanceof Date ? b.date : new Date(b.date);
                return dateA.getTime() - dateB.getTime();
              });
              
              // Update the index in selectedDateDetail to match new position
              const newIndex = updatedScheduleDates.findIndex(sd => {
                const sdDate = sd.date instanceof Date ? sd.date : new Date(sd.date);
                return getDateKey(sdDate) === getDateKey(newDateObj);
              });
              if (newIndex !== -1) {
                setSelectedDateDetail(prev => ({
                  ...prev,
                  index: newIndex,
                }));
              }
            }
            
            console.log('[EventHub] Updating scheduleForm.selectedDates after date edit:', {
              dateChanged,
              oldDate: oldDate?.toISOString(),
              newDate: newDateObj instanceof Date ? newDateObj.toISOString() : newDateObj,
              updatedDates: updatedScheduleDates.map(d => ({
                date: d.date instanceof Date ? d.date.toISOString() : d.date,
                startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
                endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
              })),
            });
            
            setScheduleForm({ ...scheduleForm, selectedDates: updatedScheduleDates });
          } else {
            console.warn('[EventHub] Could not find date in scheduleForm to update:', {
              originalDate: oldDate?.toISOString(),
              selectedDateDetailIndex: selectedDateDetail.index,
              scheduleFormDates: updatedScheduleDates.map(d => ({
                date: d.date instanceof Date ? d.date.toISOString() : d.date,
              })),
            });
          }
        }

      setSelectedDateDetail({
        date: editingDateDetailForm.date || selectedDateDetail.date,
        startTime: editingDateDetailForm.startTime !== null ? editingDateDetailForm.startTime : selectedDateDetail.startTime,
        endTime: editingDateDetailForm.endTime !== null ? editingDateDetailForm.endTime : selectedDateDetail.endTime,
        location: editingDateDetailForm.location !== undefined ? editingDateDetailForm.location : selectedDateDetail.location,
        address: editingDateDetailForm.address !== undefined ? editingDateDetailForm.address : selectedDateDetail.address,
        note: editingDateDetailForm.note !== undefined ? editingDateDetailForm.note : selectedDateDetail.note,
        index: selectedDateDetail.index,
      });
      }
      
      setEditingDateDetailField(null);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update date details. Please try again.');
      console.error(error);
    }
  };

  const handleDeleteDate = async () => {
    if (!isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers and co-organizers can delete dates.');
      return;
    }

    if (!selectedDateDetail) {
      Alert.alert('Error', 'Invalid date selection.');
      return;
    }

    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event date? This will remove it from the schedule and unhighlight it in the calendar.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (selectedDateDetail.isEditScheduleContext) {
                // Remove from scheduleForm.selectedDates (Edit Schedule context)
                const updatedDates = scheduleForm.selectedDates.filter((_, index) => index !== selectedDateDetail.index);
                setScheduleForm({ ...scheduleForm, selectedDates: updatedDates });
                console.log('[EventHub] Deleted date from scheduleForm:', {
                  deletedIndex: selectedDateDetail.index,
                  remainingDates: updatedDates.length,
                });
              } else {
                // Remove from main event dates (from read-only calendar view)
                const currentEventDates = event?.eventDates || [];
                const updatedEventDates = currentEventDates.filter((_, index) => index !== selectedDateDetail.index);
                
                await updateEventSchedule(event.id, userId, {
                  eventDates: updatedEventDates,
                });
                
                // Also update scheduleForm to unhighlight the date in the calendar
                if (isOrganizerOrCoOrganizer) {
                  const dateToDelete = selectedDateDetail.date instanceof Date 
                    ? selectedDateDetail.date 
                    : new Date(selectedDateDetail.date);
                  const dateKey = getDateKey(dateToDelete);
                  
                  const updatedScheduleDates = scheduleForm.selectedDates.filter(sd => {
                    const sdDate = sd.date instanceof Date ? sd.date : new Date(sd.date);
                    return getDateKey(sdDate) !== dateKey;
                  });
                  
                  console.log('[EventHub] Deleted date from event and scheduleForm:', {
                    deletedDate: dateToDelete.toISOString(),
                    deletedDateKey: dateKey,
                    remainingEventDates: updatedEventDates.length,
                    remainingScheduleDates: updatedScheduleDates.length,
                  });
                  
                  setScheduleForm({ ...scheduleForm, selectedDates: updatedScheduleDates });
                }
              }
              
              setShowDateDetailModal(false);
              setSelectedDateDetail(null);
              setEditingDateDetailField(null);
              setIsEditingDateDetail(false);
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete event. Please try again.');
              console.error('[EventHub] Error deleting date:', error);
            }
          },
        },
      ]
    );
  };

  const handleEditSchedule = async () => {
    if (!isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers can edit the schedule.');
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
        // Keep scheduledFor for backward compatibility (use first date)
        scheduledFor: scheduleForm.selectedDates[0]?.date.toISOString() || '',
      };

      // Only include usual times if they're set
      if (scheduleForm.usualStartTime) {
        updateData.usualStartTime = scheduleForm.usualStartTime.toISOString();
      }
      if (scheduleForm.usualEndTime) {
        updateData.usualEndTime = scheduleForm.usualEndTime.toISOString();
      }

      await updateEventSchedule(event.id, userId, updateData);
      setShowEditSchedule(false);
      Alert.alert('Success', 'Schedule updated successfully.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update schedule. Please try again.');
      console.error(error);
    }
  };

  const handleSaveDefaultTime = async () => {
    if (!isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers can edit the default time.');
      return;
    }

    try {
      const updateData = {};

      // Only include usual times if they're set
      if (defaultTimeForm.usualStartTime) {
        updateData.usualStartTime = defaultTimeForm.usualStartTime.toISOString();
      }
      if (defaultTimeForm.usualEndTime) {
        updateData.usualEndTime = defaultTimeForm.usualEndTime.toISOString();
      }

      await updateEventSchedule(event.id, userId, updateData);
      setEditingDefaultTime(false);
      Alert.alert('Success', 'Default time updated successfully.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update default time. Please try again.');
      console.error(error);
    }
  };

  const handleSaveDefaultLocation = async () => {
    if (!isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers can edit the default location.');
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
    console.log('[EventHub] handleDatesChange called with dates:', {
      count: dates.length,
      dates: dates.map(d => ({
        date: d.date instanceof Date ? d.date.toISOString() : d.date,
        startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
        endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
      })),
    });
    
    // Dates are now objects with { date, startTime, endTime, location, address, note } structure
    // Ensure new dates get default location values if not set
    const datesWithLocations = dates.map(d => ({
      ...d,
      location: d.location !== undefined ? d.location : scheduleForm.location,
      address: d.address !== undefined ? d.address : (d.exactLocation !== undefined ? d.exactLocation : scheduleForm.address),
      note: d.note !== undefined ? d.note : '',
    }));
    
    console.log('[EventHub] ✅ Updating scheduleForm with dates (highlighted in green):', {
      count: datesWithLocations.length,
      dates: datesWithLocations.map(d => ({
        date: d.date instanceof Date ? d.date.toISOString() : d.date,
        startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
        endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
        location: d.location,
        address: d.address,
      })),
    });
    
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

  const handleAddJoinCode = async () => {
    if (addCodeBusy) {
      return;
    }

    try {
      setAddCodeBusy(true);
      const newCode = await addJoinCode(event.id);
      Alert.alert(
        'New code created',
        `Your new join code is: ${newCode}`,
      );
    } catch (error) {
      Alert.alert('Could not create code', 'Please try again in a moment.');
      console.error(error);
    } finally {
      setAddCodeBusy(false);
    }
  };

  const handleDeleteJoinCode = (codeToDelete) => {
    const joinCodes = event.joinCodes || (event.joinCode ? [event.joinCode] : []);
    
    // Don't allow deleting the last code
    if (joinCodes.length <= 1) {
      Alert.alert(
        'Cannot delete',
        'You must keep at least one active join code.',
      );
      return;
    }

    Alert.alert(
      'Delete join code?',
      `Anyone with the code "${codeToDelete}" will no longer be able to join.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingCodes(prev => new Set(prev).add(codeToDelete));
              await deleteJoinCode(event.id, codeToDelete);
            } catch (error) {
              Alert.alert('Could not delete code', 'Please try again in a moment.');
              console.error(error);
            } finally {
              setDeletingCodes(prev => {
                const next = new Set(prev);
                next.delete(codeToDelete);
                return next;
              });
            }
          },
        },
      ],
    );
  };

  const handleArchiveEvent = () => {
    if (!userId || !isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers can archive a MeepleUp.');
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
        {/* Invite Members Section + All Event Actions */}
        {(isOrganizerOrCoOrganizer || currentUserMember?.canShareJoinCode) && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setIsInviteGuestsExpanded(!isInviteGuestsExpanded)}
            >
              <Text style={styles.sectionTitle}>Invite Members</Text>
              <Text style={styles.expandIcon}>{isInviteGuestsExpanded ? '▼' : '▶'}</Text>
            </TouchableOpacity>
            
            {/* Simple button list */}
            <View style={styles.buttonList}>
              {(isOrganizerOrCoOrganizer || currentUserMember?.canShareJoinCode) && (
                <TouchableOpacity
                  style={styles.buttonListItem}
                  onPress={handleShareInvite}
                >
                  <Text style={styles.buttonListText}>📤 Share invite</Text>
                </TouchableOpacity>
              )}
              {isOrganizerOrCoOrganizer && (
                <TouchableOpacity
                  style={styles.buttonListItem}
                  onPress={handleAddJoinCode}
                  disabled={addCodeBusy}
                >
                  <Text style={[styles.buttonListText, addCodeBusy && styles.buttonListTextDisabled]}>
                    {addCodeBusy ? '⏳ Creating code...' : '➕ New join code'}
                  </Text>
                </TouchableOpacity>
              )}
              {isOrganizerOrCoOrganizer && (
                <TouchableOpacity
                  style={styles.buttonListItem}
                  onPress={handleEditSchedule}
                >
                  <Text style={styles.buttonListText}>💾 Save schedule</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.buttonListItem}
                onPress={handleExportToCalendar}
              >
                <Text style={styles.buttonListText}>📆 Export calendar</Text>
              </TouchableOpacity>
            </View>
            
            {isInviteGuestsExpanded && (
              <View style={styles.inviteBlock}>
                <Text style={styles.inviteLabel}>Active join codes</Text>
                {(event.joinCodes || (event.joinCode ? [event.joinCode] : [])).map((code, index) => {
                  const isDeleting = deletingCodes.has(code);
                  return (
                    <View key={index} style={styles.joinCodeRow}>
                      <Text style={styles.inviteCode}>{code}</Text>
                      {(isOrganizerOrCoOrganizer || currentUserMember?.canShareJoinCode) && (
                        <TouchableOpacity
                          onPress={() => handleDeleteJoinCode(code)}
                          disabled={isDeleting}
                          style={[styles.deleteCodeButton, isDeleting && styles.deleteCodeButtonDisabled]}
                        >
                          <Text style={styles.deleteCodeButtonText}>
                            {isDeleting ? 'Deleting...' : 'Delete'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={[styles.section, { 
          backgroundColor: theme.colors.surfaceColor, // White background to cover wood
          margin: 0, 
          marginBottom: theme.spacing.xl,
          marginLeft: 0,
          marginRight: 0,
          padding: theme.spacing.lg, // Keep padding for content
          borderWidth: 0,
        }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {isOrganizerOrCoOrganizer ? 'Edit upcoming event details' : 'Schedule'}
            </Text>
          </View>

          {/* Edit Default Time and Place - Only for Organizers, within Schedule card */}
          {isOrganizerOrCoOrganizer && (
            <View style={styles.defaultSettingsContainer}>
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
                                {defaultTimeForm.usualStartTime 
                                  ? defaultTimeForm.usualStartTime.toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    })
                                  : 'Not set (optional)'}
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
                                {defaultTimeForm.usualEndTime 
                                  ? defaultTimeForm.usualEndTime.toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    })
                                  : 'Not set (optional)'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.defaultSettingActions}>
                          <Button
                            label="💾 Save"
                            onPress={handleSaveDefaultTime}
                            style={styles.defaultSettingButton}
                            textStyle={styles.defaultSettingButtonText}
                          />
                          <Button
                            label="❌ Cancel"
                            onPress={() => {
                              setEditingDefaultTime(false);
                              // Reset to current values
                              const defaultStart = event.usualStartTime
                                ? new Date(event.usualStartTime)
                                : new Date(new Date().setHours(18, 0, 0, 0));
                              const defaultEnd = event.usualEndTime
                                ? new Date(event.usualEndTime)
                                : new Date(new Date().setHours(22, 0, 0, 0));
                              setDefaultTimeForm({
                                usualStartTime: defaultStart,
                                usualEndTime: defaultEnd,
                              });
                            }}
                            variant="outline"
                            style={styles.defaultSettingButton}
                            textStyle={styles.defaultSettingButtonText}
                          />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.defaultSettingDisplay}>
                        <Text style={styles.defaultSettingValue}>
                          {(() => {
                            const start = event.usualStartTime
                              ? new Date(event.usualStartTime)
                              : new Date(new Date().setHours(18, 0, 0, 0));
                            const end = event.usualEndTime
                              ? new Date(event.usualEndTime)
                              : new Date(new Date().setHours(22, 0, 0, 0));
                            return `${start.toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })} - ${end.toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })}`;
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
                          onChangeText={(text) =>
                            setDefaultLocationForm({ ...defaultLocationForm, location: text })
                          }
                          placeholder="e.g., Jason's house"
                          style={styles.defaultSettingInput}
                        />
                        <Input
                          value={defaultLocationForm.address}
                          onChangeText={(text) =>
                            setDefaultLocationForm({ ...defaultLocationForm, address: text })
                          }
                          placeholder="e.g., 123 Tolkien Dr."
                          style={styles.defaultSettingInput}
                        />
                        <View style={styles.defaultSettingActions}>
                          <Button
                            label="💾 Save"
                            onPress={handleSaveDefaultLocation}
                            style={styles.defaultSettingButton}
                            textStyle={styles.defaultSettingButtonText}
                          />
                          <Button
                            label="❌ Cancel"
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
                            textStyle={styles.defaultSettingButtonText}
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

        <View style={styles.scheduleInfo}>
          {isOrganizerOrCoOrganizer ? (
            // For organizers: show editable calendar directly
            <>
              <View style={[styles.longPressInstructionBox, { marginBottom: 12 }]}>
                <Text style={styles.longPressInstructionText}>
                  📅 <Text style={styles.longPressInstructionBold}>Long-press</Text> a date to add it to your schedule (highlighted in green). Tap a selected date to edit time, notes, or delete.
                </Text>
              </View>
              <View style={[styles.calendarContainer, { 
                marginLeft: -24, 
                marginRight: -24, 
                width: Dimensions.get('window').width,
                paddingHorizontal: 0,
                paddingLeft: 0,
                paddingRight: 0,
              }]}>
                <CalendarDatePicker
                  selectedDates={scheduleForm.selectedDates}
                  onDatesChange={handleDatesChange}
                  minDate={new Date()}
                  usualStartTime={scheduleForm.usualStartTime}
                  usualEndTime={scheduleForm.usualEndTime}
                  onDateTimeEdit={(dateIndex, timeType) => {
                    setShowTimePicker({ type: timeType || 'start', dateIndex });
                  }}
                  onDatePress={(dateIndex, dateInfo) => {
                    // For organizers, open edit modal when tapping a selected date
                    if (scheduleForm.selectedDates && scheduleForm.selectedDates[dateIndex]) {
                      const dateItem = scheduleForm.selectedDates[dateIndex];
                      setSelectedDateDetail({
                        ...dateItem,
                        index: dateIndex,
                        isEditScheduleContext: true,
                      });
                      setEditingDateDetailForm({
                        date: dateItem.date instanceof Date ? dateItem.date : new Date(dateItem.date),
                        startTime: dateItem.startTime instanceof Date ? dateItem.startTime : new Date(dateItem.startTime),
                        endTime: dateItem.endTime instanceof Date ? dateItem.endTime : new Date(dateItem.endTime),
                        location: dateItem.location || '',
                        address: dateItem.address || '',
                        note: dateItem.note || '',
                      });
                      setIsEditingDateDetail(true);
                      setShowDateDetailModal(true);
                    }
                  }}
                />
              </View>
            </>
          ) : futureEvents.length > 0 ? (
            // For non-organizers: show read-only calendar
            <>
              <View style={[styles.calendarContainer, { 
                marginLeft: -24, 
                marginRight: -24, 
                width: Dimensions.get('window').width,
                paddingHorizontal: 0,
                paddingLeft: 0,
                paddingRight: 0,
              }]}>
                <CalendarDatePicker
                  selectedDates={calendarDates}
                  onDatesChange={() => {}} // Read-only, no date selection
                  minDate={new Date()}
                  usualStartTime={event.usualStartTime ? new Date(event.usualStartTime) : new Date(new Date().setHours(18, 0, 0, 0))}
                  usualEndTime={event.usualEndTime ? new Date(event.usualEndTime) : new Date(new Date().setHours(22, 0, 0, 0))}
                  readOnly={true} // Make calendar read-only for viewing
                  onDatePress={(dateIndex, dateInfo) => {
                    // Find the corresponding event data by matching the date from dateInfo
                    const clickedDate = dateInfo.date instanceof Date ? dateInfo.date : new Date(dateInfo.date);
                    const clickedDateKey = getDateKey(clickedDate);
                    
                    const calendarDate = calendarDates.find(cd => {
                      if (!cd || !cd.date) return false;
                      const cdDate = cd.date instanceof Date ? cd.date : new Date(cd.date);
                      return getDateKey(cdDate) === clickedDateKey;
                    });
                    
                    if (calendarDate) {
                      const date = calendarDate.date;
                      const startTime = calendarDate.startTime;
                      const endTime = calendarDate.endTime;
                      const location = calendarDate.location;
                      const address = calendarDate.address;
                      const note = calendarDate.note;
                      
                      setSelectedDateDetail({
                        date,
                        startTime,
                        endTime,
                        location,
                        address,
                        note,
                        index: calendarDate.originalIndex,
                      });
                      setIsEditingDateDetail(false);
                      setShowDateDetailModal(true);
                    }
                  }}
                />
              </View>
            </>
          ) : (event.eventDates && Array.isArray(event.eventDates) && event.eventDates.length > 0) || event.scheduledFor ? (
            // No future events, but there are past events - show empty message
            <Text style={styles.scheduleValue}>No upcoming dates scheduled</Text>
          ) : (
            <Text style={styles.scheduleValue}>Date and time to be announced</Text>
          )}
        </View>

        {/* Past Events Button */}
        {pastEvents.length > 0 && (
          <View style={styles.pastEventsButtonContainer}>
            <Button
              label={`📜 Past Events (${pastEvents.length})`}
              onPress={() => setShowPastEventsModal(true)}
              variant="outline"
              style={styles.pastEventsButton}
            />
          </View>
        )}
      </View>

      {/* Past Events Modal */}
      <Modal
        isOpen={showPastEventsModal}
        onClose={() => setShowPastEventsModal(false)}
        title="Past Events"
      >
        <ScrollView style={styles.pastEventsModalContent}>
          {pastEvents.map((ed) => {
            const index = ed.originalIndex;
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
            
            return (
              <View key={index} style={styles.pastEventEntry}>
                <Text style={styles.pastEventDate}>
                  {dateStr}{timeStr ? ` (${timeStr})` : ''}
                </Text>
                {location && (
                  <Text style={styles.pastEventLocation}>{location}</Text>
                )}
                {address && (
                  <Text style={styles.pastEventAddress}>{address}</Text>
                )}
                {note && (
                  <Text style={styles.pastEventNote}>{note}</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </Modal>

      {/* Date Detail Modal */}
      <Modal
        isOpen={showDateDetailModal}
        onClose={() => {
          // Prevent closing the modal if RSVP update is in progress
          if (isUpdatingRSVPRef.current) {
            return;
          }
          setShowDateDetailModal(false);
          setSelectedDateDetail(null);
          setIsEditingDateDetail(false);
        }}
        title={isEditingDateDetail ? 'Edit Event Details' : (selectedDateDetail ? formatDate(selectedDateDetail.date.toISOString()) : 'Event Details')}
        fullScreen={isEditingDateDetail}
      >
        {selectedDateDetail && (() => {
          const { date, startTime, endTime, location, address, note } = selectedDateDetail;
          const dateStr = formatDate(date.toISOString());
          let timeStr = '';
          if (startTime && !isNaN(startTime.getTime()) && endTime && !isNaN(endTime.getTime())) {
            timeStr = `${formatTime(startTime.toISOString())} - ${formatTime(endTime.toISOString())}`;
          } else if (startTime && !isNaN(startTime.getTime())) {
            timeStr = formatTime(startTime.toISOString());
          }
          
          const rsvpSettings = event.rsvpSettings || { enabled: true, allowMaybe: true, attendanceLimit: null };
          const showRSVPForDate = isMember && rsvpSettings.enabled;
          const dateRSVP = getRSVPForDate(userId, date);
          const attendingMembers = getAttendingMembersForDate(date);
          
          return (
            <ScrollView style={styles.dateDetailModalContent}>
              <View style={styles.dateDetailContainer}>
                <View style={styles.dateDetailHeader}>
                  <Text style={styles.dateDetailDate}>
                    {dateStr}{timeStr ? ` (${timeStr})` : ''}
                  </Text>
                  {isOrganizerOrCoOrganizer && !isEditingDateDetail && (
                    <TouchableOpacity
                      onPress={() => {
                        setIsEditingDateDetail(true);
                        // Initialize editing form with current date details
                        setEditingDateDetailForm({
                          date: date instanceof Date ? date : new Date(date),
                          startTime: startTime && !isNaN(startTime.getTime()) ? (startTime instanceof Date ? startTime : new Date(startTime)) : null,
                          endTime: endTime && !isNaN(endTime.getTime()) ? (endTime instanceof Date ? endTime : new Date(endTime)) : null,
                          location: location || '',
                          address: address || '',
                          note: note || '',
                        });
                      }}
                      style={styles.editIconButton}
                    >
                      <Text style={styles.editIconText}>✏️</Text>
                    </TouchableOpacity>
                  )}
                </View>
                
                {/* Edit Mode: Show editable fields for date and time */}
                {isEditingDateDetail && isOrganizerOrCoOrganizer && (
                  <>
                    {/* Date Field */}
                    <View style={styles.dateDetailSection}>
                      <View style={styles.dateDetailHeader}>
                        <Text style={styles.dateDetailLabel}>Date</Text>
                      </View>
                      {editingDateDetailField === 'date' ? (
                        <View>
                          <TouchableOpacity
                            onPress={() => setShowDateDetailTimePicker({ type: 'date' })}
                            style={styles.datePickerButton}
                          >
                            <Text style={styles.datePickerButtonText}>
                              {editingDateDetailForm.date
                                ? formatDate(editingDateDetailForm.date.toISOString())
                                : 'Select date'}
                            </Text>
                          </TouchableOpacity>
                          {Platform.OS !== 'web' && showDateDetailTimePicker.type === 'date' && (
                            <DateTimePicker
                              value={editingDateDetailForm.date || new Date()}
                              mode="date"
                              display="default"
                              minimumDate={new Date()}
                              onChange={(event, selectedDate) => {
                                if (selectedDate) {
                                  // Preserve the time from the original date
                                  const currentDate = editingDateDetailForm.date || new Date();
                                  const newDate = new Date(selectedDate);
                                  newDate.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
                                  setEditingDateDetailForm(prev => ({ ...prev, date: newDate }));
                                }
                                setShowDateDetailTimePicker({ type: null });
                              }}
                            />
                          )}
                          {Platform.OS === 'web' && showDateDetailTimePicker.type === 'date' && (
                            <Modal
                              isOpen={true}
                              onClose={() => setShowDateDetailTimePicker({ type: null })}
                              title="Select Date"
                            >
                              <CalendarDatePicker
                                selectedDates={editingDateDetailForm.date ? [{
                                  date: editingDateDetailForm.date,
                                  startTime: editingDateDetailForm.date,
                                  endTime: editingDateDetailForm.date,
                                }] : []}
                                onDatesChange={(dates) => {
                                  if (dates.length > 0) {
                                    // Preserve the time from the original date
                                    const currentDate = editingDateDetailForm.date || new Date();
                                    const newDate = dates[0].date instanceof Date 
                                      ? new Date(dates[0].date) 
                                      : new Date(dates[0].date);
                                    newDate.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
                                    setEditingDateDetailForm(prev => ({ ...prev, date: newDate }));
                                    setShowDateDetailTimePicker({ type: null });
                                  }
                                }}
                                minDate={new Date()}
                                readOnly={false}
                              />
                            </Modal>
                          )}
                          <View style={styles.inlineEditActions}>
                            <Button
                              label="💾 Save"
                              onPress={() => handleSaveDateDetailField('date')}
                              style={styles.inlineEditButton}
                              variant="primary"
                            />
                            <Button
                              label="❌ Cancel"
                              onPress={() => {
                                setEditingDateDetailField(null);
                                setEditingDateDetailForm(prev => ({
                                  ...prev,
                                  date: date instanceof Date ? date : new Date(date),
                                }));
                              }}
                              variant="outline"
                              style={styles.inlineEditButton}
                            />
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => setEditingDateDetailField('date')}
                          style={styles.dateDetailValueContainer}
                        >
                          <Text style={styles.dateDetailValue}>
                            {formatDate(date.toISOString())}
                          </Text>
                          <Text style={styles.editIconText}>✏️</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Start Time Field */}
                    {startTime && !isNaN(startTime.getTime()) && (
                      <View style={styles.dateDetailSection}>
                        <View style={styles.dateDetailHeader}>
                          <Text style={styles.dateDetailLabel}>Start Time</Text>
                        </View>
                        {editingDateDetailField === 'startTime' ? (
                          <View>
                            <TouchableOpacity
                              onPress={() => setShowDateDetailTimePicker({ type: 'startTime' })}
                              style={styles.datePickerButton}
                            >
                              <Text style={styles.datePickerButtonText}>
                                {editingDateDetailForm.startTime
                                  ? formatTime(editingDateDetailForm.startTime.toISOString())
                                  : 'Select start time'}
                              </Text>
                            </TouchableOpacity>
                            {showDateDetailTimePicker.type === 'startTime' && (
                              <DateTimePicker
                                value={editingDateDetailForm.startTime || new Date()}
                                mode="time"
                                display="default"
                                is24Hour={false}
                                onChange={(event, selectedTime) => {
                                  if (selectedTime && event.type !== 'dismissed') {
                                    setEditingDateDetailForm(prev => ({ ...prev, startTime: selectedTime }));
                                    setShowDateDetailTimePicker({ type: null });
                                  }
                                }}
                              />
                            )}
                            <View style={styles.inlineEditActions}>
                              <Button
                                label="💾 Save"
                                onPress={() => handleSaveDateDetailField('startTime')}
                                style={styles.inlineEditButton}
                                variant="primary"
                              />
                              <Button
                                label="❌ Cancel"
                                onPress={() => {
                                  setEditingDateDetailField(null);
                                  setEditingDateDetailForm(prev => ({
                                    ...prev,
                                    startTime: startTime instanceof Date ? startTime : new Date(startTime),
                                  }));
                                }}
                                variant="outline"
                                style={styles.inlineEditButton}
                              />
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setEditingDateDetailField('startTime')}
                            style={styles.dateDetailValueContainer}
                          >
                            <Text style={styles.dateDetailValue}>
                              {formatTime(startTime.toISOString())}
                            </Text>
                            <Text style={styles.editIconText}>✏️</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* End Time Field */}
                    {endTime && !isNaN(endTime.getTime()) && (
                      <View style={styles.dateDetailSection}>
                        <View style={styles.dateDetailHeader}>
                          <Text style={styles.dateDetailLabel}>End Time</Text>
                        </View>
                        {editingDateDetailField === 'endTime' ? (
                          <View>
                            <TouchableOpacity
                              onPress={() => setShowDateDetailTimePicker({ type: 'endTime' })}
                              style={styles.datePickerButton}
                            >
                              <Text style={styles.datePickerButtonText}>
                                {editingDateDetailForm.endTime
                                  ? formatTime(editingDateDetailForm.endTime.toISOString())
                                  : 'Select end time'}
                              </Text>
                            </TouchableOpacity>
                            {showDateDetailTimePicker.type === 'endTime' && (
                              <DateTimePicker
                                value={editingDateDetailForm.endTime || new Date()}
                                mode="time"
                                display="default"
                                is24Hour={false}
                                onChange={(event, selectedTime) => {
                                  if (selectedTime && event.type !== 'dismissed') {
                                    setEditingDateDetailForm(prev => ({ ...prev, endTime: selectedTime }));
                                    setShowDateDetailTimePicker({ type: null });
                                  }
                                }}
                              />
                            )}
                            <View style={styles.inlineEditActions}>
                              <Button
                                label="💾 Save"
                                onPress={() => handleSaveDateDetailField('endTime')}
                                style={styles.inlineEditButton}
                                variant="primary"
                              />
                              <Button
                                label="❌ Cancel"
                                onPress={() => {
                                  setEditingDateDetailField(null);
                                  setEditingDateDetailForm(prev => ({
                                    ...prev,
                                    endTime: endTime instanceof Date ? endTime : new Date(endTime),
                                  }));
                                }}
                                variant="outline"
                                style={styles.inlineEditButton}
                              />
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setEditingDateDetailField('endTime')}
                            style={styles.dateDetailValueContainer}
                          >
                            <Text style={styles.dateDetailValue}>
                              {formatTime(endTime.toISOString())}
                            </Text>
                            <Text style={styles.editIconText}>✏️</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* Notes Field */}
                    <View style={styles.dateDetailSection}>
                      <View style={styles.dateDetailHeader}>
                        <Text style={styles.dateDetailLabel}>Notes</Text>
                      </View>
                      {editingDateDetailField === 'note' ? (
                        <View>
                          <Input
                            value={editingDateDetailForm.note}
                            onChangeText={(text) =>
                              setEditingDateDetailForm(prev => ({ ...prev, note: text }))
                            }
                            placeholder="Add notes about parking, snacks, etc."
                            multiline
                            numberOfLines={4}
                            style={styles.modalInput}
                          />
                          <View style={styles.inlineEditActions}>
                            <Button
                              label="💾 Save"
                              onPress={() => handleSaveDateDetailField('note')}
                              style={styles.inlineEditButton}
                              variant="primary"
                            />
                            <Button
                              label="❌ Cancel"
                              onPress={() => {
                                setEditingDateDetailField(null);
                                setEditingDateDetailForm(prev => ({
                                  ...prev,
                                  note: note || '',
                                }));
                              }}
                              variant="outline"
                              style={styles.inlineEditButton}
                            />
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => setEditingDateDetailField('note')}
                          style={styles.dateDetailValueContainer}
                        >
                          <Text style={note ? styles.dateDetailValue : styles.dateDetailPlaceholder}>
                            {note || 'No notes yet. Tap ✏️ to add notes.'}
                          </Text>
                          <Text style={styles.editIconText}>✏️</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}

                {/* View Mode: Show read-only info */}
                {!isEditingDateDetail && (
                  <>
                {location && (
                  <View style={styles.dateDetailLocation}>
                    <Text style={styles.dateDetailLocationText}>{location}</Text>
                    {address && (
                      <Text style={styles.dateDetailAddressText}>{address}</Text>
                    )}
                  </View>
                )}
                
                {note && (
                  <View style={styles.dateDetailNote}>
                    <Text style={styles.dateDetailNoteText}>{note}</Text>
                  </View>
                    )}
                  </>
                )}
                
                {/* Show attending members for this date */}
                {attendingMembers && attendingMembers.length > 0 && (
                  <View style={styles.dateDetailAttendingContainer}>
                    <Text style={styles.dateDetailAttendingLabel}>
                      {attendingMembers.length} {attendingMembers.length === 1 ? 'person' : 'people'} attending:
                    </Text>
                    <View style={styles.dateDetailAttendingAvatars}>
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
                              onPress={() => {
                                setShowDateDetailModal(false);
                                setSelectedUserForProfile({
                                  userId: member.userId,
                                  userName: displayName,
                                  avatarUrl: avatarUrl
                                });
                              }}
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
                )}
                
                {/* RSVP buttons */}
                {showRSVPForDate && (
                  <View 
                    style={styles.dateDetailRSVPContainer}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                  >
                    <Text style={styles.dateDetailRSVPLabel}>Your RSVP:</Text>
                    <View style={styles.dateDetailRSVPButtons}>
                      <View style={styles.dateRSVPButtonsRow}>
                        <Button
                          label="✅ Going"
                          onPress={() => {
                            handleRSVP('going', date, null);
                          }}
                          variant={dateRSVP === 'going' ? 'primary' : 'outline'}
                          style={styles.dateRSVPButton}
                          textStyle={styles.dateRSVPButtonText}
                        />
                        {rsvpSettings.allowMaybe && (
                          <Button
                            label="🤔 Maybe"
                            onPress={() => {
                              handleRSVP('maybe', date, null);
                            }}
                            variant={dateRSVP === 'maybe' ? 'primary' : 'outline'}
                            style={styles.dateRSVPButton}
                            textStyle={styles.dateRSVPButtonText}
                          />
                        )}
                      </View>
                      <View style={styles.dateRSVPButtonsRow}>
                        <Button
                          label="❌ Can't Make It"
                          onPress={() => {
                            handleRSVP('not-going', date, null);
                          }}
                          variant={dateRSVP === 'not-going' ? 'primary' : 'outline'}
                          style={styles.dateRSVPButton}
                          textStyle={styles.dateRSVPButtonText}
                        />
                      </View>
                    </View>
                  </View>
                )}

                {/* Delete and Done Editing Buttons */}
                {isEditingDateDetail && isOrganizerOrCoOrganizer && (
                  <View style={styles.dateDetailActions}>
                    <Button
                      label="🗑️ Delete Event"
                      onPress={handleDeleteDate}
                      variant="outline"
                      style={[styles.modalButton, styles.deleteEventButton, { backgroundColor: '#fee', borderColor: '#f44' }]}
                    />
                    <Button
                      label="✅ Done Editing"
                      onPress={() => {
                        setIsEditingDateDetail(false);
                        setEditingDateDetailField(null);
                      }}
                      variant="primary"
                      style={styles.modalButton}
                    />
                  </View>
                )}
              </View>
            </ScrollView>
          );
        })()}
      </Modal>

      {/* Archive Section - Only content below calendar */}
      {isOrganizerOrCoOrganizer && (
        <View style={styles.section}>
          <Button
            label="📦 Archive MeepleUp"
            onPress={handleArchiveEvent}
            variant="outline"
            style={styles.dangerAction}
          />
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
                label="✅ Going"
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
                  label="🤔 Maybe"
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
                label="❌ Can't Make It"
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
      {isMember && !isOrganizerOrCoOrganizer && (
        <View style={styles.section}>
          <Button
            label="👋 Leave MeepleUp"
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
      async (snapshot) => {
        console.log('[EventHub] Discussion posts snapshot received, docs:', snapshot.docs.length);
        
        // Get list of blocked users
        const blockedUsers = await getBlockedUsers(userId);
        const blockedUserSet = new Set(blockedUsers);
        
        const posts = [];
        
        for (const doc of snapshot.docs) {
          const data = doc.data();
          // Filter out deleted posts
          if (data.deleted === true) continue;
          
          // Skip posts from blocked users
          if (data.userId && blockedUserSet.has(data.userId)) {
            continue;
          }
          
          posts.push({
            id: doc.id,
            userId: data.userId,
            userName: data.userName || 'Unknown',
            userAvatarUrl: data.userAvatarUrl || null,
            content: data.content || '',
            photoUrl: data.photoUrl || null,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || null,
            edited: data.edited || false,
            pinned: data.pinned || false,
          });
        }
        
        // Deduplicate posts by ID (in case of race conditions)
        const uniquePosts = [];
        const seenIds = new Set();
        for (const post of posts) {
          if (!seenIds.has(post.id)) {
            seenIds.add(post.id);
            uniquePosts.push(post);
          }
        }
        
        // Sort manually: pinned first, then by date (newest first)
        uniquePosts.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        // Limit to 50 most recent after sorting
        console.log('[EventHub] Setting discussion messages, count:', uniquePosts.slice(0, 50).length);
        setDiscussionMessages(uniquePosts.slice(0, 50));
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
  }, [event?.id, isMember, db, userId]);

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
        async (snapshot) => {
          console.log(`[EventHub] Comments snapshot for post ${post.id}, docs:`, snapshot.docs.length);
          
          // Get list of blocked users
          const blockedUsers = await getBlockedUsers(userId);
          const blockedUserSet = new Set(blockedUsers);
          
          const comments = [];
          
          for (const doc of snapshot.docs) {
            const data = doc.data();
            // Filter out deleted comments
            if (data.deleted === true) continue;
            
            // Skip comments from blocked users
            if (data.userId && blockedUserSet.has(data.userId)) {
              continue;
            }
            
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
  }, [event?.id, isMember, db, discussionMessages, userId]);

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

  // Handler for selecting a photo
  const handleSelectPhoto = useCallback(async () => {
    if (!userId) return;

    try {
      // Check photo upload limit
      const limitCheck = await checkPhotoUploadLimit(userId);
      if (!limitCheck.canUpload) {
        Alert.alert(
          'Photo Limit Reached',
          `You've reached your monthly photo limit of ${limitCheck.limit} photos. You've uploaded ${limitCheck.count} photos this month.`,
        );
        return;
      }

      setSelectedPhoto({ uri: null, uploading: true });

      // Pick and upload photo with mobile-optimized settings
      const photoUrl = await pickAndUploadImage(userId, {
        maxSize: 1200, // Good quality for mobile viewing
        quality: 0.7, // Balanced compression
        path: 'post-photos',
        allowsEditing: false, // Don't force square for posts
        aspect: null, // Allow any aspect ratio
      });

      if (photoUrl) {
        // Increment photo upload count
        await incrementPhotoUploadCount(userId);
        setSelectedPhoto({ uri: photoUrl, uploading: false });
      } else {
        // User cancelled
        setSelectedPhoto(null);
      }
    } catch (error) {
      console.error('Error selecting photo:', error);
      Alert.alert('Error', error.message || 'Failed to select photo. Please try again.');
      setSelectedPhoto(null);
    }
  }, [userId]);

  // Handler for posting messages - memoized to prevent recreation
  const handlePostMessage = useCallback(async () => {
    if ((!newMessage.trim() && !selectedPhoto?.uri) || !userId || !event?.id || !db) {
      return;
    }

    try {
      const postsRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts');
      
      const postData = {
        userId,
        userName: user?.name || user?.email || 'Unknown',
        userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
        content: newMessage.trim() || '',
        photoUrl: selectedPhoto?.uri || null,
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
      
      // Add to local state (optimistic update)
      // Note: The snapshot listener will also update this, so we check for duplicates
      setDiscussionMessages(prev => {
        // Check if post already exists (shouldn't happen, but prevent duplicates)
        if (prev.some(msg => msg.id === docRef.id)) {
          return prev;
        }
        return [{
          id: docRef.id,
          userId,
          userName: user?.name || user?.email || 'Unknown',
          content: newMessage.trim() || '',
          photoUrl: selectedPhoto?.uri || null,
          createdAt: new Date().toISOString(),
          pinned: false,
        }, ...prev];
      });
      
      setNewMessage('');
      setSelectedPhoto(null);
    } catch (error) {
      console.error('Error posting message:', error);
      Alert.alert('Error', 'Failed to post message. Please try again.');
    }
  }, [newMessage, selectedPhoto, userId, event?.id, db, user?.name, user?.email]);

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
            label="❌ Cancel"
            onPress={onCancel}
            variant="outline"
            style={styles.replyCancelButton}
          />
          <Button
            label="📝 Post Reply"
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
              <TouchableOpacity
                onPress={() => setSelectedUserForProfile({
                  userId: comment.userId,
                  userName: comment.userName,
                  avatarUrl: comment.userAvatarUrl
                })}
              >
                <Text style={styles.commentAuthor}>{comment.userName}</Text>
              </TouchableOpacity>
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
                  label="❌ Cancel"
                  onPress={() => {
                    setEditing(null);
                    setEditText('');
                  }}
                  variant="outline"
                  style={styles.editCancelButton}
                />
                <Button
                  label="💾 Save"
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
          <PrivateMessaging 
            eventId={event?.id} 
            members={members}
            onBackToTabletalk={() => setShowPrivateMessaging(false)}
          />
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
            {isOrganizerOrCoOrganizer && (
              <TouchableOpacity
                onPress={() => setShowEditPinnedNotes(true)}
                style={styles.editLink}
              >
                <Text style={styles.editLinkText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.sectionCopy}>
            {pinnedNotes || (isOrganizerOrCoOrganizer ? 'Add notes about parking, what to bring, house rules, etc.' : 'No pinned notes yet.')}
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
                            label="❌ Cancel"
                            onPress={() => {
                              setEditing(null);
                              setEditText('');
                            }}
                            variant="outline"
                            style={styles.editCancelButton}
                          />
                          <Button
                            label="💾 Save"
                            onPress={() => handleEditPost(message.id, editText)}
                            disabled={!editText.trim()}
                            style={styles.editSaveButton}
                          />
                        </View>
                      </View>
                    ) : (
                      <>
                        {message.content ? (
                          <Text style={styles.messageContent}>{message.content}</Text>
                        ) : null}
                        {message.photoUrl && (
                          <View style={styles.postPhotoContainer}>
                            <Image
                              source={{ uri: message.photoUrl }}
                              style={styles.postPhoto}
                              resizeMode="contain"
                            />
                          </View>
                        )}
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
            <Text style={styles.sectionTitle}>Tabletalk</Text>
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
                      <TouchableOpacity
                        onPress={() => {
                          if (message.userId) {
                            setSelectedUserForProfile({
                              userId: message.userId,
                              userName: message.userName,
                              avatarUrl: message.userAvatarUrl || null,
                            });
                          }
                        }}
                      >
                        <Text style={styles.messageAuthor}>{message.userName}</Text>
                      </TouchableOpacity>
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
                            label="❌ Cancel"
                            onPress={() => {
                              setEditing(null);
                              setEditText('');
                            }}
                            variant="outline"
                            style={styles.editCancelButton}
                          />
                          <Button
                            label="💾 Save"
                            onPress={() => handleEditPost(message.id, editText)}
                            disabled={!editText.trim()}
                            style={styles.editSaveButton}
                          />
                        </View>
                      </View>
                    ) : (
                      <>
                        {message.content ? (
                          <Text style={styles.messageContent}>{message.content}</Text>
                        ) : null}
                        {message.photoUrl && (
                          <View style={styles.postPhotoContainer}>
                            <Image
                              source={{ uri: message.photoUrl }}
                              style={styles.postPhoto}
                              resizeMode="contain"
                            />
                          </View>
                        )}
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
              {isMember && (
                <TouchableOpacity
                  onPress={() => setShowPrivateMessaging(!showPrivateMessaging)}
                  style={styles.privateMessageToggle}
                >
                  <Text style={styles.privateMessageToggleText}>
                    {showPrivateMessaging ? '← Back to Tabletalk' : '💬 Private Messages'}
                  </Text>
                </TouchableOpacity>
              )}
              {selectedPhoto && (
                <View style={styles.selectedPhotoContainer}>
                  {selectedPhoto.uploading ? (
                    <View style={styles.photoUploadingContainer}>
                      <Text style={styles.photoUploadingText}>Uploading photo...</Text>
                    </View>
                  ) : (
                    <View style={styles.selectedPhotoPreview}>
                      <Image source={{ uri: selectedPhoto.uri }} style={styles.selectedPhotoPreviewImage} />
                      <TouchableOpacity
                        onPress={() => setSelectedPhoto(null)}
                        style={styles.removePhotoButton}
                      >
                        <Text style={styles.removePhotoButtonText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              <View style={styles.postInputRow}>
                <Input
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder="Start a new discussion..."
                  multiline
                  style={styles.messageInputField}
                />
                <TouchableOpacity
                  onPress={handleSelectPhoto}
                  style={styles.photoButton}
                  disabled={selectedPhoto?.uploading}
                >
                  <Text style={styles.photoButtonText}>📷</Text>
                </TouchableOpacity>
              </View>
              <Button
                label="📝 Post"
                onPress={handlePostMessage}
                disabled={(!newMessage.trim() && !selectedPhoto?.uri) || selectedPhoto?.uploading}
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
    isOrganizerOrCoOrganizer,
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
        
        // Only update state if the data actually changed (deep comparison)
        setGameInterests(prev => {
          // Create stable keys by sorting both gameIds and userIds
          const createStableKey = (data) => {
            return Object.keys(data || {}).sort().map(gameId => {
              const statuses = data[gameId] || {};
              const statusKeys = Object.keys(statuses).sort();
              const statusStr = statusKeys.map(uid => `${uid}:${statuses[uid]}`).join(',');
              return `${gameId}:{${statusStr}}`;
            }).join('|');
          };
          
          const prevKey = createStableKey(prev);
          const newKey = createStableKey(interests);
          
          if (prevKey === newKey) {
            // Data hasn't changed, return previous object to prevent re-render
            return prev;
          }
          
          return interests;
        });
      },
      (error) => {
        // Handle permission errors gracefully
        if (error.code === 'permission-denied') {
          console.warn('[EventHub] Permission denied loading game interests - user may not be a member yet');
          setGameInterests({});
        } else {
          console.error('Error loading game interests:', error);
          setGameInterests({});
        }
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

  // Move refs to parent scope so they persist across component recreations
  const gameInterestsKeyRef = useRef('');
  const collectionsKeyRef = useRef('');
  const membersKeyRef = useRef('');
  const memberNamesKeyRef = useRef('');
  const failedGameLookupsRef = useRef(new Set()); // Cache for games we know don't exist or are invalid
  const isComputingRef = useRef(false); // Track if computation is in progress
  const lastComputationTimeRef = useRef(0); // Track last computation time for debouncing
  
  // Use refs to track actual dependency values, not object references
  const gameInterestsRef = useRef(gameInterests);
  const collectionsRef = useRef(collections);
  const membersRef = useRef(members);
  const memberNamesRef = useRef(memberNames);

  // Load proposals from Firestore - MOVED OUTSIDE GamesTabComponent to prevent recreation loops
  useEffect(() => {
    if (!event?.id || !db || !isMember) {
      setProposedGames([]);
      setUserProposals(new Set());
      return;
    }
    
    // Use onSnapshot for real-time updates, but handle permission errors gracefully
    const proposalsRef = db.collection('gamingGroups').doc(event.id)
      .collection('nominations');
    
    const unsubscribe = proposalsRef.onSnapshot(
      (proposalsSnapshot) => {
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
              gameOwnerId: data.gameOwnerId || null,
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
                gameOwnerId: data.gameOwnerId || existing.gameOwnerId || null,
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
        
        // Only update if proposals actually changed (deep comparison)
        setProposedGames(prev => {
          if (prev.length !== validProposals.length) {
            return validProposals;
          }
          // Compare by gameId and proposedBy
          const prevKey = prev.map(p => `${p.gameId}:${p.proposedBy}`).sort().join(',');
          const newKey = validProposals.map(p => `${p.gameId}:${p.proposedBy}`).sort().join(',');
          if (prevKey !== newKey) {
            return validProposals;
          }
          // Same proposals, return previous array to prevent re-render
          return prev;
        });
        
        // Only update if user proposals actually changed
        setUserProposals(prev => {
          const prevArray = Array.from(prev).sort();
          const newArray = Array.from(userProps).sort();
          if (prevArray.length !== newArray.length) {
            return userProps;
          }
          if (prevArray.join(',') !== newArray.join(',')) {
            return userProps;
          }
          // Same proposals, return previous Set to prevent re-render
          return prev;
        });
      },
      (error) => {
        // Handle permission errors gracefully
        if (error.code === 'permission-denied') {
          console.warn('[EventHub] Permission denied loading proposals - user may not be a member yet');
          setProposedGames([]);
          setUserProposals(new Set());
        } else {
          console.error('Error loading proposals:', error);
          setProposedGames([]);
          setUserProposals(new Set());
        }
      }
    );

    return () => unsubscribe();
  }, [event?.id, db, isMember, userId]);

  // Games Tab Component - Rebuilt from scratch
  // Memoize to prevent recreation on every render (which causes modal to remount)
  const GamesTab = React.useMemo(() => {
    const GamesTabComponent = () => {
      // Helper function to check if avatar URL is valid
      const isValidAvatarUrl = (url) => {
        return url && typeof url === 'string' && url.trim() !== '';
      };
      
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
    
    useEffect(() => {
      // Prevent concurrent computations
      if (isComputingRef.current) {
        console.log('[ExpectedGames] Computation already in progress, skipping');
        return;
      }
      
      // Debounce: Don't run if we just computed recently (within 200ms)
      const now = Date.now();
      if (now - lastComputationTimeRef.current < 200) {
        console.log('[ExpectedGames] Debouncing - too soon since last computation');
        return;
      }
      
      // Create stable keys from CURRENT prop values (use props directly, not refs)
      // This ensures we're comparing against the actual current state
      const safeGameInterests = gameInterests || {};
      const safeCollections = collections || {};
      const safeMembers = Array.isArray(members) ? members : [];
      const safeMemberNames = memberNames || {};
      
      const gameInterestsSorted = Object.keys(safeGameInterests).sort().reduce((acc, gameId) => {
        const statuses = safeGameInterests[gameId] || {};
        const statusKeys = Object.keys(statuses).sort();
        acc[gameId] = statusKeys.map(uid => `${uid}:${statuses[uid]}`).join(',');
        return acc;
      }, {});
      const gameInterestsKey = JSON.stringify(gameInterestsSorted);
      const collectionsKey = JSON.stringify(Object.keys(safeCollections).sort());
      const membersKey = JSON.stringify(safeMembers.filter(m => m && m.userId).map(m => m.userId).sort());
      const memberNamesKey = JSON.stringify(Object.keys(safeMemberNames).sort().map(k => `${k}:${safeMemberNames[k] || ''}`));
      
      // Only update if gameInterests actually changed (main trigger)
      // OR if collections/members changed significantly (new data available)
      const gameInterestsChanged = gameInterestsKey !== gameInterestsKeyRef.current;
      const collectionsChanged = collectionsKey !== collectionsKeyRef.current;
      const membersChanged = membersKey !== membersKeyRef.current;
      const memberNamesChanged = memberNamesKey !== memberNamesKeyRef.current;
      
      // Log what changed (but only once per change, not every render)
      const changes = [];
      if (gameInterestsChanged) changes.push('gameInterests');
      if (collectionsChanged) changes.push('collections');
      if (membersChanged) changes.push('members');
      if (memberNamesChanged) changes.push('memberNames');
      
      if (changes.length > 0) {
        console.log(`[ExpectedGames] Effect triggered - changes: ${changes.join(', ')}`);
        console.log(`[ExpectedGames] Key comparison - gameInterests: ${gameInterestsChanged ? 'CHANGED' : 'same'} (prev: ${gameInterestsKeyRef.current?.substring(0, 50) || 'empty'}..., new: ${gameInterestsKey.substring(0, 50)}...)`);
        console.log(`[ExpectedGames] Key comparison - collections: ${collectionsChanged ? 'CHANGED' : 'same'} (prev: ${collectionsKeyRef.current || 'empty'}, new: ${collectionsKey})`);
        console.log(`[ExpectedGames] Key comparison - members: ${membersChanged ? 'CHANGED' : 'same'} (prev: ${membersKeyRef.current || 'empty'}, new: ${membersKey})`);
        
        // If gameInterests changed, log why
        if (gameInterestsChanged) {
          console.log(`[ExpectedGames] gameInterests key changed - prev length: ${gameInterestsKeyRef.current?.length || 0}, new length: ${gameInterestsKey.length}`);
        }
      } else {
        console.log('[ExpectedGames] No changes detected, skipping computation');
        return;
      }
      
      // Only recompute if gameInterests, collections, or members changed
      // memberNames changes don't require recomputation (only affects display names in results)
      if (!gameInterestsChanged && !collectionsChanged && !membersChanged) {
        // Update memberNames key ref but don't recompute
        memberNamesKeyRef.current = memberNamesKey;
        // Also update data refs for next comparison
        gameInterestsRef.current = gameInterests;
        collectionsRef.current = collections;
        membersRef.current = members;
        memberNamesRef.current = memberNames;
        return;
      }
      
      // CRITICAL: Update key refs IMMEDIATELY after detecting a change
      // This must happen BEFORE any async operations to prevent the next effect run
      // from seeing the same change again
      gameInterestsKeyRef.current = gameInterestsKey;
      collectionsKeyRef.current = collectionsKey;
      membersKeyRef.current = membersKey;
      memberNamesKeyRef.current = memberNamesKey;
      
      // Also update data refs for use in computation
      gameInterestsRef.current = safeGameInterests;
      collectionsRef.current = safeCollections;
      membersRef.current = safeMembers;
      memberNamesRef.current = safeMemberNames;
      
      console.log(`[ExpectedGames] Updated key refs - gameInterests length: ${gameInterestsKey.length}, collections: ${collectionsKey}, members: ${membersKey}`);
      
      // Clear failed lookups cache ONLY if gameInterests changed (new games might be added)
      // Don't clear on other dependency changes - we want to preserve the cache
      if (gameInterestsChanged) {
        console.log('[ExpectedGames] Clearing failed lookups cache - gameInterests changed');
        failedGameLookupsRef.current.clear();
      }
      
      // Skip computation if we don't have required data
      if (!event?.id || !safeMembers.length || !safeCollections || Object.keys(safeCollections).length === 0) {
        setExpectedGames(prev => {
          if (prev.length === 0) return prev; // Already empty, no need to update
          return [];
        });
        return;
      }
      
      // Compute expected games lazily
      const computeExpectedGames = async () => {
        isComputingRef.current = true;
        lastComputationTimeRef.current = Date.now();
        try {
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
        // Filter out games that are already in the failed cache BEFORE processing
        const allGameIds = Object.keys(gameInterests);
        const gamesToProcess = [];
        const skippedCount = { cached: 0, noBringing: 0 };
        
        allGameIds.forEach(gameId => {
          const statuses = gameInterests[gameId] || {};
          const bringingUserIds = Object.keys(statuses).filter(
            uid => statuses[uid] === 'bringing'
          );
          
          if (bringingUserIds.length === 0) {
            skippedCount.noBringing++;
            return;
          }
          
          // Check cache BEFORE processing
          const lookupKey = `${gameId}_${bringingUserIds.sort().join(',')}`;
          if (failedGameLookupsRef.current.has(lookupKey)) {
            skippedCount.cached++;
            return;
          }
          
          gamesToProcess.push(gameId);
        });
        
        if (skippedCount.cached > 0 || skippedCount.noBringing > 0) {
          console.log(`[ExpectedGames] Processing ${gamesToProcess.length} games (skipped: ${skippedCount.cached} cached, ${skippedCount.noBringing} no bringing)`);
        }
        
        const gamePromises = gamesToProcess.map(async (gameId) => {
          const currentGameInterests = gameInterestsRef.current || {};
          const statuses = currentGameInterests[gameId] || {};
          const bringingUserIds = Object.keys(statuses).filter(
            uid => statuses[uid] === 'bringing'
          );
          
          if (seenGameIds.has(gameId)) {
            return null;
          }
          
          // Create lookup key for this game
          const lookupKey = `${gameId}_${bringingUserIds.sort().join(',')}`;
          
          // Find the game in any user's collection
          // Match by BGG ID first, then fallback to game.id
          const currentMembers = Array.isArray(membersRef.current) ? membersRef.current : [];
          const currentCollections = collectionsRef.current || {};
          let gameData = null;
          for (const member of currentMembers) {
            const memberGames = currentCollections[member.userId] || [];
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
            const userGames = currentCollections[userId] || [];
            gameData = userGames.find(g => {
              const gId = g.bggId || g.id;
              return gId === gameId;
            });
          }
          
          // If not found in collections, fetch from Firestore (from the first user bringing it)
          // Cache check already done above, so we can proceed if we have db and users
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
            // Cache check already done above
            if ((!gameData || !gameData.title || gameData.title === 'Unknown Game' || gameData.title === `Game ${gameId}`) && 
                bringingUserIds.length > 0) {
              try {
                const fetchFromUserId = bringingUserIds[0];
                console.log(`[ExpectedGames] Fetching all games for user ${fetchFromUserId} to find gameId ${gameId}`);
                const allGamesSnapshot = await db.collection('userGames').doc(fetchFromUserId)
                  .collection('games')
                  .get();
                
                if (!allGamesSnapshot.empty) {
                  // Only log once per user, not for every game
                  if (!seenGameIds.has(`_logged_${fetchFromUserId}`)) {
                    console.log(`[ExpectedGames] Fetched ${allGamesSnapshot.docs.length} games for user ${fetchFromUserId}`);
                    seenGameIds.add(`_logged_${fetchFromUserId}`);
                  }
                  for (const doc of allGamesSnapshot.docs) {
                    const data = doc.data();
                    const docId = doc.id;
                    const dataBggId = data.bggId || null;
                    
                    // Match by document ID or bggId (convert to string for comparison)
                    const gameIdStr = String(gameId);
                    const docIdStr = String(docId);
                    const dataBggIdStr = dataBggId ? String(dataBggId) : null;
                    
                    if (docIdStr === gameIdStr || dataBggIdStr === gameIdStr) {
                      const foundTitle = data.title || data.gameName || null;
                      // Only log if title is invalid (to help debug)
                      if (!foundTitle || foundTitle === 'Unknown Game' || foundTitle === `Game ${gameId}`) {
                        console.warn(`[ExpectedGames] Matched game ${gameId} but title invalid: ${foundTitle || 'null'}`);
                      }
                      
                      // Only create gameData if we have a valid title
                      if (foundTitle && foundTitle !== 'Unknown Game' && foundTitle !== `Game ${gameId}`) {
                        gameData = {
                          id: docId,
                          title: foundTitle,
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
                      } else {
                        // Found the game but it has invalid title - will be marked as failed below
                      }
                    }
                  }
                }
              } catch (error) {
                console.error(`Error fetching all games for user ${bringingUserIds[0]}:`, error);
              }
            }
            
          }
          
          // If we still don't have valid data after all attempts, mark this lookup as failed to prevent repeated fetches
          if (!gameData || !gameData.title || gameData.title === 'Unknown Game' || gameData.title === `Game ${gameId}`) {
            failedGameLookupsRef.current.add(lookupKey);
            // Only log first few failures to avoid spam
            if (failedGameLookupsRef.current.size <= 10) {
              console.log(`[ExpectedGames] Marking gameId ${gameId} as failed (cache size: ${failedGameLookupsRef.current.size})`);
            }
          }
          
          // Only add game if we have valid game data with a real title
          if (gameData && gameData.title && gameData.title !== 'Unknown Game' && gameData.title !== `Game ${gameId}`) {
            seenGameIds.add(gameId);
            const safeMemberNamesForLookup = memberNamesRef.current || {};
            return {
              ...gameData,
              bringingBy: bringingUserIds.map(uid => ({
                userId: uid,
                userName: uid === userId 
                  ? (user?.name || user?.email || userId) 
                  : (safeMemberNamesForLookup[uid] || uid),
              })),
            };
          } else {
            // Only log warning if we haven't already marked this as a failed lookup
            if (!failedGameLookupsRef.current.has(lookupKey)) {
              console.warn(`[ExpectedGames] Could not find valid game data for gameId ${gameId}. gameData:`, gameData);
            }
          }
          
          return null;
        });
        
          const results = await Promise.all(gamePromises);
          const validGames = results.filter(g => g !== null);
          console.log(`[ExpectedGames] Computation complete: ${validGames.length} valid games, ${failedGameLookupsRef.current.size} in failed cache`);
          
          // Only update if games actually changed (deep comparison)
          setExpectedGames(prev => {
            if (prev.length !== validGames.length) {
              return validGames;
            }
            // Compare by game IDs
            const prevIds = prev.map(g => g.id).sort().join(',');
            const newIds = validGames.map(g => g.id).sort().join(',');
            if (prevIds !== newIds) {
              return validGames;
            }
            // Same games, return previous array to prevent re-render
            return prev;
          });
        } finally {
          isComputingRef.current = false;
        }
      };
      
      computeExpectedGames();
      // Note: We only depend on event?.id (stable) and use refs for actual data
      // This prevents the effect from running on every render when object references change
    }, [event?.id, userId]);

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

    // Get available event dates for date selector (only future dates)
    const eventDates = useMemo(() => {
      if (!event) return [];
      
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Compare dates only (ignore time)
      
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
        }).filter(ed => {
          if (!ed.date) return false;
          // Filter out past dates
          const eventDate = new Date(ed.date);
          eventDate.setHours(0, 0, 0, 0);
          return eventDate >= now;
        });
      } else if (event.scheduledFor) {
        const date = safeParseDate(event.scheduledFor);
        if (date && !isNaN(date.getTime())) {
          const eventDate = new Date(date);
          eventDate.setHours(0, 0, 0, 0);
          // Only include if it's a future date
          if (eventDate >= now) {
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
      }
      
      return [];
    }, [event]);

    // Do not auto-select a date; wait for user selection

    // Show modal when no other confirmed attendees (excluding logged-in user)
    // Only show when a date is first selected, not on every change
    const prevSelectedDateIndexRef = useRef(null);
    useEffect(() => {
      if (selectedGameNightDateIndex === null) {
        setShowNoConfirmedAttendeesModal(false);
        prevSelectedDateIndexRef.current = null;
        return;
      }
      
      // Only show modal if this is a new date selection (not just a re-render)
      const isNewDateSelection = prevSelectedDateIndexRef.current !== selectedGameNightDateIndex;
      prevSelectedDateIndexRef.current = selectedGameNightDateIndex;
      
      if (isNewDateSelection) {
        // Check if the logged-in user has confirmed for this date
        const selectedDate = eventDates[selectedGameNightDateIndex];
        const userHasConfirmed = selectedDate && userId ? (() => {
          const userRSVPs = memberRSVPs[userId] || {};
          if (typeof userRSVPs === 'string') {
            // Backward compatibility: old format
            return !selectedDate.date ? userRSVPs === 'going' : false;
          }
          const dateKey = getDateKey(selectedDate.date);
          return userRSVPs[dateKey] === 'going';
        })() : false;
        
        // Only show modal if user hasn't confirmed AND there are no other confirmed attendees
        const otherConfirmedAttendees = confirmedAttendees.filter(m => m.userId !== userId);
        const hasNoOtherConfirmedAttendees = otherConfirmedAttendees.length === 0;
        
        if (hasNoOtherConfirmedAttendees && !userHasConfirmed) {
          setShowNoConfirmedAttendeesModal(true);
        } else {
          setShowNoConfirmedAttendeesModal(false);
        }
      }
    }, [selectedGameNightDateIndex, confirmedAttendees, userId, eventDates, memberRSVPs]);

    // Get confirmed attendees for selected date (those with rsvpStatus === 'going')
    // Always include the logged-in user if they're a member
    const confirmedAttendees = useMemo(() => {
      if (selectedGameNightDateIndex === null) return [];
      
      const selectedDate = eventDates[selectedGameNightDateIndex];
      if (!selectedDate) return [];
      
      const dateKey = getDateKey(selectedDate.date);
      
      const confirmed = members.filter(member => {
        const memberRsvps = memberRSVPs[member.userId] || {};
        if (typeof memberRsvps === 'string') {
          // Backward compatibility: old format with single status
          return !selectedDate.date ? memberRsvps === 'going' : false;
        }
        const status = memberRsvps[dateKey];
        return status === 'going';
      });
      
      // Always include the logged-in user if they're a member and have confirmed for this date
      if (isMember && userId) {
        const userIsInList = confirmed.some(m => m.userId === userId);
        if (!userIsInList) {
          const userRSVPs = memberRSVPs[userId] || {};
          let userHasConfirmed = false;
          if (typeof userRSVPs === 'string') {
            // Backward compatibility: old format
            userHasConfirmed = !selectedDate.date ? userRSVPs === 'going' : false;
          } else {
            userHasConfirmed = userRSVPs[dateKey] === 'going';
          }
          
          if (userHasConfirmed) {
          const userMember = members.find(m => m.userId === userId);
          if (userMember) {
            confirmed.push(userMember);
            }
          }
        }
      }
      
      return confirmed;
    }, [members, memberRSVPs, selectedGameNightDateIndex, isMember, userId, eventDates]);

    // Aggregate games from confirmed attendees with owner info
    // Always include the logged-in user's games if they're a member
    const aggregatedGames = useMemo(() => {
      if (selectedGameNightDateIndex === null) return [];
      
      // If no confirmed attendees, still include logged-in user's games if they're a member
      const attendeesToProcess = confirmedAttendees.length > 0 
        ? confirmedAttendees 
        : (isMember && userId ? members.filter(m => m.userId === userId) : []);
      
      if (attendeesToProcess.length === 0) return [];
      
      const gamesMap = new Map(); // Key: gameId (bggId or id), Value: { game, owners: [names] }
      
      attendeesToProcess.forEach(attendee => {
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
    }, [confirmedAttendees, collections, memberNames, selectedGameNightDateIndex, isMember, userId, members]);

    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
        {/* Game Night Dates Section (navigation to Browse & Propose) */}
        {isMember && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Propose Games</Text>
            <Text style={styles.sectionCopy}>
              Choose a date to browse the super collection and propose games.
            </Text>
            
            {eventDates.length > 0 ? (
              <View style={styles.dateListContainer}>
                  {eventDates.map((ed, filteredIndex) => {
                  const currentEventId = eventId || event?.id;
                  const originalIndex = ed.index; // Use the original index from the eventDates array
                  const dateKey = ed?.date ? getDateKey(ed.date) : 'default';
                  
                  // Get all members' RSVP statuses for this date
                  const membersWithRSVP = members.map(member => {
                    if (!member || !member.userId) return null;
                    const memberRsvps = memberRSVPs[member.userId] || {};
                    let rsvpStatus = null;
                    if (typeof memberRsvps === 'string') {
                      // Backward compatibility: old format with single status
                      rsvpStatus = ed.date ? null : memberRsvps;
                    } else {
                      rsvpStatus = memberRsvps[dateKey] || null;
                    }
                    return {
                      userId: member.userId,
                      userName: memberNames[member.userId] || member.userId,
                      avatarUrl: memberAvatars[member.userId] || null,
                      rsvpStatus: rsvpStatus || 'no response',
                    };
                  }).filter(Boolean);

                    return (
                      <TouchableOpacity
                        key={originalIndex}
                      style={styles.dateListItem}
                                      onPress={() => {
                        console.log('[EventHub] Date selector clicked:', { 
                          originalIndex,
                          filteredIndex,
                          currentEventId, 
                          platform: Platform.OS,
                          hasNavigate: !!navigate,
                          hasNavigation: !!navigation?.navigate
                        });
                        if (Platform.OS === 'web' && navigate && currentEventId) {
                          console.log('[EventHub] Navigating to web route:', `/event/${currentEventId}/browse/${originalIndex}`);
                          navigate(`/event/${currentEventId}/browse/${originalIndex}`);
                        } else if (navigation?.navigate && currentEventId) {
                          console.log('[EventHub] Navigating to native screen:', 'BrowseAndPropose', { eventId: currentEventId, dateIndex: originalIndex });
                          navigation.navigate('BrowseAndPropose', { 
                            eventId: currentEventId, 
                            dateIndex: originalIndex 
                          });
                        }
                      }}
                    >
                      <View style={styles.dateListTextBlock}>
                        <Text style={styles.dateListTitle}>
                          {ed.date ? formatDate(ed.date.toISOString()) : 'Invalid Date'}
                          </Text>
                        <Text style={styles.dateListSubtext}>
                          {ed.startTime ? formatTime(ed.startTime.toISOString()) : 'Time TBD'}
                            </Text>
                        {ed.location ? (
                          <Text style={styles.dateListLocation} numberOfLines={1}>
                            {ed.location}
                                      </Text>
                        ) : null}
                                    </View>
                      <View style={styles.dateListRSVPsContainer}>
                        {membersWithRSVP.map((member) => {
                          const hasValidAvatar = isValidAvatarUrl(member.avatarUrl);
                          const rsvpStatus = member.rsvpStatus;
                          const rsvpStyle =
                            rsvpStatus === 'going' ? styles.rsvpBadgeGoing :
                            rsvpStatus === 'maybe' ? styles.rsvpBadgeMaybe :
                            rsvpStatus === 'not going' ? styles.rsvpBadgeNotGoing :
                            styles.rsvpBadgeUnknown;
                          const rsvpTextColor =
                            rsvpStatus === 'going' ? '#2e9b5e' :
                            rsvpStatus === 'maybe' ? '#a06c00' :
                            rsvpStatus === 'not going' ? '#b33936' :
                            '#555';
                          
                          return (
                            <TouchableOpacity
                              key={member.userId}
                              style={styles.dateListRSVPItem}
                              onPress={(e) => {
                                e.stopPropagation();
                                setSelectedUserForProfile({
                                  userId: member.userId,
                                  userName: member.userName,
                                  avatarUrl: member.avatarUrl
                                });
                              }}
                            >
                              {hasValidAvatar ? (
                                <Image
                                  source={{ uri: member.avatarUrl }}
                                  style={styles.dateListAvatarImage}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View style={styles.dateListAvatarPlaceholder}>
                                  <Text style={styles.dateListAvatarInitial}>
                                    {member.userName.charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                              )}
                              <View style={[styles.dateListRSVPBadge, rsvpStyle]}>
                                <Text style={[styles.dateListRSVPBadgeText, { color: rsvpTextColor }]}>
                                  {rsvpStatus === 'no response' ? '?' : rsvpStatus === 'going' ? '✓' : rsvpStatus === 'maybe' ? '?' : '✗'}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </TouchableOpacity>
                            );
                          })}
                            </View>
            ) : (
              <Text style={styles.sectionCopy}>
                No game night dates scheduled yet. Ask the organizer to add dates!
              </Text>
            )}
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
              label="⬅️ Back"
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
                label="🎮 Add games"
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
  }, [userId, collections, planningGamesSearchQuery, selectedGamesForBringing, showPlanningGamesModal, isMember, gameInterests, event?.id, event, members, user, memberNames, memberAvatars, memberRSVPs, selectedGameNightDateIndex, proposedGames, userProposals, handleSearchChange, handleSavePlanningGames, handleOpenGameDetails]);


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
            Tabletalk
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

      {/* No Confirmed Attendees Modal */}
      <Modal
        isOpen={showNoConfirmedAttendeesModal}
        onClose={() => setShowNoConfirmedAttendeesModal(false)}
        title="Game Night"
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalMessage}>
            No confirmed attendees yet, be the first to confirm!
          </Text>
          <Button
            label="❌ Close"
            onPress={() => setShowNoConfirmedAttendeesModal(false)}
            style={styles.modalButton}
          />
        </View>
      </Modal>

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
                                        console.log('[ProposeGame] Button clicked');
                                        console.log('[ProposeGame] Initial checks:', {
                                          hasEvent: !!event,
                                          eventId: event?.id,
                                          hasDb: !!db,
                                          hasUserId: !!userId,
                                          userId,
                                          userProposalsCount: userProposals.size,
                                        });
                                        
                                        if (!event?.id || !db || !userId) {
                                          console.error('[ProposeGame] Missing required data:', {
                                            eventId: event?.id,
                                            hasDb: !!db,
                                            userId,
                                          });
                                          return;
                                        }
                                        
                                        if (userProposals.size >= 5) {
                                          Alert.alert('Limit Reached', 'You can only propose up to 5 games. Remove a proposal first to propose another game.');
                                          return;
                                        }
                                        
                                        try {
                                          // Check if user is a member
                                          const groupDoc = await db.collection('gamingGroups').doc(event.id).get();
                                          const groupData = groupDoc.data();
                                          const memberIds = groupData?.memberIds || [];
                                          const isUserMember = memberIds.includes(userId) || groupData?.organizerId === userId;
                                          
                                          console.log('[ProposeGame] Membership check:', {
                                            eventId: event.id,
                                            userId,
                                            memberIds,
                                            organizerId: groupData?.organizerId,
                                            isUserMember,
                                            isOrganizer: groupData?.organizerId === userId,
                                            isInMemberIds: memberIds.includes(userId),
                                          });
                                          
                                          if (!isUserMember) {
                                            console.error('[ProposeGame] User is not a member of the group');
                                            Alert.alert('Error', 'You must be a member of this MeepleUp to propose games.');
                                            return;
                                          }
                                          
                                          // Identify game owner - check _ownerId first, then search collections
                                          let gameOwnerId = game._ownerId;
                                          let gameOwnerName = game._ownerName;
                                          
                                          // If not found, search collections to find the owner
                                          if (!gameOwnerId) {
                                            for (const [ownerUserId, ownerGames] of Object.entries(collections || {})) {
                                              if (Array.isArray(ownerGames)) {
                                                const ownerGame = ownerGames.find(g => (g.bggId || g.id) === gameId);
                                                if (ownerGame) {
                                                  gameOwnerId = ownerUserId;
                                                  gameOwnerName = memberNames[ownerUserId] || ownerUserId;
                                                  break;
                                                }
                                              }
                                            }
                                          } else if (!gameOwnerName) {
                                            gameOwnerName = memberNames[gameOwnerId] || gameOwnerId;
                                          }
                                          
                                          // Get proposer name
                                          const proposerName = memberNames[userId] || user?.name || userId;
                                          
                                          const proposalDoc = {
                                            gameId,
                                            gameName: game.title || 'Unknown Game',
                                            gameImage: game.image || game.thumbnail || null,
                                            nominatedBy: userId, // Keep field name for backward compatibility
                                            gameOwnerId: gameOwnerId || null,
                                            createdAt: firebase.firestore.Timestamp.now(),
                                          };
                                          
                                          console.log('[ProposeGame] Attempting to save proposal:', {
                                            eventId: event.id,
                                            gameId,
                                            proposalDoc,
                                            documentPath: `gamingGroups/${event.id}/nominations/${gameId}`,
                                          });
                                          
                                          await db.collection('gamingGroups').doc(event.id)
                                            .collection('nominations')
                                            .doc(gameId)
                                            .set(proposalDoc, { merge: true });
                                          
                                          console.log('[ProposeGame] Proposal saved successfully');
                                          
                                          // Notify game owner if they exist and are different from proposer
                                          if (gameOwnerId && gameOwnerId !== userId) {
                                            try {
                                              await notifyGameOwner(
                                                gameOwnerId,
                                                userId,
                                                proposerName,
                                                gameId,
                                                game.title || 'Unknown Game',
                                                event.id
                                              );
                                              console.log('[ProposeGame] Game owner notified');
                                            } catch (notifyError) {
                                              console.error('[ProposeGame] Error notifying game owner:', notifyError);
                                              // Don't fail the proposal if notification fails
                                            }
                                          }
                                          
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
                                              gameOwnerId: gameOwnerId || null,
                                              ratings: {},
                                            }];
                                          });
                                          
                                          Alert.alert('Game Proposed', `${game.title || 'Game'} has been proposed!`);
                                        } catch (error) {
                                          console.error('[ProposeGame] Error proposing game:', error);
                                          console.error('[ProposeGame] Error details:', {
                                            code: error.code,
                                            message: error.message,
                                            stack: error.stack,
                                            eventId: event?.id,
                                            userId,
                                            gameId,
                                          });
                                          Alert.alert('Error', `Failed to propose game: ${error.message || 'Please try again.'}`);
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

      {/* Member Action Modal */}
      {selectedMemberForAction && (
        <Modal
          isOpen={!!selectedMemberForAction}
          onClose={() => setSelectedMemberForAction(null)}
          title={`Manage ${selectedMemberForAction.displayName}`}
        >
          <View style={styles.memberActionModalContent}>
            {/* Make/Remove Co-Organizer */}
            {selectedMemberForAction.userId !== event?.organizerId && (
              <View style={styles.memberActionSection}>
                <Text style={styles.memberActionLabel}>Role</Text>
                {selectedMemberForAction.role !== memberRoles?.ORGANIZER ? (
                  <Button
                    label="⭐ Make Co-Organizer"
                    onPress={async () => {
                      try {
                        await updateMemberRole(event.id, userId, selectedMemberForAction.userId, memberRoles.ORGANIZER);
                        Alert.alert('Success', `${selectedMemberForAction.displayName} is now a co-organizer.`);
                        setSelectedMemberForAction(null);
                      } catch (error) {
                        Alert.alert('Error', error.message || 'Failed to update member role.');
                        console.error(error);
                      }
                    }}
                    style={styles.memberActionButton}
                  />
                ) : (
                  <Button
                    label="⬇️ Remove Co-Organizer"
                    onPress={async () => {
                      try {
                        await updateMemberRole(event.id, userId, selectedMemberForAction.userId, memberRoles.MEMBER);
                        Alert.alert('Success', `${selectedMemberForAction.displayName} is no longer a co-organizer.`);
                        setSelectedMemberForAction(null);
                      } catch (error) {
                        Alert.alert('Error', error.message || 'Failed to update member role.');
                        console.error(error);
                      }
                    }}
                    variant="outline"
                    style={styles.memberActionButton}
                  />
                )}
              </View>
            )}

            {/* Join Code Sharing Permission */}
            {selectedMemberForAction.role !== memberRoles?.ORGANIZER && (
              <View style={styles.memberActionSection}>
                <Text style={styles.memberActionLabel}>Join Code Sharing</Text>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>
                    {selectedMemberForAction.canShareJoinCode
                      ? 'Can share join codes'
                      : 'Cannot share join codes'}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.toggleSwitch,
                      selectedMemberForAction.canShareJoinCode && styles.toggleSwitchActive,
                    ]}
                    onPress={async () => {
                      try {
                        const newValue = !selectedMemberForAction.canShareJoinCode;
                        await updateMemberJoinCodePermission(
                          event.id,
                          userId,
                          selectedMemberForAction.userId,
                          newValue
                        );
                        setSelectedMemberForAction({
                          ...selectedMemberForAction,
                          canShareJoinCode: newValue,
                        });
                        Alert.alert(
                          'Success',
                          `${selectedMemberForAction.displayName} ${newValue ? 'can' : 'cannot'} now share join codes.`
                        );
                      } catch (error) {
                        Alert.alert('Error', error.message || 'Failed to update permission.');
                        console.error(error);
                      }
                    }}
                  >
                    <View
                      style={[
                        styles.toggleSwitchThumb,
                        selectedMemberForAction.canShareJoinCode && styles.toggleSwitchThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Remove Member */}
            {selectedMemberForAction.userId !== event?.organizerId && (
              <View style={styles.memberActionSection}>
                <Button
                  label={`🗑️ Remove ${selectedMemberForAction.displayName}`}
                  onPress={() => {
                    Alert.alert(
                      'Remove Member?',
                      `Are you sure you want to remove ${selectedMemberForAction.displayName} from this MeepleUp?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await leaveEvent(event.id, selectedMemberForAction.userId);
                              Alert.alert('Member Removed', `${selectedMemberForAction.displayName} has been removed from the MeepleUp.`);
                              setSelectedMemberForAction(null);
                            } catch (error) {
                              Alert.alert('Error', 'Failed to remove member. Please try again.');
                              console.error(error);
                            }
                          },
                        },
                      ],
                    );
                  }}
                  variant="outline"
                  style={[styles.memberActionButton, styles.removeMemberButton]}
                />
              </View>
            )}

            <View style={styles.memberActionModalFooter}>
              <Button
                label="❌ Close"
                onPress={() => setSelectedMemberForAction(null)}
                variant="outline"
                style={styles.memberActionButton}
              />
            </View>
          </View>
        </Modal>
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
          style={styles.modalContentNoPadding} 
          contentContainerStyle={styles.modalScrollContent}
        >
          {/* Calendar Date Picker */}
          <View style={styles.modalFieldContainerNoPadding}>
            <Text style={[styles.fieldLabel, { paddingHorizontal: 20 }]}>Select Event Dates</Text>
            <View style={[styles.longPressInstructionBox, { marginHorizontal: 20, marginBottom: 12 }]}>
              <Text style={styles.longPressInstructionText}>
                📅 <Text style={styles.longPressInstructionBold}>Long-press</Text> a date to add it to your schedule (highlighted in green). The date will be created with default times if available. Tap a selected date to view its details.
            </Text>
            </View>
            <View style={[styles.calendarContainer, { 
              marginLeft: -24, 
              marginRight: -24, 
              width: Dimensions.get('window').width,
              paddingHorizontal: 0,
              paddingLeft: 0,
              paddingRight: 0,
            }]}>
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
                // For organizers in Edit Schedule, open edit modal when tapping a selected date
                if (isOrganizerOrCoOrganizer && scheduleForm.selectedDates && scheduleForm.selectedDates[dateIndex]) {
                  const dateItem = scheduleForm.selectedDates[dateIndex];
                  setSelectedDateDetail({
                    ...dateItem,
                    index: dateIndex,
                    isEditScheduleContext: true, // Flag to indicate we're in Edit Schedule context
                  });
                  setEditingDateDetailForm({
                    date: dateItem.date instanceof Date ? dateItem.date : new Date(dateItem.date),
                    startTime: dateItem.startTime instanceof Date ? dateItem.startTime : new Date(dateItem.startTime),
                    endTime: dateItem.endTime instanceof Date ? dateItem.endTime : new Date(dateItem.endTime),
                    location: dateItem.location || '',
                    address: dateItem.address || '',
                    note: dateItem.note || '',
                  });
                  setIsEditingDateDetail(true);
                  setShowDateDetailModal(true);
                } else if (scheduleForm.selectedDates && scheduleForm.selectedDates[dateIndex]) {
                  // For non-organizers or fallback, scroll to date details
                  const dateItem = scheduleForm.selectedDates[dateIndex];
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
          </View>


          {event.scheduledFor && (
            <View style={styles.modalActions}>
              <Button
                label="📤 Export to Calendar"
                onPress={handleExportToCalendar}
                variant="outline"
                style={styles.modalButton}
              />
            </View>
          )}
          <View style={styles.modalActions}>
            <Button
              label="💾 Save"
              onPress={handleEditSchedule}
              style={styles.modalButton}
            />
            <Button
              label="❌ Cancel"
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
                    showTimePicker.type === 'usualStart' ? (scheduleForm.usualStartTime || new Date(new Date().setHours(18, 0, 0, 0))) :
                    showTimePicker.type === 'usualEnd' ? (scheduleForm.usualEndTime || new Date(new Date().setHours(22, 0, 0, 0))) :
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
                  {(showTimePicker.type === 'usualStart' || showTimePicker.type === 'usualEnd') && (
                    <Button
                      label="Clear"
                      onPress={() => {
                        if (showTimePicker.type === 'usualStart') {
                          setScheduleForm(prev => ({ ...prev, usualStartTime: null }));
                        } else if (showTimePicker.type === 'usualEnd') {
                          setScheduleForm(prev => ({ ...prev, usualEndTime: null }));
                        }
                        setShowTimePicker({ type: null, dateIndex: null });
                      }}
                      variant="outline"
                      style={styles.modalButton}
                    />
                  )}
                  <Button
                    label="✅ Done"
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
                  showTimePicker.type === 'usualStart' ? (scheduleForm.usualStartTime || new Date(new Date().setHours(18, 0, 0, 0))) :
                  showTimePicker.type === 'usualEnd' ? (scheduleForm.usualEndTime || new Date(new Date().setHours(22, 0, 0, 0))) :
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
                    ? (defaultTimeForm.usualStartTime || new Date(new Date().setHours(18, 0, 0, 0)))
                    : (defaultTimeForm.usualEndTime || new Date(new Date().setHours(22, 0, 0, 0)))
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
                  label="Clear"
                  onPress={() => {
                    if (showDefaultTimePicker.type === 'usualStart') {
                      setDefaultTimeForm(prev => ({ ...prev, usualStartTime: null }));
                    } else if (showDefaultTimePicker.type === 'usualEnd') {
                      setDefaultTimeForm(prev => ({ ...prev, usualEndTime: null }));
                    }
                    setShowDefaultTimePicker({ type: null });
                  }}
                  variant="outline"
                  style={styles.modalButton}
                />
                <Button
                  label="✅ Done"
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
                  ? (defaultTimeForm.usualStartTime || new Date(new Date().setHours(18, 0, 0, 0)))
                  : (defaultTimeForm.usualEndTime || new Date(new Date().setHours(22, 0, 0, 0)))
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
        onClose={() => {
          setSelectedDateDetail(null);
          setEditingDateDetailField(null);
        }}
        title="Event Date Details"
      >
        {selectedDateDetail && (
          <View style={styles.dateDetailModalContent}>
            {/* Date Field */}
            <View style={styles.dateDetailSection}>
              <View style={styles.dateDetailHeader}>
                <Text style={styles.dateDetailLabel}>Date</Text>
                {isOrganizerOrCoOrganizer && editingDateDetailField !== 'date' && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingDateDetailField('date');
                      setEditingDateDetailForm(prev => ({
                        ...prev,
                        date: selectedDateDetail.date ? new Date(selectedDateDetail.date) : null,
                      }));
                    }}
                    style={styles.editIconButton}
                  >
                    <Text style={styles.editIconText}>✏️</Text>
                  </TouchableOpacity>
                )}
              </View>
              {editingDateDetailField === 'date' && isOrganizerOrCoOrganizer ? (
                <View>
                  <TouchableOpacity
                    onPress={() => setShowDateDetailTimePicker({ type: 'date' })}
                    style={styles.datePickerButton}
                  >
                    <Text style={styles.datePickerButtonText}>
                      {editingDateDetailForm.date
                        ? formatDate(editingDateDetailForm.date.toISOString())
                        : 'Select date'}
                    </Text>
                  </TouchableOpacity>
                  {Platform.OS !== 'web' && showDateDetailTimePicker.type === 'date' && (
                    <DateTimePicker
                      value={editingDateDetailForm.date || new Date()}
                      mode="date"
                      display="default"
                      onChange={(event, selectedDate) => {
                        if (selectedDate) {
                          // Preserve the time from the original date
                          const currentDate = editingDateDetailForm.date || new Date();
                          const newDate = new Date(selectedDate);
                          newDate.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
                          setEditingDateDetailForm(prev => ({ ...prev, date: newDate }));
                        }
                        setShowDateDetailTimePicker({ type: null });
                      }}
                    />
                  )}
                  {Platform.OS === 'web' && showDateDetailTimePicker.type === 'date' && (
                    <CalendarDatePicker
                      selectedDate={editingDateDetailForm.date}
                      onDateSelect={(selectedDate) => {
                        // Preserve the time from the original date
                        const currentDate = editingDateDetailForm.date || new Date();
                        const newDate = selectedDate instanceof Date 
                          ? new Date(selectedDate) 
                          : new Date(selectedDate);
                        newDate.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
                        setEditingDateDetailForm(prev => ({ ...prev, date: newDate }));
                        setShowDateDetailTimePicker({ type: null });
                      }}
                      onClose={() => setShowDateDetailTimePicker({ type: null })}
                    />
                  )}
                  <View style={styles.inlineEditActions}>
                    <Button
                      label="💾 Save"
                      onPress={() => handleSaveDateDetailField('date')}
                      style={styles.inlineEditButton}
                      variant="primary"
                    />
                    <Button
                      label="❌ Cancel"
                      onPress={() => {
                        setEditingDateDetailField(null);
                        setEditingDateDetailForm(prev => ({
                          ...prev,
                          date: selectedDateDetail.date ? new Date(selectedDateDetail.date) : null,
                        }));
                      }}
                      variant="outline"
                      style={styles.inlineEditButton}
                    />
                  </View>
                </View>
              ) : (
                <Text style={styles.dateDetailValue}>
                  {formatDate(selectedDateDetail.date.toISOString())}
                </Text>
              )}
            </View>

            {/* Start Time Field */}
            {selectedDateDetail.startTime && !isNaN(selectedDateDetail.startTime.getTime()) && (
              <View style={styles.dateDetailSection}>
                <View style={styles.dateDetailHeader}>
                  <Text style={styles.dateDetailLabel}>Start Time</Text>
                  {isOrganizerOrCoOrganizer && editingDateDetailField !== 'startTime' && (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingDateDetailField('startTime');
                        setEditingDateDetailForm(prev => ({
                          ...prev,
                          startTime: selectedDateDetail.startTime ? new Date(selectedDateDetail.startTime) : null,
                        }));
                      }}
                      style={styles.editIconButton}
                    >
                      <Text style={styles.editIconText}>✏️</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {editingDateDetailField === 'startTime' && isOrganizerOrCoOrganizer ? (
                  <View>
                    <TouchableOpacity
                      onPress={() => setShowDateDetailTimePicker({ type: 'startTime' })}
                      style={styles.datePickerButton}
                    >
                      <Text style={styles.datePickerButtonText}>
                        {editingDateDetailForm.startTime
                          ? formatTime(editingDateDetailForm.startTime.toISOString())
                          : 'Select start time'}
                      </Text>
                    </TouchableOpacity>
                    {showDateDetailTimePicker.type === 'startTime' && (
                      <DateTimePicker
                        value={editingDateDetailForm.startTime || new Date()}
                        mode="time"
                        display="default"
                        is24Hour={false}
                        onChange={(event, date) => {
                          if (date) {
                            setEditingDateDetailForm(prev => ({ ...prev, startTime: date }));
                          }
                          setShowDateDetailTimePicker({ type: null });
                        }}
                      />
                    )}
                    <View style={styles.inlineEditActions}>
                      <Button
                        label="💾 Save"
                        onPress={() => handleSaveDateDetailField('startTime')}
                        style={styles.inlineEditButton}
                        variant="primary"
                      />
                      <Button
                        label="❌ Cancel"
                        onPress={() => {
                          setEditingDateDetailField(null);
                          setEditingDateDetailForm(prev => ({
                            ...prev,
                            startTime: selectedDateDetail.startTime ? new Date(selectedDateDetail.startTime) : null,
                          }));
                        }}
                        variant="outline"
                        style={styles.inlineEditButton}
                      />
                    </View>
                  </View>
                ) : (
                  <Text style={styles.dateDetailValue}>
                    {formatTime(selectedDateDetail.startTime.toISOString())}
                  </Text>
                )}
              </View>
            )}

            {/* End Time Field */}
            {selectedDateDetail.endTime && !isNaN(selectedDateDetail.endTime.getTime()) && (
              <View style={styles.dateDetailSection}>
                <View style={styles.dateDetailHeader}>
                  <Text style={styles.dateDetailLabel}>End Time</Text>
                  {isOrganizerOrCoOrganizer && editingDateDetailField !== 'endTime' && (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingDateDetailField('endTime');
                        setEditingDateDetailForm(prev => ({
                          ...prev,
                          endTime: selectedDateDetail.endTime ? new Date(selectedDateDetail.endTime) : null,
                        }));
                      }}
                      style={styles.editIconButton}
                    >
                      <Text style={styles.editIconText}>✏️</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {editingDateDetailField === 'endTime' && isOrganizerOrCoOrganizer ? (
                  <View>
                    <TouchableOpacity
                      onPress={() => setShowDateDetailTimePicker({ type: 'endTime' })}
                      style={styles.datePickerButton}
                    >
                      <Text style={styles.datePickerButtonText}>
                        {editingDateDetailForm.endTime
                          ? formatTime(editingDateDetailForm.endTime.toISOString())
                          : 'Select end time'}
                      </Text>
                    </TouchableOpacity>
                    {showDateDetailTimePicker.type === 'endTime' && (
                      <DateTimePicker
                        value={editingDateDetailForm.endTime || new Date()}
                        mode="time"
                        display="default"
                        is24Hour={false}
                        onChange={(event, date) => {
                          if (date) {
                            setEditingDateDetailForm(prev => ({ ...prev, endTime: date }));
                          }
                          setShowDateDetailTimePicker({ type: null });
                        }}
                      />
                    )}
                    <View style={styles.inlineEditActions}>
                      <Button
                        label="💾 Save"
                        onPress={() => handleSaveDateDetailField('endTime')}
                        style={styles.inlineEditButton}
                        variant="primary"
                      />
                      <Button
                        label="❌ Cancel"
                        onPress={() => {
                          setEditingDateDetailField(null);
                          setEditingDateDetailForm(prev => ({
                            ...prev,
                            endTime: selectedDateDetail.endTime ? new Date(selectedDateDetail.endTime) : null,
                          }));
                        }}
                        variant="outline"
                        style={styles.inlineEditButton}
                      />
                    </View>
                  </View>
                ) : (
                  <Text style={styles.dateDetailValue}>
                    {formatTime(selectedDateDetail.endTime.toISOString())}
                  </Text>
                )}
              </View>
            )}

            {/* Location Field */}
            <View style={styles.dateDetailSection}>
              <View style={styles.dateDetailHeader}>
                <Text style={styles.dateDetailLabel}>Location</Text>
                {isOrganizerOrCoOrganizer && editingDateDetailField !== 'location' && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingDateDetailField('location');
                      setEditingDateDetailForm(prev => ({
                        ...prev,
                        location: selectedDateDetail.location || '',
                      }));
                    }}
                    style={styles.editIconButton}
                  >
                    <Text style={styles.editIconText}>✏️</Text>
                  </TouchableOpacity>
                )}
              </View>
              {editingDateDetailField === 'location' && isOrganizerOrCoOrganizer ? (
                <View>
                  <Input
                    value={editingDateDetailForm.location}
                    onChangeText={(text) =>
                      setEditingDateDetailForm(prev => ({ ...prev, location: text }))
                    }
                    placeholder="Enter location"
                    style={styles.modalInput}
                  />
                  <View style={styles.inlineEditActions}>
                    <Button
                      label="💾 Save"
                      onPress={() => handleSaveDateDetailField('location')}
                      style={styles.inlineEditButton}
                      variant="primary"
                    />
                    <Button
                      label="❌ Cancel"
                      onPress={() => {
                        setEditingDateDetailField(null);
                        setEditingDateDetailForm(prev => ({
                          ...prev,
                          location: selectedDateDetail.location || '',
                        }));
                      }}
                      variant="outline"
                      style={styles.inlineEditButton}
                    />
                  </View>
                </View>
              ) : selectedDateDetail.location ? (
                <Text style={styles.dateDetailValue}>
                  {selectedDateDetail.location}
                </Text>
              ) : (
                <Text style={styles.dateDetailPlaceholder}>
                  No location set
                </Text>
              )}
            </View>

            {/* Address Field */}
            {isMember && (
              <View style={styles.dateDetailSection}>
                <View style={styles.dateDetailHeader}>
                  <Text style={styles.dateDetailLabel}>Address</Text>
                  {isOrganizerOrCoOrganizer && editingDateDetailField !== 'address' && (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingDateDetailField('address');
                        setEditingDateDetailForm(prev => ({
                          ...prev,
                          address: selectedDateDetail.address || selectedDateDetail.exactLocation || '',
                        }));
                      }}
                      style={styles.editIconButton}
                    >
                      <Text style={styles.editIconText}>✏️</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {editingDateDetailField === 'address' && isOrganizerOrCoOrganizer ? (
                  <View>
                    <Input
                      value={editingDateDetailForm.address}
                      onChangeText={(text) =>
                        setEditingDateDetailForm(prev => ({ ...prev, address: text }))
                      }
                      placeholder="Enter address"
                      style={styles.modalInput}
                    />
                    <View style={styles.inlineEditActions}>
                      <Button
                        label="💾 Save"
                        onPress={() => handleSaveDateDetailField('address')}
                        style={styles.inlineEditButton}
                        variant="primary"
                      />
                      <Button
                        label="❌ Cancel"
                        onPress={() => {
                          setEditingDateDetailField(null);
                          setEditingDateDetailForm(prev => ({
                            ...prev,
                            address: selectedDateDetail.address || selectedDateDetail.exactLocation || '',
                          }));
                        }}
                        variant="outline"
                        style={styles.inlineEditButton}
                      />
                    </View>
                  </View>
                ) : (selectedDateDetail.address || selectedDateDetail.exactLocation) ? (
                  <Text style={styles.dateDetailValue}>
                    {selectedDateDetail.address || selectedDateDetail.exactLocation}
                  </Text>
                ) : (
                  <Text style={styles.dateDetailPlaceholder}>
                    No address set
                  </Text>
                )}
              </View>
            )}

            {/* Notes Field */}
            <View style={styles.dateDetailSection}>
              <View style={styles.dateDetailHeader}>
                <Text style={styles.dateDetailLabel}>Notes</Text>
                {isOrganizerOrCoOrganizer && editingDateDetailField !== 'note' && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingDateDetailField('note');
                      setEditingDateDetailForm(prev => ({
                        ...prev,
                        note: selectedDateDetail.note || '',
                      }));
                    }}
                    style={styles.editIconButton}
                  >
                    <Text style={styles.editIconText}>✏️</Text>
                  </TouchableOpacity>
                )}
              </View>
              {editingDateDetailField === 'note' && isOrganizerOrCoOrganizer ? (
                <View>
                  <Input
                    value={editingDateDetailForm.note}
                    onChangeText={(text) =>
                      setEditingDateDetailForm(prev => ({ ...prev, note: text }))
                    }
                    placeholder="Add notes about parking, snacks, etc."
                    multiline
                    numberOfLines={4}
                    style={styles.modalInput}
                  />
                  <View style={styles.inlineEditActions}>
                    <Button
                      label="💾 Save"
                      onPress={() => handleSaveDateDetailField('note')}
                      style={styles.inlineEditButton}
                      variant="primary"
                    />
                    <Button
                      label="❌ Cancel"
                      onPress={() => {
                        setEditingDateDetailField(null);
                        setEditingDateDetailForm(prev => ({
                          ...prev,
                          note: selectedDateDetail.note || '',
                        }));
                      }}
                      variant="outline"
                      style={styles.inlineEditButton}
                    />
                  </View>
                </View>
              ) : (
                <Text
                  style={
                    selectedDateDetail.note
                      ? styles.dateDetailValue
                      : styles.dateDetailPlaceholder
                  }
                >
                  {selectedDateDetail.note ||
                    (isOrganizerOrCoOrganizer
                      ? 'No notes yet. Tap ✏️ to add notes.'
                      : 'No notes yet.')}
                </Text>
              )}
            </View>

            {/* Delete Button - Only show for organizers in Edit Schedule context */}
            {isOrganizerOrCoOrganizer && selectedDateDetail.isEditScheduleContext && (
              <View style={styles.dateDetailDeleteSection}>
                <Button
                  label="🗑️ Delete Date"
                  onPress={handleDeleteDate}
                  variant="outline"
                  style={[styles.deleteDateButton, { backgroundColor: '#fee', borderColor: '#f44' }]}
                />
              </View>
            )}

            {/* Close Button */}
            <View style={styles.dateDetailActions}>
              <Button
                label="❌ Close"
                onPress={() => {
                  setSelectedDateDetail(null);
                  setEditingDateDetailField(null);
                }}
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
              label="💾 Save"
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
              label="❌ Cancel"
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
    backgroundColor: theme.colors.bgColor,
    flexDirection: 'column',
  },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceColor,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    alignItems: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceColor,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.meepleRed,
  },
  tabText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  tabTextActive: {
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  discussionScrollContent: {
    paddingBottom: 100,
  },
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    paddingBottom: theme.spacing.xl,
  },
  section: {
    ...commonStyles.card,
    margin: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.woodLight,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  expandIcon: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  privateMessageToggle: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  privateMessageToggleText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  sectionCopy: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: theme.typography.fontSize.sm * theme.typography.lineHeight.normal,
    marginBottom: theme.spacing.sm,
  },
  defaultSettingsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  defaultSettingRow: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  defaultSettingLabel: {
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: 6,
  },
  defaultSettingDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  defaultSettingValueContainer: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  defaultSettingValue: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  defaultSettingSubValue: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  editIconButton: {
    padding: 4,
  },
  editIconText: {
    fontSize: 16,
  },
  defaultSettingEdit: {
    marginTop: 4,
  },
  defaultSettingInput: {
    marginBottom: 8,
  },
  defaultSettingActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  defaultSettingButton: {
    flex: 1,
    padding: 6,
    minHeight: 32,
  },
  defaultSettingButtonText: {
    fontSize: 12,
  },
  scheduleInfo: {
    marginBottom: 0,
  },
  scheduleLabel: {
    fontSize: theme.typography.fontSize.lg,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  scheduleValue: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  highlight: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.feltGreen,
    marginTop: theme.spacing.xs,
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
  dateDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
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
  dateDetailValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginTop: 4,
  },
  dateDetailPlaceholder: {
    fontSize: 14,
    color: '#777',
    fontStyle: 'italic',
  },
  dateDetailDeleteSection: {
    marginTop: 24,
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  deleteDateButton: {
    borderWidth: 2,
  },
  deleteEventButton: {
    borderWidth: 2,
    marginBottom: 12,
  },
  inlineEditActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  inlineEditButton: {
    flex: 1,
  },
  dateDetailActions: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    flexDirection: 'row',
    gap: 12,
  },
  datePickerButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 8,
  },
  datePickerButtonText: {
    fontSize: 16,
    color: '#2f2f2f',
    fontWeight: '500',
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
    marginTop: 12,
    marginRight: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 140,
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
  scheduleValueBoldRed: {
    fontSize: 16,
    color: '#ff0000',
    fontWeight: 'bold',
  },
  scheduleLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  scheduleLocationBoldRed: {
    fontSize: 18,
    color: '#ff0000',
    fontWeight: 'bold',
    flex: 1,
  },
  dateEntryContainer: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#e8e8e8',
    overflow: 'hidden',
  },
  pastEventsButtonContainer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  pastEventsButton: {
    width: '100%',
  },
  exportCalendarButtonContainer: {
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  exportCalendarButton: {
    width: '100%',
  },
  pastEventsModalContent: {
    maxHeight: 500,
    padding: theme.spacing.md,
  },
  dateDetailModalContent: {
    padding: theme.spacing.md,
  },
  dateDetailContainer: {
    gap: theme.spacing.md,
  },
  dateDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  dateDetailDate: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#ff0000',
    flex: 1,
  },
  dateDetailLocation: {
    marginTop: theme.spacing.sm,
  },
  dateDetailLocationText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#ff0000',
    marginBottom: theme.spacing.xs,
  },
  dateDetailAddressText: {
    fontSize: theme.typography.fontSize.base,
    color: '#666',
  },
  dateDetailNote: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
  },
  dateDetailNoteText: {
    fontSize: theme.typography.fontSize.base,
    color: '#2f2f2f',
  },
  dateDetailAttendingContainer: {
    marginTop: theme.spacing.md,
  },
  dateDetailAttendingLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    marginBottom: theme.spacing.sm,
    color: '#2f2f2f',
  },
  dateDetailAttendingAvatars: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  dateDetailRSVPContainer: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    minHeight: 120, // Reserve space to prevent layout shifts
  },
  dateDetailRSVPLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    marginBottom: theme.spacing.sm,
    color: '#2f2f2f',
  },
  dateDetailRSVPButtons: {
    gap: theme.spacing.sm,
    minHeight: 90, // Reserve space for buttons to prevent layout shifts
  },
  pastEventEntry: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.woodLight,
  },
  pastEventDate: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  pastEventLocation: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  pastEventAddress: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    fontStyle: 'italic',
  },
  pastEventNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    fontStyle: 'italic',
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
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0e8ff',
  },
  dateRSVPRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  dateRSVPLabelContainer: {
    alignItems: 'flex-start',
  },
  dateRSVPLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    lineHeight: 18,
  },
  dateRSVPButtonsContainer: {
    flex: 1,
    gap: 6,
  },
  dateRSVPButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 40, // Consistent row height
  },
  dateRSVPButton: {
    flex: 1,
    padding: 6,
    minHeight: 40, // Consistent height to prevent layout shifts
    height: 40, // Fixed height to prevent size changes when variant changes
  },
  dateRSVPButtonText: {
    fontSize: 12,
  },
  dateRSVPStatus: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  dateGameplanButtonContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  dateGameplanButton: {
    padding: 10,
    minHeight: 40,
  },
  dateGameplanButtonText: {
    fontSize: 14,
    fontWeight: theme.typography.fontWeight.semibold,
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
    marginRight: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 140,
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
  postPhotoContainer: {
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  postPhoto: {
    width: '100%',
    maxHeight: 400,
    minHeight: 200,
  },
  selectedPhotoContainer: {
    marginBottom: 12,
  },
  selectedPhotoPreview: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  selectedPhotoPreviewImage: {
    width: '100%',
    maxHeight: 200,
    minHeight: 150,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoButtonText: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: 'bold',
  },
  photoUploadingContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  photoUploadingText: {
    fontSize: 14,
    color: '#666',
  },
  postInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  photoButton: {
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 48,
    height: 48,
  },
  photoButtonText: {
    fontSize: 24,
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
    flex: 1,
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
    borderColor: '#d45d5d',
  },
  removeMemberText: {
    color: '#d45d5d',
    fontSize: 13,
    fontWeight: '500',
  },
  memberActionButton: {
    marginBottom: 8,
  },
  memberActionButtonText: {
    fontSize: 18,
  },
  memberActionModalContent: {
    padding: 20,
  },
  memberActionSection: {
    marginBottom: 24,
  },
  memberActionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: '#d45d5d',
  },
  toggleSwitchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleSwitchThumbActive: {
    alignSelf: 'flex-end',
  },
  memberActionModalFooter: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
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
  buttonList: {
    marginTop: 12,
    gap: 8,
  },
  buttonListItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  buttonListText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  buttonListTextDisabled: {
    opacity: 0.5,
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
    flex: 1,
  },
  joinCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d4ff',
  },
  deleteCodeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#d45d5d',
    borderRadius: 6,
    marginLeft: 12,
  },
  deleteCodeButtonDisabled: {
    opacity: 0.5,
  },
  deleteCodeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
  modalContentNoPadding: {
    padding: 0,
    paddingHorizontal: 0,
  },
  modalMessage: {
    fontSize: 16,
    color: '#444',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  timeInputContainer: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  timeButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 13,
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
  modalFieldContainerNoPadding: {
    marginBottom: 24,
    paddingHorizontal: 0,
    marginHorizontal: 0,
  },
  calendarContainer: {
    paddingHorizontal: 0,
    marginHorizontal: 0,
    width: '100%',
    overflow: 'hidden',
    marginLeft: -24, // Negative margin to break out of section margins (theme.spacing.xl = 24)
    marginRight: -24,
    paddingLeft: 0,
    paddingRight: 0,
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
  longPressInstructionBox: {
    backgroundColor: '#e8f4fd',
    borderWidth: 2,
    borderColor: '#4a90e2',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  longPressInstructionText: {
    fontSize: 13,
    color: '#2f2f2f',
    lineHeight: 18,
  },
  longPressInstructionBold: {
    fontWeight: '700',
    color: '#4a90e2',
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
  dateListContainer: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  dateListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  dateListTextBlock: {
    flex: 1,
    marginRight: 12,
  },
  dateListTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  dateListSubtext: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  dateListLocation: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },
  rsvpBadge: {
    minWidth: 90,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  rsvpBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#222',
    textTransform: 'capitalize',
  },
  rsvpBadgeGoing: {
    backgroundColor: '#eef8f2',
  },
  rsvpBadgeMaybe: {
    backgroundColor: '#fff8ec',
  },
  rsvpBadgeNotGoing: {
    backgroundColor: '#fff0f0',
  },
  rsvpBadgeUnknown: {
    backgroundColor: '#f5f7f9',
  },
  dateListRSVPsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
    maxWidth: 200,
  },
  dateListRSVPItem: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateListAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
  },
  dateListAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  dateListAvatarInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dateListRSVPBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateListRSVPBadgeText: {
    fontSize: 10,
    fontWeight: '700',
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
  proposedGameImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  proposedGameImagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  proposedGameImageText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#999',
  },
  proposedGameMeta: {
    marginTop: 8,
    gap: 4,
  },
  ratingSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  allRatingsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  allRatingsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  ratingItemUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  ratingItemAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  ratingItemAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingItemAvatarInitial: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  ratingItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  ratingItemValue: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    marginLeft: 8,
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
  expectedGamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 12,
  },
  expectedGameCardWrapper: {
    width: '31%',
    position: 'relative',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  bringingByContainer: {
    backgroundColor: '#f0f0f0',
    padding: 6,
    borderRadius: 4,
    marginTop: 4,
  },
  bringingByText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  addGamesButton: {
    marginTop: 12,
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
  expandIndicator: {
    paddingLeft: 12,
    justifyContent: 'center',
  },
  expandIndicatorText: {
    fontSize: 16,
    color: '#666',
  },
  proposedGameRatingIndicator: {
    fontSize: 12,
    color: '#4a90e2',
    marginTop: 4,
    fontWeight: '500',
  },
});

export default EventHub;
