import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const EventsContext = createContext();

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
  const [loading, setLoading] = useState(false);

  // Load events from AsyncStorage on mount
  useEffect(() => {
    const loadEvents = async () => {
      try {
        const storedEvents = await AsyncStorage.getItem('meepleup_events');
        if (storedEvents) {
          setEvents(JSON.parse(storedEvents));
        }
      } catch (error) {
        console.error('Error loading events:', error);
      }
    };
    loadEvents();
  }, []);

  // Save events to AsyncStorage whenever they change
  useEffect(() => {
    const saveEvents = async () => {
      try {
        if (events.length > 0) {
          await AsyncStorage.setItem('meepleup_events', JSON.stringify(events));
        }
      } catch (error) {
        console.error('Error saving events:', error);
      }
    };
    saveEvents();
  }, [events]);

  const createEvent = (eventData = {}) => {
    const organizerId = eventData.organizerId || user?.id;
    const members = eventData.members || (organizerId ? [organizerId] : []);

    const newEvent = {
      id: Date.now().toString(),
      ...eventData,
      createdAt: new Date().toISOString(),
      members,
      organizerId,
    };

    setEvents((prev) => [...prev, newEvent]);
    return newEvent;
  };

  const updateEvent = (eventId, updates) => {
    setEvents((prev) =>
      prev.map((event) =>
        event.id === eventId ? { ...event, ...updates } : event
      )
    );
  };

  const deleteEvent = (eventId) => {
    setEvents((prev) => prev.filter((event) => event.id !== eventId));
  };

  const joinEvent = (eventId, userId) => {
    setEvents((prev) =>
      prev.map((event) =>
        event.id === eventId
          ? {
              ...event,
              members: [...(event.members || []), userId],
            }
          : event
      )
    );
  };

  const leaveEvent = (eventId, userId) => {
    setEvents((prev) =>
      prev.map((event) =>
        event.id === eventId
          ? {
              ...event,
              members: (event.members || []).filter((id) => id !== userId),
            }
          : event
      )
    );
  };

  const getEventById = (eventId) => {
    return events.find((event) => event.id === eventId);
  };

  const getUserEvents = (userId) => {
    return events.filter((event) =>
      (event.members || []).includes(userId)
    );
  };

  const value = {
    events,
    createEvent,
    updateEvent,
    deleteEvent,
    joinEvent,
    leaveEvent,
    getEventById,
    getUserEvents,
    loading,
  };

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
};

