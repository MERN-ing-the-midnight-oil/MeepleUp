import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import storage from '../utils/storage';
import { useAuth } from './AuthContext';

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

const JOIN_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 6;

const generateJoinCode = () => {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * JOIN_CODE_CHARACTERS.length);
    code += JOIN_CODE_CHARACTERS[index];
  }
  return code;
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

  return {
    id: event.id || Date.now().toString(),
    name: event.name || 'New Event',
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
    (eventData = {}) => {
      const organizerId = eventData.organizerId || user?.uid || user?.id || null;
      const baseEvent = normalizeEvent({
        ...eventData,
        organizerId,
        members: eventData.members || (organizerId ? [organizerId] : []),
        createdAt: new Date().toISOString(),
        joinCode: eventData.joinCode || generateJoinCode(),
      });

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
    (code, userId) => {
      if (!code || !userId) {
        return null;
      }

      const event = getEventByJoinCode(code);
      if (!event) {
        return null;
      }

      return joinEvent(event.id, userId);
    },
    [getEventByJoinCode, joinEvent],
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

  const leaveEvent = useCallback((eventId, userId) => {
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
  }, []);

  const getEventById = useCallback(
    (eventId) => events.find((event) => event.id === eventId),
    [events],
  );

  const getEventByJoinCode = useCallback(
    (code) => {
      if (!code) return null;
      const normalized = code.trim().toUpperCase();
      return (
        events.find((event) => (event.joinCode || '').toUpperCase() === normalized) || null
      );
    },
    [events],
  );

  const getUserEvents = useCallback(
    (userId) =>
      events.filter((event) =>
        (event.members || []).some((member) => member.userId === userId),
      ),
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
      joinEvent,
      joinEventWithCode,
      regenerateJoinCode,
      leaveEvent,
      getEventById,
      getEventByJoinCode,
      getUserEvents,
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
      joinEvent,
      joinEventWithCode,
      regenerateJoinCode,
      leaveEvent,
      getEventById,
      getEventByJoinCode,
      getUserEvents,
      getMembershipStatus,
      submitContactRequest,
      updateContactRequest,
    ],
  );

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
};

