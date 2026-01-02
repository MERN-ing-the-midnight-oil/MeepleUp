import React, { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { Platform, KeyboardAvoidingView, Dimensions } from 'react-native';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Share,
  Image,
  FlatList,
  Pressable,
  Modal as RNModal,
  ActivityIndicator,
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
import { notifyDiscussionActivity, notifyGameOwner, createNotification, getUserNotificationPreferences, isNotificationEnabled, notifyMeepleUpMembers, sendRSVPUpdateEmail } from '../utils/notifications';
import RSVPManagementScreen from '../components/RSVPManagementScreen';
import UserProfileModal from '../components/UserProfileModal';
import { handleLeaveEvent as handleLeaveEventUtil } from '../components/LeaveEventButton';
import PrivateMessaging from '../components/PrivateMessaging';
import { getBlockedUsers } from '../services/blocking';
import { pickAndUploadImage } from '../utils/imageUpload';
import { checkPhotoUploadLimit, incrementPhotoUploadCount } from '../utils/photoUploadTracking';
import { theme, commonStyles } from '../utils/theme';
import GearIcon from '../components/GearIcon';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { LinearGradient } from 'expo-linear-gradient';
import LogisticsCardV2 from '../components/LogisticsCardV2';
import storage from '../utils/storage';

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
    removeMember,
    archiveEvent,
    updateMemberRSVP,
    updateEventSchedule,
    updateEvent,
    updateMemberRole,
    updateMemberJoinCodePermission,
    updateMemberProposalLimit,
    memberRoles,
  } = useEvents();
  const { user } = useAuth();
  const { getUserCollection, getEventCollection, syncGamesForUsers, collections } = useCollections();

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [addCodeBusy, setAddCodeBusy] = useState(false);
  const [deletingCodes, setDeletingCodes] = useState(new Set()); // Track which codes are being deleted
  const [removingMembers, setRemovingMembers] = useState(new Set()); // Track which members are being removed
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
  const [highlightedAnnouncementId, setHighlightedAnnouncementId] = useState(null); // ID of announcement to highlight in Tabletalk
  const scheduleScrollRef = useRef(null);
  const dateEntryPositions = useRef({}); // Map of index to Y position
  const scrollPositionRef = useRef(0); // Track scroll position to prevent jumps
  const isUpdatingRSVPRef = useRef(false); // Track if RSVP update is in progress to prevent modal from closing
  const [rsvpUpdateCounter, setRsvpUpdateCounter] = useState(0); // Counter to trigger scroll restoration on RSVP updates
  const messageRefs = useRef({}); // Map of message ID to ref for scrolling to announcements
  const discussionScrollViewRef = useRef(null); // Ref to the discussion ScrollView
  const [memberNames, setMemberNames] = useState({});
  const [memberRSVPs, setMemberRSVPs] = useState({}); // { [userId]: { [dateKey]: status } }
  const [memberAvatars, setMemberAvatars] = useState({});
  const [loadingMemberData, setLoadingMemberData] = useState(true); // Track loading state for member data
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
  const [selectedMemberForAction, setSelectedMemberForAction] = useState(null); // { userId, displayName, role, canShareJoinCode, proposalLimit }
  const [editingProposalLimit, setEditingProposalLimit] = useState(false);
  const [proposalLimitInput, setProposalLimitInput] = useState('');
  // Collapsible sections state
  const [isMembersExpanded, setIsMembersExpanded] = useState(false);
  // Past events modal state
  const [showPastEventsModal, setShowPastEventsModal] = useState(false);
  // Calendar view modal state
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  // Announcements state
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null); // null for new, or announcement object for editing
  const [announcementForm, setAnnouncementForm] = useState({
    selectedDateIndex: null,
    content: '',
    photo: null, // { uri: string, uploading: boolean }
  });
  // Notification debouncing for announcements
  const announcementNotificationTimers = useRef({}); // { [announcementId]: timerId }

  // Get event and userId early so they're available for AnnouncementModalContent
  const event = getEventById(eventId);
  const userId = user?.uid || user?.id || null;
  
  // Create a stable close handler using useCallback with empty deps
  // This ensures the function reference never changes
  const handleCloseAnnouncementModal = useCallback(() => {
    setShowAnnouncementModal(false);
    setEditingAnnouncement(null);
    setAnnouncementForm({
      selectedDateIndex: null,
      content: '',
      photo: null,
    });
  }, []);
  
  // Initialize announcementForm.content when modal opens for editing
  useEffect(() => {
    if (showAnnouncementModal && editingAnnouncement) {
      setAnnouncementForm(prev => ({
        ...prev,
        content: editingAnnouncement.content || '',
      }));
    } else if (showAnnouncementModal && !editingAnnouncement) {
      // Reset content when opening for new announcement
      setAnnouncementForm(prev => ({
        ...prev,
        content: '',
      }));
    }
  }, [showAnnouncementModal, editingAnnouncement]);
  
  // Ref to maintain focus on the announcement input
  const announcementInputRef = useRef(null);
  
  // Auto-focus input when modal opens
  useEffect(() => {
    if (showAnnouncementModal && announcementInputRef.current) {
      const timer = setTimeout(() => {
        announcementInputRef.current?.focus();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [showAnnouncementModal]);
  
  // Log when announcementForm.content changes
  useEffect(() => {
    console.log('[ANNOUNCEMENT] announcementForm.content changed to:', JSON.stringify(announcementForm.content), 'length:', announcementForm.content.length);
  }, [announcementForm.content]);
  
  // Log when component re-renders (disabled to prevent excessive logging)
  // useEffect(() => {
  //   console.log('[ANNOUNCEMENT] EventHub component rendered/re-rendered');
  //   console.log('[ANNOUNCEMENT] announcementForm.content:', JSON.stringify(announcementForm.content));
  //   console.log('[ANNOUNCEMENT] showAnnouncementModal:', showAnnouncementModal);
  // });

  // Render announcement modal content - NO memoization, just like DiscussionTab
  // DiscussionTab recalculates on every keystroke but Input maintains focus naturally
  const AnnouncementModalContent = (
    <View style={styles.modalContent}>
      {/* Date Selection */}
      <View style={styles.announcementFormSection}>
        <Text style={styles.announcementFormLabel}>Event Date:</Text>
        {event?.eventDates && event.eventDates.length > 0 ? (
          <View style={styles.announcementDateSelector}>
            {event.eventDates.map((eventDate, index) => {
              const date = safeParseDate(eventDate.date);
              if (!date || isNaN(date.getTime())) return null;
              
              const isSelected = announcementForm.selectedDateIndex === index;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.announcementDateOption,
                    isSelected && styles.announcementDateOptionSelected,
                  ]}
                  onPress={() => {
                    setAnnouncementForm(prev => ({
                      ...prev,
                      selectedDateIndex: index,
                    }));
                  }}
                >
                  <Text
                    style={[
                      styles.announcementDateOptionText,
                      isSelected && styles.announcementDateOptionTextSelected,
                    ]}
                  >
                    {formatDate(date)}
                  </Text>
                </TouchableOpacity>
              );
            })}
      </View>
        ) : (
          <Text style={styles.announcementFormHint}>No event dates available</Text>
        )}
      </View>

      {/* Content Input */}
      <View style={styles.announcementFormSection}>
        <Text style={styles.announcementFormLabel}>Message:</Text>
        <Input
          ref={announcementInputRef}
          value={announcementForm.content}
          onChangeText={(text) => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('[ANNOUNCEMENT INPUT] onChangeText called');
            console.log('[ANNOUNCEMENT INPUT] Previous value:', JSON.stringify(announcementForm.content));
            console.log('[ANNOUNCEMENT INPUT] New value:', JSON.stringify(text));
            console.log('[ANNOUNCEMENT INPUT] Previous length:', announcementForm.content.length);
            console.log('[ANNOUNCEMENT INPUT] New length:', text.length);
            setAnnouncementForm(prev => {
              console.log('[ANNOUNCEMENT INPUT] setAnnouncementForm called');
              return { ...prev, content: text };
            });
          }}
          onFocus={() => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('[ANNOUNCEMENT INPUT] ⭐ FOCUS GAINED ⭐');
            console.log('[ANNOUNCEMENT INPUT] Current value:', JSON.stringify(announcementForm.content));
            console.log('[ANNOUNCEMENT INPUT] Ref exists:', !!announcementInputRef.current);
            console.log('[ANNOUNCEMENT INPUT] Timestamp:', new Date().toISOString());
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          }}
          onBlur={() => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('[ANNOUNCEMENT INPUT] ❌ FOCUS LOST ❌');
            console.log('[ANNOUNCEMENT INPUT] Current value:', JSON.stringify(announcementForm.content));
            console.log('[ANNOUNCEMENT INPUT] Timestamp:', new Date().toISOString());
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          }}
          placeholder="Write your announcement..."
          multiline
          numberOfLines={4}
          style={styles.announcementContentInput}
        />
      </View>

        {/* Photo Upload */}
        <View style={styles.announcementFormSection}>
          <Text style={styles.announcementFormLabel}>Photo (optional):</Text>
          {announcementForm.photo?.uri ? (
            <View style={styles.announcementPhotoPreview}>
              <Image
                source={{ uri: announcementForm.photo.uri }}
                style={styles.announcementPhotoPreviewImage}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.announcementPhotoRemoveButton}
                onPress={() => {
                  setAnnouncementForm(prev => ({ ...prev, photo: null }));
                }}
              >
                <Text style={styles.announcementPhotoRemoveButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Button
              label="📷 Add Photo"
              onPress={async () => {
                try {
                  const uploadLimit = await checkPhotoUploadLimit(userId);
                  if (!uploadLimit.canUpload) {
                    Alert.alert(
                      'Upload Limit Reached',
                      uploadLimit.message || 'You have reached your photo upload limit for today.'
                    );
                    return;
                  }

                  const result = await pickAndUploadImage();
                  if (result && result.uri) {
                    await incrementPhotoUploadCount(userId);
                    setAnnouncementForm(prev => ({
                      ...prev,
                      photo: { uri: result.uri, uploading: false },
                    }));
                  }
                } catch (error) {
                  console.error('Error picking/uploading image:', error);
                  Alert.alert('Error', 'Failed to upload photo. Please try again.');
                }
              }}
              variant="outline"
              style={styles.announcementPhotoButton}
            />
              )}
            </View>

        {/* Action Buttons */}
        <View style={styles.announcementFormActions}>
          <Button
            label={editingAnnouncement ? "💾 Save Changes" : "📢 Create Announcement"}
            onPress={handleSaveAnnouncement}
            variant="primary"
            style={styles.announcementSaveButton}
          />
          <Button
            label="❌ Cancel"
            onPress={handleCloseAnnouncementModal}
            variant="outline"
            style={styles.announcementCancelButton}
          />
        </View>
      </View>
    );
  
  // Log when event object reference changes (causes re-renders)
  const eventRef = useRef(event);
  const scheduleFormRef = useRef(scheduleForm);
  
  useEffect(() => {
    scheduleFormRef.current = scheduleForm;
  }, [scheduleForm]);
  
  // Scroll to highlighted announcement when switching to Discussion tab
  useEffect(() => {
    if (activeTab === TABS.DISCUSSION && highlightedAnnouncementId) {
      // Wait for the next frame to ensure the view is rendered
      setTimeout(() => {
        const messageRef = messageRefs.current[highlightedAnnouncementId];
        if (messageRef && discussionScrollViewRef.current) {
          if (Platform.OS === 'web') {
            // Web: use scrollIntoView
            if (messageRef.scrollIntoView) {
              messageRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                setHighlightedAnnouncementId(null);
              }, 2000);
            }
          } else {
            // Native: use measureLayout
            messageRef.measureLayout(
              discussionScrollViewRef.current,
              (x, y) => {
                discussionScrollViewRef.current?.scrollTo({
                  y: y - 20, // Offset by 20px for better visibility
                  animated: true,
                });
                // Clear highlight after scrolling
                setTimeout(() => {
                  setHighlightedAnnouncementId(null);
                }, 2000); // Clear after 2 seconds
              },
              () => {
                // Error callback - clear highlight anyway
                setTimeout(() => {
                  setHighlightedAnnouncementId(null);
                }, 2000);
              }
            );
          }
        }
      }, 100);
    }
  }, [activeTab, highlightedAnnouncementId]);
  
  useEffect(() => {
    if (eventRef.current !== event) {
      // Reduced logging - removed event reference change logs
      // Check if scheduleForm should be preserved (if eventDates haven't actually changed)
      const eventDatesChanged = 
        event?.eventDates?.length !== eventRef.current?.eventDates?.length ||
        JSON.stringify(event?.eventDates?.map(ed => ed.date)) !== 
        JSON.stringify(eventRef.current?.eventDates?.map(ed => ed.date));
      
      if (!eventDatesChanged && scheduleFormRef.current?.selectedDates?.length > 0) {
        // Reduced logging - removed event update preservation logs
      }
      
      eventRef.current = event;
    }
  }, [event, scheduleForm]);

  const memberStatus = event && userId
    ? getMembershipStatus(event.id, userId)
    : membershipStatus.STRANGER;
  const isMember = memberStatus === membershipStatus.MEMBER;
  const isOrganizer = event?.organizerId && event.organizerId === userId;
  // Check if user is organizer or co-organizer (has organizer role)
  const currentUserMember = event?.members?.find(m => m.userId === userId);
  const isOrganizerOrCoOrganizer = isOrganizer || currentUserMember?.role === memberRoles?.ORGANIZER;
  // Get user's proposal limit from members
  const userProposalLimit = currentUserMember?.proposalLimit !== undefined ? currentUserMember.proposalLimit : 5;

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

  // Convert all events (future + past) to calendar format for CalendarDatePicker
  const calendarDates = useMemo(() => {
    const allEvents = [...futureEvents, ...pastEvents];
    return allEvents.map((ed) => {
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
  }, [futureEvents, pastEvents, event?.location, event?.generalLocation, event?.address, event?.exactLocation]);

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

  // Track the last initialized eventId to prevent resetting scheduleForm on every event update
  const lastInitializedEventIdRef = useRef(null);
  
  // Initialize schedule form when event loads (only once per eventId)
  useEffect(() => {
    console.log('[EventHub] ========== scheduleForm INITIALIZATION useEffect RUNNING ==========');
    console.log('[EventHub] useEffect trigger - event:', {
      id: event?.id,
      lastInitializedId: lastInitializedEventIdRef.current,
      shouldInitialize: event?.id && event.id !== lastInitializedEventIdRef.current,
      hasEventDates: !!event?.eventDates,
      eventDatesType: Array.isArray(event?.eventDates) ? 'array' : typeof event?.eventDates,
      eventDatesCount: Array.isArray(event?.eventDates) ? event?.eventDates.length : 'N/A',
      hasScheduledFor: !!event?.scheduledFor,
    });
    
    if (event && event.id && event.id !== lastInitializedEventIdRef.current) {
      console.log('[EventHub] Initializing scheduleForm for new eventId:', event.id);
      lastInitializedEventIdRef.current = event.id;
      console.log('[EventHub] Event exists, initializing scheduleForm from event data...');
      // Parse existing scheduledFor or eventDates
      let selectedDates = [];
      const defaultStartTime = new Date(new Date().setHours(18, 0, 0, 0));
      const defaultEndTime = new Date(new Date().setHours(22, 0, 0, 0));
      
      if (event.eventDates && Array.isArray(event.eventDates)) {
        // Reduced logging - removed format log
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
        // Reduced logging - removed parsed dates log
      } else if (event.scheduledFor) {
        // Reduced logging - removed legacy format log
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
            // Reduced logging - removed parsed scheduledFor log
          }
        } catch (e) {
          console.error('[EventHub] Error parsing scheduledFor:', e);
        }
      } else {
        // Reduced logging - removed empty array log
      }
      
      // Reduced logging - removed scheduleForm state log
      
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
      
      // Reduced logging - removed initialization complete log
    }
    // Reduced logging - removed initialization complete log
  }, [event?.id]); // Only depend on event.id, not the entire event object

  // GamesTab-specific logic removed - will be rebuilt

  // Fetch member names, RSVP data, and avatars from Firestore
  useEffect(() => {
    if (!memberIdsKey || !db || !event?.id) {
      // If we can't fetch (missing dependencies), mark as not loading
      setLoadingMemberData(false);
      return;
    }

    // Prevent concurrent fetches
    if (memberDataFetchInProgressRef.current) {
      console.log('[EventHub] Member data fetch already in progress, skipping');
      return;
    }

    const fetchMemberData = async () => {
      memberDataFetchInProgressRef.current = true;
      setLoadingMemberData(true);
      // Reduced logging - removed verbose fetchMemberData start log
      
      const names = {};
      const rsvps = {};
      const avatars = {};
      
      for (const member of members) {
        if (!member.userId || names[member.userId]) continue;
        
        // Reduced logging - removed per-member processing log
        
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
                if (memberData.rsvpStatuses && typeof memberData.rsvpStatuses === 'object' && memberData.rsvpStatuses.constructor === Object) {
                  // Normal format: object with date keys
                  rsvps[member.userId] = memberData.rsvpStatuses;
                } else if (memberData.rsvpStatus && typeof memberData.rsvpStatus === 'string') {
                  // Backward compatibility: convert single status to date-specific
                  rsvps[member.userId] = { default: memberData.rsvpStatus };
                } else {
                  // No valid RSVP data found
                  rsvps[member.userId] = {};
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
            // Reduced logging - removed member document fetch log
            try {
              const memberDoc = await db.collection('gamingGroups').doc(event.id)
                .collection('members').doc(member.userId).get();
              
              // Reduced logging - removed member document fetch result log
              
              if (memberDoc.exists) {
                const memberData = memberDoc.data();
                // Reduced logging - removed verbose member document data logs
                
                if (memberData.userName) {
                  names[member.userId] = memberData.userName;
                }
                // Support both old format (rsvpStatus) and new format (rsvpStatuses)
                if (memberData.rsvpStatuses && typeof memberData.rsvpStatuses === 'object' && memberData.rsvpStatuses.constructor === Object) {
                  // Normal format: object with date keys
                  rsvps[member.userId] = memberData.rsvpStatuses;
                } else if (memberData.rsvpStatus && typeof memberData.rsvpStatus === 'string') {
                  // Backward compatibility: convert single status to date-specific
                  rsvps[member.userId] = { default: memberData.rsvpStatus };
                } else {
                  // No valid RSVP data found
                  rsvps[member.userId] = {};
                }
                if (memberData.userAvatarUrl && memberData.userAvatarUrl.trim() !== '') {
                  avatars[member.userId] = memberData.userAvatarUrl;
                  avatarFound = true;
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
            // Reduced logging - removed skip log
          }
        } catch (error) {
          console.error(`Error fetching data for user ${member.userId}:`, error);
          names[member.userId] = member.userId;
          avatars[member.userId] = null;
        }
      }
      
      // Reduced logging - removed verbose fetchMemberData complete log
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
        // Reduced logging - removed memberRSVPs update log
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
      setLoadingMemberData(false); // Mark loading as complete
    };

    fetchMemberData().catch((error) => {
      console.error('[EventHub] Error in fetchMemberData:', error);
      memberDataFetchInProgressRef.current = false; // Ensure lock is released even on error
      setLoadingMemberData(false); // Mark loading as complete even on error
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIdsKey, event?.id, user?.uid, user?.id]);

  // Real-time listener for all members' RSVP updates
  useEffect(() => {
    if (!event?.id || !db || !members.length) return;

    // Reduced logging - removed RSVP listener setup log

    const membersRef = db.collection('gamingGroups').doc(event.id).collection('members');
    
    // Set up real-time listener for all member documents
    const unsubscribe = membersRef.onSnapshot(
      (snapshot) => {
        // Reduced logging - removed RSVP snapshot log
        
        const rsvps = {};
        snapshot.forEach((doc) => {
          const memberData = doc.data();
          const memberUserId = doc.id;
          
          // Process RSVP data for this member
          if (memberData.rsvpStatuses && typeof memberData.rsvpStatuses === 'object' && memberData.rsvpStatuses.constructor === Object) {
            rsvps[memberUserId] = memberData.rsvpStatuses;
            // Reduced logging - removed per-member RSVP update log
          } else if (memberData.rsvpStatus && typeof memberData.rsvpStatus === 'string') {
            // Backward compatibility: convert single status to date-specific
            rsvps[memberUserId] = { default: memberData.rsvpStatus };
            // Reduced logging - removed legacy RSVP update log
          } else {
            rsvps[memberUserId] = {};
          }
        });

        // Update state with all RSVP data (merge with existing to preserve other data)
        setMemberRSVPs(prev => {
          const updated = { ...prev };
          Object.keys(rsvps).forEach(userId => {
            updated[userId] = rsvps[userId];
          });
          // Reduced logging - removed memberRSVPs update log
          return updated;
        });
      },
      (error) => {
        console.error('[EventHub] Error in members RSVP listener:', error);
      }
    );

    return () => {
      // Reduced logging - removed cleanup log
      unsubscribe();
    };
  }, [event?.id, db, members.length]);

  // Helper to get date key from event date
  const getDateKey = (eventDate) => {
    if (!eventDate) return 'default';
    const date = eventDate instanceof Date ? eventDate : new Date(eventDate);
    // Format using local date components to avoid timezone shifts
    // This ensures the date key matches the calendar day displayed to users
    date.setHours(0, 0, 0, 0);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // YYYY-MM-DD format using local date
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
            // Backward compatibility: old format - only count 'going', not 'maybe'
            return eventDate ? false : (memberRsvps === 'going');
          }
          const status = memberRsvps[dateKey];
          return status === 'going';
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

    const rsvpSettings = event.rsvpSettings || { enabled: true, allowMaybe: false, attendanceLimit: null };
    
    // Maybe option is no longer supported
    if (status === 'maybe') {
      Alert.alert('Error', 'Maybe option is no longer available. Please select "Going" or "Can\'t Make It".');
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

    // Set flag before state updates to ensure useLayoutEffect can detect it
    isUpdatingRSVPRef.current = true;

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

    // Increment counter to trigger useLayoutEffect for scroll restoration
    setRsvpUpdateCounter(prev => prev + 1);

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
      await updateEventSchedule(event.id, {
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

      await updateEventSchedule(event.id, updateData);
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

      await updateEventSchedule(event.id, updateData);
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

  const handleDatesChange = async (dates) => {
    console.log('[EventHub] ========== handleDatesChange CALLED ==========');
    console.log('[EventHub] handleDatesChange - input dates:', {
      count: dates.length,
      dates: dates.map(d => ({
        date: d.date instanceof Date ? d.date.toISOString() : d.date,
        startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
        endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
        location: d.location,
        address: d.address,
        note: d.note,
      })),
    });
    
    console.log('[EventHub] Current scheduleForm state:', {
      selectedDatesCount: scheduleForm.selectedDates.length,
      location: scheduleForm.location,
      address: scheduleForm.address,
    });
    
    // Save scroll position before state update to prevent scroll reset
    const savedScroll = scrollPositionRef.current;
    
    // Dates are now objects with { date, startTime, endTime, location, address, note } structure
    // Ensure new dates get default location values if not set
    const datesWithLocations = dates.map(d => ({
      ...d,
      location: d.location !== undefined ? d.location : scheduleForm.location,
      address: d.address !== undefined ? d.address : (d.exactLocation !== undefined ? d.exactLocation : scheduleForm.address),
      note: d.note !== undefined ? d.note : '',
    }));
    
    console.log('[EventHub] Dates with locations applied:', {
      count: datesWithLocations.length,
      dates: datesWithLocations.map(d => ({
        date: d.date instanceof Date ? d.date.toISOString() : d.date,
        startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
        endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
        location: d.location,
        address: d.address,
        note: d.note,
      })),
    });
    
    console.log('[EventHub] Updating scheduleForm state with new dates...');
    console.log('[EventHub] BEFORE setScheduleForm - isOrganizerOrCoOrganizer:', isOrganizerOrCoOrganizer);
    console.log('[EventHub] BEFORE setScheduleForm - event?.id:', event?.id);
    console.log('[EventHub] BEFORE setScheduleForm - userId:', userId);
    
    // CRITICAL: Save scroll position BEFORE state update to prevent scroll reset
    const savedScrollY = scrollPositionRef.current;
    console.log('[EventHub] Saved scroll position before state update:', savedScrollY);
    
    setScheduleForm({ ...scheduleForm, selectedDates: datesWithLocations });
    
    console.log('[EventHub] ✅ scheduleForm state updated (dates should appear green in calendar)');
    
    // Restore scroll position immediately using useLayoutEffect-like approach
    // Use a ref to track if we need to restore after this update
    if (scheduleScrollRef.current && savedScrollY > 0) {
      // Use requestAnimationFrame to restore after React has updated, but do it synchronously
      // in the next frame to minimize the visible jump
      requestAnimationFrame(() => {
        if (scheduleScrollRef.current) {
          console.log('[EventHub] Restoring scroll position immediately to:', savedScrollY);
          scheduleScrollRef.current.scrollTo({
            y: savedScrollY,
            animated: false,
          });
        }
      });
    }
    
    // Save to Firestore if user is organizer/co-organizer
    if (isOrganizerOrCoOrganizer && event?.id) {
      console.log('[EventHub] 🚀 Starting backend save to Firestore...');
      try {
        // Convert dates to ISO string format for Firestore
        const eventDates = datesWithLocations.map(d => ({
          date: d.date instanceof Date ? d.date.toISOString() : d.date,
          startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
          endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
          location: d.location || '',
          exactLocation: d.address || '',
          note: d.note || '',
        }));
        
        console.log('[EventHub] Calling updateEventSchedule with:', {
          eventId: event.id,
          eventDatesCount: eventDates.length,
          eventDates: eventDates,
        });
        
        // Note: updateEventSchedule will update the events state, causing a re-render
        // This is expected, but the scheduleForm initialization useEffect should not reset
        // because it only depends on event?.id, not the entire event object
        await updateEventSchedule(event.id, {
          eventDates: eventDates,
        });
        
        console.log('[EventHub] ✅ Backend save completed successfully!');
        console.log('[EventHub] ⚠️  Note: Event object will update, causing re-render, but scheduleForm should not reset');
      } catch (error) {
        console.error('[EventHub] ❌ Error saving to Firestore:', error);
        console.error('[EventHub] Error details:', {
          code: error.code,
          message: error.message,
        });
        // Don't show error to user - this is a background save
        // The dates are still in local state, so user can try again
      }
    } else {
      console.log('[EventHub] ⚠️  Skipping backend save - conditions not met:', {
        isOrganizerOrCoOrganizer,
        hasEventId: !!event?.id,
      });
    }
    
    console.log('[EventHub] ========== handleDatesChange COMPLETE ==========');
    
    // Restore scroll position immediately - use multiple strategies to ensure it works
    // Strategy 1: Immediate restore (if ScrollView is still mounted)
    if (scheduleScrollRef.current && savedScroll > 0) {
      // Try immediate restore first
      try {
        scheduleScrollRef.current.scrollTo({
          y: savedScroll,
          animated: false,
        });
        console.log('[EventHub] Immediate scroll restore attempted to:', savedScroll);
      } catch (e) {
        console.warn('[EventHub] Immediate scroll restore failed:', e);
      }
    }
    
    // Strategy 2: Restore after React has updated (backup)
    requestAnimationFrame(() => {
      if (scheduleScrollRef.current && savedScroll > 0) {
        scheduleScrollRef.current.scrollTo({
          y: savedScroll,
          animated: false,
        });
        console.log('[EventHub] Backup scroll restore to:', savedScroll);
      }
    });
  };
  
  // useLayoutEffect to preserve scroll position when scheduleForm.selectedDates changes
  // This runs synchronously before browser paint, preventing visible jumps
  // Track the previous date count to detect when dates are added/removed
  const previousDateCountRef = useRef(scheduleForm.selectedDates.length);
  
  useLayoutEffect(() => {
    const currentDateCount = scheduleForm.selectedDates.length;
    const dateCountChanged = currentDateCount !== previousDateCountRef.current;
    previousDateCountRef.current = currentDateCount;
    
    if (dateCountChanged) {
      const savedScroll = scrollPositionRef.current;
      if (scheduleScrollRef.current && savedScroll > 0) {
        console.log('[EventHub] useLayoutEffect: Date count changed, restoring scroll to:', savedScroll);
        // Restore synchronously before paint to prevent visible jump
        scheduleScrollRef.current.scrollTo({
          y: savedScroll,
          animated: false,
        });
      }
    }
  }, [scheduleForm.selectedDates.length]);

  // useLayoutEffect to preserve scroll position when RSVP updates occur
  // This runs synchronously before browser paint, preventing visible jumps
  useLayoutEffect(() => {
    // Only restore scroll if we're in the middle of an RSVP update
    if (isUpdatingRSVPRef.current && rsvpUpdateCounter > 0) {
      const savedScroll = scrollPositionRef.current;
      if (scheduleScrollRef.current && savedScroll > 0) {
        // Restore synchronously before paint to prevent visible jump
        scheduleScrollRef.current.scrollTo({
          y: savedScroll,
          animated: false,
        });
      }
    }
  }, [rsvpUpdateCounter]);

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

  const handleInviteMembers = async () => {
    // For organizers, show options to share existing code or create new code
    if (isOrganizerOrCoOrganizer) {
      Alert.alert(
        'Invite Members',
        'Choose an option:',
        [
          {
            text: 'Share existing invite',
            onPress: async () => {
              try {
                const joinCodes = event.joinCodes || (event.joinCode ? [event.joinCode] : []);
                const codeToShare = joinCodes[0] || event.joinCode;
                const shareMessage = `Join my MeepleUp "${event.name}"!\n\nJoin code: ${codeToShare}`;
                await Share.share({
                  message: shareMessage,
                  title: `Join ${event.name} on MeepleUp`,
                });
              } catch (error) {
                console.error('Error sharing invite:', error);
              }
            },
          },
          {
            text: 'Create new code and share',
            onPress: async () => {
              if (addCodeBusy) {
                return;
              }
              // Check if we've reached the limit of 10 active join codes
              const joinCodes = event.joinCodes || (event.joinCode ? [event.joinCode] : []);
              if (joinCodes.length >= 10) {
                Alert.alert(
                  'Limit reached',
                  'You can have a maximum of 10 active join codes. Please delete an existing code before creating a new one.',
                );
                return;
              }
              try {
                setAddCodeBusy(true);
                const newCode = await addJoinCode(event.id);
                const shareMessage = `Join my MeepleUp "${event.name}"!\n\nJoin code: ${newCode}`;
                await Share.share({
                  message: shareMessage,
                  title: `Join ${event.name} on MeepleUp`,
                });
              } catch (error) {
                Alert.alert('Could not create code', 'Please try again in a moment.');
                console.error(error);
              } finally {
                setAddCodeBusy(false);
              }
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ],
        { cancelable: true }
      );
    } else {
      // For members with canShareJoinCode, just share the invite
      try {
        const joinCodes = event.joinCodes || (event.joinCode ? [event.joinCode] : []);
        const codeToShare = joinCodes[0] || event.joinCode;
        const shareMessage = `Join my MeepleUp "${event.name}"!\n\nJoin code: ${codeToShare}`;
        await Share.share({
          message: shareMessage,
          title: `Join ${event.name} on MeepleUp`,
        });
      } catch (error) {
        console.error('Error sharing invite:', error);
      }
    }
  };

  const handleRemoveMember = async (memberUserId, memberName) => {
    if (!event?.id) return;

    // Prevent removing the organizer
    if (memberUserId === event.organizerId) {
      Alert.alert('Cannot remove', 'The organizer cannot be removed from the MeepleUp.');
      return;
    }

    // Prevent removing yourself
    const currentUserId = user?.uid || user?.id;
    if (memberUserId === currentUserId) {
      Alert.alert('Cannot remove', 'Please use "Leave MeepleUp" to remove yourself.');
      return;
    }

    Alert.alert(
      'Remove member?',
      `Remove ${memberName || 'this member'} from "${event.name}"? They will no longer have access to this MeepleUp.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingMembers((prev) => new Set(prev).add(memberUserId));
              await removeMember(event.id, memberUserId);
              Alert.alert('Success', `${memberName || 'Member'} has been removed from the MeepleUp.`);
            } catch (error) {
              console.error('Error removing member:', error);
              Alert.alert(
                'Error',
                error.message || 'Failed to remove member. Please try again.',
              );
            } finally {
              setRemovingMembers((prev) => {
                const next = new Set(prev);
                next.delete(memberUserId);
                return next;
              });
            }
          },
        },
      ],
      { cancelable: true }
    );
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
    const counts = { going: 0, 'not-going': 0, none: 0 };
    members.forEach((member) => {
      const status = memberRSVPs[member.userId] || null;
      if (status === 'going' || status === 'not-going') {
        counts[status] = (counts[status] || 0) + 1;
      } else {
        // Treat 'maybe' as 'none' since it's no longer supported
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
  // Handler to update date card field and reset RSVPs if date/time/location changed
  const handleUpdateDateCardField = async (dateKey, originalIndex, field, value) => {
    if (!isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers and co-organizers can edit date details.');
      return;
    }

    try {
      const currentEventDates = event?.eventDates || [];
      const dateIndex = currentEventDates.findIndex((ed, idx) => {
        if (idx === originalIndex) {
          const edDate = safeParseDate(ed.date);
          return edDate && getDateKey(edDate) === dateKey;
        }
        return false;
      });

      if (dateIndex === -1) {
        Alert.alert('Error', 'Date not found.');
        return;
      }

      const currentDate = currentEventDates[dateIndex];
      const oldDate = safeParseDate(currentDate.date);
      const oldStartTime = safeParseDate(currentDate.startTime);
      const oldEndTime = safeParseDate(currentDate.endTime);
      const oldLocation = currentDate.location || currentDate.generalLocation || '';
      const oldAddress = currentDate.address || currentDate.exactLocation || '';

      // Determine if we need to reset RSVPs
      let shouldResetRSVPs = false;
      let updatedDate = { ...currentDate };

      if (field === 'date') {
        const newDate = value instanceof Date ? value : new Date(value);
        updatedDate.date = newDate.toISOString();
        shouldResetRSVPs = getDateKey(oldDate) !== getDateKey(newDate);
      } else if (field === 'startTime') {
        const newStartTime = value instanceof Date ? value : new Date(value);
        updatedDate.startTime = newStartTime.toISOString();
        shouldResetRSVPs = oldStartTime && newStartTime.getTime() !== oldStartTime.getTime();
      } else if (field === 'endTime') {
        const newEndTime = value instanceof Date ? value : new Date(value);
        updatedDate.endTime = newEndTime.toISOString();
        shouldResetRSVPs = oldEndTime && newEndTime.getTime() !== oldEndTime.getTime();
      } else if (field === 'location') {
        updatedDate.location = value;
        updatedDate.generalLocation = value;
        shouldResetRSVPs = oldLocation !== value;
      } else if (field === 'address') {
        updatedDate.address = value;
        updatedDate.exactLocation = value;
        shouldResetRSVPs = oldAddress !== value;
      }

      const updatedEventDates = [...currentEventDates];
      updatedEventDates[dateIndex] = updatedDate;

      // Reset RSVPs and send notifications if needed
      if (shouldResetRSVPs && db && event?.id) {
        try {
          // Clear RSVPs for this date
          const membersRef = db.collection('gamingGroups').doc(event.id).collection('members');
          const membersSnapshot = await membersRef.get();
          
          const batch = db.batch();
          const userName = user?.name || user?.email || 'The host';
          const dateStr = field === 'date' 
            ? formatDate((value instanceof Date ? value : new Date(value)).toISOString())
            : formatDate(oldDate.toISOString());
          
          membersSnapshot.docs.forEach(doc => {
            const memberData = doc.data();
            const memberId = memberData.userId;
            if (memberId && memberId !== userId) {
              // Get current RSVPs - support both formats
              let currentRSVPs = {};
              if (memberData.rsvpStatuses && typeof memberData.rsvpStatuses === 'object') {
                currentRSVPs = { ...memberData.rsvpStatuses };
              } else if (memberData.rsvpStatus && typeof memberData.rsvpStatus === 'string') {
                currentRSVPs = { default: memberData.rsvpStatus };
              }
              
              // Remove RSVP for old date key, keep others
              const updatedRSVPs = { ...currentRSVPs };
              delete updatedRSVPs[dateKey];
              
              // Update member document with rsvpStatuses
              batch.update(doc.ref, { 
                rsvpStatuses: updatedRSVPs,
                rsvpStatus: null, // Clear legacy field
              });
              
              // Send notification
              createNotification(memberId, {
                type: 'rsvp_update',
                groupId: event.id,
                fromUserId: userId,
                fromUserName: userName,
                message: `${userName} updated the event details for ${dateStr}. Please RSVP again.`,
              });
            }
          });
          
          await batch.commit();
        } catch (error) {
          console.error('Error resetting RSVPs:', error);
          // Continue with date update even if RSVP reset fails
        }
      }

      await updateEventSchedule(event.id, {
        eventDates: updatedEventDates,
      });

      // Notify all members when time, location, or address changes
      if ((field === 'startTime' || field === 'endTime' || field === 'location' || field === 'address') && db && event?.id) {
        try {
          const userName = user?.name || user?.email || 'The host';
          const dateStr = formatDate((field === 'date' && value instanceof Date ? value : oldDate).toISOString());
          
          let changeMessage = '';
          if (field === 'startTime' || field === 'endTime') {
            const newStartTime = field === 'startTime' ? (value instanceof Date ? value : new Date(value)) : oldStartTime;
            const newEndTime = field === 'endTime' ? (value instanceof Date ? value : new Date(value)) : (oldEndTime || oldStartTime);
            const timeStr = `${formatTime(newStartTime.toISOString())} - ${formatTime(newEndTime.toISOString())}`;
            changeMessage = `${userName} updated the time for ${dateStr} to ${timeStr}.`;
          } else if (field === 'location') {
            changeMessage = `${userName} updated the location for ${dateStr} to "${value}".`;
          } else if (field === 'address') {
            changeMessage = `${userName} updated the address for ${dateStr} to "${value}".`;
          }
          
          if (changeMessage) {
            await notifyMeepleUpMembers(event.id, userId, {
              type: 'meepleup_changes',
              fromUserName: userName,
              message: changeMessage,
            });
          }
        } catch (notifError) {
          console.error('Error notifying members about date change:', notifError);
        }
      }

      Alert.alert('Success', 'Date details updated successfully.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update date details. Please try again.');
      console.error(error);
    }
  };

  // Handler for calendar date changes (add/remove dates via long press)
  const handleCalendarDatesChange = useCallback(async (newSelectedDates) => {
    if (!isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers and co-organizers can add or remove dates.');
      return;
    }

    try {
      const currentEventDates = event?.eventDates || [];
      const oldLength = currentEventDates.length;
      
      // Convert CalendarDatePicker format to eventDates format
      const updatedEventDates = newSelectedDates.map((dateObj) => {
        const date = dateObj.date instanceof Date ? dateObj.date : new Date(dateObj.date);
        const startTime = dateObj.startTime instanceof Date ? dateObj.startTime : new Date(dateObj.startTime);
        const endTime = dateObj.endTime instanceof Date ? dateObj.endTime : new Date(dateObj.endTime);
        const dateKey = getDateKey(date);
        
        // Get existing date data if it exists (to preserve location, address, note)
        const existingEventDate = currentEventDates.find(ed => {
          const edDate = safeParseDate(ed.date);
          return edDate && getDateKey(edDate) === dateKey;
        });
        
        return {
          date: date.toISOString(),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          location: existingEventDate?.location || existingEventDate?.generalLocation || event?.location || event?.generalLocation || '',
          address: existingEventDate?.address || existingEventDate?.exactLocation || event?.address || event?.exactLocation || '',
          note: existingEventDate?.note || '',
        };
      });

      await updateEventSchedule(event.id, {
        eventDates: updatedEventDates,
      });

      // Create a Tabletalk message about the date change
      if (db && event?.id) {
        try {
          const postsRef = db.collection('gamingGroups').doc(event.id).collection('posts');
          const userName = user?.name || user?.email || 'The host';
          const newLength = updatedEventDates.length;
          
          let messageContent = '';
          if (newLength > oldLength) {
            // Date was added - find which date was added
            const addedDate = updatedEventDates.find(ed => {
              const edDate = safeParseDate(ed.date);
              return !currentEventDates.some(ced => {
                const cedDate = safeParseDate(ced.date);
                return cedDate && edDate && getDateKey(cedDate) === getDateKey(edDate);
              });
            });
            
            if (addedDate) {
              const date = safeParseDate(addedDate.date);
              const dateStr = formatDate(date.toISOString());
              messageContent = `${userName} added a new event date: ${dateStr}`;
            } else {
              messageContent = `${userName} added a new event date.`;
            }
          } else if (newLength < oldLength) {
            // Date was removed - find which date was removed
            const removedDate = currentEventDates.find(ced => {
              const cedDate = safeParseDate(ced.date);
              return !updatedEventDates.some(ed => {
                const edDate = safeParseDate(ed.date);
                return edDate && cedDate && getDateKey(edDate) === getDateKey(cedDate);
              });
            });
            
            if (removedDate) {
              const date = safeParseDate(removedDate.date);
              const dateStr = formatDate(date.toISOString());
              messageContent = `${userName} removed the event date: ${dateStr}`;
            } else {
              messageContent = `${userName} removed an event date.`;
            }
          }
          
          if (messageContent) {
            const postData = {
              userId,
              userName,
              userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
              content: messageContent,
              photoUrl: null,
              likeCount: 0,
              commentCount: 0,
              createdAt: firebase.firestore.Timestamp.now(),
              updatedAt: firebase.firestore.Timestamp.now(),
              edited: false,
              deleted: false,
              pinned: false,
            };
            
            await postsRef.add(postData);
            
            // Notify members about the date change
            try {
              await notifyDiscussionActivity(event.id, userId, {
                type: 'new_post',
                fromUserName: userName,
                message: messageContent,
              });
            } catch (notifError) {
              console.error('Error sending date change notification:', notifError);
            }
          }
        } catch (postError) {
          console.error('Error creating Tabletalk message for date change:', postError);
          // Don't fail the whole operation if post creation fails
        }
      }

      // Show feedback for add/remove
      const newLength = updatedEventDates.length;
      if (newLength > oldLength) {
        Alert.alert('Success', 'Date added successfully.');
      } else if (newLength < oldLength) {
        Alert.alert('Success', 'Date removed successfully.');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update dates. Please try again.');
      console.error(error);
    }
  }, [isOrganizerOrCoOrganizer, event, updateEventSchedule, db, userId, user]);

  // Helper to schedule delayed notification for announcement edits
  const scheduleAnnouncementNotification = useCallback((announcementId, isNew = false) => {
    // Clear any existing timer for this announcement
    if (announcementNotificationTimers.current[announcementId]) {
      clearTimeout(announcementNotificationTimers.current[announcementId]);
    }

    // For new announcements, notify immediately
    if (isNew) {
      return; // Notification already sent in handleSaveAnnouncement
    }

    // For edits, delay notification by 3 minutes (180000ms)
    announcementNotificationTimers.current[announcementId] = setTimeout(async () => {
      try {
        if (!event?.id || !db) return;
        
        // Get the announcement to send notification
        const announcementRef = db.collection('gamingGroups').doc(event.id)
          .collection('posts').doc(announcementId);
        const announcementDoc = await announcementRef.get();
        
        if (!announcementDoc.exists) return;
        
        const announcementData = announcementDoc.data();
        
        // Send notification
        await notifyDiscussionActivity(event.id, userId, {
          type: 'new_post',
          postId: announcementId,
          fromUserName: user?.name || user?.email || 'Unknown',
          message: `${user?.name || 'The host'} updated an announcement`,
        });
        
        // Clean up timer
        delete announcementNotificationTimers.current[announcementId];
      } catch (error) {
        console.error('Error sending delayed announcement notification:', error);
        delete announcementNotificationTimers.current[announcementId];
      }
    }, 180000); // 3 minutes delay
  }, [event?.id, db, userId, user?.name, user?.email]);

  // Handler for creating/editing an announcement
  // Memoize handleSaveAnnouncement to prevent unnecessary re-renders
  const handleSaveAnnouncement = useCallback(async () => {
    if (!isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers and co-organizers can create/edit announcements.');
      return;
    }

    // Sync local content to parent state before saving
    // Use announcementForm.content directly (no local state needed)
    const contentToSave = announcementForm.content;

    if (!contentToSave.trim() && !announcementForm.photo?.uri) {
      Alert.alert('Error', 'Please add text or a photo to your announcement.');
      return;
    }

    if (announcementForm.selectedDateIndex === null) {
      Alert.alert('Error', 'Please select an event date for this announcement.');
      return;
    }

    try {
      const eventDates = event?.eventDates || [];
      const selectedDate = eventDates[announcementForm.selectedDateIndex];
      if (!selectedDate) {
        Alert.alert('Error', 'Selected date not found.');
        return;
      }

      const date = safeParseDate(selectedDate.date);
      if (!date || isNaN(date.getTime())) {
        Alert.alert('Error', 'Invalid date selected.');
        return;
      }

      const dateKey = getDateKey(date);
      const isEditing = editingAnnouncement !== null;

      // Upload photo if present and new
      let photoUrl = null;
      if (announcementForm.photo?.uri && !announcementForm.photo.uploading) {
        // If editing and photo hasn't changed, keep existing URL
        if (isEditing && announcementForm.photo.uri === editingAnnouncement.photoUrl) {
          photoUrl = editingAnnouncement.photoUrl;
        } else {
          photoUrl = announcementForm.photo.uri; // Already uploaded
        }
      } else if (isEditing) {
        // Keep existing photo if not changed
        photoUrl = editingAnnouncement.photoUrl || null;
      }

      const postsRef = db.collection('gamingGroups').doc(event.id).collection('posts');
      
      if (isEditing) {
        // Update existing announcement
        const announcementRef = postsRef.doc(editingAnnouncement.id);
        
        // Check if 30 minutes have passed since creation
        const announcementDoc = await announcementRef.get();
        const announcementData = announcementDoc.data();
        const createdAt = announcementData.createdAt?.toDate?.() || new Date(announcementData.createdAt?.seconds * 1000);
        const now = new Date();
        const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);
        
        await announcementRef.update({
          content: contentToSave.trim() || '',
          photoUrl: photoUrl || null,
          edited: true,
          updatedAt: firebase.firestore.Timestamp.now(),
        });

        // If 30+ minutes have passed, notify users who have seen the announcement
        if (minutesSinceCreation >= 30 && db && event?.id) {
          try {
            // Get all members who aren't the editor
            const membersRef = db.collection('gamingGroups').doc(event.id).collection('members');
            const membersSnapshot = await membersRef.get();
            
            const userName = user?.name || user?.email || 'The host';
            const dateStr = formatDate(date.toISOString());
            
            for (const memberDoc of membersSnapshot.docs) {
              const memberData = memberDoc.data();
              const memberId = memberData.userId;
              
              if (memberId && memberId !== userId) {
                // Check if member has notification preferences enabled
                const preferences = await getUserNotificationPreferences(memberId);
                
                if (isNotificationEnabled(preferences, 'discussion')) {
                  await createNotification(memberId, {
                    type: 'new_post',
                    groupId: event.id,
                    postId: editingAnnouncement.id,
                    fromUserId: userId,
                    fromUserName: userName,
                    message: `${userName} updated an announcement for ${dateStr}.`,
                  });
                }
              }
            }
          } catch (notifError) {
            console.error('Error notifying members about announcement edit:', notifError);
          }
        }

        Alert.alert('Success', 'Announcement updated successfully!');
      } else {
        // Create new announcement
        const postData = {
          userId,
          userName: user?.name || user?.email || 'Unknown',
          userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
          content: contentToSave.trim() || '',
          photoUrl: photoUrl || null,
          likeCount: 0,
          commentCount: 0,
          createdAt: firebase.firestore.Timestamp.now(),
          updatedAt: firebase.firestore.Timestamp.now(),
          edited: false,
          deleted: false,
          pinned: false,
          isAnnouncement: true,
          associatedDateKey: dateKey,
          associatedDateIndex: announcementForm.selectedDateIndex,
          associatedDate: date.toISOString(),
        };

        const docRef = await postsRef.add(postData);

        // Notify members about new announcement immediately
        try {
          await notifyDiscussionActivity(event.id, userId, {
            type: 'new_post',
            postId: docRef.id,
            fromUserName: user?.name || user?.email || 'Unknown',
            message: `${user?.name || 'The host'} posted an announcement`,
          });
        } catch (notifError) {
          console.error('Error sending announcement notification:', notifError);
        }

        Alert.alert('Success', 'Announcement created successfully!');
      }

      // Reset form and close modal
      setAnnouncementForm({
        selectedDateIndex: null,
        content: '',
        photo: null,
      });
      setEditingAnnouncement(null);
      setShowAnnouncementModal(false);
    } catch (error) {
      console.error('Error saving announcement:', error);
      Alert.alert('Error', error.message || 'Failed to save announcement. Please try again.');
    }
  }, [isOrganizerOrCoOrganizer, announcementForm.content, announcementForm.photo, announcementForm.selectedDateIndex, event?.eventDates, event?.id, editingAnnouncement, userId, user?.name, user?.email, user?.photoURL, user?.avatarUrl, scheduleAnnouncementNotification, notifyDiscussionActivity]);

  // Handler for host to edit member RSVP
  const handleHostUpdateMemberRSVP = async (memberId, dateKey, newStatus) => {
    if (!isOrganizerOrCoOrganizer) {
      Alert.alert('Error', 'Only organizers and co-organizers can edit member RSVPs.');
      return;
    }

    try {
      // Find the date object for this dateKey
      const dateObj = futureEvents.find(ed => {
        const edDate = safeParseDate(ed.date);
        return edDate && getDateKey(edDate) === dateKey;
      });
      
      if (!dateObj || !dateObj.date) {
        Alert.alert('Error', 'Date not found.');
        return;
      }

      const eventDate = safeParseDate(dateObj.date);
      await updateMemberRSVP(event.id, memberId, newStatus, eventDate);
      
      // Send notification and email to the member
      if (db && memberId !== userId) {
        const userName = user?.name || user?.email || 'The host';
        const dateStr = formatDate(eventDate.toISOString());
        
        // Get member's preferences
        const preferences = await getUserNotificationPreferences(memberId);
        
        // Create in-app notification
        const notificationId = await createNotification(memberId, {
          type: 'rsvp_update',
          groupId: event.id,
          fromUserId: userId,
          fromUserName: userName,
          message: `${userName} updated your RSVP status to "${newStatus === 'going' ? 'Going' : newStatus === 'not-going' ? 'Can\'t Make It' : newStatus}" for ${dateStr}.`,
        });
        
        // Send email if enabled
        if (preferences?.meepleupChangesEmail === true && notificationId) {
          try {
            await sendRSVPUpdateEmail(memberId, userName, newStatus, dateStr, event.id, event?.name);
          } catch (emailError) {
            console.error('Error sending RSVP update email:', emailError);
          }
        }
      }

    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update RSVP. Please try again.');
      console.error(error);
    }
  };

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
    
    // Show spinner while member data is loading
    const isLoading = loadingMemberData;
    
    if (isLoading) {
      return (
        <View style={[styles.tabContent, { justifyContent: 'center', alignItems: 'center', flex: 1 }]}>
          <ActivityIndicator size="large" color={theme.colors.meepleRed} />
          <Text style={{ marginTop: 16, color: theme.colors.textSecondary }}>
            Loading logistics...
          </Text>
        </View>
      );
    }
    
    return (
      <>
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
            {/* Simple button list */}
            <View style={styles.buttonList}>
              {(isOrganizerOrCoOrganizer || currentUserMember?.canShareJoinCode) && (
                <TouchableOpacity
                  style={styles.buttonListItem}
                  onPress={handleInviteMembers}
                  disabled={addCodeBusy}
                >
                  <Text style={[styles.buttonListText, addCodeBusy && styles.buttonListTextDisabled]}>
                    {addCodeBusy ? '⏳ Creating code...' : '👥 Invite Members'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            
            <View style={styles.inviteBlock}>
              <Text style={styles.inviteLabel}>Active join codes</Text>
              {(event.joinCodes || (event.joinCode ? [event.joinCode] : [])).slice(0, 10).map((code, index) => {
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
          </View>
        )}

        {/* Manage Members Section - Only for Organizers */}
        {isOrganizerOrCoOrganizer && event?.members && event.members.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>👥 Manage Members</Text>
            </View>
            <View style={styles.membersListContainer}>
              {event.members
                .filter((member) => {
                  // Don't show the organizer in the list (they can't be removed)
                  return member.userId !== event.organizerId;
                })
                .map((member) => {
                  const memberName = memberNames[member.userId] || member.userName || 'Unknown Member';
                  const memberAvatar = memberAvatars[member.userId] || member.userAvatarUrl || null;
                  const isRemoving = removingMembers.has(member.userId);
                  
                  return (
                    <View key={member.userId} style={styles.memberRow}>
                      <View style={styles.memberInfo}>
                        {memberAvatar ? (
                          <Image source={{ uri: memberAvatar }} style={styles.memberAvatar} />
                        ) : (
                          <View style={styles.memberAvatarPlaceholder}>
                            <Text style={styles.memberAvatarText}>
                              {memberName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.memberDetails}>
                          <Text style={styles.memberName}>{memberName}</Text>
                          {member.role === memberRoles?.ORGANIZER && (
                            <Text style={styles.memberRole}>Co-organizer</Text>
                          )}
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.removeMemberButton, isRemoving && styles.removeMemberButtonDisabled]}
                        onPress={() => handleRemoveMember(member.userId, memberName)}
                        disabled={isRemoving}
                      >
                        <Text style={[styles.removeMemberText, isRemoving && styles.removeMemberTextDisabled]}>
                          {isRemoving ? 'Removing...' : 'Remove'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              {event.members.filter((m) => m.userId !== event.organizerId).length === 0 && (
                <Text style={styles.emptyMembersText}>No other members to manage</Text>
              )}
            </View>
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

        {/* Calendar View Button */}
        <View style={styles.pastEventsButtonContainer}>
          <Button
            label="📅 Calendar View"
            onPress={() => setShowCalendarModal(true)}
            variant="outline"
            style={styles.pastEventsButton}
                />
              </View>

        {/* Old Date Cards Section - REMOVED - Using LogisticsCardV2 instead */}
          
          {/* Upcoming events - Separate component */}
          <LogisticsCardV2
            futureEvents={futureEvents}
            eventId={event?.id}
            userId={userId}
            user={user}
            notifyDiscussionActivity={notifyDiscussionActivity}
            isOrganizerOrCoOrganizer={isOrganizerOrCoOrganizer}
            members={members}
            memberNames={memberNames}
            memberAvatars={memberAvatars}
            memberRSVPs={memberRSVPs}
            rsvpSettings={event?.rsvpSettings || { enabled: true, allowMaybe: false, attendanceLimit: null }}
            isMember={isMember}
            getRSVPForDate={getRSVPForDate}
            handleRSVP={handleRSVP}
            handleHostUpdateMemberRSVP={handleHostUpdateMemberRSVP}
            event={event}
            navigation={navigation}
            navigate={navigate}
            setSelectedUserForProfile={setSelectedUserForProfile}
            handleUpdateDateCardField={handleUpdateDateCardField}
          />
          
          {(event?.eventDates && Array.isArray(event.eventDates) && event.eventDates.length > 0) || event?.scheduledFor ? (
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

        {/* Export Calendar Button */}
        <View style={styles.pastEventsButtonContainer}>
          <Button
            label="📆 Export calendar"
            onPress={handleExportToCalendar}
            variant="outline"
            style={styles.pastEventsButton}
          />
        </View>

      </ScrollView>
      
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
            
            const location = ed.location || '';
            const address = ed.address || '';
            const note = ed.note || '';
            
            return (
              <View key={`past-${index}`} style={styles.pastEventCard}>
                <Text style={styles.pastEventDate}>{dateStr}</Text>
                {timeStr ? <Text style={styles.pastEventTime}>{timeStr}</Text> : null}
                {location ? <Text style={styles.pastEventLocation}>📍 {location}</Text> : null}
                {address ? <Text style={styles.pastEventAddress}>{address}</Text> : null}
                {note ? <Text style={styles.pastEventNote}>📝 {note}</Text> : null}
              </View>
            );
          })}
        </ScrollView>
      </Modal>

      {/* Calendar View Modal */}
      <Modal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        title="📅 Calendar View"
      >
        <View style={styles.calendarModalContent}>
          <CalendarDatePicker
            selectedDates={calendarDates}
            onDatesChange={handleCalendarDatesChange}
            usualStartTime={event?.usualStartTime ? new Date(event.usualStartTime) : null}
            usualEndTime={event?.usualEndTime ? new Date(event.usualEndTime) : null}
            readOnly={!isOrganizerOrCoOrganizer}
            onDatePress={(dateIndex, dateInfo) => {
              // Find the corresponding date in calendarDates by matching the date
              const dateKey = getDateKey(dateInfo.date);
              const calendarDate = calendarDates.find(cd => {
                const cdDate = cd.date instanceof Date ? cd.date : new Date(cd.date);
                return getDateKey(cdDate) === dateKey;
              });
              
              if (calendarDate && calendarDate.originalIndex !== undefined) {
                const eventDateObj = event?.eventDates?.[calendarDate.originalIndex];
                if (eventDateObj) {
                  setSelectedDateDetail({
                    date: dateInfo.date,
                    startTime: dateInfo.startTime,
                    endTime: dateInfo.endTime,
                    location: eventDateObj.location || eventDateObj.generalLocation || event?.location || event?.generalLocation || '',
                    address: eventDateObj.address || eventDateObj.exactLocation || event?.address || event?.exactLocation || '',
                    note: eventDateObj.note || '',
                    index: calendarDate.originalIndex,
                    isEditScheduleContext: false,
                  });
                  setShowDateDetailModal(true);
                }
              }
            }}
            memberRSVPs={memberRSVPs}
            currentUserId={userId}
          />
        </View>
      </Modal>
    </>
  );
};

  // Find the next chronological event date where user has RSVP'd "going"
  const findNextGoingDateIndex = () => {
    if (!event?.eventDates || !userId || !memberRSVPs[userId]) {
      return null; // Return null if no RSVP data, so we can handle it appropriately
    }

    const userRSVPs = memberRSVPs[userId];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Create array of dates with their indices, sorted chronologically
    const datesWithIndices = event.eventDates
      .map((eventDate, index) => {
        const date = safeParseDate(eventDate.date);
        if (!date || isNaN(date.getTime())) return null;
        const dateKey = getDateKey(date);
        const rsvpStatus = userRSVPs[dateKey];
        return { index, date, dateKey, rsvpStatus };
      })
      .filter(item => item !== null && item.date >= now) // Only future dates
      .sort((a, b) => a.date.getTime() - b.date.getTime()); // Sort chronologically

    // Find the first date where user RSVP'd "going"
    const goingDate = datesWithIndices.find(item => item.rsvpStatus === 'going');
    
    return goingDate ? goingDate.index : null; // Return the index, or null if no going date found
  };

  // Navigate to BrowseAndProposeScreen for full game planning functionality
  const handleNavigateToGameplan = () => {
    const dateIndex = findNextGoingDateIndex();
    
    // If no date found where user RSVP'd "going", don't navigate
    if (dateIndex === null) {
      // Just show the GamesTab instead
      setActiveTab(TABS.GAMES);
      return;
    }
    
    if (Platform.OS === 'web') {
      if (navigate) {
        navigate(`/event/${eventId}/browse/${dateIndex}`);
      } else if (typeof window !== 'undefined') {
        window.location.href = `/event/${eventId}/browse/${dateIndex}`;
      }
    } else {
      if (navigation) {
        navigation.navigate('BrowseAndPropose', { eventId, dateIndex });
      }
    }
  };

  // GamesTab component - shows proposed games and game planning
  const GamesTab = () => {
    const [showGameplanMessage, setShowGameplanMessage] = useState(true);

    // Load dismissal state from storage on mount
    useEffect(() => {
      const loadDismissalState = async () => {
        try {
          const dismissed = await storage.getItem('gameplan_message_dismissed');
          if (dismissed === 'true') {
            setShowGameplanMessage(false);
          }
        } catch (error) {
          console.error('Error loading gameplan message dismissal state:', error);
        }
      };
      loadDismissalState();
    }, []);

    if (!event) {
      return (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
          <View style={styles.section}>
            <Text>Loading event...</Text>
          </View>
        </ScrollView>
      );
    }

    // Navigate to BrowseAndProposeScreen for full game planning functionality
    const handleNavigateToGameplanLocal = () => {
      const dateIndex = findNextGoingDateIndex();
      
      if (dateIndex === null) {
        // If no date found where user RSVP'd "going", just show a message
        Alert.alert(
          'No Upcoming Dates',
          'You need to RSVP "Going" to at least one upcoming event date to access the gameplan.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      if (Platform.OS === 'web') {
        if (navigate) {
          navigate(`/event/${eventId}/browse/${dateIndex}`);
        } else if (typeof window !== 'undefined') {
          window.location.href = `/event/${eventId}/browse/${dateIndex}`;
        }
      } else {
        if (navigation) {
          navigation.navigate('BrowseAndPropose', { eventId, dateIndex });
        }
      }
    };

    // Handle "Got it" button click - dismiss the message if first time, otherwise navigate
    const handleGotIt = async () => {
      if (showGameplanMessage) {
        // First time - dismiss the message
        try {
          await storage.setItem('gameplan_message_dismissed', 'true');
          setShowGameplanMessage(false);
        } catch (error) {
          console.error('Error saving gameplan message dismissal state:', error);
          // Still hide the message even if storage fails
          setShowGameplanMessage(false);
        }
      } else {
        // Already dismissed - navigate to gameplan
        handleNavigateToGameplanLocal();
      }
    };

    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gameplan</Text>
          <Text style={styles.sectionCopy}>
            Plan which games to play at your event. Browse collections, propose games, and see what others are bringing.
          </Text>
          <Button
            label="Got it."
            onPress={handleGotIt}
            style={styles.planningGamesLink}
            textStyle={styles.planningGamesLinkText}
          />
        </View>
      </ScrollView>
    );
  };

  // DiscussionTab component - shows posts, announcements, and messages
  const DiscussionTab = () => {
    const [posts, setPosts] = useState([]);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [newPostContent, setNewPostContent] = useState('');
    const [newPostPhoto, setNewPostPhoto] = useState(null); // { uri: string, uploading: boolean }
    const [creatingPost, setCreatingPost] = useState(false);

    // Fetch posts from Firestore
    useEffect(() => {
      if (!event?.id || !db) {
        setLoadingPosts(false);
        return;
      }

      setLoadingPosts(true);
      const postsRef = db.collection('gamingGroups').doc(event.id).collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(50);

      const unsubscribe = postsRef.onSnapshot(
        (snapshot) => {
          const postsData = snapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter(post => post.deleted !== true); // Filter out deleted posts (but include posts without deleted field)
          setPosts(postsData);
          setLoadingPosts(false);
        },
        (error) => {
          console.error('Error fetching posts:', error);
          setLoadingPosts(false);
        }
      );

      return () => unsubscribe();
    }, [event?.id, db]);

    // Fetch comments for all posts
    // Use a ref to track which posts we've subscribed to, and only subscribe to new ones
    const subscribedPostIdsRef = useRef(new Set());
    const unsubscribeRefsRef = useRef({}); // { postId: unsubscribe function }
    
    useEffect(() => {
      if (!event?.id || !db || posts.length === 0) {
        // Clean up all subscriptions if event/db is not available
        Object.values(unsubscribeRefsRef.current).forEach(unsubscribe => unsubscribe());
        unsubscribeRefsRef.current = {};
        subscribedPostIdsRef.current.clear();
        return;
      }

      const currentPostIds = new Set(posts.map(p => p.id));
      
      // Unsubscribe from posts that no longer exist
      subscribedPostIdsRef.current.forEach(postId => {
        if (!currentPostIds.has(postId)) {
          if (unsubscribeRefsRef.current[postId]) {
            unsubscribeRefsRef.current[postId]();
            delete unsubscribeRefsRef.current[postId];
          }
          subscribedPostIdsRef.current.delete(postId);
        }
      });
      
      // Subscribe to new posts
      posts.forEach(post => {
        if (!subscribedPostIdsRef.current.has(post.id)) {
          const commentsRef = db.collection('gamingGroups').doc(event.id)
            .collection('posts').doc(post.id)
            .collection('comments')
            .orderBy('createdAt', 'asc');

          const unsubscribe = commentsRef.onSnapshot(
            (snapshot) => {
              const commentsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
              })).filter(comment => comment.deleted !== true);

              setCommentsByPost(prev => ({
                ...prev,
                [post.id]: commentsData,
              }));
            },
            (error) => {
              console.error(`Error fetching comments for post ${post.id}:`, error);
            }
          );
          
          unsubscribeRefsRef.current[post.id] = unsubscribe;
          subscribedPostIdsRef.current.add(post.id);
        }
      });

      // Cleanup function
      return () => {
        Object.values(unsubscribeRefsRef.current).forEach(unsubscribe => unsubscribe());
        unsubscribeRefsRef.current = {};
        subscribedPostIdsRef.current.clear();
      };
    }, [event?.id, db, posts.map(p => p.id).sort().join(',')]);

    // Create new post (thread)
    const handleCreatePost = async () => {
      if (!newPostContent.trim() && !newPostPhoto?.uri) {
        Alert.alert('Error', 'Please add text or a photo to your post.');
        return;
      }

      if (!event?.id || !db || !userId) return;

      setCreatingPost(true);
      try {
        let photoUrl = null;
        if (newPostPhoto?.uri && !newPostPhoto.uploading) {
          photoUrl = newPostPhoto.uri;
        }

        const postsRef = db.collection('gamingGroups').doc(event.id).collection('posts');
        const postData = {
          userId,
          userName: user?.name || user?.email || 'Unknown',
          userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
          content: newPostContent.trim() || '',
          photoUrl: photoUrl,
          likeCount: 0,
          commentCount: 0,
          createdAt: firebase.firestore.Timestamp.now(),
          updatedAt: firebase.firestore.Timestamp.now(),
          edited: false,
          deleted: false,
          pinned: false,
        };

        await postsRef.add(postData);

        // Notify members about new post
        try {
          await notifyDiscussionActivity(event.id, userId, {
            type: 'new_post',
            fromUserName: user?.name || user?.email || 'Unknown',
            message: `${user?.name || 'A member'} posted in Tabletalk`,
          });
        } catch (notifError) {
          console.error('Error sending post notification:', notifError);
        }

        // Reset form
        setNewPostContent('');
        setNewPostPhoto(null);
      } catch (error) {
        console.error('Error creating post:', error);
        Alert.alert('Error', 'Failed to create post. Please try again.');
      } finally {
        setCreatingPost(false);
      }
    };

    // Handle reply to post or comment
    const handleReply = async () => {
      if (!replyText.trim()) {
        Alert.alert('Error', 'Please enter a comment.');
        return;
      }

      if (!event?.id || !db || !userId || !replyingTo) return;

      try {
        const commentsRef = db.collection('gamingGroups').doc(event.id)
          .collection('posts').doc(replyingTo.postId)
          .collection('comments');

        const commentData = {
          userId,
          userName: user?.name || user?.email || 'Unknown',
          userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
          content: replyText.trim(),
          createdAt: firebase.firestore.Timestamp.now(),
          updatedAt: firebase.firestore.Timestamp.now(),
          edited: false,
          deleted: false,
          parentType: replyingTo.type, // 'post' or 'comment'
          parentId: replyingTo.id,
        };

        await commentsRef.add(commentData);

        // Update comment count on the post
        const postRef = db.collection('gamingGroups').doc(event.id)
          .collection('posts').doc(replyingTo.postId);
        const postDoc = await postRef.get();
        const currentCount = postDoc.data()?.commentCount || 0;
        await postRef.update({
          commentCount: currentCount + 1,
        });

        // Reset reply state
        setReplyingTo(null);
        setReplyText('');

        // Notify post author
        try {
          const postDoc = await postRef.get();
          const postData = postDoc.data();
          if (postData?.userId && postData.userId !== userId) {
            const preferences = await getUserNotificationPreferences(postData.userId);
            if (isNotificationEnabled(preferences, 'discussion')) {
              await createNotification(postData.userId, {
                type: 'new_comment',
                groupId: event.id,
                postId: replyingTo.postId,
                fromUserId: userId,
                fromUserName: user?.name || user?.email || 'Unknown',
                message: `${user?.name || 'Someone'} commented on your post`,
              });
            }
          }
        } catch (notifError) {
          console.error('Error sending comment notification:', notifError);
        }
      } catch (error) {
        console.error('Error creating comment:', error);
        Alert.alert('Error', 'Failed to post comment. Please try again.');
      }
    };

    if (!event) {
      return (
        <ScrollView 
          ref={discussionScrollViewRef}
          style={styles.tabContent} 
          contentContainerStyle={[styles.tabContentContainer, styles.discussionScrollContent]}
        >
          <View style={styles.section}>
            <Text>Loading event...</Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView 
        ref={discussionScrollViewRef}
        style={styles.tabContent} 
        contentContainerStyle={[styles.tabContentContainer, styles.discussionScrollContent]}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tabletalk</Text>
          <Text style={styles.sectionCopy}>
            Share announcements, discuss plans, and chat with your group.
          </Text>
        </View>

        {/* New Post Form */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Create a new post</Text>
          <Input
            value={newPostContent}
            onChangeText={setNewPostContent}
            placeholder="What's on your mind?"
            multiline
            numberOfLines={4}
            style={{ marginBottom: 12 }}
          />
          {newPostPhoto && (
            <View style={{ marginBottom: 12, position: 'relative' }}>
              <Image 
                source={{ uri: newPostPhoto.uri }} 
                style={{ width: '100%', height: 200, borderRadius: 8 }}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  borderRadius: 15,
                  width: 30,
                  height: 30,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onPress={() => setNewPostPhoto(null)}
              >
                <Text style={{ color: 'white', fontSize: 18 }}>×</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <Button
              label={newPostPhoto ? "📷 Change Photo" : "📷 Add Photo"}
              onPress={async () => {
                try {
                  const photo = await pickAndUploadImage(userId, event.id);
                  if (photo) {
                    setNewPostPhoto({ uri: photo, uploading: false });
                  }
                } catch (error) {
                  console.error('Error picking photo:', error);
                  Alert.alert('Error', 'Failed to pick photo. Please try again.');
                }
              }}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <Button
              label={creatingPost ? "Posting..." : "Post"}
              onPress={handleCreatePost}
              variant="primary"
              style={{ flex: 1 }}
              disabled={creatingPost || (!newPostContent.trim() && !newPostPhoto)}
            />
          </View>
        </View>

        {loadingPosts ? (
          <View style={styles.section}>
            <Text>Loading messages...</Text>
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionCopy}>No messages yet. Be the first to post!</Text>
          </View>
        ) : (
          posts.map((post) => {
            const postComments = commentsByPost[post.id] || [];
            const isReplyingToThisPost = replyingTo?.postId === post.id && replyingTo?.type === 'post' && replyingTo?.id === post.id;
            
            return (
              <View key={post.id} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{post.userName || 'Unknown'}</Text>
                  {post.createdAt && (
                    <Text style={styles.sectionCopy}>
                      {post.createdAt.toDate ? formatDate(post.createdAt.toDate().toISOString()) : formatDate(post.createdAt)}
                    </Text>
                  )}
                </View>
                {post.content && (
                  <Text style={styles.sectionCopy}>{post.content}</Text>
                )}
                {post.photoUrl && (
                  <Image 
                    source={{ uri: post.photoUrl }} 
                    style={{ width: '100%', height: 200, borderRadius: 8, marginTop: 8 }}
                    resizeMode="cover"
                  />
                )}
                {post.isAnnouncement && (
                  <Text style={[styles.sectionCopy, { color: theme.colors.meepleRed, fontWeight: 'bold', marginTop: 4 }]}>
                    📢 Announcement
                  </Text>
                )}
                {post.edited && (
                  <Text style={[styles.sectionCopy, { fontSize: 11, color: theme.colors.textSecondary, fontStyle: 'italic', marginTop: 4 }]}>
                    (edited)
                  </Text>
                )}

                {/* Comments Count and Reply Button */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 16 }}>
                  {post.commentCount > 0 && (
                    <Text style={[styles.sectionCopy, { fontSize: 13, color: theme.colors.textSecondary }]}>
                      {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      if (isReplyingToThisPost) {
                        setReplyingTo(null);
                        setReplyText('');
                      } else {
                        setReplyingTo({ type: 'post', id: post.id, postId: post.id });
                      }
                    }}
                    style={{ paddingVertical: 4 }}
                  >
                    <Text style={[styles.sectionCopy, { fontSize: 13, color: theme.colors.meepleRed }]}>
                      {isReplyingToThisPost ? 'Cancel' : 'Reply'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Reply Input */}
                {isReplyingToThisPost && (
                  <View style={styles.replyInputContainer}>
                    <Input
                      value={replyText}
                      onChangeText={setReplyText}
                      placeholder="Write a comment..."
                      multiline
                      numberOfLines={3}
                      style={styles.replyInputField}
                    />
                    <View style={styles.replyActions}>
                      <Button
                        label="Cancel"
                        onPress={() => {
                          setReplyingTo(null);
                          setReplyText('');
                        }}
                        variant="secondary"
                        style={styles.replyCancelButton}
                      />
                      <Button
                        label="Post"
                        onPress={handleReply}
                        variant="primary"
                        style={styles.replyPostButton}
                        disabled={!replyText.trim()}
                      />
                    </View>
                  </View>
                )}

                {/* Comments */}
                {postComments.length > 0 && (
                  <View style={styles.commentsSection}>
                    {postComments.map((comment) => {
                      const isReplyingToThisComment = replyingTo?.postId === post.id && replyingTo?.type === 'comment' && replyingTo?.id === comment.id;
                      
                      return (
                        <View key={comment.id} style={styles.commentItem}>
                          <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { fontSize: 14 }]}>{comment.userName || 'Unknown'}</Text>
                            {comment.createdAt && (
                              <Text style={[styles.sectionCopy, { fontSize: 11 }]}>
                                {comment.createdAt.toDate ? formatDate(comment.createdAt.toDate().toISOString()) : formatDate(comment.createdAt)}
                              </Text>
                            )}
                          </View>
                          <Text style={[styles.sectionCopy, { fontSize: 14 }]}>{comment.content}</Text>
                          {comment.edited && (
                            <Text style={[styles.sectionCopy, { fontSize: 10, color: theme.colors.textSecondary, fontStyle: 'italic', marginTop: 2 }]}>
                              (edited)
                            </Text>
                          )}
                          <TouchableOpacity
                            onPress={() => {
                              if (isReplyingToThisComment) {
                                setReplyingTo(null);
                                setReplyText('');
                              } else {
                                setReplyingTo({ type: 'comment', id: comment.id, postId: post.id });
                              }
                            }}
                            style={{ marginTop: 4 }}
                          >
                            <Text style={[styles.sectionCopy, { fontSize: 12, color: theme.colors.meepleRed }]}>
                              {isReplyingToThisComment ? 'Cancel' : 'Reply'}
                            </Text>
                          </TouchableOpacity>
                          {isReplyingToThisComment && (
                            <View style={styles.replyInputContainer}>
                              <Input
                                value={replyText}
                                onChangeText={setReplyText}
                                placeholder={`Reply to ${comment.userName}...`}
                                multiline
                                numberOfLines={3}
                                style={styles.replyInputField}
                              />
                              <View style={styles.replyActions}>
                                <Button
                                  label="Cancel"
                                  onPress={() => {
                                    setReplyingTo(null);
                                    setReplyText('');
                                  }}
                                  variant="secondary"
                                  style={styles.replyCancelButton}
                                />
                                <Button
                                  label="Post"
                                  onPress={handleReply}
                                  variant="primary"
                                  style={styles.replyPostButton}
                                  disabled={!replyText.trim()}
                                />
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    );
  };

  if (!event) {
    return (
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Loading event...</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{event.name || 'Event'}</Text>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === TABS.EVENT && styles.tabActive]}
            onPress={() => setActiveTab(TABS.EVENT)}
          >
            <Text style={[styles.tabText, activeTab === TABS.EVENT && styles.tabTextActive]}>
              Logistics
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === TABS.GAMES && styles.tabActive]}
            onPress={() => handleNavigateToGameplan()}
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
        {activeTab === TABS.DISCUSSION && <DiscussionTab />}
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
  calendarModalContent: {
    flex: 1,
    minHeight: 500,
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
  pastEventCard: {
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
  pastEventTime: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
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
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  dateGameplanButton: {
    minWidth: 120,
    height: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateGameplanButtonText: {
    fontSize: 16,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  dateCardGameplanButtonContainer: {
    marginTop: theme.spacing.md,
    alignItems: 'flex-start',
  },
  dateCardGameplanButton: {
    minWidth: 120,
    height: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateCardGameplanButtonText: {
    fontSize: 15,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  dateCardEditableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dateCardEditIcon: {
    marginLeft: theme.spacing.xs,
    padding: 4,
  },
  dateCardEditIconText: {
    fontSize: 14,
  },
  dateCardEditContainer: {
    flex: 1,
    marginTop: theme.spacing.xs,
  },
  dateCardEditInput: {
    marginBottom: theme.spacing.xs,
  },
  dateCardEditInputLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    marginBottom: theme.spacing.xs,
    color: theme.colors.textPrimary,
  },
  dateCardEditActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  dateCardEditSaveButton: {
    minWidth: 50,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateCardEditCancelButton: {
    minWidth: 50,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateCardEditButtonText: {
    fontSize: 14,
  },
  dateCardTimeEditRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  dateCardTimeEditColumn: {
    flex: 1,
  },
  dateCardTimeEditLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    marginBottom: theme.spacing.xs,
    color: theme.colors.textPrimary,
  },
  dateCardMemberRSVPItem: {
    position: 'relative',
  },
  dateCardMemberRSVPEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginTop: theme.spacing.xs,
  },
  dateCardMemberRSVPEditOption: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  dateCardMemberRSVPEditOptionSelected: {
    borderColor: theme.colors.meepleRed,
    backgroundColor: '#fff0f0',
  },
  dateCardMemberRSVPEditOptionText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
  },
  dateCardMemberRSVPEditOptionTextSelected: {
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  dateCardMemberRSVPEditCancel: {
    marginLeft: 'auto',
    padding: 4,
  },
  dateCardMemberRSVPEditCancelText: {
    fontSize: 16,
  },
  dateCardMemberRSVPEditHint: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 2,
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
  highlightedAnnouncement: {
    backgroundColor: '#fff3cd',
    borderWidth: 2,
    borderColor: '#ffc107',
    borderRadius: 8,
    padding: 8,
    marginBottom: 24,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  announcementBadge: {
    backgroundColor: theme.colors.meepleRed,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  announcementBadgeText: {
    fontSize: 11,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  announcementDateSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  announcementDateOption: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.woodDark,
    backgroundColor: '#fff',
  },
  announcementDateOptionSelected: {
    backgroundColor: theme.colors.meepleRed,
    borderColor: theme.colors.meepleRed,
  },
  announcementDateOptionText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
  },
  announcementDateOptionTextSelected: {
    color: '#fff',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  announcementTextInput: {
    marginTop: theme.spacing.sm,
    minHeight: 120,
  },
  announcementPhotoContainer: {
    position: 'relative',
    marginTop: theme.spacing.sm,
    width: '100%',
    maxHeight: 300,
  },
  announcementPhotoPreview: {
    width: '100%',
    height: 300,
    borderRadius: 8,
  },
  announcementPhotoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  announcementPhotoRemoveText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  announcementPhotoButton: {
    marginTop: theme.spacing.sm,
  },
  announcementSubmitButton: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  announcementCancelButton: {
    marginBottom: theme.spacing.md,
  },
  dateCardAnnouncementsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  dateCardAnnouncementAddButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: theme.colors.meepleRed,
  },
  dateCardAnnouncementAddButtonText: {
    fontSize: theme.typography.fontSize.xs,
    color: '#fff',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  dateCardAnnouncementsList: {
    marginTop: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  dateCardAnnouncementItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateCardAnnouncementContent: {
    flex: 1,
  },
  dateCardAnnouncementText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  dateCardAnnouncementClickable: {
    cursor: 'pointer',
  },
  dateCardAnnouncementPhoto: {
    width: '100%',
    height: 100,
    borderRadius: 6,
    marginTop: theme.spacing.xs,
  },
  dateCardAnnouncementEditButton: {
    marginLeft: theme.spacing.sm,
    padding: 4,
  },
  dateCardAnnouncementEditButtonText: {
    fontSize: 14,
  },
  announcementFormSection: {
    marginBottom: theme.spacing.md,
  },
  announcementFormLabel: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  announcementFormHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  announcementDateSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  announcementDateOption: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  announcementDateOptionSelected: {
    backgroundColor: theme.colors.meepleRed,
    borderColor: theme.colors.meepleRed,
  },
  announcementDateOptionText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  announcementDateOptionTextSelected: {
    color: '#fff',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  announcementContentInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  announcementPhotoButton: {
    marginTop: theme.spacing.xs,
  },
  announcementPhotoPreview: {
    position: 'relative',
    marginTop: theme.spacing.xs,
    borderRadius: 8,
    overflow: 'hidden',
  },
  announcementPhotoPreviewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  announcementPhotoRemoveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  announcementPhotoRemoveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  announcementFormActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  announcementSaveButton: {
    flex: 1,
  },
  announcementCancelButton: {
    flex: 1,
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
  commentItem: {
    marginTop: 12,
    marginLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.woodMedium,
    paddingLeft: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
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
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  removeMemberButtonDisabled: {
    opacity: 0.5,
  },
  removeMemberText: {
    color: '#d45d5d',
    fontSize: 13,
    fontWeight: '500',
  },
  removeMemberTextDisabled: {
    opacity: 0.5,
  },
  membersListContainer: {
    marginTop: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  memberDetails: {
    flex: 1,
    marginLeft: 12,
  },
  memberAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  emptyMembersText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f7f5',
    overflow: 'hidden',
  },
  dateListItemContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'column',
  },
  dateListItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  proposeGamesTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    marginBottom: theme.spacing.lg,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  dateCardContainer: {
    flexDirection: 'column',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  dateCard: {
    marginBottom: theme.spacing.lg,
    borderRadius: 20,
    overflow: 'visible',
    borderWidth: 6,
    borderColor: theme.colors.woodDark,
    borderStyle: 'solid',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minHeight: 120,
  },
  dateCardHighlighted: {
    borderWidth: 8,
    borderColor: theme.colors.meepleRed,
    shadowColor: theme.colors.meepleRed,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  dateCardMinimal: {
    borderWidth: 2,
    borderColor: '#d0d0d0',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    opacity: 0.7,
  },
  dateCardBackground: {
    position: 'relative',
    minHeight: 120,
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'visible',
  },
  dateCardContent: {
    padding: theme.spacing.xl,
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    overflow: 'visible',
  },
  dateCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  dateCardTextBlock: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  dateCardTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    marginBottom: theme.spacing.xs,
  },
  dateCardSubtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  dateCardLocation: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  dateCardNextEventBadge: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    marginLeft: theme.spacing.xs,
  },
  dateCardCTAText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.semibold,
    marginTop: theme.spacing.xs,
  },
  dateCardRSVPStatusText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: theme.spacing.xs,
  },
  dateCardYourRSVPContainer: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rsvpDropdownContainer: {
    flex: 1,
    marginLeft: theme.spacing.xs,
    zIndex: 1000,
    elevation: 1000,
  },
  rsvpDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    minWidth: 150,
  },
  rsvpDropdownButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  rsvpDropdownArrow: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  rsvpDropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 15,
    zIndex: 10000,
    minWidth: 180,
  },
  rsvpDropdownOption: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rsvpDropdownOptionLast: {
    borderBottomWidth: 0,
  },
  rsvpDropdownOptionSelected: {
    backgroundColor: '#f0f7ff',
  },
  rsvpDropdownOptionText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
  },
  rsvpDropdownOptionTextSelected: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.meepleRed,
  },
  rsvpReminderText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  dateCardRSVPsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: theme.spacing.xs,
  },
  dateCardInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  dateCardInfoLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginRight: theme.spacing.xs,
  },
  dateCardInfoValue: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  dateCardHostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  dateCardHostAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dateCardHostAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.meepleRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dateCardHostAvatarInitial: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  dateCardRSVPToggle: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  dateCardRSVPToggleLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    marginBottom: theme.spacing.sm,
    color: theme.colors.textPrimary,
  },
  dateCardRSVPButtons: {
    gap: theme.spacing.xs,
  },
  dateCardRSVPButton: {
    flex: 1,
    padding: 6,
    minHeight: 36,
    height: 36,
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
  dateListItemHighlighted: {
    borderWidth: 3,
    borderColor: theme.colors.meepleRed,
    backgroundColor: '#fff8f0',
  },
  dateListNextEventBadge: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.meepleRed,
    marginLeft: 8,
  },
  dateListCTAText: {
    fontSize: 12,
    color: theme.colors.meepleRed,
    fontWeight: '600',
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
  dateListAvatarContainer: {
    position: 'relative',
    width: 36,
    height: 36,
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
  dateListAvatarEditIcon: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.meepleRed,
    borderWidth: 1.5,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  dateListAvatarEditIconText: {
    fontSize: 9,
    lineHeight: 10,
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
  memberActionHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    marginTop: 4,
  },
  proposalLimitEditContainer: {
    marginTop: 8,
  },
  proposalLimitInput: {
    marginBottom: 12,
  },
  proposalLimitButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  proposalLimitButton: {
    flex: 1,
  },
  proposalLimitDisplayContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  proposalLimitDisplay: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  proposalLimitEditButton: {
    minWidth: 120,
  },
});

export default EventHub;
