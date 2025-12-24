import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import storage from '../utils/storage';
import { useAuth } from './AuthContext';
import { wordList1, wordList2, wordList3 } from '../utils/wordlist';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import { notifyMeepleUpMembers } from '../utils/notifications';

const EventsContext = createContext();

const MEMBERSHIP_STATUS = {
  STRANGER: 'stranger',
  MEMBER: 'member',
};

const MEMBER_ROLES = {
  ORGANIZER: 'organizer',
  MEMBER: 'member',
};

const CONTACT_STATUS = {
  PENDING: 'pending',
  RESPONDED: 'responded',
  ARCHIVED: 'archived',
};

const STORAGE_KEY = 'meepleup_events';

const generateJoinCode = () => {
  // Select one word from each list: word1, word2, word3
  const word1Index = Math.floor(Math.random() * wordList1.length);
  const word2Index = Math.floor(Math.random() * wordList2.length);
  const word3Index = Math.floor(Math.random() * wordList3.length);
  
  return `${wordList1[word1Index]} ${wordList2[word2Index]} ${wordList3[word3Index]}`;
};

const normalizeMember = (member, organizerId, fallbackDate) => {
  if (!member) {
    return null;
  }

  if (typeof member === 'string') {
    return {
      userId: member,
      status: MEMBERSHIP_STATUS.MEMBER,
      role: member === organizerId ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER,
      joinedAt: fallbackDate || new Date().toISOString(),
      canShareJoinCode: false, // Default to false
      proposalLimit: 5, // Default proposal limit
    };
  }

  const status = member.status || MEMBERSHIP_STATUS.MEMBER;
  const isOrganizer = member.userId === organizerId || member.role === MEMBER_ROLES.ORGANIZER;
  return {
    userId: member.userId || member.id || null,
    status,
    role: member.role || (member.userId === organizerId ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER),
    joinedAt: member.joinedAt || fallbackDate || new Date().toISOString(),
    canShareJoinCode: member.canShareJoinCode !== undefined ? member.canShareJoinCode : isOrganizer, // Organizers can always share
    proposalLimit: member.proposalLimit !== undefined ? member.proposalLimit : 5, // Default to 5 if not set
  };
};

