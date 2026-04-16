import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import storage from '../utils/storage';
import { useAuth } from './AuthContext';
import { wordList1, wordList2, wordList3 } from '../utils/wordlist';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import {
  getMeepleupProduct,
  purchaseMeepleupCreation,
  verifyMeepleupPurchaseReceipt,
  acknowledgeMeepleupPurchase,
  setupMeepleupPurchaseListener,
  initializePurchases,
} from '../services/meepleupPurchaseService';
import { initializePurchases as initIAP } from '../services/subscriptionService';
import logger from '../utils/logger';

const EventsContext = createContext();

const MEMBERSHIP_STATUS = {
  STRANGER: 'stranger',
  MEMBER: 'member',
};

const MEMBER_ROLES = {
  ORGANIZER: 'organizer',
  CO_ORGANIZER: 'co-organizer',
  MEMBER: 'member',
};

const CONTACT_STATUS = {
  PENDING: 'pending',
  RESPONDED: 'responded',
  ARCHIVED: 'archived',
};

const STORAGE_KEY = 'meepleup_events';

const generateJoinCode = () => {
  const word1Index = Math.floor(Math.random() * wordList1.length);
  const word2Index = Math.floor(Math.random() * wordList2.length);
  const word3Index = Math.floor(Math.random() * wordList3.length);
  
  return `${wordList1[word1Index]} ${wordList2[word2Index]} ${wordList3[word3Index]}`;
};

const normalizeMember = (member, organizerId, fallbackDate) => {
  if (!member) return null;

  if (typeof member === 'string') {
    return {
      userId: member,
      status: MEMBERSHIP_STATUS.MEMBER,
      role: member === organizerId ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER,
      joinedAt: fallbackDate || new Date().toISOString(),
      canShareJoinCode: false,
      proposalLimit: 5,
    };
  }

  const status = member.status || MEMBERSHIP_STATUS.MEMBER;
  const isOrganizer = member.userId === organizerId || member.role === MEMBER_ROLES.ORGANIZER;
  return {
    userId: member.userId || member.id || null,
    status,
    role: member.role || (member.userId === organizerId ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER),
    joinedAt: member.joinedAt || fallbackDate || new Date().toISOString(),
    canShareJoinCode: member.canShareJoinCode !== undefined ? member.canShareJoinCode : isOrganizer,
    proposalLimit: member.proposalLimit !== undefined ? member.proposalLimit : 5,
  };
};

const normalizeEvent = (event) => {
  if (!event) return null;

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

  const location = event.location || event.generalLocation || '';
  const address = event.address || event.exactLocation || '';

  const deletedAt = event.deletedAt?.toDate?.()?.toISOString() || event.deletedAt || null;
  const isActive = event.isActive !== undefined ? event.isActive : (deletedAt === null);

  let joinCodes = [];
  if (Array.isArray(event.joinCodes)) {
    joinCodes = event.joinCodes.filter(code => code && typeof code === 'string');
  } else if (event.joinCode) {
    joinCodes = [event.joinCode];
  }
  if (joinCodes.length === 0) {
    joinCodes = [generateJoinCode()];
  }
  const joinCode = joinCodes[0] || generateJoinCode();

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
    joinCode,
    joinCodes,
    location,
    address,
    generalLocation: location,
    exactLocation: address,
    visibility: 'private',
    members: normalizedMembers,
    contactRequests,
    lastUpdatedAt: event.lastUpdatedAt || new Date().toISOString(),
    tags: event.tags || [],
    allowStrangerMessages: event.allowStrangerMessages ?? true,
    isActive,
    deletedAt,
    rsvpSettings: event.rsvpSettings || {
      enabled: true,
      allowMaybe: true,
      attendanceLimit: null,
    },
  };
};

