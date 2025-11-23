import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import storage from '../utils/storage';
import { useAuth } from './AuthContext';
import { wordlist } from '../utils/wordlist';
import { db } from '../config/firebase';
import firebase from '../config/firebase';

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
  const words = [];
  for (let i = 0; i < 3; i++) {
    const randomIndex = Math.floor(Math.random() * wordlist.length);
    words.push(wordlist[randomIndex]);
  }
  return words.join(' ');
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
    };
  }

  const status = member.status || MEMBERSHIP_STATUS.MEMBER;
  return {
    userId: member.userId || member.id || null,
    status,
    role: member.role || (member.userId === organizerId ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER),
    joinedAt: member.joinedAt || fallbackDate || new Date().toISOString(),
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

  const generalLocation = event.generalLocation || event.location || 'Details shared after you join';
  const exactLocation = event.exactLocation || event.location || '';

  // Check if event is archived (from Firestore)
  const deletedAt = event.deletedAt?.toDate?.()?.toISOString() || event.deletedAt || null;
  const isActive = event.isActive !== undefined ? event.isActive : (deletedAt === null);

  return {
    id: event.id || Date.now().toString(),
    name: event.name || 'New MeepleUp',
    organizerId,
    description: event.description || '',
    scheduledFor: event.scheduledFor || event.nextDate || '',
    createdAt,
    joinCode: event.joinCode || generateJoinCode(),
    generalLocation,
    exactLocation,
    location: exactLocation || generalLocation,
    visibility: event.visibility || 'private',
    members: normalizedMembers,
    contactRequests,
    lastUpdatedAt: event.lastUpdatedAt || new Date().toISOString(),
    tags: event.tags || [],
    allowStrangerMessages: event.allowStrangerMessages ?? true,
    isActive,
    deletedAt,
  };
};