const normalizeEvent = (event) => {
  if (!event) {
    return null;
  }

  const createdAt = event.createdAt || new Date().toISOString();
  const organizerId = event.organizerId || null;

  const membersRaw = Array.isArray(event.members) ? event.members : [];
  const members = membersRaw
    .map((member) => normalizeMember(member, organizerId, createdAt))
    .filter((member) => !!member?.userId);

  const hasOrganizer = members.some((member) => member.role === MEMBER_ROLES.ORGANIZER);
  const normalizedMembers = hasOrganizer || !organizerId
    ? members
    : [
        {
          userId: organizerId,
          status: MEMBERSHIP_STATUS.MEMBER,
          role: MEMBER_ROLES.ORGANIZER,
          joinedAt: createdAt,
        },
        ...members,
      ];

  const contactRequests = Array.isArray(event.contactRequests)
    ? event.contactRequests.map((request) => ({
        id: request.id || `${event.id || Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: request.name || '',
        email: request.email || '',
        message: request.message || '',
        status: request.status || CONTACT_STATUS.PENDING,
        createdAt: request.createdAt || new Date().toISOString(),
        respondedAt: request.respondedAt || null,
        notes: request.notes || '',
      }))
    : [];

  // Support both new (location/address) and old (generalLocation/exactLocation) field names
  const location = event.location || event.generalLocation || '';
  const address = event.address || event.exactLocation || '';

  // Check if event is archived (from Firestore)
  const deletedAt = event.deletedAt?.toDate?.()?.toISOString() || event.deletedAt || null;
  const isActive = event.isActive !== undefined ? event.isActive : (deletedAt === null);

  // Handle joinCodes: support both new array format and old single string format
  let joinCodes = [];
  if (Array.isArray(event.joinCodes)) {
    // New format: array of codes
    joinCodes = event.joinCodes.filter(code => code && typeof code === 'string');
  } else if (event.joinCode) {
    // Old format: single code - convert to array
    joinCodes = [event.joinCode];
  }
  // If no codes exist, generate one
  if (joinCodes.length === 0) {
    joinCodes = [generateJoinCode()];
  }
  // For backward compatibility, also set joinCode to the first code
  const joinCode = joinCodes[0] || generateJoinCode();

  // Normalize eventDates - ensure it's always an array if present, or undefined if not
  let eventDates = undefined;
  if (event.eventDates !== undefined && event.eventDates !== null) {
    eventDates = Array.isArray(event.eventDates) ? event.eventDates : undefined;
  }

  return {
    id: event.id || Date.now().toString(),
    name: event.name || 'New MeepleUp',
    organizerId,
    description: event.description || '',
    scheduledFor: event.scheduledFor || event.nextDate || '',
    eventDates,
    usualStartTime: event.usualStartTime || undefined,
    usualEndTime: event.usualEndTime || undefined,
    createdAt,
    joinCode, // Backward compatibility: first code
    joinCodes, // New format: array of all active codes
    location,
    address,
    // Backward compatibility: also include old field names
    generalLocation: location,
    exactLocation: address,
    visibility: 'private', // All meepleups are private (public feature removed)
    members: normalizedMembers,
    contactRequests,
    lastUpdatedAt: event.lastUpdatedAt || new Date().toISOString(),
    tags: event.tags || [],
    allowStrangerMessages: event.allowStrangerMessages ?? true,
    isActive,
    deletedAt,
    // RSVP settings
    rsvpSettings: event.rsvpSettings || {
      enabled: true,
      allowMaybe: true,
      attendanceLimit: null, // null means no limit
    },
  };
};

const addOrUpdateMember = (event, userId, role = MEMBER_ROLES.MEMBER, canShareJoinCode = false) => {
  if (!userId) {
    return event.members;
  }

  const existing = event.members.find((member) => member.userId === userId);
  if (existing) {
    return event.members.map((member) =>
      member.userId === userId
        ? {
            ...member,
            status: MEMBERSHIP_STATUS.MEMBER,
            role: role !== undefined ? role : member.role,
            canShareJoinCode: canShareJoinCode !== undefined ? canShareJoinCode : (member.canShareJoinCode !== undefined ? member.canShareJoinCode : (role === MEMBER_ROLES.ORGANIZER)),
            joinedAt: member.joinedAt || new Date().toISOString(),
          }
        : member,
    );
  }

  return [
    ...event.members,
    {
      userId,
      status: MEMBERSHIP_STATUS.MEMBER,
      role: role || MEMBER_ROLES.MEMBER,
      canShareJoinCode: canShareJoinCode || (role === MEMBER_ROLES.ORGANIZER),
      joinedAt: new Date().toISOString(),
    },
  ];
};

const removeMember = (event, userId) =>
  event.members.filter((member) => member.userId !== userId);

// Helper function to extract zipcode from location string
const extractZipcodeFromLocation = (location) => {
  if (!location) return '';
  
  // Try to find 5-digit zipcode pattern
  const zipcodeMatch = location.match(/\b\d{5}(-\d{4})?\b/);
  if (zipcodeMatch) {
    return zipcodeMatch[0].split('-')[0]; // Return just the 5-digit part
  }
  
  return '';
};

export const useEvents = () => {
  const context = useContext(EventsContext);
  if (!context) {
    throw new Error('useEvents must be used within an EventsProvider');
  }
  return context;
};

export const EventsProvider = ({ children }) => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const storedEvents = await storage.getItem(STORAGE_KEY);
        if (storedEvents) {
          const parsed = JSON.parse(storedEvents);
          const normalized = Array.isArray(parsed)
            ? parsed.map(normalizeEvent).filter(Boolean)
            : [];
          setEvents(normalized);
        }
      } catch (error) {
        console.error('Error loading events:', error);
      } finally {
        setInitialised(true);
        setLoading(false);
      }
    };
    loadEvents();
  }, []);

  // Sync events from Firestore when user is authenticated
  useEffect(() => {
    if (!user || !db || !initialised) {
      return;
    }

    const syncEventsFromFirestore = async () => {
      try {
        const userId = user.uid || user.id;
        if (!userId) {
          console.log('[EventsContext] No userId available, skipping sync');
          return;
        }

        console.log(`[EventsContext] Syncing events for user: ${userId} (${user.email || 'no email'})`);

        // Query Firestore for gamingGroups where user is in memberIds array OR is the organizer
        // Try multiple queries and combine results
        let allGroupDocs = [];
        const seenGroupIds = new Set();
        
        // Query 1: Groups where user is in memberIds
        try {
          console.log(`[EventsContext] Querying groups where user is in memberIds...`);
          const memberGroupsRef = db.collection('gamingGroups')
            .where('memberIds', 'array-contains', userId)
            .where('isActive', '==', true);
          const memberGroupsSnapshot = await memberGroupsRef.get();
          memberGroupsSnapshot.docs.forEach(doc => {
            if (!seenGroupIds.has(doc.id)) {
              allGroupDocs.push(doc);
              seenGroupIds.add(doc.id);
            }
          });
          console.log(`[EventsContext] Found ${memberGroupsSnapshot.docs.length} groups via memberIds query for user ${userId}`);
        } catch (memberQueryError) {
          // Check if it's a permission error or index error
          const isPermissionError = memberQueryError.code === 'permission-denied' || 
                                    memberQueryError.message?.includes('permission') ||
                                    memberQueryError.message?.includes('Missing or insufficient permissions');
          if (isPermissionError) {
            console.warn('[EventsContext] Permission error querying groups by memberIds (user may not be in memberIds):', memberQueryError.message);
          } else {
            console.warn('[EventsContext] Error querying groups by memberIds (may need index):', memberQueryError.message);
          }
        }
        
        // Query 2: Groups where user is the organizer
        try {
          console.log(`[EventsContext] Querying groups where user is organizer...`);
          const organizerGroupsRef = db.collection('gamingGroups')
            .where('organizerId', '==', userId)
            .where('isActive', '==', true);
          const organizerGroupsSnapshot = await organizerGroupsRef.get();
          organizerGroupsSnapshot.docs.forEach(doc => {
            if (!seenGroupIds.has(doc.id)) {
              allGroupDocs.push(doc);
              seenGroupIds.add(doc.id);
            }
          });
          console.log(`[EventsContext] Found ${organizerGroupsSnapshot.docs.length} groups via organizerId query for user ${userId}`);
        } catch (organizerQueryError) {
          // Check if it's a permission error or index error
          const isPermissionError = organizerQueryError.code === 'permission-denied' || 
                                    organizerQueryError.message?.includes('permission') ||
                                    organizerQueryError.message?.includes('Missing or insufficient permissions');
          if (isPermissionError) {
            console.warn('[EventsContext] Permission error querying groups by organizerId:', organizerQueryError.message);
          } else {
            console.warn('[EventsContext] Error querying groups by organizerId (may need index):', organizerQueryError.message);
          }
        }
        
        console.log(`[EventsContext] Total groups found: ${allGroupDocs.length} for user ${userId}`);
        
        // Create a snapshot-like object from the combined results
        const groupsSnapshot = {
          docs: allGroupDocs,
          empty: allGroupDocs.length === 0
        };
        
        if (groupsSnapshot.empty) {
          console.log(`[EventsContext] No groups found for user ${userId}. User may not be a member of any MeepleUps.`);
          // Set empty array to clear any stale data
          setEvents([]);
          return;
        }

        // Fetch all group documents with their members
        const groupPromises = groupsSnapshot.docs.map(async (groupDoc) => {
          try {
            const firestoreData = groupDoc.data();
            
            // Get members from subcollection
            let members = [];
            try {
              const membersSnapshot = await db.collection('gamingGroups')
                .doc(groupDoc.id)
                .collection('members')
                .get();
              
              members = membersSnapshot.docs.map(memberDoc => {
                const memberData = memberDoc.data();
                const isOrganizer = memberData.role === MEMBER_ROLES.ORGANIZER || memberData.userId === firestoreData.organizerId;
                
                // Default RSVP status to "going" for organizers if not set
                let rsvpStatus = memberData.rsvpStatus;
                let rsvpStatuses = memberData.rsvpStatuses || {};
                
                if (isOrganizer && !rsvpStatus && Object.keys(rsvpStatuses).length === 0) {
                  // Organizer has no RSVP set - default to "going"
                  rsvpStatus = 'going';
                  rsvpStatuses = { default: 'going' };
                } else if (isOrganizer && !rsvpStatus && Object.keys(rsvpStatuses).length > 0) {
                  // Organizer has date-specific RSVPs but no default - set default to "going"
                  rsvpStatus = 'going';
                }
                
                return {
                  userId: memberData.userId || memberDoc.id,
                  status: MEMBERSHIP_STATUS.MEMBER,
                  role: memberData.role || MEMBER_ROLES.MEMBER,
                  joinedAt: memberData.joinedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                  rsvpStatus: rsvpStatus || null, // Backward compatibility
                  rsvpStatuses: rsvpStatuses, // Date-specific RSVPs
                  rsvpUpdatedAt: memberData.rsvpUpdatedAt?.toDate?.()?.toISOString() || null,
                  canShareJoinCode: memberData.canShareJoinCode !== undefined ? memberData.canShareJoinCode : (memberData.role === MEMBER_ROLES.ORGANIZER), // Default: organizers can share
                  proposalLimit: memberData.proposalLimit !== undefined ? memberData.proposalLimit : 5, // Default to 5 if not set
                };
              });
            } catch (memberError) {
              // Permission errors can occur if user isn't a member yet
              // Fall back to using memberIds from the group document
              console.warn(`Error fetching members for group ${groupDoc.id}, using memberIds fallback:`, memberError);
              const memberIds = firestoreData.memberIds || [];
              members = memberIds.map((memberId, index) => {
                const isOrganizer = memberId === firestoreData.organizerId;
                return {
                  userId: memberId,
                  status: MEMBERSHIP_STATUS.MEMBER,
                  role: isOrganizer ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER,
                  joinedAt: firestoreData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                  rsvpStatus: isOrganizer ? 'going' : null, // Default organizers to "going"
                  rsvpStatuses: isOrganizer ? { default: 'going' } : {}, // Default organizers to "going"
                  rsvpUpdatedAt: null,
                  canShareJoinCode: isOrganizer, // Only organizer by default
                  proposalLimit: 5, // Default proposal limit
                };
              });
            }

            // Convert Firestore event format to local event format
            return {
              id: groupDoc.id,
              name: firestoreData.name || '',
              organizerId: firestoreData.organizerId || null,
              description: firestoreData.description || '',
              scheduledFor: firestoreData.scheduledFor || firestoreData.nextEventDate || '',
              eventDates: (firestoreData.eventDates && Array.isArray(firestoreData.eventDates)) 
                ? firestoreData.eventDates.map(ed => ({
                    date: ed.date?.toDate?.()?.toISOString() || ed.date,
                    startTime: ed.startTime?.toDate?.()?.toISOString() || ed.startTime,
                    endTime: ed.endTime?.toDate?.()?.toISOString() || ed.endTime,
                    location: ed.location || firestoreData.location?.name || '',
                    exactLocation: ed.exactLocation || firestoreData.location?.address || '',
                    note: ed.note || '',
                  })) 
                : undefined,
              usualStartTime: firestoreData.usualStartTime?.toDate?.()?.toISOString() || firestoreData.usualStartTime,
              usualEndTime: firestoreData.usualEndTime?.toDate?.()?.toISOString() || firestoreData.usualEndTime,
              createdAt: firestoreData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
              joinCode: firestoreData.joinCode || '',
              joinCodes: firestoreData.joinCodes || (firestoreData.joinCode ? [firestoreData.joinCode] : []),
              location: firestoreData.location?.name || '',
              address: firestoreData.location?.address || '',
              // Backward compatibility
              generalLocation: firestoreData.location?.name || '',
              exactLocation: firestoreData.location?.address || '',
              visibility: 'private', // All meepleups are private (public feature removed)
              members: members,
              isActive: firestoreData.isActive !== false,
              deletedAt: firestoreData.deletedAt?.toDate?.()?.toISOString() || firestoreData.deletedAt || null,
              lastUpdatedAt: firestoreData.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
              rsvpSettings: firestoreData.rsvpSettings || {
                enabled: true,
                allowMaybe: true,
                attendanceLimit: null,
              },
            };
          } catch (error) {
            console.error(`Error fetching group ${groupDoc.id}:`, error);
            return null;
          }
        });

        const firestoreEvents = (await Promise.all(groupPromises))
          .filter(Boolean)
          .map(normalizeEvent)
          .filter(Boolean);

        if (firestoreEvents.length > 0) {
          // Merge Firestore events with local events, preferring Firestore data
          setEvents((prevEvents) => {
            const merged = new Map();
            
            // First add all local events
            prevEvents.forEach(event => {
              merged.set(event.id, event);
            });
            
            // Then add/update with Firestore events (Firestore takes precedence)
            firestoreEvents.forEach(event => {
              merged.set(event.id, event);
            });
            
            return Array.from(merged.values());
          });
        }
      } catch (error) {
        console.error('Error syncing events from Firestore:', error);
      }
    };

    syncEventsFromFirestore();
  }, [user, db, initialised]);

  useEffect(() => {
    if (!initialised) {
      return;
    }

    const saveEvents = async () => {
      try {
        const serializable = events.map((event) => ({
          ...event,
          members: event.members.map((member) => ({
            userId: member.userId,
            status: member.status,
            role: member.role,
            joinedAt: member.joinedAt,
          })),
          contactRequests: event.contactRequests.map((request) => ({
            id: request.id,
            name: request.name,
            email: request.email,
            message: request.message,
            status: request.status,
            createdAt: request.createdAt,
            respondedAt: request.respondedAt,
            notes: request.notes,
          })),
        }));

        await storage.setItem(STORAGE_KEY, JSON.stringify(serializable));
      } catch (error) {
        console.error('Error saving events:', error);
      }
    };

    saveEvents();
  }, [events, initialised]);

  const createEvent = useCallback(
    async (eventData = {}) => {
      const organizerId = eventData.organizerId || user?.uid || user?.id || null;
      // Initialize joinCodes array - use provided code or generate new one
      const initialCode = eventData.joinCode || generateJoinCode();
      const normalizedInitialCode = initialCode.trim().toLowerCase().replace(/[\s-]+/g, ' ');
      const joinCodes = eventData.joinCodes || [normalizedInitialCode];
      
      const baseEvent = normalizeEvent({
        ...eventData,
        organizerId,
        members: eventData.members || (organizerId ? [organizerId] : []),
        createdAt: new Date().toISOString(),
        joinCodes: joinCodes.map(code => code.trim().toLowerCase().replace(/[\s-]+/g, ' ')),
      });

      // Save to Firestore if available
      if (db && baseEvent.id) {
        try {
          const eventsRef = db.collection('gamingGroups').doc(baseEvent.id);
          
          console.log('[EventsContext] createEvent - eventData.eventDates received:', {
            hasEventDates: !!eventData.eventDates,
            count: eventData.eventDates?.length || 0,
            eventDates: eventData.eventDates?.map((ed, index) => ({
              index,
              date: ed.date,
              dateType: typeof ed.date,
              startTime: ed.startTime,
              startTimeType: typeof ed.startTime,
              endTime: ed.endTime,
              endTimeType: typeof ed.endTime,
              dateParsed: new Date(ed.date).toISOString(),
              startTimeParsed: new Date(ed.startTime).toISOString(),
              endTimeParsed: new Date(ed.endTime).toISOString(),
            })) || [],
          });
          
          // Convert local event format to Firestore format
          const firestoreData = {
            id: baseEvent.id,
            name: baseEvent.name,
            description: baseEvent.description || '',
            organizerId: baseEvent.organizerId,
            organizerName: user?.name || user?.email || '',
            joinCode: baseEvent.joinCode, // Backward compatibility: first code
            joinCodes: baseEvent.joinCodes || [baseEvent.joinCode], // Array of all active codes
            privacy: 'private', // All meepleups are private (public feature removed)
            location: {
              name: baseEvent.location || baseEvent.generalLocation || '',
              address: baseEvent.address || baseEvent.exactLocation || '',
            },
            scheduledFor: baseEvent.scheduledFor || null,
            eventDates: eventData.eventDates ? eventData.eventDates.map((ed, index) => {
              const dateDate = new Date(ed.date);
              const startTimeDate = new Date(ed.startTime);
              const endTimeDate = new Date(ed.endTime);
              
              const firestoreDate = firebase.firestore.Timestamp.fromDate(dateDate);
              const firestoreStartTime = firebase.firestore.Timestamp.fromDate(startTimeDate);
              const firestoreEndTime = firebase.firestore.Timestamp.fromDate(endTimeDate);
              
              console.log(`[EventsContext] Converting eventDate ${index + 1} to Firestore:`, {
                original: {
                  date: ed.date,
                  startTime: ed.startTime,
                  endTime: ed.endTime,
                },
                parsed: {
                  date: dateDate.toISOString(),
                  startTime: startTimeDate.toISOString(),
                  endTime: endTimeDate.toISOString(),
                },
                firestore: {
                  date: firestoreDate.toDate().toISOString(),
                  startTime: firestoreStartTime.toDate().toISOString(),
                  endTime: firestoreEndTime.toDate().toISOString(),
                },
                timestamp: {
                  date: firestoreDate.seconds,
                  startTime: firestoreStartTime.seconds,
                  endTime: firestoreEndTime.seconds,
                },
              });
              
              return {
                date: firestoreDate,
                startTime: firestoreStartTime,
                endTime: firestoreEndTime,
                location: ed.location || '',
                exactLocation: ed.exactLocation || '',
                note: ed.note || '',
              };
            }) : undefined,
            nextEventDate: baseEvent.eventDates && baseEvent.eventDates.length > 0
              ? firebase.firestore.Timestamp.fromDate(new Date(baseEvent.eventDates[0].date))
              : (baseEvent.scheduledFor ? firebase.firestore.Timestamp.fromDate(new Date(baseEvent.scheduledFor)) : null),
            type: eventData.recurring?.enabled ? 'recurring' : 'single',
            frequency: eventData.recurring?.frequency || null,
            memberIds: baseEvent.members.map(m => m.userId).filter(Boolean),
            memberCount: baseEvent.members.length,
            isActive: true,
            createdAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
            createdBy: organizerId,
            rsvpSettings: baseEvent.rsvpSettings || {
              enabled: true,
              allowMaybe: true,
              attendanceLimit: null,
            },
          };
          
          // Only include usualStartTime and usualEndTime if they're provided (Firestore doesn't allow undefined)
          if (eventData.usualStartTime) {
            firestoreData.usualStartTime = firebase.firestore.Timestamp.fromDate(
              eventData.usualStartTime instanceof Date 
                ? eventData.usualStartTime 
                : new Date(eventData.usualStartTime)
            );
            console.log('[EventsContext] createEvent - usualStartTime converted:', {
              original: eventData.usualStartTime,
              firestore: firestoreData.usualStartTime.toDate().toISOString(),
            });
          }
          if (eventData.usualEndTime) {
            firestoreData.usualEndTime = firebase.firestore.Timestamp.fromDate(
              eventData.usualEndTime instanceof Date 
                ? eventData.usualEndTime 
                : new Date(eventData.usualEndTime)
            );
            console.log('[EventsContext] createEvent - usualEndTime converted:', {
              original: eventData.usualEndTime,
              firestore: firestoreData.usualEndTime.toDate().toISOString(),
            });
          }
          
          console.log('[EventsContext] createEvent - firestoreData being saved:', {
            ...firestoreData,
            eventDates: firestoreData.eventDates?.map((ed, index) => ({
              index,
              date: ed.date?.toDate?.()?.toISOString() || ed.date,
              startTime: ed.startTime?.toDate?.()?.toISOString() || ed.startTime,
              endTime: ed.endTime?.toDate?.()?.toISOString() || ed.endTime,
              dateTimestamp: ed.date?.seconds || ed.date,
              startTimeTimestamp: ed.startTime?.seconds || ed.startTime,
              endTimeTimestamp: ed.endTime?.seconds || ed.endTime,
            })) || [],
            scheduledFor: firestoreData.scheduledFor,
          });
          
          await eventsRef.set(firestoreData);
          
          console.log('[EventsContext] createEvent - Event saved to Firestore successfully');
          
          // Save organizer as member in subcollection
          if (organizerId) {
            const membersRef = eventsRef.collection('members').doc(organizerId);
            
            // Set default RSVP status to "going" for organizers
            // If there are event dates, set RSVP for each date; otherwise use 'default' key
            const rsvpStatuses = {};
            if (eventData.eventDates && Array.isArray(eventData.eventDates) && eventData.eventDates.length > 0) {
              // Set RSVP status to "going" for each event date
              eventData.eventDates.forEach((ed) => {
                if (ed.date) {
                  const date = ed.date instanceof Date ? ed.date : new Date(ed.date);
                  const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
                  rsvpStatuses[dateKey] = 'going';
                }
              });
            } else {
              // For single-date or no-date events, use 'default' key
              rsvpStatuses['default'] = 'going';
            }
            
            await membersRef.set({
              userId: organizerId,
              userName: user?.name || user?.email || '',
              userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
              role: 'organizer',
              joinedAt: firebase.firestore.Timestamp.now(),
              rsvpStatus: 'going', // Backward compatibility - set to "going" for organizers
              rsvpStatuses: rsvpStatuses,
            });
          }

          // Public meepleups feature removed - no notifications needed
        } catch (error) {
          console.error('[createEvent] ❌ Error saving event to Firestore:', error);
          // Continue with local creation even if Firestore save fails
        }
      }

      setEvents((prev) => [...prev, baseEvent]);
      return baseEvent;
    },
    [user],
  );

  const updateEvent = useCallback((eventId, updates) => {
    setEvents((prev) =>
      prev.map((event) => {
        if (event.id !== eventId) {
          return event;
        }
        const updated = normalizeEvent({
          ...event,
          ...updates,
          lastUpdatedAt: new Date().toISOString(),
        });

        return {
          ...updated,
          contactRequests: updates.contactRequests ? updated.contactRequests : event.contactRequests,
          members: updates.members ? updated.members : event.members,
        };
      }),
    );
  }, []);

  const deleteEvent = useCallback((eventId) => {
    setEvents((prev) => prev.filter((event) => event.id !== eventId));
  }, []);

  const archiveEvent = useCallback(
    async (eventId, userId) => {
      if (!eventId || !userId) {
        throw new Error('MeepleUp ID and user ID are required to archive a MeepleUp.');
      }

      // Find the event and verify user is the organizer
      const event = events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error('MeepleUp not found.');
      }

      if (event.organizerId !== userId) {
        throw new Error('Only the organizer can archive this MeepleUp.');
      }

      // Archive in Firestore if available
      if (db && eventId) {
        try {
          const groupRef = db.collection('gamingGroups').doc(eventId);
          const groupDoc = await groupRef.get();
          
          if (groupDoc.exists) {
            // Double-check organizer in Firestore
            const firestoreData = groupDoc.data();
            if (firestoreData.organizerId !== userId) {
              throw new Error('Only the organizer can archive this MeepleUp.');
            }

            await groupRef.update({
              isActive: false,
              deletedAt: firebase.firestore.Timestamp.now(),
              updatedAt: firebase.firestore.Timestamp.now(),
            });
          }
        } catch (error) {
          console.error('Error archiving event in Firestore:', error);
          throw error; // Re-throw to show error to user
        }
      }
      
      // Update local state to mark as archived (keep in events list but marked)
      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId
            ? {
                ...event,
                isActive: false,
                deletedAt: new Date().toISOString(),
                lastUpdatedAt: new Date().toISOString(),
              }
            : event,
        ),
      );
    },
    [events],
  );

  const unarchiveEvent = useCallback(
    async (eventId, userId) => {
      if (!eventId || !userId) {
        throw new Error('MeepleUp ID and user ID are required to unarchive a MeepleUp.');
      }

      // Find the event and verify user is the organizer
      const event = events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error('MeepleUp not found.');
      }

      if (event.organizerId !== userId) {
        throw new Error('Only the organizer can unarchive this MeepleUp.');
      }

      // Unarchive in Firestore if available
      if (db && eventId) {
        try {
          const groupRef = db.collection('gamingGroups').doc(eventId);
          const groupDoc = await groupRef.get();
          
          if (groupDoc.exists) {
            // Double-check organizer in Firestore
            const firestoreData = groupDoc.data();
            if (firestoreData.organizerId !== userId) {
              throw new Error('Only the organizer can unarchive this MeepleUp.');
            }

            await groupRef.update({
              isActive: true,
              deletedAt: firebase.firestore.FieldValue.delete(),
              updatedAt: firebase.firestore.Timestamp.now(),
            });
          }
        } catch (error) {
          console.error('Error unarchiving event in Firestore:', error);
          throw error; // Re-throw to show error to user
        }
      }
      
      // Update local state to unarchive
      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId
            ? {
                ...event,
                isActive: true,
                deletedAt: null,
                lastUpdatedAt: new Date().toISOString(),
              }
            : event,
        ),
      );
    },
    [events],
  );

  const joinEvent = useCallback((eventId, userId, role = MEMBER_ROLES.MEMBER) => {
    if (!userId) {
      return null;
    }

    let joinedEvent = null;
    setEvents((prev) =>
      prev.map((event) => {
        if (event.id !== eventId) {
          return event;
        }

        const nextMembers = addOrUpdateMember(event, userId, role);
        joinedEvent = {
          ...event,
          members: nextMembers,
          lastUpdatedAt: new Date().toISOString(),
        };
        return joinedEvent;
      }),
    );
    return joinedEvent;
  }, []);

  const joinEventWithCode = useCallback(
    async (code, userId) => {
      if (!code || !userId) {
        return null;
      }

      const normalized = code.trim().toLowerCase().replace(/[\s-]+/g, ' ');
      
      // First check local events
      let event = getEventByJoinCode(code);
      let eventFromFirestore = false;
      
      // If not found locally, query Firestore with retry logic
      // This handles Firestore propagation delays for newly created events
      // We query by joinCode only (single-field index) and filter isActive in memory
      // to avoid composite index issues
      if (!event && db) {
        const maxRetries = 4;
        const baseDelay = 500; // Start with 500ms delay
        let fallbackTried = false; // Track if we've tried the fallback query
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const eventsRef = db.collection('gamingGroups');
            
            console.log(`[EventsContext] Join code query attempt ${attempt + 1}/${maxRetries}:`, {
              normalizedCode: normalized,
              userId: userId,
              hasAuth: !!user,
              authUid: user?.uid || user?.id || 'none'
            });
            
            // Query by joinCode only (single-field index)
            // Security rules will allow reading active groups even for non-members
            // We filter for active events in memory after the query
            let snapshot = await eventsRef
              .where('joinCode', '==', normalized)
              .limit(10) // Get a few matches in case there are archived events with same code
              .get();
            
            console.log(`[EventsContext] Join code query succeeded, found ${snapshot.docs.length} documents`);
            
            // If indexed query returns empty, try fallback approach
            // This handles cases where the index hasn't been initialized yet
            // Only try fallback once per join attempt to avoid expensive repeated queries
            if (snapshot.empty && !fallbackTried) {
              fallbackTried = true;
              console.log('[EventsContext] Primary query returned empty, trying fallback query...');
              try {
                // Query recent events and filter in memory (bypasses index requirement)
                const recentSnapshot = await eventsRef
                  .orderBy('createdAt', 'desc')
                  .limit(100) // Get recent events to search through
                  .get();
                
                console.log(`[EventsContext] Fallback query succeeded, found ${recentSnapshot.docs.length} recent documents to filter`);
                
                // Filter for matching joinCode/joinCodes and active status in memory
                const matchingDocs = recentSnapshot.docs.filter(doc => {
                  const data = doc.data();
                  const isActive = data.isActive !== false && !data.deletedAt;
                  if (!isActive) return false;
                  
                  // Check single joinCode field (backward compatibility)
                  const docJoinCode = (data.joinCode || '').trim().toLowerCase().replace(/[\s-]+/g, ' ');
                  if (docJoinCode === normalized) return true;
                  
                  // Check joinCodes array
                  const joinCodes = data.joinCodes || [];
                  return joinCodes.some(code => {
                    const normalizedCode = (code || '').trim().toLowerCase().replace(/[\s-]+/g, ' ');
                    return normalizedCode === normalized;
                  });
                });
                
                if (matchingDocs.length > 0) {
                  snapshot = {
                    docs: matchingDocs,
                    empty: false
                  };
                }
              } catch (fallbackError) {
                const isPermissionError = fallbackError?.code === 'permission-denied' || 
                                        fallbackError?.message?.includes('permission') ||
                                        fallbackError?.message?.includes('Missing or insufficient permissions');
                console.error('[EventsContext] Error in fallback query for join code:', {
                  errorCode: fallbackError?.code,
                  errorMessage: fallbackError?.message,
                  isPermissionError,
                  normalizedCode: normalized,
                  userId: userId,
                  hasAuth: !!user,
                  authUid: user?.uid || user?.id || 'none',
                  error: fallbackError
                });
                // Continue with original empty snapshot
              }
            }
            
            // Filter for active events and check if code matches (for indexed query results)
            const activeDocs = snapshot.docs.filter(doc => {
              const data = doc.data();
              const isActive = data.isActive !== false && !data.deletedAt;
              if (!isActive) return false;
              
              // For indexed query, check if the primary joinCode matches
              // (fallback already checked both joinCode and joinCodes)
              if (!fallbackTried) {
                const docJoinCode = (data.joinCode || '').trim().toLowerCase().replace(/[\s-]+/g, ' ');
                if (docJoinCode === normalized) return true;
                
                // Also check joinCodes array
                const joinCodes = data.joinCodes || [];
                return joinCodes.some(code => {
                  const normalizedCode = (code || '').trim().toLowerCase().replace(/[\s-]+/g, ' ');
                  return normalizedCode === normalized;
                });
              }
              return true; // Fallback already filtered
            });
            
            console.log(`[EventsContext] After filtering, found ${activeDocs.length} active documents matching join code`);
            
            if (activeDocs.length > 0) {
              const doc = activeDocs[0];
              const firestoreEvent = doc.data();
              
              // Get members from subcollection (same as syncEventsFromFirestore)
              let members = [];
              try {
                const membersSnapshot = await db.collection('gamingGroups')
                  .doc(doc.id)
                  .collection('members')
                  .get();
                
                members = membersSnapshot.docs.map(memberDoc => {
                  const memberData = memberDoc.data();
                  return {
                    userId: memberData.userId || memberDoc.id,
                    status: MEMBERSHIP_STATUS.MEMBER,
                    role: memberData.role || MEMBER_ROLES.MEMBER,
                    joinedAt: memberData.joinedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    rsvpStatus: memberData.rsvpStatus || null, // Backward compatibility
                    rsvpStatuses: memberData.rsvpStatuses || {},
                    rsvpUpdatedAt: memberData.rsvpUpdatedAt?.toDate?.()?.toISOString() || memberData.rsvpUpdatedAt || null,
                    canShareJoinCode: memberData.canShareJoinCode !== undefined ? memberData.canShareJoinCode : (memberData.role === MEMBER_ROLES.ORGANIZER || memberData.userId === firestoreEvent.organizerId),
                    proposalLimit: memberData.proposalLimit !== undefined ? memberData.proposalLimit : 5, // Default to 5 if not set
                  };
                });
              } catch (membersError) {
                console.warn('[EventsContext] Error fetching members subcollection, falling back to memberIds:', membersError);
                // Fallback to memberIds if subcollection fetch fails
                if (firestoreEvent.memberIds && Array.isArray(firestoreEvent.memberIds)) {
                  members = firestoreEvent.memberIds.map((memberId) => ({
                    userId: memberId,
                    status: MEMBERSHIP_STATUS.MEMBER,
                    role: memberId === firestoreEvent.organizerId ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER,
                    joinedAt: firestoreEvent.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    canShareJoinCode: memberId === firestoreEvent.organizerId,
                    proposalLimit: 5, // Default proposal limit
                  }));
                }
              }
              
              // Convert Firestore event format to local event format
              // Match the format used in syncEventsFromFirestore for consistency
              const localEventData = {
                id: doc.id,
                name: firestoreEvent.name,
                organizerId: firestoreEvent.organizerId,
                description: firestoreEvent.description || '',
                scheduledFor: firestoreEvent.scheduledFor || firestoreEvent.nextEventDate || '',
                eventDates: firestoreEvent.eventDates ? firestoreEvent.eventDates.map(ed => ({
                  date: ed.date?.toDate?.()?.toISOString() || ed.date,
                  startTime: ed.startTime?.toDate?.()?.toISOString() || ed.startTime,
                  endTime: ed.endTime?.toDate?.()?.toISOString() || ed.endTime,
                  location: ed.location || firestoreEvent.location?.name || '',
                  exactLocation: ed.exactLocation || firestoreEvent.location?.address || '',
                  note: ed.note || '',
                })) : undefined,
                usualStartTime: firestoreEvent.usualStartTime?.toDate?.()?.toISOString() || firestoreEvent.usualStartTime,
                usualEndTime: firestoreEvent.usualEndTime?.toDate?.()?.toISOString() || firestoreEvent.usualEndTime,
                createdAt: firestoreEvent.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                joinCode: firestoreEvent.joinCode || '',
                joinCodes: firestoreEvent.joinCodes || (firestoreEvent.joinCode ? [firestoreEvent.joinCode] : []),
                location: firestoreEvent.location?.name || '',
                address: firestoreEvent.location?.address || '',
                // Backward compatibility
                generalLocation: firestoreEvent.location?.name || '',
                exactLocation: firestoreEvent.location?.address || '',
                visibility: 'private', // All meepleups are private (public feature removed)
                members: members,
                isActive: firestoreEvent.isActive !== false,
                deletedAt: firestoreEvent.deletedAt?.toDate?.()?.toISOString() || firestoreEvent.deletedAt || null,
                // Include RSVP settings if they exist
                rsvpSettings: firestoreEvent.rsvpSettings || {
                  enabled: true,
                  allowMaybe: true,
                  attendanceLimit: null,
                },
              };
              
              event = normalizeEvent(localEventData);
              eventFromFirestore = true;
              
              // Add to local events if not already present
              setEvents((prev) => {
                const exists = prev.find((e) => e.id === event.id);
                if (!exists) {
                  return [...prev, event];
                }
                return prev;
              });
              
              // Found the event, break out of retry loop
              break;
            }
            
            // If not found and not the last attempt, wait before retrying
            if (attempt < maxRetries - 1) {
              const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 500ms, 1s, 2s, 4s
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          } catch (error) {
            const isPermissionError = error?.code === 'permission-denied' || 
                                    error?.message?.includes('permission') ||
                                    error?.message?.includes('Missing or insufficient permissions');
            
            console.error(`[EventsContext] Error querying Firestore for join code (attempt ${attempt + 1}/${maxRetries}):`, {
              errorCode: error?.code,
              errorMessage: error?.message,
              isPermissionError,
              normalizedCode: normalized,
              userId: userId,
              hasAuth: !!user,
              authUid: user?.uid || user?.id || 'none',
              error: error
            });
            
            // If not the last attempt, wait before retrying
            if (attempt < maxRetries - 1) {
              const delay = baseDelay * Math.pow(2, attempt);
              console.log(`[EventsContext] Retrying join code query after ${delay}ms delay...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              console.error('[EventsContext] All join code query attempts failed. Last error:', error);
            }
          }
        }
      }
      
      if (!event) {
        return null;
      }

      // Save membership to Firestore if db is available and event exists in Firestore
      if (db && event.id) {
        const groupRef = db.collection('gamingGroups').doc(event.id);
        
        try {
          const groupDoc = await groupRef.get();
          
          if (groupDoc.exists) {
            // Use current user's data from Auth context if this is the current user joining
            let userName = '';
            let userAvatarUrl = '';
            if (user && userId === (user.uid || user.id)) {
              userName = user.name || user.email || '';
              userAvatarUrl = user.photoURL || user.avatarUrl || '';
            } else {
              // Fallback: fetch from Firestore for other users (shouldn't happen in normal flow)
              const userData = await db.collection('users').doc(userId).get().catch(() => null);
              const userDocData = userData?.data();
              userName = userDocData?.name || userDocData?.email || '';
              userAvatarUrl = userDocData?.avatarUrl || '';
            }
            
            console.log('[EventsContext] Creating/updating member document:', {
              eventId: event.id,
              userId,
              userName,
              hasUserAvatarUrl: !!userAvatarUrl
            });
            
            // First, update memberIds array in the group document
            // This ensures the user is recognized as a member before creating the member document
            // This order helps with Firestore security rules that check membership
            console.log('[EventsContext] Updating memberIds array in group document');
            await groupRef.update({
              memberIds: firebase.firestore.FieldValue.arrayUnion(userId),
              updatedAt: firebase.firestore.Timestamp.now(),
            });
            
            console.log('[EventsContext] Group document updated successfully - user added to memberIds');
            
            // Small delay to allow Firestore to propagate the memberIds update
            // This helps avoid permission errors when creating the member document
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Then create/update the member document in the subcollection
            // Now that user is in memberIds, they should have proper permissions
            const membersRef = groupRef.collection('members').doc(userId);
            await membersRef.set({
              userId,
              userName: userName || userId, // Fallback to userId if no name found
              userAvatarUrl: userAvatarUrl || null,
              role: 'member',
              joinedAt: firebase.firestore.Timestamp.now(),
              rsvpStatus: null,
              rsvpStatuses: {},
            }, { merge: true });
            
            console.log('[EventsContext] Member document created/updated successfully');

            // Calculate match scores for new member (background task, non-blocking)
            try {
              const { calculateMatchScoresForUser } = await import('../services/matchScores');
              // Get user's collection and weights
              const userGamesSnapshot = await db.collection('userGames').doc(userId).collection('games').get();
              const userCollection = userGamesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                  id: doc.id,
                  bggId: data.bggId || null,
                  mechanics: data.mechanics || null,
                  categories: data.categories || null,
                  publishers: data.publishers || null,
                  publisher: data.publisher || null,
                  complexity: data.complexity || null,
                  averageWeight: data.averageWeight || data.complexity || null,
                  isFavorite: data.isFavorite || false,
                };
              });

              // Get user's custom weights
              const userDoc = await db.collection('users').doc(userId).get();
              const userData = userDoc.data();
              const customWeights = userData?.personalMatchWeights || null;

              // Calculate scores in background (don't await)
              calculateMatchScoresForUser(event.id, userId, userCollection, customWeights).catch(err => {
                console.warn('[EventsContext] Error calculating match scores for new member:', err);
              });
            } catch (matchScoreError) {
              console.warn('[EventsContext] Error setting up match score calculation:', matchScoreError);
              // Non-critical, continue
            }
          }
        } catch (error) {
          console.error('[EventsContext] Error saving membership to Firestore:', {
            error,
            errorCode: error?.code,
            errorMessage: error?.message,
            eventId: event.id,
            userId
          });
          
          // If it's a permission error, try a retry with a small delay
          // Sometimes Firestore needs a moment to propagate the memberIds update
          if (error?.code === 'permission-denied') {
            console.warn('[EventsContext] Permission denied when saving membership - retrying after delay');
            try {
              // Wait a bit for Firestore to propagate the memberIds update
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Get user data for retry
              let userName = '';
              let userAvatarUrl = '';
              if (user && userId === (user.uid || user.id)) {
                userName = user.name || user.email || '';
                userAvatarUrl = user.photoURL || user.avatarUrl || '';
              } else {
                const userData = await db.collection('users').doc(userId).get().catch(() => null);
                const userDocData = userData?.data();
                userName = userDocData?.name || userDocData?.email || '';
                userAvatarUrl = userDocData?.avatarUrl || '';
              }
              
              // Retry the member document creation
              const membersRef = groupRef.collection('members').doc(userId);
              await membersRef.set({
                userId,
                userName: userName || userId,
                userAvatarUrl: userAvatarUrl || null,
                role: 'member',
                joinedAt: firebase.firestore.Timestamp.now(),
                rsvpStatus: null,
                rsvpStatuses: {},
              }, { merge: true });
              
              console.log('[EventsContext] Member document created successfully on retry');
            } catch (retryError) {
              console.error('[EventsContext] Retry also failed:', retryError);
              // Continue with local join even if Firestore update fails
              // The user will be able to use the app locally, but Firestore sync will be incomplete
              console.warn('[EventsContext] User joined locally but Firestore sync failed - some features may not work');
            }
          } else {
            // For other errors, continue with local join
            console.warn('[EventsContext] User joined locally but Firestore sync failed - some features may not work');
          }
        }
      }

      // If event was just added from Firestore, ensure it's in state before calling joinEvent
      // by using a functional update that includes the member
      if (eventFromFirestore) {
        setEvents((prev) => {
          const existingEvent = prev.find((e) => e.id === event.id);
          if (existingEvent) {
            // Event is already in state, update it with the new member
            const updatedMembers = addOrUpdateMember(existingEvent, userId);
            return prev.map((e) =>
              e.id === event.id
                ? {
                    ...e,
                    members: updatedMembers,
                    lastUpdatedAt: new Date().toISOString(),
                  }
                : e
            );
          } else {
            // Event not in state yet, add it with the member already included
            const membersWithUser = addOrUpdateMember(event, userId);
            return [...prev, { ...event, members: membersWithUser }];
          }
        });
        
        // Return the event with the member added
        const membersWithUser = addOrUpdateMember(event, userId);
        return {
          ...event,
          members: membersWithUser,
          lastUpdatedAt: new Date().toISOString(),
        };
      } else {
        // Event was found locally, use the normal joinEvent function
        return joinEvent(event.id, userId);
      }
    },
    [getEventByJoinCode, joinEvent, user],
  );

  const addJoinCode = useCallback(
    async (eventId) => {
      const nextCode = generateJoinCode();
      const normalizedCode = nextCode.trim().toLowerCase().replace(/[\s-]+/g, ' ');
      
      // Update local state
      setEvents((prev) =>
        prev.map((event) => {
          if (event.id === eventId) {
            const currentCodes = event.joinCodes || (event.joinCode ? [event.joinCode] : []);
            const updatedCodes = [...currentCodes, normalizedCode];
            return {
              ...event,
              joinCode: updatedCodes[0], // First code for backward compatibility
              joinCodes: updatedCodes,
              lastUpdatedAt: new Date().toISOString(),
            };
          }
          return event;
        }),
      );
      
      // Update Firestore
      if (db && eventId) {
        try {
          const groupRef = db.collection('gamingGroups').doc(eventId);
          const groupDoc = await groupRef.get();
          
          if (groupDoc.exists) {
            const firestoreData = groupDoc.data();
            const currentCodes = firestoreData.joinCodes || (firestoreData.joinCode ? [firestoreData.joinCode] : []);
            const updatedCodes = [...currentCodes, normalizedCode];
            
            await groupRef.update({
              joinCode: updatedCodes[0], // First code for backward compatibility
              joinCodes: updatedCodes,
              updatedAt: firebase.firestore.Timestamp.now(),
            });
          }
        } catch (error) {
          console.error('Error adding join code to Firestore:', error);
          // Continue with local update even if Firestore update fails
        }
      }
      
      return normalizedCode;
    },
    [],
  );

  const deleteJoinCode = useCallback(
    async (eventId, codeToDelete) => {
      if (!codeToDelete) return;
      
      const normalizedToDelete = codeToDelete.trim().toLowerCase().replace(/[\s-]+/g, ' ');
      
      // Update local state
      setEvents((prev) =>
        prev.map((event) => {
          if (event.id === eventId) {
            const currentCodes = event.joinCodes || (event.joinCode ? [event.joinCode] : []);
            const updatedCodes = currentCodes.filter(
              code => code.trim().toLowerCase().replace(/[\s-]+/g, ' ') !== normalizedToDelete
            );
            
            // Don't allow deleting the last code
            if (updatedCodes.length === 0) {
              return event; // Keep original if trying to delete last code
            }
            
            return {
              ...event,
              joinCode: updatedCodes[0], // First code for backward compatibility
              joinCodes: updatedCodes,
              lastUpdatedAt: new Date().toISOString(),
            };
          }
          return event;
        }),
      );
      
      // Update Firestore
      if (db && eventId) {
        try {
          const groupRef = db.collection('gamingGroups').doc(eventId);
          const groupDoc = await groupRef.get();
          
          if (groupDoc.exists) {
            const firestoreData = groupDoc.data();
            const currentCodes = firestoreData.joinCodes || (firestoreData.joinCode ? [firestoreData.joinCode] : []);
            const updatedCodes = currentCodes.filter(
              code => code.trim().toLowerCase().replace(/[\s-]+/g, ' ') !== normalizedToDelete
            );
            
            // Don't allow deleting the last code
            if (updatedCodes.length === 0) {
              return; // Don't update if trying to delete last code
            }
            
            await groupRef.update({
              joinCode: updatedCodes[0], // First code for backward compatibility
              joinCodes: updatedCodes,
              updatedAt: firebase.firestore.Timestamp.now(),
            });
          }
        } catch (error) {
          console.error('Error deleting join code from Firestore:', error);
          // Continue with local update even if Firestore update fails
        }
      }
    },
    [],
  );

  const leaveEvent = useCallback(
    async (eventId, userId) => {
      // Remove from Firestore if available
      if (db && eventId) {
        try {
          const groupRef = db.collection('gamingGroups').doc(eventId);
          const groupDoc = await groupRef.get();
          
          if (groupDoc.exists) {
            // Remove member from members subcollection
            const membersRef = groupRef.collection('members').doc(userId);
            await membersRef.delete().catch(() => null); // Ignore if doesn't exist
            
            // Update memberIds array in the group document
            await groupRef.update({
              memberIds: firebase.firestore.FieldValue.arrayRemove(userId),
              updatedAt: firebase.firestore.Timestamp.now(),
            }).catch(() => null); // Ignore if update fails
          }
        } catch (error) {
          console.error('Error removing membership from Firestore:', error);
          // Continue with local removal even if Firestore update fails
        }
      }
      
      // Remove from local state
      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId
            ? {
                ...event,
                members: removeMember(event, userId),
                lastUpdatedAt: new Date().toISOString(),
              }
            : event,
        ),
      );
    },
    [],
  );

  const updateMemberRole = useCallback(
    async (eventId, requestingUserId, targetUserId, newRole) => {
      if (!eventId || !requestingUserId || !targetUserId) {
        throw new Error('Event ID, requesting user ID, and target user ID are required.');
      }

      const event = events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error('MeepleUp not found.');
      }

      // Verify requesting user is organizer (cannot be removed)
      if (event.organizerId !== requestingUserId) {
        throw new Error('Only the organizer can change member roles.');
      }

      // Cannot change the original organizer's role
      if (targetUserId === event.organizerId) {
        throw new Error('Cannot change the original organizer\'s role.');
      }

      // Update in Firestore if available
      if (db && eventId) {
        try {
          const membersRef = db.collection('gamingGroups')
            .doc(eventId)
            .collection('members')
            .doc(targetUserId);
          
          await membersRef.update({
            role: newRole,
            updatedAt: firebase.firestore.Timestamp.now(),
          }).catch(async (error) => {
            // If document doesn't exist, try to set it
            const groupDoc = await db.collection('gamingGroups').doc(eventId).get();
            if (groupDoc.exists) {
              await membersRef.set({
                userId: targetUserId,
                role: newRole,
                joinedAt: firebase.firestore.Timestamp.now(),
                updatedAt: firebase.firestore.Timestamp.now(),
              });
            } else {
              throw error;
            }
          });
        } catch (error) {
          console.error('Error updating member role in Firestore:', error);
          // Continue with local update even if Firestore update fails
        }
      }

      // Update local state
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                members: e.members.map((member) =>
                  member.userId === targetUserId
                    ? {
                        ...member,
                        role: newRole,
                        // If making co-organizer, ensure they can share join code
                        canShareJoinCode: newRole === MEMBER_ROLES.ORGANIZER ? true : member.canShareJoinCode,
                      }
                    : member,
                ),
                lastUpdatedAt: new Date().toISOString(),
              }
            : e,
        ),
      );
    },
    [events],
  );

  const updateMemberJoinCodePermission = useCallback(
    async (eventId, requestingUserId, targetUserId, canShare) => {
      if (!eventId || !requestingUserId || !targetUserId) {
        throw new Error('Event ID, requesting user ID, and target user ID are required.');
      }

      const event = events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error('MeepleUp not found.');
      }

      // Verify requesting user is organizer
      if (event.organizerId !== requestingUserId) {
        throw new Error('Only the organizer can change join code sharing permissions.');
      }

      // Organizers can always share, no need to update
      const targetMember = event.members.find((m) => m.userId === targetUserId);
      if (targetMember?.role === MEMBER_ROLES.ORGANIZER) {
        return; // Organizers can always share
      }

      // Update in Firestore if available
      if (db && eventId) {
        try {
          const membersRef = db.collection('gamingGroups')
            .doc(eventId)
            .collection('members')
            .doc(targetUserId);
          
          await membersRef.update({
            canShareJoinCode: canShare,
            updatedAt: firebase.firestore.Timestamp.now(),
          }).catch(async (error) => {
            // If document doesn't exist, try to set it
            const groupDoc = await db.collection('gamingGroups').doc(eventId).get();
            if (groupDoc.exists) {
              await membersRef.set({
                userId: targetUserId,
                canShareJoinCode: canShare,
                joinedAt: firebase.firestore.Timestamp.now(),
                updatedAt: firebase.firestore.Timestamp.now(),
              });
            } else {
              throw error;
            }
          });
        } catch (error) {
          console.error('Error updating member join code permission in Firestore:', error);
          // Continue with local update even if Firestore update fails
        }
      }

      // Update local state
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                members: e.members.map((member) =>
                  member.userId === targetUserId
                    ? {
                        ...member,
                        canShareJoinCode: canShare,
                      }
                    : member,
                ),
                lastUpdatedAt: new Date().toISOString(),
              }
            : e,
        ),
      );
    },
    [events],
  );

  const updateMemberProposalLimit = useCallback(
    async (eventId, requestingUserId, targetUserId, proposalLimit) => {
      if (!eventId || !requestingUserId || !targetUserId) {
        throw new Error('Event ID, requesting user ID, and target user ID are required.');
      }

      if (proposalLimit !== null && (typeof proposalLimit !== 'number' || proposalLimit < 0 || !Number.isInteger(proposalLimit))) {
        throw new Error('Proposal limit must be a non-negative integer or null.');
      }

      const event = events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error('MeepleUp not found.');
      }

      // Verify requesting user is organizer
      if (event.organizerId !== requestingUserId) {
        throw new Error('Only the organizer can change proposal limits.');
      }

      // Update in Firestore if available
      if (db && eventId) {
        try {
          const membersRef = db.collection('gamingGroups')
            .doc(eventId)
            .collection('members')
            .doc(targetUserId);
          
          const updateData = {
            proposalLimit: proposalLimit === null ? firebase.firestore.FieldValue.delete() : proposalLimit,
            updatedAt: firebase.firestore.Timestamp.now(),
          };
          
          await membersRef.update(updateData).catch(async (error) => {
            // If document doesn't exist, try to set it
            const groupDoc = await db.collection('gamingGroups').doc(eventId).get();
            if (groupDoc.exists) {
              await membersRef.set({
                userId: targetUserId,
                proposalLimit: proposalLimit === null ? 5 : proposalLimit,
                joinedAt: firebase.firestore.Timestamp.now(),
                updatedAt: firebase.firestore.Timestamp.now(),
              });
            } else {
              throw error;
            }
          });
        } catch (error) {
          console.error('Error updating member proposal limit in Firestore:', error);
          // Continue with local update even if Firestore update fails
        }
      }

      // Update local state
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                members: e.members.map((member) =>
                  member.userId === targetUserId
                    ? {
                        ...member,
                        proposalLimit: proposalLimit === null ? 5 : proposalLimit,
                      }
                    : member,
                ),
                lastUpdatedAt: new Date().toISOString(),
              }
            : e,
        ),
      );
    },
    [events],
  );

  const getEventById = useCallback(
    (eventId) => events.find((event) => event.id === eventId),
    [events],
  );

  const getEventByJoinCode = useCallback(
    (code) => {
      if (!code) return null;
      // Normalize: trim, lowercase, and normalize spaces/hyphens to spaces
      const normalized = code.trim().toLowerCase().replace(/[\s-]+/g, ' ');
      return (
        events.find((event) => {
          // Check all codes in the joinCodes array
          const codesToCheck = event.joinCodes || (event.joinCode ? [event.joinCode] : []);
          return codesToCheck.some(eventCode => {
            const normalizedEventCode = (eventCode || '').trim().toLowerCase().replace(/[\s-]+/g, ' ');
            return normalizedEventCode === normalized;
          });
        }) || null
      );
    },
    [events],
  );

  const getUserEvents = useCallback(
    (userId) => {
      if (!userId || !Array.isArray(events)) {
        return [];
      }
      return events.filter((event) => {
        if (!event) return false;
        // Filter out archived events
        if (event.deletedAt || event.isActive === false) {
          return false;
        }
        // Check if user is a member
        return (event.members || []).some((member) => member?.userId === userId);
      });
    },
    [events],
  );

  const getUserArchivedEvents = useCallback(
    (userId) =>
      events.filter((event) => {
        // Only show archived events where user is the organizer
        if (!event.deletedAt && event.isActive !== false) {
          return false;
        }
        // Check if user is the organizer
        return event.organizerId === userId;
      }),
    [events],
  );

  const getMembershipStatus = useCallback(
    (eventId, userId) => {
      if (!eventId || !userId) {
        return MEMBERSHIP_STATUS.STRANGER;
      }
      const event = getEventById(eventId);
      if (!event) {
        return MEMBERSHIP_STATUS.STRANGER;
      }
      const member = event.members.find((entry) => entry.userId === userId);
      return member?.status || MEMBERSHIP_STATUS.STRANGER;
    },
    [getEventById],
  );

  const submitContactRequest = useCallback((eventId, request) => {
    if (!eventId || !request?.name || !request?.email) {
      return null;
    }

    const sanitized = {
      id: `${eventId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: request.name.trim(),
      email: request.email.trim(),
      message: request.message?.trim() || '',
      status: CONTACT_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      respondedAt: null,
      notes: '',
    };

    let createdRequest = null;

    setEvents((prev) =>
      prev.map((event) => {
        if (event.id !== eventId) {
          return event;
        }

        createdRequest = sanitized;

        return {
          ...event,
          contactRequests: [sanitized, ...event.contactRequests],
          lastUpdatedAt: new Date().toISOString(),
        };
      }),
    );

    return createdRequest;
  }, []);

  const updateContactRequest = useCallback((eventId, requestId, updates) => {
    setEvents((prev) =>
      prev.map((event) => {
        if (event.id !== eventId) {
          return event;
        }

        return {
          ...event,
          contactRequests: event.contactRequests.map((request) =>
            request.id === requestId
              ? {
                  ...request,
                  ...updates,
                  respondedAt:
                    updates.status && updates.status !== CONTACT_STATUS.PENDING
                      ? new Date().toISOString()
                      : request.respondedAt,
                }
              : request,
          ),
          lastUpdatedAt: new Date().toISOString(),
        };
      }),
    );
  }, []);

  const updateMemberRSVP = useCallback(
    async (eventId, userId, rsvpStatus, eventDate = null) => {
      if (!eventId || !userId || !rsvpStatus) {
        throw new Error('Event ID, user ID, and RSVP status are required.');
      }

      // Validate RSVP status
      const validStatuses = ['going', 'maybe', 'not-going'];
      if (!validStatuses.includes(rsvpStatus)) {
        throw new Error(`Invalid RSVP status. Must be one of: ${validStatuses.join(', ')}`);
      }

      const event = events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error('Event not found.');
      }

      // Check if maybe is allowed
      if (rsvpStatus === 'maybe' && !event.rsvpSettings?.allowMaybe) {
        throw new Error('Maybe option is not enabled for this event.');
      }

      // Create date key for this RSVP
      // If eventDate is provided, use it; otherwise use 'default' for single-date events
      let dateKey = 'default';
      if (eventDate) {
        // Normalize date to ISO string for consistent key
        const date = eventDate instanceof Date ? eventDate : new Date(eventDate);
        dateKey = date.toISOString().split('T')[0]; // Use YYYY-MM-DD format
      } else if (event.scheduledFor) {
        const date = new Date(event.scheduledFor);
        dateKey = date.toISOString().split('T')[0];
      }

      // Get current member and their RSVP statuses
      const currentMember = event.members.find((m) => m.userId === userId);
      const currentRsvpStatuses = currentMember?.rsvpStatuses || {};
      const previousStatus = currentRsvpStatuses[dateKey] || null;

      // Update in Firestore if available (non-blocking - update local state even if this fails)
      if (db && eventId) {
        // Fire and forget - don't block local state update
        const membersRef = db.collection('gamingGroups').doc(eventId)
          .collection('members').doc(userId);
        
        membersRef.get().then(async (memberDoc) => {
          const existingData = memberDoc.data() || {};
          const existingRsvpStatuses = existingData.rsvpStatuses || {};
          
          // Update the specific date's RSVP
          const updatedRsvpStatuses = {
            ...existingRsvpStatuses,
            [dateKey]: rsvpStatus,
          };
          
          await membersRef.set({
            rsvpStatuses: updatedRsvpStatuses,
            rsvpUpdatedAt: firebase.firestore.Timestamp.now(),
            // Keep backward compatibility with single rsvpStatus
            rsvpStatus: eventDate ? existingData.rsvpStatus : rsvpStatus,
          }, { merge: true });
        }).catch((error) => {
          console.error('Error updating RSVP in Firestore (non-blocking):', error);
          // Don't throw - allow local state to update for better UX
        });
      }

      // Update local state and handle waitlist promotion
      setEvents((prev) =>
        prev.map((event) => {
          if (event.id !== eventId) {
            return event;
          }

          // Get all members with their RSVPs
          const updatedMembers = event.members.map((member) => {
            if (member.userId !== userId) {
              return member;
            }

            const existingRsvpStatuses = member.rsvpStatuses || {};
            const updatedRsvpStatuses = {
              ...existingRsvpStatuses,
              [dateKey]: rsvpStatus,
            };

          return {
                    ...member,
              rsvpStatuses: updatedRsvpStatuses,
              rsvpStatus: eventDate ? member.rsvpStatus : rsvpStatus, // Backward compatibility
                    rsvpUpdatedAt: new Date().toISOString(),
            };
          });

          // Handle waitlist promotion if someone changed from 'going' to something else
          // and there's an attendance limit (only for the specific date)
          const attendanceLimit = event.rsvpSettings?.attendanceLimit;
          if (attendanceLimit && previousStatus === 'going' && rsvpStatus !== 'going') {
            // Count current 'going' RSVPs for this specific date
            const goingCount = updatedMembers.filter((m) => {
              const memberRsvpStatuses = m.rsvpStatuses || {};
              return memberRsvpStatuses[dateKey] === 'going';
            }).length;

            // If we're under the limit, promote the first waitlisted member for this date
            if (goingCount < attendanceLimit) {
              // Find waitlisted members for this date
              const waitlistedMembers = updatedMembers.filter((m) => {
                if (m.userId === userId) return false; // Skip the person who just changed
                const memberRsvpStatuses = m.rsvpStatuses || {};
                const memberStatus = memberRsvpStatuses[dateKey];
                return !memberStatus || memberStatus === 'maybe';
              });

              if (waitlistedMembers.length > 0) {
                // Promote the first waitlisted member (oldest join date)
                const toPromote = waitlistedMembers.sort(
                  (a, b) => new Date(a.joinedAt) - new Date(b.joinedAt)
                )[0];

                const finalMembers = updatedMembers.map((member) => {
                  if (member.userId !== toPromote.userId) {
                    return member;
                  }

                  const existingRsvpStatuses = member.rsvpStatuses || {};
                  return {
                    ...member,
                    rsvpStatuses: {
                      ...existingRsvpStatuses,
                      [dateKey]: 'going',
                    },
                    rsvpUpdatedAt: new Date().toISOString(),
                  };
                });

                // Update in Firestore (fire and forget)
                if (db) {
                  const promoteRef = db.collection('gamingGroups').doc(eventId)
                    .collection('members').doc(toPromote.userId);
                  
                  promoteRef.get().then((promoteDoc) => {
                    const promoteData = promoteDoc.data() || {};
                    const promoteRsvpStatuses = promoteData.rsvpStatuses || {};
                    
                    return promoteRef.set({
                      rsvpStatuses: {
                        ...promoteRsvpStatuses,
                        [dateKey]: 'going',
                      },
                      rsvpUpdatedAt: firebase.firestore.Timestamp.now(),
                    }, { merge: true });
                  }).catch(console.error);
                }

                return {
                  ...event,
                  members: finalMembers,
                  lastUpdatedAt: new Date().toISOString(),
                };
              }
            }
          }

          return {
            ...event,
            members: updatedMembers,
            lastUpdatedAt: new Date().toISOString(),
          };
        }),
      );
    },
    [events],
  );

  const updateRSVPSettings = useCallback(
    async (eventId, userId, settings) => {
      if (!eventId || !userId) {
        throw new Error('Event ID and user ID are required.');
      }

      // Verify user is the organizer
      const event = events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error('Event not found.');
      }

      if (event.organizerId !== userId) {
        throw new Error('Only the organizer can update RSVP settings.');
      }

      // Update in Firestore if available
      if (db && eventId) {
        try {
          const groupRef = db.collection('gamingGroups').doc(eventId);
          await groupRef.update({
            'rsvpSettings.enabled': settings.enabled !== undefined ? settings.enabled : event.rsvpSettings?.enabled ?? true,
            'rsvpSettings.allowMaybe': settings.allowMaybe !== undefined ? settings.allowMaybe : event.rsvpSettings?.allowMaybe ?? true,
            'rsvpSettings.attendanceLimit': settings.attendanceLimit !== undefined ? settings.attendanceLimit : event.rsvpSettings?.attendanceLimit ?? null,
            updatedAt: firebase.firestore.Timestamp.now(),
          });
        } catch (error) {
          console.error('Error updating RSVP settings in Firestore:', error);
          throw error;
        }
      }

      // Update local state
      setEvents((prev) =>
        prev.map((event) => {
          if (event.id !== eventId) {
            return event;
          }

          const currentSettings = event.rsvpSettings || {
            enabled: true,
            allowMaybe: true,
            attendanceLimit: null,
          };

          return {
            ...event,
            rsvpSettings: {
              enabled: settings.enabled !== undefined ? settings.enabled : currentSettings.enabled,
              allowMaybe: settings.allowMaybe !== undefined ? settings.allowMaybe : currentSettings.allowMaybe,
              attendanceLimit: settings.attendanceLimit !== undefined ? settings.attendanceLimit : currentSettings.attendanceLimit,
            },
            lastUpdatedAt: new Date().toISOString(),
          };
        }),
      );
    },
    [events],
  );

  const overrideMemberRSVP = useCallback(
    async (eventId, userId, targetUserId, rsvpStatus, eventDate = null) => {
      if (!eventId || !userId) {
        throw new Error('Event ID and user ID are required.');
      }

      // Verify user is the organizer
      const event = events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error('Event not found.');
      }

      if (event.organizerId !== userId) {
        throw new Error('Only the organizer can override RSVP status.');
      }

      // Validate RSVP status
      const validStatuses = ['going', 'maybe', 'not-going', null];
      if (!validStatuses.includes(rsvpStatus)) {
        throw new Error(`Invalid RSVP status. Must be one of: ${validStatuses.filter(Boolean).join(', ')}, or null`);
      }

      // Create date key
      let dateKey = 'default';
      if (eventDate) {
        const date = eventDate instanceof Date ? eventDate : new Date(eventDate);
        dateKey = date.toISOString().split('T')[0];
      } else if (event.scheduledFor) {
        const date = new Date(event.scheduledFor);
        dateKey = date.toISOString().split('T')[0];
      }

      // Update in Firestore if available
      if (db && eventId) {
        try {
          const membersRef = db.collection('gamingGroups').doc(eventId)
            .collection('members').doc(targetUserId);
          
          const memberDoc = await membersRef.get();
          const existingData = memberDoc.data() || {};
          const existingRsvpStatuses = existingData.rsvpStatuses || {};
          
          if (rsvpStatus === null) {
            // Remove this date's RSVP
            const updatedRsvpStatuses = { ...existingRsvpStatuses };
            delete updatedRsvpStatuses[dateKey];
            
            await membersRef.set({
              rsvpStatuses: updatedRsvpStatuses,
              rsvpUpdatedAt: firebase.firestore.Timestamp.now(),
            }, { merge: true });
          } else {
            await membersRef.set({
              rsvpStatuses: {
                ...existingRsvpStatuses,
                [dateKey]: rsvpStatus,
              },
              rsvpStatus: eventDate ? existingData.rsvpStatus : rsvpStatus, // Backward compatibility
              rsvpUpdatedAt: firebase.firestore.Timestamp.now(),
            }, { merge: true });
          }
        } catch (error) {
          console.error('Error overriding RSVP in Firestore:', error);
          throw error;
        }
      }

      // Update local state
      setEvents((prev) =>
        prev.map((event) => {
          if (event.id !== eventId) {
            return event;
          }

          return {
            ...event,
            members: event.members.map((member) => {
              if (member.userId !== targetUserId) {
                return member;
              }

              const existingRsvpStatuses = member.rsvpStatuses || {};
              let updatedRsvpStatuses;
              
              if (rsvpStatus === null) {
                updatedRsvpStatuses = { ...existingRsvpStatuses };
                delete updatedRsvpStatuses[dateKey];
              } else {
                updatedRsvpStatuses = {
                  ...existingRsvpStatuses,
                  [dateKey]: rsvpStatus,
                };
              }

              return {
                ...member,
                rsvpStatuses: updatedRsvpStatuses,
                rsvpStatus: eventDate ? member.rsvpStatus : rsvpStatus, // Backward compatibility
                rsvpUpdatedAt: rsvpStatus ? new Date().toISOString() : null,
              };
            }),
            lastUpdatedAt: new Date().toISOString(),
          };
        }),
      );
    },
    [events],
  );

  const updateEventSchedule = useCallback(
    async (eventId, userId, scheduleUpdates) => {
      if (!eventId || !userId) {
        throw new Error('Event ID and user ID are required.');
      }

      // Verify user is the organizer or co-organizer
      const event = events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error('Event not found.');
      }

      const isOrganizer = event.organizerId === userId;
      const currentUserMember = event.members?.find(m => m.userId === userId);
      const isCoOrganizer = currentUserMember?.role === MEMBER_ROLES.ORGANIZER;
      
      if (!isOrganizer && !isCoOrganizer) {
        throw new Error('Only the organizer or co-organizer can update the schedule.');
      }

      const updates = {};
      if (scheduleUpdates.scheduledFor !== undefined) {
        updates.scheduledFor = scheduleUpdates.scheduledFor;
      }
      if (scheduleUpdates.eventDates !== undefined) {
        updates.eventDates = scheduleUpdates.eventDates;
      }
      if (scheduleUpdates.usualStartTime !== undefined) {
        updates.usualStartTime = scheduleUpdates.usualStartTime;
      }
      if (scheduleUpdates.usualEndTime !== undefined) {
        updates.usualEndTime = scheduleUpdates.usualEndTime;
      }
      // Support both new (location/address) and old (generalLocation/exactLocation) field names
      if (scheduleUpdates.location !== undefined || scheduleUpdates.generalLocation !== undefined) {
        const newLocation = scheduleUpdates.location !== undefined 
          ? scheduleUpdates.location 
          : scheduleUpdates.generalLocation;
        updates.location = newLocation;
        updates.generalLocation = newLocation; // Backward compatibility
      }
      if (scheduleUpdates.address !== undefined || scheduleUpdates.exactLocation !== undefined) {
        const newAddress = scheduleUpdates.address !== undefined 
          ? scheduleUpdates.address 
          : scheduleUpdates.exactLocation;
        updates.address = newAddress;
        updates.exactLocation = newAddress; // Backward compatibility
      }

      // Update in Firestore if available
      if (db && eventId) {
        try {
          const groupRef = db.collection('gamingGroups').doc(eventId);
          const firestoreUpdates = {
            updatedAt: firebase.firestore.Timestamp.now(),
          };

          if (scheduleUpdates.scheduledFor !== undefined) {
            firestoreUpdates.scheduledFor = scheduleUpdates.scheduledFor;
            firestoreUpdates.nextEventDate = scheduleUpdates.scheduledFor
              ? firebase.firestore.Timestamp.fromDate(new Date(scheduleUpdates.scheduledFor))
              : null;
          }

          if (scheduleUpdates.eventDates !== undefined) {
            // Store eventDates as an array of objects with timestamps, locations, and notes
            firestoreUpdates.eventDates = scheduleUpdates.eventDates.map(ed => ({
              date: firebase.firestore.Timestamp.fromDate(new Date(ed.date)),
              startTime: firebase.firestore.Timestamp.fromDate(new Date(ed.startTime)),
              endTime: firebase.firestore.Timestamp.fromDate(new Date(ed.endTime)),
              location: ed.location || '',
              exactLocation: ed.exactLocation || '',
              note: ed.note || '',
            }));
            // Also set nextEventDate to the first date for backward compatibility
            if (scheduleUpdates.eventDates.length > 0) {
              firestoreUpdates.nextEventDate = firebase.firestore.Timestamp.fromDate(
                new Date(scheduleUpdates.eventDates[0].date)
              );
            }
          }

          if (scheduleUpdates.usualStartTime !== undefined) {
            firestoreUpdates.usualStartTime = scheduleUpdates.usualStartTime;
          }

          if (scheduleUpdates.usualEndTime !== undefined) {
            firestoreUpdates.usualEndTime = scheduleUpdates.usualEndTime;
          }

          // Support both new (location/address) and old (generalLocation/exactLocation) field names
          if (scheduleUpdates.location !== undefined || scheduleUpdates.generalLocation !== undefined ||
              scheduleUpdates.address !== undefined || scheduleUpdates.exactLocation !== undefined) {
            // Try to get current data, but don't fail if we can't read it
            let currentLocation = {};
            try {
              const currentData = (await groupRef.get()).data();
              currentLocation = currentData?.location || {};
            } catch (readError) {
              // If we can't read the document, that's okay - we'll just use the new values
              console.log('Could not read current location data, using new values only:', readError);
            }
            
            firestoreUpdates.location = {
              name: scheduleUpdates.location !== undefined
                ? scheduleUpdates.location
                : scheduleUpdates.generalLocation !== undefined
                ? scheduleUpdates.generalLocation
                : currentLocation.name || '',
              address: scheduleUpdates.address !== undefined
                ? scheduleUpdates.address
                : scheduleUpdates.exactLocation !== undefined
                ? scheduleUpdates.exactLocation
                : currentLocation.address || '',
            };
            // Also set the old field names for backward compatibility
            firestoreUpdates.generalLocation = firestoreUpdates.location.name;
            firestoreUpdates.exactLocation = firestoreUpdates.location.address;
          }

          await groupRef.update(firestoreUpdates);
        } catch (error) {
          console.error('Error updating schedule in Firestore:', error);
          throw error;
        }
      }

      // Update local state
      setEvents((prev) =>
        prev.map((event) => {
          if (event.id !== eventId) {
            return event;
          }

          return {
            ...event,
            ...updates,
            lastUpdatedAt: new Date().toISOString(),
          };
        }),
      );
    },
    [events],
  );

  const value = useMemo(
    () => ({
      events,
      createEvent,
      updateEvent,
      deleteEvent,
      archiveEvent,
      unarchiveEvent,
      joinEvent,
      joinEventWithCode,
      addJoinCode,
      deleteJoinCode,
      leaveEvent,
      getEventById,
      getEventByJoinCode,
      getUserEvents,
      getUserArchivedEvents,
      getMembershipStatus,
      submitContactRequest,
      updateContactRequest,
      updateMemberRSVP,
      updateEventSchedule,
      updateRSVPSettings,
      overrideMemberRSVP,
      updateMemberRole,
      updateMemberJoinCodePermission,
      updateMemberProposalLimit,
      loading,
      membershipStatus: MEMBERSHIP_STATUS,
      contactStatus: CONTACT_STATUS,
      memberRoles: MEMBER_ROLES,
    }),
    [
      events,
      loading,
      createEvent,
      updateEvent,
      deleteEvent,
      archiveEvent,
      unarchiveEvent,
      joinEvent,
      joinEventWithCode,
      addJoinCode,
      deleteJoinCode,
      leaveEvent,
      getEventById,
      getEventByJoinCode,
      getUserEvents,
      getUserArchivedEvents,
      getMembershipStatus,
      submitContactRequest,
      updateContactRequest,
      updateMemberRSVP,
      updateEventSchedule,
      updateRSVPSettings,
      overrideMemberRSVP,
      updateMemberRole,
      updateMemberJoinCodePermission,
      updateMemberProposalLimit,
    ],
  );

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
};