const addOrUpdateMember = (event, userId, role = MEMBER_ROLES.MEMBER, canShareJoinCode = false) => {
  if (!userId) return event.members;

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

  useEffect(() => {
    if (!user || !db || !initialised) return;

    const syncEventsFromFirestore = async () => {
      try {
        const userId = user.uid || user.id;
        if (!userId) {
          logger.debug('[EventsContext] No userId available, skipping sync');
          return;
        }

        logger.debug(`[EventsContext] 🔍 SYNC START: Syncing events for user: ${userId}`);

        const memberDoc = await db.collection('users').doc(userId).get();
        const userData = memberDoc.data();
        const groupIds = userData?.groupIds || [];

        logger.debug(`[EventsContext] 🔍 SYNC: User's groupIds from Firestore:`, {
          count: groupIds.length,
          groupIds: groupIds
        });

        if (groupIds.length === 0) {
          logger.debug('[EventsContext] User has no group memberships');
          setEvents([]);
          return;
        }

        const groupPromises = groupIds.map(async (groupId) => {
          try {
            logger.debug(`[EventsContext] 🔍 SYNC: Fetching group ${groupId}`);
            const groupDoc = await db.collection('gamingGroups').doc(groupId).get();
            
            if (!groupDoc.exists) {
              logger.debug(`[EventsContext] 🔍 SYNC: Group ${groupId} does not exist in Firestore`);
              return null;
            }

            const firestoreData = groupDoc.data();
            logger.debug(`[EventsContext] 🔍 SYNC: Group ${groupId} data:`, {
              id: groupId,
              name: firestoreData.name,
              isActive: firestoreData.isActive,
              organizerId: firestoreData.organizerId
            });
            
            let members = [];
            try {
              const membersSnapshot = await db.collection('gamingGroups')
                .doc(groupId)
                .collection('members')
                .get();
              
              members = membersSnapshot.docs.map(memberDoc => {
                const memberData = memberDoc.data();
                const isOrganizer = memberData.role === MEMBER_ROLES.ORGANIZER || memberData.userId === firestoreData.organizerId;
                
                let rsvpStatus = memberData.rsvpStatus;
                let rsvpStatuses = memberData.rsvpStatuses || {};
                
                if (isOrganizer && !rsvpStatus && Object.keys(rsvpStatuses).length === 0) {
                  rsvpStatus = 'going';
                  rsvpStatuses = { default: 'going' };
                } else if (isOrganizer && !rsvpStatus && Object.keys(rsvpStatuses).length > 0) {
                  rsvpStatus = 'going';
                }
                
                return {
                  userId: memberData.userId || memberDoc.id,
                  status: MEMBERSHIP_STATUS.MEMBER,
                  role: memberData.role || MEMBER_ROLES.MEMBER,
                  joinedAt: memberData.joinedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                  rsvpStatus: rsvpStatus || null,
                  rsvpStatuses: rsvpStatuses,
                  rsvpUpdatedAt: memberData.rsvpUpdatedAt?.toDate?.()?.toISOString() || null,
                  canShareJoinCode: memberData.canShareJoinCode !== undefined ? memberData.canShareJoinCode : (memberData.role === MEMBER_ROLES.ORGANIZER),
                  proposalLimit: memberData.proposalLimit !== undefined ? memberData.proposalLimit : 5,
                };
              });
            } catch (memberError) {
              console.warn(`Error fetching members for group ${groupId}:`, memberError);
              const memberIds = firestoreData.memberIds || [];
              members = memberIds.map((memberId) => {
                const isOrganizer = memberId === firestoreData.organizerId;
                return {
                  userId: memberId,
                  status: MEMBERSHIP_STATUS.MEMBER,
                  role: isOrganizer ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER,
                  joinedAt: firestoreData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                  rsvpStatus: isOrganizer ? 'going' : null,
                  rsvpStatuses: isOrganizer ? { default: 'going' } : {},
                  rsvpUpdatedAt: null,
                  canShareJoinCode: isOrganizer,
                  proposalLimit: 5,
                };
              });
            }

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
              generalLocation: firestoreData.location?.name || '',
              exactLocation: firestoreData.location?.address || '',
              visibility: 'private',
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
            console.error(`Error fetching group ${groupId}:`, error);
            return null;
          }
        });

        const firestoreEvents = (await Promise.all(groupPromises))
          .filter(Boolean)
          .map(normalizeEvent)
          .filter(Boolean);

        logger.debug(`[EventsContext] 🔍 SYNC: Processed events from Firestore:`, {
          count: firestoreEvents.length,
          events: firestoreEvents.map(e => ({ id: e.id, name: e.name, isActive: e.isActive }))
        });

        // Check specifically for "Bobs MeepleUp"
        const bobsMeepleUp = firestoreEvents.find(e => e.name === "Bobs MeepleUp" || e.id === "1766552116194");
        if (bobsMeepleUp) {
          logger.debug('[EventsContext] 🔍 SYNC: "Bobs MeepleUp" found in firestoreEvents:', {
            id: bobsMeepleUp.id,
            name: bobsMeepleUp.name,
            isActive: bobsMeepleUp.isActive
          });
        } else {
          logger.debug('[EventsContext] 🔍 SYNC: "Bobs MeepleUp" NOT found in firestoreEvents');
        }

        if (firestoreEvents.length > 0) {
          setEvents((prevEvents) => {
            logger.debug(`[EventsContext] 🔍 SYNC: Merging events. Previous count: ${prevEvents.length}, New events: ${firestoreEvents.length}`);
            
            const merged = new Map();
            
            prevEvents.forEach(event => {
              merged.set(event.id, event);
            });
            
            firestoreEvents.forEach(event => {
              merged.set(event.id, event);
            });
            
            const finalEvents = Array.from(merged.values());
            logger.debug(`[EventsContext] 🔍 SYNC: Final merged events count: ${finalEvents.length}`);
            logger.debug(`[EventsContext] 🔍 SYNC: Final events:`, finalEvents.map(e => ({ id: e.id, name: e.name, isActive: e.isActive })));
            
            return finalEvents;
          });
        } else {
          logger.debug('[EventsContext] 🔍 SYNC: No events to merge (firestoreEvents.length === 0)');
        }
      } catch (error) {
        console.error('Error syncing events from Firestore:', error);
      }
    };

    syncEventsFromFirestore();
  }, [user, db, initialised]);

  useEffect(() => {
    if (!initialised) return;

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

      if (db && baseEvent.id) {
        try {
          const eventsRef = db.collection('gamingGroups').doc(baseEvent.id);
          
          const firestoreData = {
            id: baseEvent.id,
            name: baseEvent.name,
            description: baseEvent.description || '',
            organizerId: baseEvent.organizerId,
            organizerName: user?.name || user?.email || '',
            joinCode: baseEvent.joinCode,
            joinCodes: baseEvent.joinCodes || [baseEvent.joinCode],
            privacy: 'private',
            location: {
              name: baseEvent.location || baseEvent.generalLocation || '',
              address: baseEvent.address || baseEvent.exactLocation || '',
            },
            scheduledFor: baseEvent.scheduledFor || null,
            eventDates: eventData.eventDates ? eventData.eventDates.map((ed) => ({
              date: firebase.firestore.Timestamp.fromDate(new Date(ed.date)),
              startTime: firebase.firestore.Timestamp.fromDate(new Date(ed.startTime)),
              endTime: firebase.firestore.Timestamp.fromDate(new Date(ed.endTime)),
                location: ed.location || '',
                exactLocation: ed.exactLocation || '',
                note: ed.note || '',
            })) : undefined,
            nextEventDate: baseEvent.eventDates && baseEvent.eventDates.length > 0
              ? firebase.firestore.Timestamp.fromDate(new Date(baseEvent.eventDates[0].date))
              : (baseEvent.scheduledFor ? firebase.firestore.Timestamp.fromDate(new Date(baseEvent.scheduledFor)) : null),
            type: eventData.recurring?.enabled ? 'recurring' : 'single',
            frequency: eventData.recurring?.frequency || null,
            memberIds: [organizerId],
            memberCount: 1,
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
          
          if (eventData.usualStartTime) {
            firestoreData.usualStartTime = firebase.firestore.Timestamp.fromDate(
              eventData.usualStartTime instanceof Date 
                ? eventData.usualStartTime 
                : new Date(eventData.usualStartTime)
            );
          }
          if (eventData.usualEndTime) {
            firestoreData.usualEndTime = firebase.firestore.Timestamp.fromDate(
              eventData.usualEndTime instanceof Date 
                ? eventData.usualEndTime 
                : new Date(eventData.usualEndTime)
            );
          }
          
          await eventsRef.set(firestoreData);
          
          if (organizerId) {
            const membersRef = eventsRef.collection('members').doc(organizerId);
            
            const rsvpStatuses = {};
            if (eventData.eventDates && Array.isArray(eventData.eventDates) && eventData.eventDates.length > 0) {
              eventData.eventDates.forEach((ed) => {
                if (ed.date) {
                  const date = ed.date instanceof Date ? ed.date : new Date(ed.date);
                  const dateKey = date.toISOString().split('T')[0];
                  rsvpStatuses[dateKey] = 'going';
                }
              });
            } else {
              rsvpStatuses['default'] = 'going';
            }
            
            await membersRef.set({
              userId: organizerId,
              userName: user?.name || user?.email || '',
              userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
              role: 'organizer',
              joinedAt: firebase.firestore.Timestamp.now(),
              rsvpStatus: 'going',
              rsvpStatuses: rsvpStatuses,
            });

            await db.collection('users').doc(organizerId).update({
              groupIds: firebase.firestore.FieldValue.arrayUnion(baseEvent.id),
            });
          }
        } catch (error) {
          console.error('[createEvent] Error saving event to Firestore:', error);
        }
      }

      setEvents((prev) => [...prev, baseEvent]);
      return baseEvent;
    },
    [user],
  );

  // Initialize IAP and set up purchase listener
  useEffect(() => {
    if (!user) return;

    let purchaseUnsubscribe = null;

    const setupIAP = async () => {
      try {
        // Initialize IAP (can use subscription service's init since it's the same connection)
        await initIAP();
        
        // Set up purchase listener for meepleup creation
        purchaseUnsubscribe = setupMeepleupPurchaseListener(async (update) => {
          if (update.type === 'purchase' && !update.acknowledged) {
            const userId = user?.uid || user?.id;
            if (!userId) return;

            try {
              // Acknowledge the purchase
              await acknowledgeMeepleupPurchase(update.purchase);
              
              // Verify the purchase with backend
              const verification = await verifyMeepleupPurchaseReceipt(update.purchase, userId);
              
              if (verification.success && verification.verified) {
                logger.debug('[EventsContext] Meepleup creation purchase verified successfully');
                // Purchase is now recorded, user can create meepleups
              } else {
                console.warn('[EventsContext] Meepleup creation purchase verification failed:', verification.error);
              }
            } catch (error) {
              console.error('[EventsContext] Error processing meepleup purchase:', error);
            }
          }
        });
      } catch (error) {
        console.error('[EventsContext] Error setting up IAP:', error);
      }
    };

    setupIAP();

    return () => {
      if (purchaseUnsubscribe) {
        purchaseUnsubscribe();
      }
    };
  }, [user]);

  /**
   * Legacy name: creation is free for all signed-in users (host = creator via organizerId).
   * Kept so existing callers get a consistent { success, event } result shape.
   */
  const createEventWithPurchaseCheck = useCallback(
    async (eventData = {}) => {
      const userId = user?.uid || user?.id;
      if (!userId) {
        return { success: false, error: 'User must be authenticated to create a meepleup' };
      }
      try {
        const event = await createEvent(eventData);
        return { success: true, event };
      } catch (error) {
        console.error('[createEventWithPurchaseCheck] Error creating event:', error);
        return { success: false, error: error.message };
      }
    },
    [user, createEvent],
  );

  const joinEventWithCode = useCallback(
    async (code, userId) => {
      logger.debug('[EventsContext] ========== JOIN EVENT WITH CODE START ==========');
      logger.debug('[EventsContext] Input code:', code);
      logger.debug('[EventsContext] Input userId:', userId);
      logger.debug('[EventsContext] User object:', { uid: user?.uid, id: user?.id, email: user?.email });
      logger.debug('[EventsContext] DB available:', !!db);
      
      if (!code || !userId) {
        console.error('[EventsContext] Missing required parameters:', { code: !!code, userId: !!userId });
        throw new Error('Join code and user ID are required');
      }

      const normalized = code.trim().toLowerCase().replace(/[\s-]+/g, ' ');
      logger.debug('[EventsContext] Normalized code:', normalized);

      if (!db) {
        console.error('[EventsContext] Database not available');
        throw new Error('Database not available');
      }

      if (!user) {
        console.error('[EventsContext] User not authenticated');
        throw new Error('You must be signed in to join a MeepleUp');
      }

      try {
        const eventsRef = db.collection('gamingGroups');
        logger.debug('[EventsContext] Created eventsRef, starting query...');
        
        // Query by joinCode (security rules will filter to active groups)
        // Note: We don't filter by isActive in the query since security rules handle that
        logger.debug('[EventsContext] Attempting query: where(joinCode == normalized)');
        let snapshot;
        try {
          snapshot = await eventsRef
            .where('joinCode', '==', normalized)
            .limit(10)
            .get();
          logger.debug('[EventsContext] ✅ Query succeeded!');
          logger.debug('[EventsContext] Documents found:', snapshot.docs.length);
          snapshot.docs.forEach((doc, index) => {
            const data = doc.data();
            logger.debug(`[EventsContext] Doc ${index + 1}:`, {
              id: doc.id,
              name: data.name,
              isActive: data.isActive,
              deletedAt: data.deletedAt,
              joinCode: data.joinCode,
              joinCodes: data.joinCodes
            });
          });
        } catch (queryError) {
          console.error('[EventsContext] ❌ Query by joinCode failed:', {
            error: queryError,
            code: queryError?.code,
            message: queryError?.message,
            stack: queryError?.stack
          });
          throw queryError;
        }

        // Filter results to ensure they match security rules (active and not deleted)
        logger.debug('[EventsContext] Filtering results for active, non-deleted groups...');
        let matchingDocs = snapshot.docs.filter(doc => {
          const data = doc.data();
          const isActive = data.isActive !== false;
          const notDeleted = !data.deletedAt;
          const matches = isActive && notDeleted;
          logger.debug(`[EventsContext] Doc ${doc.id}: isActive=${isActive}, notDeleted=${notDeleted}, matches=${matches}`);
          return matches;
        });
        logger.debug('[EventsContext] After filtering:', matchingDocs.length, 'matching documents');

        if (matchingDocs.length === 0) {
          // Try querying by joinCodes array
          logger.debug('[EventsContext] No matches by joinCode, trying joinCodes array...');
          let snapshotArray;
          try {
            snapshotArray = await eventsRef
              .where('joinCodes', 'array-contains', normalized)
              .limit(10)
              .get();
            logger.debug('[EventsContext] ✅ Array query succeeded!');
            logger.debug('[EventsContext] Array query documents found:', snapshotArray.docs.length);
          } catch (arrayQueryError) {
            console.error('[EventsContext] ❌ Query by joinCodes array failed:', {
              error: arrayQueryError,
              code: arrayQueryError?.code,
              message: arrayQueryError?.message,
              stack: arrayQueryError?.stack
            });
            throw new Error('MeepleUp not found with this join code');
          }
          
          matchingDocs = snapshotArray.docs.filter(doc => {
            const data = doc.data();
            const isActive = data.isActive !== false;
            const notDeleted = !data.deletedAt;
            const matches = isActive && notDeleted;
            logger.debug(`[EventsContext] Array query doc ${doc.id}: isActive=${isActive}, notDeleted=${notDeleted}, matches=${matches}`);
            return matches;
          });
          logger.debug('[EventsContext] After array query filtering:', matchingDocs.length, 'matching documents');
          
          if (matchingDocs.length === 0) {
            console.error('[EventsContext] ❌ No matching groups found after both queries');
            throw new Error('MeepleUp not found with this join code');
          }
        }
        
        logger.debug('[EventsContext] ✅ Found matching group:', matchingDocs[0].id);
        logger.debug('[EventsContext] Proceeding to processJoinedGroup...');
        const result = await processJoinedGroup(matchingDocs[0], userId);
        logger.debug('[EventsContext] ========== JOIN EVENT WITH CODE SUCCESS ==========');
        return result;
      } catch (error) {
        console.error('[EventsContext] ========== JOIN EVENT WITH CODE ERROR ==========');
        console.error('[EventsContext] Error details:', {
          error,
          code: error?.code,
          message: error?.message,
          normalizedCode: normalized,
          userId,
          userAuthenticated: !!user,
          dbAvailable: !!db
        });
        // If it's a permission error, provide more helpful message
        if (error?.code === 'permission-denied') {
          console.error('[EventsContext] Permission denied - possible causes:');
          console.error('[EventsContext] 1. User not authenticated properly');
          console.error('[EventsContext] 2. Security rules blocking query');
          console.error('[EventsContext] 3. Group is archived or deleted');
          throw new Error('Permission denied. Please make sure you are signed in and the MeepleUp is active.');
        }
        throw error;
      }
    },
    [user],
  );

  const processJoinedGroup = async (groupDoc, userId) => {
    logger.debug('[EventsContext] ========== PROCESS JOINED GROUP START ==========');
    logger.debug('[EventsContext] Group document ID:', groupDoc.id);
    logger.debug('[EventsContext] User ID:', userId);
    
    const firestoreEvent = groupDoc.data();
    const groupId = groupDoc.id;
    logger.debug('[EventsContext] Group data:', {
      name: firestoreEvent.name,
      organizerId: firestoreEvent.organizerId,
      isActive: firestoreEvent.isActive,
      deletedAt: firestoreEvent.deletedAt,
      joinCode: firestoreEvent.joinCode,
      joinCodes: firestoreEvent.joinCodes,
      memberIds: firestoreEvent.memberIds
    });

              let members = [];
              try {
                const membersSnapshot = await db.collection('gamingGroups')
        .doc(groupId)
                  .collection('members')
                  .get();
                
                members = membersSnapshot.docs.map(memberDoc => {
                  const memberData = memberDoc.data();
                  return {
                    userId: memberData.userId || memberDoc.id,
                    status: MEMBERSHIP_STATUS.MEMBER,
                    role: memberData.role || MEMBER_ROLES.MEMBER,
                    joinedAt: memberData.joinedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          rsvpStatus: memberData.rsvpStatus || null,
                    rsvpStatuses: memberData.rsvpStatuses || {},
                    rsvpUpdatedAt: memberData.rsvpUpdatedAt?.toDate?.()?.toISOString() || memberData.rsvpUpdatedAt || null,
                    canShareJoinCode: memberData.canShareJoinCode !== undefined ? memberData.canShareJoinCode : (memberData.role === MEMBER_ROLES.ORGANIZER || memberData.userId === firestoreEvent.organizerId),
          proposalLimit: memberData.proposalLimit !== undefined ? memberData.proposalLimit : 5,
                  };
                });
              } catch (membersError) {
      console.warn('[EventsContext] Error fetching members, using fallback');
                if (firestoreEvent.memberIds && Array.isArray(firestoreEvent.memberIds)) {
                  members = firestoreEvent.memberIds.map((memberId) => ({
                    userId: memberId,
                    status: MEMBERSHIP_STATUS.MEMBER,
                    role: memberId === firestoreEvent.organizerId ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER,
                    joinedAt: firestoreEvent.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    canShareJoinCode: memberId === firestoreEvent.organizerId,
          proposalLimit: 5,
                  }));
                }
              }
              
              const localEventData = {
      id: groupId,
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
                generalLocation: firestoreEvent.location?.name || '',
                exactLocation: firestoreEvent.location?.address || '',
      visibility: 'private',
                members: members,
                isActive: firestoreEvent.isActive !== false,
                deletedAt: firestoreEvent.deletedAt?.toDate?.()?.toISOString() || firestoreEvent.deletedAt || null,
                rsvpSettings: firestoreEvent.rsvpSettings || {
                  enabled: true,
                  allowMaybe: true,
                  attendanceLimit: null,
                },
              };
              
    const event = normalizeEvent(localEventData);

    try {
      logger.debug('[EventsContext] Starting Firestore operations...');
      const groupRef = db.collection('gamingGroups').doc(groupId);
      logger.debug('[EventsContext] Group ref created:', groupId);
      
            let userName = '';
            let userAvatarUrl = '';
            if (user && userId === (user.uid || user.id)) {
              userName = user.name || user.email || '';
              userAvatarUrl = user.photoURL || user.avatarUrl || '';
              logger.debug('[EventsContext] Using user object for name/avatar:', { userName, hasAvatar: !!userAvatarUrl });
            } else {
              logger.debug('[EventsContext] Fetching user data from Firestore...');
              const userData = await db.collection('users').doc(userId).get().catch((err) => {
                console.error('[EventsContext] Error fetching user data:', err);
                return null;
              });
              const userDocData = userData?.data();
              userName = userDocData?.name || userDocData?.email || '';
              userAvatarUrl = userDocData?.avatarUrl || '';
              logger.debug('[EventsContext] User data fetched:', { userName, hasAvatar: !!userAvatarUrl });
            }
            
            logger.debug('[EventsContext] Creating member document...');
            const membersRef = groupRef.collection('members').doc(userId);
            try {
              await membersRef.set({
                userId,
        userName: userName || userId,
              userAvatarUrl: userAvatarUrl || null,
              role: 'member',
              joinedAt: firebase.firestore.Timestamp.now(),
              rsvpStatus: null,
              rsvpStatuses: {},
            }, { merge: true });
            logger.debug('[EventsContext] ✅ Member document created successfully');
            } catch (memberError) {
              console.error('[EventsContext] ❌ Error creating member document:', {
                error: memberError,
                code: memberError?.code,
                message: memberError?.message
              });
              throw memberError;
            }
            
      logger.debug('[EventsContext] Updating user document with groupId...');
      try {
        await db.collection('users').doc(userId).update({
          groupIds: firebase.firestore.FieldValue.arrayUnion(groupId),
        });
        logger.debug('[EventsContext] ✅ User groupIds updated successfully');
      } catch (userUpdateError) {
        console.error('[EventsContext] ❌ Error updating user groupIds:', {
          error: userUpdateError,
          code: userUpdateError?.code,
          message: userUpdateError?.message
        });
        throw userUpdateError;
      }

            try {
              const { calculateMatchScoresForUser } = await import('../services/matchScores');
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

              const userDoc = await db.collection('users').doc(userId).get();
              const userData = userDoc.data();
              const customWeights = userData?.personalMatchWeights || null;

        calculateMatchScoresForUser(groupId, userId, userCollection, customWeights).catch(err => {
          console.warn('[EventsContext] Error calculating match scores:', err);
              });
            } catch (matchScoreError) {
              console.warn('[EventsContext] Error setting up match score calculation:', matchScoreError);
          }
        } catch (error) {
      console.error('[EventsContext] ========== PROCESS JOINED GROUP ERROR ==========');
      console.error('[EventsContext] Error saving membership:', {
        error,
        code: error?.code,
        message: error?.message,
        groupId,
        userId
      });
      throw new Error('Failed to join group: ' + error.message);
    }
    
    logger.debug('[EventsContext] ========== PROCESS JOINED GROUP SUCCESS ==========');

        setEvents((prev) => {
          const existingEvent = prev.find((e) => e.id === event.id);
          if (existingEvent) {
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
            const membersWithUser = addOrUpdateMember(event, userId);
            return [...prev, { ...event, members: membersWithUser }];
          }
        });
        
          return event;
  };

  const getEventById = useCallback(
    (eventId) => {
      return events.find((event) => event.id === eventId);
    },
    [events],
  );

  const getUserEvents = useCallback(() => {
    if (!user) {
      logger.debug('[EventsContext] getUserEvents: No user, returning empty array');
      return [];
    }
    const userId = user.uid || user.id;
    logger.debug('[EventsContext] getUserEvents: Looking for events for user:', userId, 'Total events:', events.length);
    
    const userEvents = events.filter((event) =>
      event.members.some((member) => member.userId === userId),
    );
    
    logger.debug('[EventsContext] getUserEvents: Found', userEvents.length, 'events for user', userId);
    if (userEvents.length > 0) {
      logger.debug('[EventsContext] getUserEvents: Event names:', userEvents.map(e => ({ id: e.id, name: e.name, isActive: e.isActive })));
    }
    
    return userEvents;
  }, [events, user]);

  const leaveEvent = useCallback(
    async (eventId) => {
      if (!user || !db) return;

      const userId = user.uid || user.id;
        try {
          const groupRef = db.collection('gamingGroups').doc(eventId);
        const membersRef = groupRef.collection('members').doc(userId);
        
        await membersRef.delete();
        
        await db.collection('users').doc(userId).update({
          groupIds: firebase.firestore.FieldValue.arrayRemove(eventId),
        });

        setEvents((prev) => prev.filter((event) => event.id !== eventId));
        } catch (error) {
        console.error('[EventsContext] Error leaving event:', error);
          throw error;
        }
    },
    [user],
  );

  const removeMember = useCallback(
    async (eventId, memberUserId) => {
      if (!user || !db) return;

      const currentUserId = user.uid || user.id;
      const event = getEventById(eventId);
      
      if (!event) {
        throw new Error('Event not found');
      }

      // Primary host or organizer / co-organizer role on the member record
      const isPrimaryOrganizer = event.organizerId === currentUserId;
      const currentUserMember = event.members.find((m) => m.userId === currentUserId);
      const hasOrganizerRole =
        currentUserMember?.role === MEMBER_ROLES.ORGANIZER ||
        currentUserMember?.role === MEMBER_ROLES.CO_ORGANIZER;

      if (!isPrimaryOrganizer && !hasOrganizerRole) {
        throw new Error('Only organizers can remove members');
      }

      // Prevent removing the organizer
      if (memberUserId === event.organizerId) {
        throw new Error('Cannot remove the organizer');
      }

      // Prevent removing yourself (use leaveEvent instead)
      if (memberUserId === currentUserId) {
        throw new Error('Use leave event to remove yourself');
      }

      try {
        const groupRef = db.collection('gamingGroups').doc(eventId);
        const membersRef = groupRef.collection('members').doc(memberUserId);
        
        // Remove member document (this is allowed by security rules for organizers)
        await membersRef.delete();

        // Update memberIds array in group document if it exists
        // Note: We don't update the user's groupIds because security rules only allow
        // users to update their own documents. The member will lose access because
        // they're no longer in the members subcollection, and their groupIds will
        // be cleaned up when they next sync or can be handled by a Cloud Function.
        const groupDoc = await groupRef.get();
        const groupData = groupDoc.data();
        if (groupData?.memberIds && Array.isArray(groupData.memberIds) && groupData.memberIds.includes(memberUserId)) {
          await groupRef.update({
            memberIds: firebase.firestore.FieldValue.arrayRemove(memberUserId),
            memberCount: firebase.firestore.FieldValue.increment(-1),
            updatedAt: firebase.firestore.Timestamp.now(),
          });
        }

        // Update local events state
        setEvents((prev) =>
          prev.map((e) =>
            e.id === eventId
              ? {
                  ...e,
                  members: e.members.filter((m) => m.userId !== memberUserId),
                  lastUpdatedAt: new Date().toISOString(),
                }
              : e
          )
        );
      } catch (error) {
        console.error('[EventsContext] Error removing member:', error);
        throw error;
      }
    },
    [user, db, getEventById],
  );

  const getMembershipStatus = useCallback(
    (eventId, userId) => {
      const event = getEventById(eventId);
      if (!event) return MEMBERSHIP_STATUS.STRANGER;
      const member = event.members.find((m) => m.userId === userId);
      return member ? MEMBERSHIP_STATUS.MEMBER : MEMBERSHIP_STATUS.STRANGER;
    },
    [getEventById],
  );

  // Helper to get date key from event date
  const getDateKey = (eventDate) => {
    if (!eventDate) return 'default';
    const date = eventDate instanceof Date ? eventDate : new Date(eventDate);
    // Format using local date components to avoid timezone shifts
    date.setHours(0, 0, 0, 0);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // YYYY-MM-DD format using local date
  };

  const updateEvent = useCallback(
    async (eventId, updates) => {
      logger.debug('[EventsContext] ========== updateEvent CALLED ==========');
      logger.debug('[EventsContext] updateEvent - eventId:', eventId);
      logger.debug('[EventsContext] updateEvent - updates:', {
        ...updates,
        eventDates: updates.eventDates ? {
          count: Array.isArray(updates.eventDates) ? updates.eventDates.length : 'not an array',
          firstDate: Array.isArray(updates.eventDates) && updates.eventDates.length > 0 
            ? updates.eventDates[0] 
            : 'no dates',
        } : 'no eventDates in updates',
      });
      
      if (!db) {
        logger.debug('[EventsContext] ⚠️  No database available, returning early');
        return;
      }
      
      try {
        const groupRef = db.collection('gamingGroups').doc(eventId);
        
        // If eventDates are being updated, check for deleted dates and clean up RSVPs
        if (updates.eventDates && Array.isArray(updates.eventDates)) {
          // Get current event dates from Firestore
          const currentEventDoc = await groupRef.get();
          const currentEventData = currentEventDoc.exists ? currentEventDoc.data() : {};
          const currentEventDates = currentEventData.eventDates || [];
          
          // Extract date keys from current and new event dates
          const currentDateKeys = new Set(
            currentEventDates.map((ed) => {
              const date = ed.date?.toDate?.() || ed.date;
              return getDateKey(date);
            })
          );
          
          const newDateKeys = new Set(
            updates.eventDates.map((ed) => {
              const date = ed.date instanceof Date ? ed.date : new Date(ed.date);
              return getDateKey(date);
            })
          );
          
          // Find deleted date keys (in current but not in new)
          const deletedDateKeys = Array.from(currentDateKeys).filter((key) => !newDateKeys.has(key));
          
          // Clean up RSVPs for deleted dates
          if (deletedDateKeys.length > 0) {
            logger.debug('[EventsContext] Cleaning up RSVPs for deleted dates:', deletedDateKeys);
            
            // Get all members
            const membersRef = groupRef.collection('members');
            const membersSnapshot = await membersRef.get();
            
            // Update each member's RSVPs to remove deleted date keys
            const updatePromises = [];
            membersSnapshot.forEach((memberDoc) => {
              const memberData = memberDoc.data();
              const rsvpStatuses = memberData.rsvpStatuses || {};
              
              // Only update if this member has RSVPs for any of the deleted dates
              const hasDeletedDateRSVPs = deletedDateKeys.some((dateKey) => rsvpStatuses.hasOwnProperty(dateKey));
              
              if (hasDeletedDateRSVPs) {
                // Create updated rsvpStatuses without deleted date keys
                const updatedRSVPStatuses = { ...rsvpStatuses };
                deletedDateKeys.forEach((dateKey) => {
                  delete updatedRSVPStatuses[dateKey];
                });
                
                // Update member document
                updatePromises.push(
                  memberDoc.ref.update({
                    rsvpStatuses: updatedRSVPStatuses,
                    rsvpUpdatedAt: firebase.firestore.Timestamp.now(),
                  })
                );
              }
            });
            
            // Wait for all member updates to complete
            await Promise.all(updatePromises);
            logger.debug('[EventsContext] ✅ Cleaned up RSVPs for', deletedDateKeys.length, 'deleted date(s)');
          }
        }
        
        // Convert eventDates to Firestore Timestamps if present
        const firestoreUpdates = { ...updates };
        if (firestoreUpdates.eventDates && Array.isArray(firestoreUpdates.eventDates)) {
          logger.debug('[EventsContext] Converting eventDates to Firestore Timestamps...');
          firestoreUpdates.eventDates = firestoreUpdates.eventDates.map((ed) => {
            // Handle both ISO string and Date object formats
            const date = ed.date instanceof Date ? ed.date : new Date(ed.date);
            const startTime = ed.startTime instanceof Date ? ed.startTime : new Date(ed.startTime);
            const endTime = ed.endTime instanceof Date ? ed.endTime : new Date(ed.endTime);
            
            return {
              date: firebase.firestore.Timestamp.fromDate(date),
              startTime: firebase.firestore.Timestamp.fromDate(startTime),
              endTime: firebase.firestore.Timestamp.fromDate(endTime),
              location: ed.location || '',
              exactLocation: ed.exactLocation || ed.address || '',
              note: ed.note || '',
            };
          });
          
          // Update nextEventDate to the first event date if eventDates exist
          if (firestoreUpdates.eventDates.length > 0) {
            firestoreUpdates.nextEventDate = firestoreUpdates.eventDates[0].date;
          }
          
          logger.debug('[EventsContext] Converted eventDates to Timestamps:', {
            count: firestoreUpdates.eventDates.length,
            firstDate: firestoreUpdates.eventDates[0]?.date?.toDate?.()?.toISOString(),
          });
        }
        
        // Convert usualStartTime and usualEndTime if present
        if (firestoreUpdates.usualStartTime) {
          const usualStartTime = firestoreUpdates.usualStartTime instanceof Date 
            ? firestoreUpdates.usualStartTime 
            : new Date(firestoreUpdates.usualStartTime);
          firestoreUpdates.usualStartTime = firebase.firestore.Timestamp.fromDate(usualStartTime);
        }
        if (firestoreUpdates.usualEndTime) {
          const usualEndTime = firestoreUpdates.usualEndTime instanceof Date 
            ? firestoreUpdates.usualEndTime 
            : new Date(firestoreUpdates.usualEndTime);
          firestoreUpdates.usualEndTime = firebase.firestore.Timestamp.fromDate(usualEndTime);
        }
        
        firestoreUpdates.updatedAt = firebase.firestore.Timestamp.now();
        
        logger.debug('[EventsContext] Preparing Firestore update:', {
          hasEventDates: !!firestoreUpdates.eventDates,
          eventDatesType: Array.isArray(firestoreUpdates.eventDates) ? 'array' : typeof firestoreUpdates.eventDates,
          eventDatesCount: Array.isArray(firestoreUpdates.eventDates) ? firestoreUpdates.eventDates.length : 'N/A',
          eventDatesFormat: Array.isArray(firestoreUpdates.eventDates) && firestoreUpdates.eventDates.length > 0
            ? {
                firstDateType: typeof firestoreUpdates.eventDates[0].date,
                isTimestamp: firestoreUpdates.eventDates[0].date?.toDate ? 'Timestamp' : 'not Timestamp',
                firstDateValue: firestoreUpdates.eventDates[0].date?.toDate?.()?.toISOString(),
              }
            : 'no dates',
        });
        
        logger.debug('[EventsContext] Calling Firestore update...');
        await groupRef.update(firestoreUpdates);
        logger.debug('[EventsContext] ✅ Firestore update completed successfully');
        
        logger.debug('[EventsContext] Updating local events state...');
        setEvents((prev) => {
          const updated = prev.map((event) =>
            event.id === eventId ? { ...event, ...updates, lastUpdatedAt: new Date().toISOString() } : event
          );
          logger.debug('[EventsContext] Local events state updated - this will cause EventHub to re-render');
          return updated;
        });
        logger.debug('[EventsContext] ✅ Local events state updated');
        logger.debug('[EventsContext] ========== updateEvent COMPLETE ==========');
        } catch (error) {
        console.error('[EventsContext] ❌ Error updating event:', error);
        console.error('[EventsContext] Error details:', {
          code: error.code,
          message: error.message,
          stack: error.stack,
        });
        throw error;
      }
    },
    [db],
  );

  const updateMemberRSVP = useCallback(
    async (eventId, userId, status, eventDate = null) => {
      if (!db) return;
      try {
        const membersRef = db.collection('gamingGroups').doc(eventId).collection('members').doc(userId);
        
        // Get current RSVP data from Firestore
        const memberDoc = await membersRef.get();
        const currentData = memberDoc.exists ? memberDoc.data() : {};
        
        // Get current rsvpStatuses or initialize empty object
        let rsvpStatuses = {};
        if (currentData.rsvpStatuses && typeof currentData.rsvpStatuses === 'object' && currentData.rsvpStatuses.constructor === Object) {
          rsvpStatuses = { ...currentData.rsvpStatuses };
        } else if (currentData.rsvpStatus && typeof currentData.rsvpStatus === 'string') {
          // Legacy format: convert single status to date-specific
          rsvpStatuses = { default: currentData.rsvpStatus };
        }
        
        // Update the specific date key
        const dateKey = getDateKey(eventDate);
        if (status) {
          rsvpStatuses[dateKey] = status;
        } else {
          // Remove the status for this date if status is null/empty
          delete rsvpStatuses[dateKey];
        }
        
        // Set rsvpStatus to null since we're using date-specific statuses now
        const updateData = {
          rsvpStatus: null, // Legacy field, set to null
          rsvpStatuses: rsvpStatuses,
          rsvpUpdatedAt: firebase.firestore.Timestamp.now(),
        };
        
        await membersRef.set(updateData, { merge: true });
        
        // Update local events state
        setEvents((prev) =>
          prev.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  members: event.members.map((member) =>
                    member.userId === userId
                      ? { ...member, rsvpStatus: null, rsvpStatuses, rsvpUpdatedAt: new Date().toISOString() }
                      : member
                  ),
                }
              : event
          )
        );
      } catch (error) {
        console.error('[EventsContext] Error updating member RSVP:', error);
        throw error;
      }
    },
    [db],
  );

  const updateEventSchedule = useCallback(
    async (eventId, scheduleUpdates) => {
      logger.debug('[EventsContext] ========== updateEventSchedule CALLED ==========');
      logger.debug('[EventsContext] updateEventSchedule - eventId:', eventId);
      logger.debug('[EventsContext] updateEventSchedule - scheduleUpdates:', {
        ...scheduleUpdates,
        eventDates: scheduleUpdates.eventDates ? {
          count: Array.isArray(scheduleUpdates.eventDates) ? scheduleUpdates.eventDates.length : 'not an array',
          sample: Array.isArray(scheduleUpdates.eventDates) && scheduleUpdates.eventDates.length > 0
            ? scheduleUpdates.eventDates[0]
            : 'no dates',
        } : 'no eventDates',
      });
      logger.debug('[EventsContext] updateEventSchedule - delegating to updateEvent...');
      const result = await updateEvent(eventId, scheduleUpdates);
      logger.debug('[EventsContext] ========== updateEventSchedule COMPLETE ==========');
      return result;
    },
    [updateEvent],
  );

  const updateMemberRole = useCallback(
    async (eventId, userId, role) => {
      if (!db) return;
      try {
        const membersRef = db.collection('gamingGroups').doc(eventId).collection('members').doc(userId);
        await membersRef.update({ role });
      setEvents((prev) =>
          prev.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  members: event.members.map((member) =>
                    member.userId === userId ? { ...member, role } : member
                  ),
                }
              : event
          )
        );
      } catch (error) {
        console.error('[EventsContext] Error updating member role:', error);
        throw error;
      }
    },
    [db],
  );

  const archiveEvent = useCallback(
    async (eventId, organizerUserId) => {
      if (!db) return;
      try {
        const event = getEventById(eventId);
        if (!event) {
          throw new Error('Event not found');
        }

        const groupRef = db.collection('gamingGroups').doc(eventId);
        
        // Check if the document exists before trying to update it
        const groupDoc = await groupRef.get();
        if (!groupDoc.exists) {
          console.warn(`[EventsContext] Document ${eventId} does not exist in Firestore, only archiving locally`);
          // Update local state only
          setEvents((prev) =>
            prev.map((event) =>
              event.id === eventId
                ? { ...event, isActive: false, deletedAt: new Date().toISOString() }
                : event
            )
          );
          return;
        }

        await groupRef.update({
          isActive: false,
          deletedAt: firebase.firestore.Timestamp.now(),
          updatedAt: firebase.firestore.Timestamp.now(),
        });

        // Send a message to all members about the archive
        try {
          const organizerName = user?.name || user?.email || 'The organizer';
          const archiveMessage = `${organizerName} has archived this MeepleUp. It can be restored from the archived MeepleUps section.`;
          
          const postsRef = groupRef.collection('posts');
          await postsRef.add({
            userId: organizerUserId || user?.uid || user?.id || 'system',
            userName: organizerName,
            userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
            content: archiveMessage,
            photoUrl: null,
            likeCount: 0,
            commentCount: 0,
            createdAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
            edited: false,
            deleted: false,
            pinned: false,
            isSystemMessage: true, // Mark as system message
          });

          // Notify members about the archive (push notifications)
          try {
            const { notifyDiscussionActivity } = await import('../utils/notifications');
            await notifyDiscussionActivity(eventId, organizerUserId || user?.uid || user?.id, {
              type: 'meepleup_archived',
              fromUserName: organizerName,
              message: `${organizerName} archived this MeepleUp`,
            });
          } catch (notifError) {
            console.warn('[EventsContext] Error sending archive notification:', notifError);
            // Don't fail the archive if notification fails
          }

          // Send email notifications to members
          try {
            const { sendMeepleupArchiveEmail } = await import('../utils/notifications');
            const membersSnapshot = await groupRef.collection('members').get();
            
            // Send emails to all members (except the organizer) who have email notifications enabled
            const emailPromises = membersSnapshot.docs.map(async (memberDoc) => {
              const memberData = memberDoc.data();
              const memberId = memberData.userId || memberDoc.id;
              
              // Don't send email to the organizer
              if (memberId === (organizerUserId || user?.uid || user?.id)) {
                return;
              }
              
              try {
                await sendMeepleupArchiveEmail(
                  memberId,
                  organizerName,
                  eventId,
                  event.name
                );
              } catch (emailError) {
                console.warn(`[EventsContext] Error sending archive email to ${memberId}:`, emailError);
                // Don't fail the archive if email fails
              }
            });
            
            await Promise.all(emailPromises);
          } catch (emailError) {
            console.warn('[EventsContext] Error sending archive emails:', emailError);
            // Don't fail the archive if email sending fails
          }
        } catch (messageError) {
          console.warn('[EventsContext] Error posting archive message:', messageError);
          // Don't fail the archive if message posting fails
        }

        setEvents((prev) =>
          prev.map((event) =>
            event.id === eventId
              ? { ...event, isActive: false, deletedAt: new Date().toISOString() }
              : event
          )
        );
      } catch (error) {
        console.error('[EventsContext] Error archiving event:', error);
        throw error;
      }
    },
    [db, getEventById, user],
  );

  const addJoinCode = useCallback(
    async (eventId, code) => {
      const event = getEventById(eventId);
      if (!event) return;
      const normalizedCode = code.trim().toLowerCase().replace(/[\s-]+/g, ' ');
      const newJoinCodes = [...(event.joinCodes || []), normalizedCode];
      return updateEvent(eventId, { joinCodes: newJoinCodes, joinCode: newJoinCodes[0] });
    },
    [getEventById, updateEvent],
  );

  const deleteJoinCode = useCallback(
    async (eventId, code) => {
      const event = getEventById(eventId);
      if (!event) return;
      const normalizedCode = code.trim().toLowerCase().replace(/[\s-]+/g, ' ');
      const newJoinCodes = (event.joinCodes || []).filter((c) => c !== normalizedCode);
      if (newJoinCodes.length === 0) {
        const newCode = generateJoinCode();
        newJoinCodes.push(newCode.trim().toLowerCase().replace(/[\s-]+/g, ' '));
      }
      return updateEvent(eventId, { joinCodes: newJoinCodes, joinCode: newJoinCodes[0] });
    },
    [getEventById, updateEvent],
  );

  const updateMemberJoinCodePermission = useCallback(
    async (eventId, userId, canShareJoinCode) => {
      if (!db) return;
      try {
        const membersRef = db.collection('gamingGroups').doc(eventId).collection('members').doc(userId);
        await membersRef.update({ canShareJoinCode });
    setEvents((prev) =>
          prev.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  members: event.members.map((member) =>
                    member.userId === userId ? { ...member, canShareJoinCode } : member
                  ),
                }
              : event
          )
        );
        } catch (error) {
        console.error('[EventsContext] Error updating member join code permission:', error);
          throw error;
        }
    },
    [db],
  );

  const updateMemberProposalLimit = useCallback(
    async (eventId, userId, proposalLimit) => {
      if (!db) return;
      try {
        const membersRef = db.collection('gamingGroups').doc(eventId).collection('members').doc(userId);
        await membersRef.update({ proposalLimit });
      setEvents((prev) =>
          prev.map((event) =>
            event.id === eventId
              ? {
            ...event,
                  members: event.members.map((member) =>
                    member.userId === userId ? { ...member, proposalLimit } : member
                  ),
                }
              : event
          )
        );
      } catch (error) {
        console.error('[EventsContext] Error updating member proposal limit:', error);
        throw error;
      }
    },
    [db],
  );

  const submitContactRequest = useCallback(
    async (eventId, contactRequest) => {
      const event = getEventById(eventId);
      if (!event) return;
      const newRequest = {
        ...contactRequest,
        id: contactRequest.id || `${eventId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: CONTACT_STATUS.PENDING,
        createdAt: contactRequest.createdAt || new Date().toISOString(),
      };
      const updatedRequests = [...(event.contactRequests || []), newRequest];
      return updateEvent(eventId, { contactRequests: updatedRequests });
    },
    [getEventById, updateEvent],
  );

  const updateContactRequest = useCallback(
    async (eventId, requestId, updates) => {
      const event = getEventById(eventId);
      if (!event) return;
      const updatedRequests = (event.contactRequests || []).map((req) =>
        req.id === requestId ? { ...req, ...updates } : req
      );
      return updateEvent(eventId, { contactRequests: updatedRequests });
    },
    [getEventById, updateEvent],
  );

  const unarchiveEvent = useCallback(
    async (eventId, organizerUserId) => {
      if (!db) return;
      try {
        const event = getEventById(eventId);
        if (!event) {
          throw new Error('Event not found');
        }

        const groupRef = db.collection('gamingGroups').doc(eventId);
        await groupRef.update({
          isActive: true,
          deletedAt: null,
          updatedAt: firebase.firestore.Timestamp.now(),
        });

        // Send a message to all members about the unarchive
        try {
          const organizerName = user?.name || user?.email || 'The organizer';
          const unarchiveMessage = `${organizerName} has restored this MeepleUp.`;
          
          const postsRef = groupRef.collection('posts');
          await postsRef.add({
            userId: organizerUserId || user?.uid || user?.id || 'system',
            userName: organizerName,
            userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
            content: unarchiveMessage,
            photoUrl: null,
            likeCount: 0,
            commentCount: 0,
            createdAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
            edited: false,
            deleted: false,
            pinned: false,
            isSystemMessage: true, // Mark as system message
          });

          // Notify members about the unarchive
          try {
            const { notifyDiscussionActivity } = await import('../utils/notifications');
            await notifyDiscussionActivity(eventId, organizerUserId || user?.uid || user?.id, {
              type: 'meepleup_unarchived',
              fromUserName: organizerName,
              message: `${organizerName} restored this MeepleUp`,
            });
          } catch (notifError) {
            console.warn('[EventsContext] Error sending unarchive notification:', notifError);
            // Don't fail the unarchive if notification fails
          }
        } catch (messageError) {
          console.warn('[EventsContext] Error posting unarchive message:', messageError);
          // Don't fail the unarchive if message posting fails
        }

        setEvents((prev) =>
          prev.map((event) =>
            event.id === eventId
              ? { ...event, isActive: true, deletedAt: null }
              : event
          )
        );
      } catch (error) {
        console.error('[EventsContext] Error unarchiving event:', error);
        throw error;
      }
    },
    [db, getEventById, user],
  );

  const deleteEvent = useCallback(
    async (eventId, organizerUserId) => {
      if (!db) return;
      try {
        const event = getEventById(eventId);
        if (!event) {
          throw new Error('Event not found');
        }

        // Only the organizer can delete
        if (event.organizerId !== organizerUserId) {
          throw new Error('Only the organizer can delete a MeepleUp');
        }

        // Only allow deletion of archived events
        if (event.isActive) {
          throw new Error('MeepleUp must be archived before it can be deleted');
        }

        const groupRef = db.collection('gamingGroups').doc(eventId);

        // Delete the main document first (this is the critical operation)
        // Note: Subcollections (members, posts, etc.) are not automatically deleted
        // These will remain in Firestore but won't be accessible since the parent doc is deleted
        // A Cloud Function could be used to clean up subcollections if needed
        await groupRef.delete();

        // Clean up the current user's groupIds (if they're in the member list)
        // Note: We can't update other users' documents from the client due to security rules
        // Other members' groupIds will be cleaned up when they next access the app or via a Cloud Function
        try {
          const currentUserId = organizerUserId;
          if (currentUserId) {
            const userRef = db.collection('users').doc(currentUserId);
            await userRef.update({
              groupIds: firebase.firestore.FieldValue.arrayRemove(eventId),
            });
          }
        } catch (cleanupError) {
          // Don't fail the deletion if cleanup fails - the document is already deleted
          console.warn('[EventsContext] Error cleaning up user groupIds:', cleanupError);
        }

        // Update local state
        setEvents((prev) => prev.filter((event) => event.id !== eventId));
      } catch (error) {
        console.error('[EventsContext] Error deleting event:', error);
        throw error;
      }
    },
    [db, getEventById],
  );

  const getUserArchivedEvents = useCallback(() => {
    if (!user) return [];
    const userId = user.uid || user.id;
    return events.filter(
      (event) =>
        !event.isActive &&
        event.organizerId === userId // Only show archived events where user is organizer
    );
  }, [events, user]);

  const value = useMemo(
    () => ({
      events,
      loading,
      createEvent,
      createEventWithPurchaseCheck,
      joinEventWithCode,
      getEventById,
      getUserEvents,
      leaveEvent,
      removeMember,
      getMembershipStatus,
      membershipStatus: MEMBERSHIP_STATUS,
      updateEvent,
      updateMemberRSVP,
      updateEventSchedule,
      archiveEvent,
      unarchiveEvent,
      deleteEvent,
      addJoinCode,
      deleteJoinCode,
      updateMemberRole,
      updateMemberJoinCodePermission,
      updateMemberProposalLimit,
      submitContactRequest,
      updateContactRequest,
      contactStatus: CONTACT_STATUS,
      memberRoles: MEMBER_ROLES,
      getUserArchivedEvents,
    }),
    [
      events,
      loading,
      createEvent,
      createEventWithPurchaseCheck,
      joinEventWithCode,
      getEventById,
      getUserEvents,
      leaveEvent,
      removeMember,
      getMembershipStatus,
      updateEvent,
      updateMemberRSVP,
      updateEventSchedule,
      archiveEvent,
      unarchiveEvent,
      deleteEvent,
      addJoinCode,
      deleteJoinCode,
      updateMemberRole,
      updateMemberJoinCodePermission,
      updateMemberProposalLimit,
      submitContactRequest,
      updateContactRequest,
      getUserArchivedEvents,
    ],
  );

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
};
