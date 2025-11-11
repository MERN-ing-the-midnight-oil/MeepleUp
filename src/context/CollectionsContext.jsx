import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const CollectionsContext = createContext();

export const useCollections = () => {
  const context = useContext(CollectionsContext);
  if (!context) {
    throw new Error('useCollections must be used within a CollectionsProvider');
  }
  return context;
};

export const CollectionsProvider = ({ children }) => {
  const { user } = useAuth();
  const [collections, setCollections] = useState({}); // { userId: [games] }
  const [loading, setLoading] = useState(false);

  // Load collections from AsyncStorage on mount
  useEffect(() => {
    const loadCollections = async () => {
      try {
        const storedCollections = await AsyncStorage.getItem('meepleup_collections');
        if (storedCollections) {
          setCollections(JSON.parse(storedCollections));
        }
      } catch (error) {
        console.error('Error loading collections:', error);
      }
    };
    loadCollections();
  }, []);

  // Save collections to AsyncStorage whenever they change
  useEffect(() => {
    const saveCollections = async () => {
      try {
        await AsyncStorage.setItem('meepleup_collections', JSON.stringify(collections));
      } catch (error) {
        console.error('Error saving collections:', error);
      }
    };
    saveCollections();
  }, [collections]);

  const addGameToCollection = (userId, gameData) => {
    if (!userId) return;
    setCollections((prev) => ({
      ...prev,
      [userId]: [...(prev[userId] || []), gameData],
    }));
  };

  const removeGameFromCollection = (userId, gameId) => {
    if (!userId) return;
    setCollections((prev) => ({
      ...prev,
      [userId]: (prev[userId] || []).filter((game) => game.id !== gameId),
    }));
  };

  const getUserCollection = (userId) => {
    if (!userId) return [];
    return collections[userId] || [];
  };

  const getEventCollection = (eventMembers) => {
    // Get all games from all members of an event
    const allGames = [];
    eventMembers.forEach((memberId) => {
      const memberGames = getUserCollection(memberId);
      allGames.push(...memberGames);
    });
    // Remove duplicates based on game ID
    const uniqueGames = allGames.reduce((acc, game) => {
      if (!acc.find((g) => g.id === game.id)) {
        acc.push(game);
      }
      return acc;
    }, []);
    return uniqueGames;
  };

  const updateGameInCollection = (userId, gameId, updates) => {
    if (!userId) return;
    setCollections((prev) => ({
      ...prev,
      [userId]: (prev[userId] || []).map((game) =>
        game.id === gameId ? { ...game, ...updates } : game
      ),
    }));
  };

  const value = {
    collections,
    addGameToCollection,
    removeGameFromCollection,
    getUserCollection,
    getEventCollection,
    updateGameInCollection,
    loading,
  };

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
};