const addOrUpdateMember = (event, userId, role = MEMBER_ROLES.MEMBER) => {
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
            role: role || member.role,
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
      const joinCode = eventData.joinCode || generateJoinCode();
      const normalizedJoinCode = joinCode.trim().toLowerCase().replace(/[\s-]+/g, ' ');
      
      const baseEvent = normalizeEvent({
        ...eventData,
        organizerId,
        members: eventData.members || (organizerId ? [organizerId] : []),
        createdAt: new Date().toISOString(),
        joinCode: normalizedJoinCode,
      });

      // Save to Firestore if available
      if (db && baseEvent.id) {
        try {
          const eventsRef = db.collection('gamingGroups').doc(baseEvent.id);
          
          // Convert local event format to Firestore format
          const firestoreData = {
            id: baseEvent.id,
            name: baseEvent.name,
            description: baseEvent.description || '',
            organizerId: baseEvent.organizerId,
            organizerName: user?.name || user?.email || '',
            joinCode: normalizedJoinCode,
            privacy: baseEvent.visibility === 'public' ? 'public' : 'private',
            location: {
              name: baseEvent.generalLocation || '',
              address: baseEvent.exactLocation || '',
            },
            scheduledFor: baseEvent.scheduledFor || null,
            type: eventData.recurring?.enabled ? 'recurring' : 'single',
            frequency: eventData.recurring?.frequency || null,
            memberIds: baseEvent.members.map(m => m.userId).filter(Boolean),
            memberCount: baseEvent.members.length,
            isActive: true,
            createdAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
            createdBy: organizerId,
          };
          
          await eventsRef.set(firestoreData);
          
          // Save organizer as member in subcollection
          if (organizerId) {
            const membersRef = eventsRef.collection('members').doc(organizerId);
            await membersRef.set({
              userId: organizerId,
              userName: user?.name || user?.email || '',
              role: 'organizer',
              joinedAt: firebase.firestore.Timestamp.now(),
              rsvpStatus: null,
            });
          }
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
            
            // Query by joinCode only (uses single-field index, more reliable)
            // Then filter for active events in memory
            let snapshot = await eventsRef
              .where('joinCode', '==', normalized)
              .limit(10) // Get a few matches in case there are archived events with same code
              .get();
            
            // If indexed query returns empty, try fallback approach
            // This handles cases where the index hasn't been initialized yet
            // Only try fallback once per join attempt to avoid expensive repeated queries
            if (snapshot.empty && !fallbackTried) {
              fallbackTried = true;
              try {
                // Query recent events and filter in memory (bypasses index requirement)
                const recentSnapshot = await eventsRef
                  .orderBy('createdAt', 'desc')
                  .limit(100) // Get recent events to search through
                  .get();
                
                // Filter for matching joinCode and active status in memory
                const matchingDocs = recentSnapshot.docs.filter(doc => {
                  const data = doc.data();
                  const docJoinCode = (data.joinCode || '').trim().toLowerCase().replace(/[\s-]+/g, ' ');
                  const matchesCode = docJoinCode === normalized;
                  const isActive = data.isActive !== false && !data.deletedAt;
                  return matchesCode && isActive;
                });
                
                if (matchingDocs.length > 0) {
                  snapshot = {
                    docs: matchingDocs,
                    empty: false
                  };
                }
              } catch (fallbackError) {
                console.error('Error in fallback query for join code:', fallbackError);
                // Continue with original empty snapshot
              }
            }
            
            // Filter for active events in memory
            const activeDocs = snapshot.docs.filter(doc => {
              const data = doc.data();
              return data.isActive !== false && !data.deletedAt;
            });
            
            if (activeDocs.length > 0) {
              const doc = activeDocs[0];
              const firestoreEvent = doc.data();
              
              // Convert Firestore event format to local event format
              const localEventData = {
                id: doc.id,
                name: firestoreEvent.name,
                organizerId: firestoreEvent.organizerId,
                description: firestoreEvent.description || '',
                scheduledFor: firestoreEvent.scheduledFor || firestoreEvent.nextEventDate || '',
                createdAt: firestoreEvent.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                joinCode: firestoreEvent.joinCode || '',
                generalLocation: firestoreEvent.location?.name || '',
                exactLocation: firestoreEvent.location?.address || '',
                visibility: firestoreEvent.privacy === 'public' ? 'public' : 'private',
                members: firestoreEvent.memberIds ? firestoreEvent.memberIds.map((memberId, index) => ({
                  userId: memberId,
                  status: MEMBERSHIP_STATUS.MEMBER,
                  role: memberId === firestoreEvent.organizerId ? MEMBER_ROLES.ORGANIZER : MEMBER_ROLES.MEMBER,
                  joinedAt: firestoreEvent.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                })) : [],
                isActive: firestoreEvent.isActive,
                deletedAt: firestoreEvent.deletedAt?.toDate?.()?.toISOString() || firestoreEvent.deletedAt || null,
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
            console.error('Error querying Firestore for join code:', error);
            
            // If not the last attempt, wait before retrying
            if (attempt < maxRetries - 1) {
              const delay = baseDelay * Math.pow(2, attempt);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
      }
      
      if (!event) {
        return null;
      }

      // Save membership to Firestore if db is available and event exists in Firestore
      if (db && event.id) {
        try {
          const groupRef = db.collection('gamingGroups').doc(event.id);
          const groupDoc = await groupRef.get();
          
          if (groupDoc.exists) {
            const membersRef = groupRef.collection('members').doc(userId);
            
            // Use current user's data from Auth context if this is the current user joining
            let userName = '';
            if (user && userId === (user.uid || user.id)) {
              userName = user.name || user.email || '';
            } else {
              // Fallback: fetch from Firestore for other users (shouldn't happen in normal flow)
              const userData = await db.collection('users').doc(userId).get().catch(() => null);
              userName = userData?.data()?.name || userData?.data()?.email || '';
            }
            
            await membersRef.set({
              userId,
              userName: userName || userId, // Fallback to userId if no name found
              role: 'member',
              joinedAt: firebase.firestore.Timestamp.now(),
              rsvpStatus: null,
            }, { merge: true });
            
            // Update memberIds array in the group document
            await groupRef.update({
              memberIds: firebase.firestore.FieldValue.arrayUnion(userId),
              updatedAt: firebase.firestore.Timestamp.now(),
            });
          }
        } catch (error) {
          console.error('Error saving membership to Firestore:', error);
          // Continue with local join even if Firestore update fails
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

  const regenerateJoinCode = useCallback((eventId) => {
    const nextCode = generateJoinCode();
    setEvents((prev) =>
      prev.map((event) =>
        event.id === eventId
          ? {
              ...event,
              joinCode: nextCode,
              lastUpdatedAt: new Date().toISOString(),
            }
          : event,
      ),
    );
    return nextCode;
  }, []);

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
          const eventCode = (event.joinCode || '').toLowerCase().replace(/\s+/g, ' ');
          return eventCode === normalized;
        }) || null
      );
    },
    [events],
  );

  const getUserEvents = useCallback(
    (userId) =>
      events.filter((event) => {
        // Filter out archived events
        if (event.deletedAt || event.isActive === false) {
          return false;
        }
        // Check if user is a member
        return (event.members || []).some((member) => member.userId === userId);
      }),
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
      regenerateJoinCode,
      leaveEvent,
      getEventById,
      getEventByJoinCode,
      getUserEvents,
      getUserArchivedEvents,
      getMembershipStatus,
      submitContactRequest,
      updateContactRequest,
      loading,
      membershipStatus: MEMBERSHIP_STATUS,
      contactStatus: CONTACT_STATUS,
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
      regenerateJoinCode,
      leaveEvent,
      getEventById,
      getEventByJoinCode,
      getUserEvents,
      getUserArchivedEvents,
      getMembershipStatus,
      submitContactRequest,
      updateContactRequest,
    ],
  );

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
};

