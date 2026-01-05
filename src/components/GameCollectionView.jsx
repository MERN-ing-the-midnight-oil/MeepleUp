import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, useWindowDimensions, PanResponder, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import Input from './common/Input';
import GameCard from './GameCard';
import { theme } from '../utils/theme';
import { getStarRating as getStarRatingUtil } from '../utils/gameBadges';

// Ensure function exists, fallback to simple conversion if not
const getStarRating = (average) => {
  if (typeof getStarRatingUtil === 'function') {
    return getStarRatingUtil(average);
  }
  // Fallback: simple conversion from 0-10 to 0-5 stars
  if (!average || average === '' || average === '0') return 0;
  const avgNum = parseFloat(average);
  if (isNaN(avgNum) || avgNum === 0) return 0;
  const stars = (avgNum / 10) * 5;
  return Math.round(stars * 2) / 2;
};

// All game categories in order
const ALL_CATEGORIES = ['Strategy', 'Family', 'Party', 'War', 'Thematic', 'Abstract', 'Children', 'CCG', 'Other'];

// Simple Slider Component
const SimpleSlider = ({ value, onValueChange, min = 0, max = 5, step = 0.1, label, disabled = false, screenWidth }) => {
  // Use 4/6 of screen width on mobile, with a minimum of 200px
  const sliderWidth = screenWidth ? Math.max(200, (screenWidth * 4) / 6) : 200;
  const handleSize = 20;
  const maxPosition = sliderWidth - handleSize;
  
  const getPositionFromValue = (val) => {
    const clampedValue = Math.max(min, Math.min(max, val));
    const range = max - min;
    if (range === 0) return 0;
    const percentage = (clampedValue - min) / range;
    return Math.max(0, Math.min(maxPosition, percentage * maxPosition));
  };

  const getValueFromPosition = (x) => {
    const clampedX = Math.max(0, Math.min(maxPosition, x));
    const percentage = maxPosition > 0 ? clampedX / maxPosition : 0;
    const rawValue = min + (percentage * (max - min));
    const steppedValue = Math.round(rawValue / step) * step;
    return Math.max(min, Math.min(max, steppedValue));
  };

  const [position] = useState(new Animated.Value(getPositionFromValue(value)));
  const [currentValue, setCurrentValue] = useState(value);
  const startPositionRef = useRef(0);

  useEffect(() => {
    const newPosition = getPositionFromValue(value);
    position.setValue(newPosition);
    setCurrentValue(value);
  }, [value]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (evt) => {
      position.stopAnimation((val) => {
        startPositionRef.current = val;
        position.setValue(val);
      });
    },
    onPanResponderMove: (evt, gestureState) => {
      const { dx } = gestureState;
      const newPosition = Math.max(0, Math.min(maxPosition, startPositionRef.current + dx));
      const newValue = getValueFromPosition(newPosition);
      setCurrentValue(newValue);
      position.setValue(newPosition);
      if (onValueChange) {
        onValueChange(newValue);
      }
    },
    onPanResponderRelease: () => {
      position.stopAnimation((val) => {
        const clampedPosition = Math.max(0, Math.min(maxPosition, val));
        const finalValue = getValueFromPosition(clampedPosition);
        position.setValue(clampedPosition);
        setCurrentValue(finalValue);
        if (onValueChange) {
          onValueChange(finalValue);
        }
      });
    },
  }), [disabled, onValueChange, maxPosition]);

  // Generate tick marks for all increments
  const generateTickMarks = () => {
    const ticks = [];
    const numIncrements = Math.floor((max - min) / step) + 1;
    for (let i = 0; i < numIncrements; i++) {
      const val = min + i * step;
      // Round to avoid floating point errors, but don't exceed max
      const roundedVal = Math.min(Math.round(val / step) * step, max);
      if (roundedVal >= min && roundedVal <= max) {
        // Avoid duplicates
        if (ticks.length === 0 || ticks[ticks.length - 1] < roundedVal) {
          ticks.push(roundedVal);
        }
      }
    }
    // Always include max value if not already included
    if (ticks.length === 0 || Math.abs(ticks[ticks.length - 1] - max) > 0.0001) {
      ticks.push(max);
    }
    return ticks;
  };

  const tickMarks = generateTickMarks();

  return (
    <View style={styles.sliderContainer}>
      {label && <Text style={styles.sliderLabel}>{label}</Text>}
      <View style={styles.sliderTrackContainer}>
        <View style={[styles.sliderTrack, { width: sliderWidth, position: 'relative' }]}>
          {/* Tick marks */}
          <View style={[styles.sliderTicks, { width: sliderWidth }]}>
            {tickMarks.map((tick) => {
              const tickPosition = getPositionFromValue(tick);
              return (
                <View
                  key={tick}
                  style={[
                    styles.sliderTick,
                    {
                      left: tickPosition + handleSize / 2 - 1,
                    },
                  ]}
                />
              );
            })}
          </View>
          <Animated.View
            style={[
              styles.sliderHandle,
              {
                width: handleSize,
                height: handleSize,
                left: position,
              },
            ]}
            {...panResponder.panHandlers}
          />
        </View>
        {/* Labels for each increment */}
        <View style={[styles.sliderIncrementLabels, { width: sliderWidth }]}>
          {tickMarks.map((tick) => {
            const tickPosition = getPositionFromValue(tick);
            return (
              <View
                key={tick}
                style={[
                  styles.sliderIncrementLabelContainer,
                  {
                    left: tickPosition + handleSize / 2,
                    transform: [{ translateX: -10 }], // Center the label
                  },
                ]}
              >
                <Text style={styles.sliderIncrementLabel}>
                  {tick.toFixed(step < 1 ? 1 : 0)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

// Double Slider Component for Range Selection
const DoubleSlider = ({ minValue, maxValue, onMinChange, onMaxChange, min = 0, max = 11, step = 1, label, disabled = false, formatValue, screenWidth }) => {
  // Use 4/6 of screen width on mobile, with a minimum of 200px
  const sliderWidth = screenWidth ? Math.max(200, (screenWidth * 4) / 6) : 200;
  const handleSize = 20;
  const sliderMaxPosition = sliderWidth - handleSize;
  
  const getPositionFromValue = (val) => {
    const clampedValue = Math.max(min, Math.min(max, val));
    const range = max - min;
    if (range === 0) return 0;
    const percentage = (clampedValue - min) / range;
    return Math.max(0, Math.min(sliderMaxPosition, percentage * sliderMaxPosition));
  };

  const getValueFromPosition = (x) => {
    const clampedX = Math.max(0, Math.min(sliderMaxPosition, x));
    const percentage = sliderMaxPosition > 0 ? clampedX / sliderMaxPosition : 0;
    const rawValue = min + (percentage * (max - min));
    const steppedValue = Math.round(rawValue / step) * step;
    return Math.max(min, Math.min(max, steppedValue));
  };

  const formatPlayerLabel = (val) => {
    if (val >= 11) return '10+';
    return String(val);
  };

  // Use custom formatValue if provided, otherwise use formatPlayerLabel for backward compatibility
  const formatLabel = formatValue || formatPlayerLabel;

  const [minPositionAnimated] = useState(new Animated.Value(getPositionFromValue(minValue)));
  const [maxPositionAnimated] = useState(new Animated.Value(getPositionFromValue(maxValue)));
  const [currentMinValue, setCurrentMinValue] = useState(minValue);
  const [currentMaxValue, setCurrentMaxValue] = useState(maxValue);
  const minStartPositionRef = useRef(0);
  const maxStartPositionRef = useRef(0);
  const activeHandleRef = useRef(null); // 'min' or 'max' or null

  useEffect(() => {
    const newMinPos = getPositionFromValue(minValue);
    minPositionAnimated.setValue(newMinPos);
    setCurrentMinValue(minValue);
  }, [minValue]);

  useEffect(() => {
    const newMaxPos = getPositionFromValue(maxValue);
    maxPositionAnimated.setValue(newMaxPos);
    setCurrentMaxValue(maxValue);
  }, [maxValue]);

  const createPanResponder = (handleType, position, startRef, setValue, onChange) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: () => {
        activeHandleRef.current = handleType;
        position.stopAnimation((val) => {
          startRef.current = val;
          position.setValue(val);
        });
      },
      onPanResponderMove: (evt, gestureState) => {
        if (activeHandleRef.current !== handleType) return;
        const { dx } = gestureState;
        let newPosition = Math.max(0, Math.min(sliderMaxPosition, startRef.current + dx));
        
        // Ensure min doesn't exceed max and vice versa
        if (handleType === 'min') {
          maxPositionAnimated.stopAnimation((maxPos) => {
            newPosition = Math.min(newPosition, maxPos - handleSize);
            const newValue = getValueFromPosition(newPosition);
            if (newValue <= currentMaxValue) {
              setCurrentMinValue(newValue);
              position.setValue(newPosition);
              if (onChange) onChange(newValue);
            }
          });
        } else {
          minPositionAnimated.stopAnimation((minPos) => {
            newPosition = Math.max(newPosition, minPos + handleSize);
            const newValue = getValueFromPosition(newPosition);
            if (newValue >= currentMinValue) {
              setCurrentMaxValue(newValue);
              position.setValue(newPosition);
              if (onChange) onChange(newValue);
            }
          });
        }
      },
      onPanResponderRelease: () => {
        if (activeHandleRef.current === handleType) {
          position.stopAnimation((val) => {
            const clampedPosition = Math.max(0, Math.min(sliderMaxPosition, val));
            const finalValue = getValueFromPosition(clampedPosition);
            
            if (handleType === 'min' && finalValue <= currentMaxValue) {
              position.setValue(clampedPosition);
              setCurrentMinValue(finalValue);
              if (onChange) onChange(finalValue);
            } else if (handleType === 'max' && finalValue >= currentMinValue) {
              position.setValue(clampedPosition);
              setCurrentMaxValue(finalValue);
              if (onChange) onChange(finalValue);
            }
            activeHandleRef.current = null;
          });
        }
      },
    });
  };

  const minPanResponder = useMemo(() => 
    createPanResponder('min', minPositionAnimated, minStartPositionRef, setCurrentMinValue, onMinChange),
    [disabled, onMinChange, currentMaxValue]
  );

  const maxPanResponder = useMemo(() => 
    createPanResponder('max', maxPositionAnimated, maxStartPositionRef, setCurrentMaxValue, onMaxChange),
    [disabled, onMaxChange, currentMinValue]
  );

  // Generate tick marks for all increments
  const generateTickMarks = () => {
    const ticks = [];
    const numIncrements = Math.floor((max - min) / step) + 1;
    for (let i = 0; i < numIncrements; i++) {
      const val = min + i * step;
      // Round to avoid floating point errors, but don't exceed max
      const roundedVal = Math.min(Math.round(val / step) * step, max);
      if (roundedVal >= min && roundedVal <= max) {
        // Avoid duplicates
        if (ticks.length === 0 || ticks[ticks.length - 1] < roundedVal) {
          ticks.push(roundedVal);
        }
      }
    }
    // Always include max value if not already included
    if (ticks.length === 0 || Math.abs(ticks[ticks.length - 1] - max) > 0.0001) {
      ticks.push(max);
    }
    return ticks;
  };

  const tickMarks = generateTickMarks();
  
  // For play time slider (step=30, max=300, formatValue converts to hours), only show 1-hour increment labels
  const isPlayTime = step === 30 && max === 300 && formatValue;
  const labelsToShow = isPlayTime 
    ? tickMarks.filter(tick => tick % 60 === 0) // Only 1-hour increments (0, 60, 120, 180, 240, 300)
    : tickMarks;

  return (
    <View style={styles.sliderContainer}>
      {label && <Text style={styles.sliderLabel}>{label}</Text>}
      <View style={styles.sliderTrackContainer}>
        <View style={[styles.sliderTrack, { width: sliderWidth, position: 'relative' }]}>
          {/* Tick marks */}
          <View style={[styles.sliderTicks, { width: sliderWidth }]}>
            {tickMarks.map((tick) => {
              const tickPosition = getPositionFromValue(tick);
              return (
                <View
                  key={tick}
                  style={[
                    styles.sliderTick,
                    {
                      left: tickPosition + handleSize / 2 - 1,
                    },
                  ]}
                />
              );
            })}
          </View>
          {/* Active range highlight */}
          <Animated.View
            style={[
              styles.sliderActiveRange,
              {
                left: minPositionAnimated,
                width: Animated.subtract(maxPositionAnimated, minPositionAnimated),
              },
            ]}
          />
          {/* Min handle */}
          <Animated.View
            style={[
              styles.sliderHandle,
              {
                width: handleSize,
                height: handleSize,
                left: minPositionAnimated,
                zIndex: 2,
              },
            ]}
            {...minPanResponder.panHandlers}
          />
          {/* Max handle */}
          <Animated.View
            style={[
              styles.sliderHandle,
              {
                width: handleSize,
                height: handleSize,
                left: maxPositionAnimated,
                zIndex: 2,
              },
            ]}
            {...maxPanResponder.panHandlers}
          />
        </View>
        {/* Labels for increments - only show range for non-play-time sliders */}
        {!isPlayTime && (
          <View style={[styles.sliderValues, { width: sliderWidth }]}>
            <Text style={styles.sliderValueText}>{formatLabel(min)}</Text>
            <Text style={styles.sliderValueText}>
              {formatLabel(currentMinValue)} - {formatLabel(currentMaxValue)}
            </Text>
            <Text style={styles.sliderValueText}>{formatLabel(max)}</Text>
          </View>
        )}
        {/* Increment labels */}
        <View style={[styles.sliderIncrementLabels, { width: sliderWidth }]}>
          {labelsToShow.map((tick) => {
            const tickPosition = getPositionFromValue(tick);
            return (
              <View
                key={tick}
                style={[
                  styles.sliderIncrementLabelContainer,
                  {
                    left: tickPosition + handleSize / 2,
                    transform: [{ translateX: -10 }], // Center the label
                  },
                ]}
              >
                <Text style={styles.sliderIncrementLabel}>
                  {formatLabel ? formatLabel(tick) : String(tick)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const GameCollectionView = ({
  games = [],
  // Optional features
  onGamePress,
  onGameDelete,
  showMatchScores = false,
  matchScores = {},
  showOwners = false,
  ownersMap = {}, // { gameId: [ownerNames] }
  showProposals = false,
  userProposals = new Set(),
  onProposeGame,
  userProposalLimit = 5,
  // Display options
  usePagination = false,
  itemsPerPage = 20,
  renderInScrollView = true,
  // Styling
  containerStyle,
  headerTitle,
  headerComponent, // Optional component to render above games (e.g., menu)
  showSearch = true,
}) => {
  console.log('[GameCollectionView] Component rendering', {
    gamesCount: Array.isArray(games) ? games.length : 0,
    showMatchScores,
    showOwners,
    usePagination,
    showSearch,
    hasHeaderComponent: !!headerComponent,
    headerTitle,
  });

  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { collections, getUserCollection } = useCollections();
  const userId = user?.uid || user?.id;
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [browseAllMode, setBrowseAllMode] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const scrollViewRef = useRef(null);
  const flatListRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const resultsContainerY = useRef(0);
  
  // Pagination state
  const [displayedGamesCount, setDisplayedGamesCount] = useState(50); // Start with 50 games
  const GAMES_PER_PAGE = 50; // Load 50 more games at a time
  
  // Count user's favorited games
  const favoritedGamesCount = useMemo(() => {
    if (!userId) return 0;
    const userCollection = getUserCollection ? getUserCollection(userId) : (collections[userId] || []);
    if (!Array.isArray(userCollection)) return 0;
    return userCollection.filter(game => game.isFavorite === true).length;
  }, [userId, collections, getUserCollection]);

  // Filter state
  const [selectedCategories, setSelectedCategories] = useState([]); // Array of selected category names
  const [selectedOwners, setSelectedOwners] = useState([]); // Array of selected owner names
  const [minPlayers, setMinPlayers] = useState(1); // Minimum player count (1-10, where 10 = 10+)
  const [maxPlayers, setMaxPlayers] = useState(10); // Maximum player count (1-10, where 10 = 10+)
  const [minBggRating, setMinBggRating] = useState(0); // Minimum BGG rating (0-10)
  const [minMatchRating, setMinMatchRating] = useState(0); // Minimum match rating (0-1000)
  const [minPlayTime, setMinPlayTime] = useState(0); // Minimum play time in minutes (0-300)
  const [maxPlayTime, setMaxPlayTime] = useState(300); // Maximum play time in minutes (0-300)

  // Get unique owners from games
  const uniqueOwners = useMemo(() => {
    if (!showOwners || !Array.isArray(games) || games.length === 0) return [];
    const ownerSet = new Set();
    games.forEach(game => {
      const gameId = String(game.bggId || game.id);
      const owners = ownersMap[gameId] || [];
      owners.forEach(owner => {
        if (owner) ownerSet.add(owner);
      });
    });
    return Array.from(ownerSet).sort();
  }, [games, ownersMap, showOwners]);

  // Enrich games with category data
  const enrichedGames = useMemo(() => {
    console.log('[GameCollectionView] enrichingGames useMemo running', { gamesCount: Array.isArray(games) ? games.length : 0 });
    if (!Array.isArray(games) || games.length === 0) {
      console.log('[GameCollectionView] No games to enrich');
      return [];
    }
    
    const enriched = games.map(game => {
      // Helper to get ALL categories from rank fields
      const getCategoriesFromRanks = (data) => {
        if (!data) return ['Other'];
        const categories = [];
        if (data.strategyGamesRank !== undefined && data.strategyGamesRank !== '') categories.push('Strategy');
        if (data.familyGamesRank !== undefined && data.familyGamesRank !== '') categories.push('Family');
        if (data.partyGamesRank !== undefined && data.partyGamesRank !== '') categories.push('Party');
        if (data.wargamesRank !== undefined && data.wargamesRank !== '') categories.push('War');
        if (data.thematicRank !== undefined && data.thematicRank !== '') categories.push('Thematic');
        if (data.abstractsRank !== undefined && data.abstractsRank !== '') categories.push('Abstract');
        if (data.childrensGamesRank !== undefined && data.childrensGamesRank !== '') categories.push('Children');
        if (data.cgsRank !== undefined && data.cgsRank !== '') categories.push('CCG');
        return categories.length > 0 ? categories : ['Other'];
      };
      
      const hasCategoryRanks = game.strategyGamesRank !== undefined || game.familyGamesRank !== undefined || game.partyGamesRank !== undefined;
      const effectiveBggData = hasCategoryRanks ? game : null;
      
      if (effectiveBggData) {
        const categories = getCategoriesFromRanks(effectiveBggData);
        
        return {
          ...game,
          _categories: categories,
        };
      }
      
      return {
        ...game,
        _categories: ['Other'],
      };
    });
    
    console.log('[GameCollectionView] enrichedGames complete', { count: enriched.length });
    return enriched;
  }, [games]);

  // Filter games based on all filters
  const filteredGames = useMemo(() => {
    console.log('[GameCollectionView] filteredGames useMemo running', {
      enrichedGamesCount: Array.isArray(enrichedGames) ? enrichedGames.length : 0,
      searchQuery,
      selectedCategoriesCount: selectedCategories.length,
      selectedOwnersCount: selectedOwners.length,
      minPlayers,
      maxPlayers,
      minBggRating,
      minMatchRating,
      minPlayTime,
      maxPlayTime,
    });
    
    if (!Array.isArray(enrichedGames) || enrichedGames.length === 0) {
      console.log('[GameCollectionView] No enriched games to filter');
      return [];
    }
    
    let filtered = enrichedGames;

    // If in browse all mode, skip all filters and just sort by rank
    if (browseAllMode) {
      filtered = filtered.sort((a, b) => {
        const rankA = parseInt(a.rank || '999999') || 999999;
        const rankB = parseInt(b.rank || '999999') || 999999;
        return rankA - rankB; // Ascending order (lower rank = better)
      });
      console.log('[GameCollectionView] Browse all mode - showing all games sorted by rank', { 
        count: filtered.length 
      });
      return filtered;
    }

    // Search query filter - keyword search that omits common words
    if (searchQuery.trim()) {
      // Common stop words to omit from search
      const stopWords = new Set([
        'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
        'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
        'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
        'had', 'what', 'said', 'each', 'which', 'their', 'if', 'up', 'out',
        'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make',
        'like', 'into', 'him', 'has', 'two', 'more', 'very', 'after', 'words',
        'long', 'than', 'first', 'been', 'call', 'who', 'oil', 'sit', 'now',
        'find', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part'
      ]);
      
      // Split query into words, normalize, and filter out stop words
      const queryWords = searchQuery
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 0 && !stopWords.has(word));
      
      // If all words were stop words, use the original query
      const searchKeywords = queryWords.length > 0 ? queryWords : [searchQuery.toLowerCase().trim()];
      
      filtered = filtered.filter(game => {
        // Get title from multiple possible fields
        const title = (game.title || game.name || '').toLowerCase().trim();
        if (!title) return false;
        
        // Normalize whitespace in title for comparison
        const normalizedTitle = title.replace(/\s+/g, ' ');
        
        // Check if all keywords are found in the title
        // This allows "Settlers" to match "Settlers of Catan"
        return searchKeywords.every(keyword => normalizedTitle.includes(keyword));
      });
    }

    // Category filter - games must belong to ALL selected categories (AND logic)
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(game => {
        const gameCategories = game._categories || ['Other'];
        // Check that ALL selected categories are in the game's categories
        return selectedCategories.every(selectedCat => gameCategories.includes(selectedCat));
      });
    }

    // Owner filter
    if (selectedOwners.length > 0 && showOwners) {
      filtered = filtered.filter(game => {
        const gameId = String(game.bggId || game.id);
        const owners = ownersMap[gameId] || [];
        return selectedOwners.some(owner => owners.includes(owner));
      });
    }

    // Player count filter (range)
    if (minPlayers > 1 || maxPlayers < 10) {
      filtered = filtered.filter(game => {
        const gameMinPlayers = game.minPlayers || 1;
        const gameMaxPlayers = game.maxPlayers || 999;
        // Check if game's player range overlaps with filter range
        // Game is included if its range overlaps with [minPlayers, maxPlayers]
        // For maxPlayers = 10 (10+), treat as 10+
        const filterMax = maxPlayers >= 10 ? 999 : maxPlayers;
        return gameMinPlayers <= filterMax && gameMaxPlayers >= minPlayers;
      });
    }

    // BGG rating filter
    if (minBggRating > 0) {
      filtered = filtered.filter(game => {
        const rating = parseFloat(game.average || game.bggRating || 0);
        return rating >= minBggRating;
      });
    }

    // Match rating filter
    if (minMatchRating > 0 && showMatchScores) {
      filtered = filtered.filter(game => {
        const gameId = String(game.bggId || game.id);
        const matchScore = matchScores[gameId] || 0;
        return matchScore >= minMatchRating;
      });
    }

    // Play time filter (range with overlap check)
    if (minPlayTime > 0 || maxPlayTime < 300) {
      filtered = filtered.filter(game => {
        // Get game's play time range (if available) or single value
        const gameMinTime = game.minPlayTime || game.playingTime || null;
        const gameMaxTime = game.maxPlayTime || game.playingTime || null;
        
        if (!gameMinTime && !gameMaxTime) return true; // Include games without play time data
        
        // Check if game's play time range overlaps with filter range
        // Two ranges overlap if: gameMinTime <= filterMaxTime AND gameMaxTime >= filterMinTime
        const gameMin = gameMinTime || 0;
        const gameMax = gameMaxTime || 300;
        
        return gameMin <= maxPlayTime && gameMax >= minPlayTime;
      });
    }

    console.log('[GameCollectionView] filteredGames complete', { 
      originalCount: enrichedGames.length,
      filteredCount: filtered.length,
      browseAllMode,
      sortedByRank: browseAllMode
    });
    return filtered;
  }, [enrichedGames, searchQuery, selectedCategories, selectedOwners, minPlayers, maxPlayers, minBggRating, minMatchRating, minPlayTime, maxPlayTime, showOwners, ownersMap, showMatchScores, matchScores, browseAllMode]);


  // Toggle category selection
  const toggleCategory = useCallback((category) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  }, []);

  // Toggle owner selection
  const toggleOwner = useCallback((owner) => {
    setSelectedOwners(prev => {
      if (prev.includes(owner)) {
        return prev.filter(o => o !== owner);
      } else {
        return [...prev, owner];
      }
    });
  }, []);


  // Reset filters
  const resetFilters = useCallback(() => {
    setSelectedCategories([]);
    setSelectedOwners([]);
    setMinPlayers(1);
    setMaxPlayers(10);
    setMinBggRating(0);
    setMinMatchRating(0);
    setMinPlayTime(0);
    setMaxPlayTime(300);
    setShowResults(false);
    setBrowseAllMode(false);
    setSearchQuery('');
    setDisplayedGamesCount(50); // Reset pagination when filters reset
  }, []);

  // Handle browse all games
  const handleBrowseAll = useCallback(() => {
    setSearchQuery('');
    setSelectedCategories([]);
    setSelectedOwners([]);
    setMinPlayers(1);
    setMaxPlayers(10);
    setMinBggRating(0);
    setMinMatchRating(0);
    setMinPlayTime(0);
    setMaxPlayTime(300);
    setBrowseAllMode(true);
    setShowResults(true);
    setDisplayedGamesCount(50); // Reset pagination when browsing all
  }, []);
  
  // Scroll to results when browseAllMode is activated
  useEffect(() => {
    if (browseAllMode && showResults && resultsContainerY.current > 0 && scrollViewRef.current) {
      // Wait for layout to complete, then scroll
      const timer = setTimeout(() => {
        if (scrollViewRef.current && resultsContainerY.current > 0) {
          scrollViewRef.current.scrollTo({
            y: resultsContainerY.current - 20, // Small offset for better visibility
            animated: true,
          });
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [browseAllMode, showResults]);

  // Handle scroll to show/hide back to top button
  const handleScroll = useCallback((event) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    // Show button when scrolled down more than 300px
    setShowBackToTop(scrollY > 300);
  }, []);

  // Scroll to top of games (results container) or absolute top if no results
  const scrollToTop = useCallback(() => {
    if (scrollViewRef.current) {
      // If results are shown and we have the position, scroll to results container
      // Otherwise scroll to absolute top
      if (showResults && resultsContainerY.current > 0) {
        scrollViewRef.current.scrollTo({
          y: resultsContainerY.current - 20, // Small offset for better visibility
          animated: true,
        });
      } else {
        scrollViewRef.current.scrollTo({
          y: 0,
          animated: true,
        });
      }
    }
  }, [showResults]);
  
  // Get paginated games (only show first N games)
  const paginatedGames = useMemo(() => {
    return filteredGames.slice(0, displayedGamesCount);
  }, [filteredGames, displayedGamesCount]);
  
  // Check if there are more games to load
  const hasMoreGames = filteredGames.length > displayedGamesCount;
  
  // Load more games
  const loadMoreGames = useCallback(() => {
    setDisplayedGamesCount(prev => prev + GAMES_PER_PAGE);
  }, []);
  
  // Reset pagination when filters change or results are shown
  useEffect(() => {
    if (showResults) {
      setDisplayedGamesCount(50); // Reset to first page when showing results
    }
  }, [showResults, searchQuery, selectedCategories, selectedOwners, minPlayers, maxPlayers, minBggRating, minMatchRating, minPlayTime, maxPlayTime, browseAllMode]);

  // Render filter chip/pill
  const renderChip = useCallback((label, isSelected, onPress, count = null) => {
    return (
      <Pressable
        key={label}
        style={[styles.chip, isSelected && styles.chipSelected]}
        onPress={onPress}
      >
        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
          {label}{count !== null ? ` (${count})` : ''}
        </Text>
      </Pressable>
    );
  }, []);

  // Render game card
  const renderGameCard = useCallback((game, index) => {
    const gameId = game.bggId || game.id;
    const matchScore = showMatchScores ? matchScores[gameId] : undefined;
    
    // Calculate card width for grid
    const numColumns = 3;
    const containerPadding = theme.spacing.md;
    const gap = theme.spacing.md;
    const rowPadding = theme.spacing.xs * 2;
    const totalPadding = containerPadding * 2 + rowPadding;
    const totalGaps = gap * (numColumns - 1);
    const availableWidth = width - totalPadding - totalGaps;
    const cardWidthPixels = availableWidth / numColumns;
    
    // Use _bggData if available, otherwise use the game object itself since enriched games
    // have all BGG data merged directly into them
    const preloadedBggData = game._bggData || game;
    
    return (
      <View key={gameId || `game-${index}`} style={styles.gameCardWrapper}>
        <View style={{ width: cardWidthPixels }}>
          <Pressable onPress={() => onGamePress?.(game)}>
            <GameCard 
              game={game} 
              onDelete={onGameDelete}
              preloadedBggData={preloadedBggData}
              inGrid={true}
              disableModal={!!onGamePress}
            />
          </Pressable>
        </View>
        {showMatchScores && matchScore !== undefined && matchScore !== null && (
          <View style={styles.matchScoreBadge}>
            <Text style={styles.matchScoreIcon}>💘</Text>
            <Text style={styles.matchScoreText}>
              {typeof matchScore === 'object' ? JSON.stringify(matchScore) : String(Math.round(Number(matchScore) || 0))}
            </Text>
          </View>
        )}
      </View>
    );
  }, [showMatchScores, matchScores, onGameDelete, onGamePress, width]);

  // Render games grid
  const renderGamesGrid = useCallback((gamesToRender) => {
    return (
      <View style={styles.gamesGrid}>
        {gamesToRender.map((game, index) => renderGameCard(game, index))}
      </View>
    );
  }, [renderGameCard]);

  // Render list item for FlatList
  const renderListItem = useCallback(({ item }) => {
    const gameId = item.bggId || item.id;
    const matchScore = showMatchScores ? matchScores[gameId] : undefined;
    
    const numColumns = 3;
    const containerPadding = theme.spacing.md;
    const gap = theme.spacing.md;
    const rowPadding = theme.spacing.xs * 2;
    const totalPadding = containerPadding * 2 + rowPadding;
    const totalGaps = gap * (numColumns - 1);
    const availableWidth = width - totalPadding - totalGaps;
    const cardWidthPixels = availableWidth / numColumns;
    
    // Use _bggData if available, otherwise use the game object itself since enriched games
    // have all BGG data merged directly into them
    const preloadedBggData = item._bggData || item;
    
    return (
      <Pressable onPress={() => onGamePress?.(item)} style={{ width: cardWidthPixels }}>
        <GameCard 
          game={item} 
          onDelete={onGameDelete}
          preloadedBggData={preloadedBggData}
          inGrid={true}
        />
      </Pressable>
    );
  }, [showMatchScores, matchScores, onGameDelete, onGamePress, width]);

  console.log('[GameCollectionView] About to render', {
    showResults,
    filteredGamesCount: filteredGames.length,
    hasHeaderComponent: !!headerComponent,
  });

  useEffect(() => {
    console.log('[GameCollectionView] useEffect - component mounted/updated', {
      gamesCount: games.length,
      enrichedGamesCount: enrichedGames.length,
      filteredGamesCount: filteredGames.length,
    });
  }, [games.length, enrichedGames.length, filteredGames.length]);

  return (
    <View style={[styles.container, containerStyle]}>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.mainScrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {headerComponent && (() => {
          console.log('[GameCollectionView] Rendering headerComponent');
          try {
            return headerComponent;
          } catch (error) {
            console.error('[GameCollectionView] Error rendering headerComponent:', error);
            return null;
          }
        })()}
        {headerTitle && <Text style={styles.headerTitle}>{headerTitle}</Text>}
        
        {/* Search Input */}
        {showSearch && (
          <>
            <View style={styles.searchContainer}>
              <Input
                placeholder="Search By Title"
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  setBrowseAllMode(false); // Clear browse all mode when searching
                }}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => {
                  // Search is already happening in real-time, but this allows Enter key to confirm
                }}
              />
              <Pressable
                style={styles.searchButton}
                onPress={() => {
                  // Search is already happening in real-time, but this provides visual confirmation
                  // Could also be used to focus results or scroll to them
                }}
              >
                <Text style={styles.searchButtonText}>Search</Text>
              </Pressable>
            </View>
            <View style={styles.browseAllButtonContainer}>
              <Pressable
                style={[styles.browseAllButton, browseAllMode && styles.browseAllButtonActive]}
                onPress={handleBrowseAll}
              >
                <Text style={[styles.browseAllButtonText, browseAllMode && styles.browseAllButtonTextActive]}>
                  Browse All My Games
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Filter Panel */}
        <View style={styles.filterPanel}>
        <Text style={styles.filterPanelTitle}>Filters</Text>
        
        {/* Category Chips */}
        <View style={styles.filterSection}>
          <Text style={styles.filterSectionLabel}>Category</Text>
          <View style={styles.chipsContainer}>
            {ALL_CATEGORIES.map(category => {
              const isSelected = selectedCategories.includes(category);
              return renderChip(
                category,
                isSelected,
                () => toggleCategory(category)
              );
            })}
          </View>
        </View>

        {/* Owner Chips */}
        {showOwners && uniqueOwners.length > 0 && (
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionLabel}>Owner</Text>
            <View style={styles.chipsContainer}>
              {uniqueOwners.map(owner => {
                const isSelected = selectedOwners.includes(owner);
                return renderChip(
                  owner,
                  isSelected,
                  () => toggleOwner(owner)
                );
              })}
            </View>
          </View>
        )}

        {/* Player Count Double Slider */}
        <View style={styles.filterSection}>
          <DoubleSlider
            label="Number of Players Best Played With"
            minValue={minPlayers}
            maxValue={maxPlayers}
            onMinChange={setMinPlayers}
            onMaxChange={setMaxPlayers}
            min={1}
            max={10}
            step={1}
            formatValue={(val) => val >= 10 ? '10+' : String(val)}
            screenWidth={width}
          />
        </View>

        {/* BGG Rating Slider */}
        <View style={styles.filterSection}>
          <SimpleSlider
            label="Minimum Board Game Geek Rating"
            value={minBggRating}
            onValueChange={setMinBggRating}
            min={0}
            max={10}
            step={1.25}
            screenWidth={width}
          />
        </View>

        {/* Match Rating Slider */}
        {showMatchScores && favoritedGamesCount >= 8 && (
          <View style={styles.filterSection}>
            <SimpleSlider
              label="Minimum Beeple Rating"
              value={minMatchRating}
              onValueChange={setMinMatchRating}
              min={0}
              max={1000}
              step={1}
            screenWidth={width}
            />
          </View>
        )}
        
        {/* Match Rating Placeholder */}
        {showMatchScores && favoritedGamesCount < 8 && (
          <View style={styles.filterSection}>
            <Pressable 
              style={styles.placeholderContainer}
              onPress={() => navigation.navigate('Collection')}
            >
              <Text style={styles.placeholderText}>
                "Heart" at least 8 games to unlock beeple match ratings
              </Text>
            </Pressable>
          </View>
        )}

        {/* Play Time Double Slider */}
        <View style={styles.filterSection}>
          <DoubleSlider
            label="Play Time"
            minValue={minPlayTime}
            maxValue={maxPlayTime}
            onMinChange={setMinPlayTime}
            onMaxChange={setMaxPlayTime}
            min={0}
            max={300}
            step={30}
            formatValue={(val) => {
              const hours = val / 60;
              // Format hours: whole numbers show 1 decimal (1.0), fractions show up to 2 decimals (0.5, 0.75)
              // Remove trailing zeros after decimal point, but keep .0 for whole numbers
              let formatted;
              if (hours % 1 === 0) {
                formatted = hours.toFixed(1);
              } else {
                formatted = hours.toFixed(2).replace(/\.?0+$/, '');
              }
              return `${formatted} hr`;
            }}
            screenWidth={width}
          />
        </View>

        {/* Results Count and Actions */}
        <View style={styles.filterActions}>
          <Text style={styles.resultsCount}>
            {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''} found out of {enrichedGames.length} game{enrichedGames.length !== 1 ? 's' : ''}
          </Text>
          <View style={styles.filterButtons}>
            <Pressable
              style={[styles.filterButton, styles.resetButton]}
              onPress={resetFilters}
            >
              <Text style={styles.resetButtonText}>Reset</Text>
            </Pressable>
            <Pressable
              style={[styles.filterButton, styles.seeResultsButton, filteredGames.length === 0 && styles.seeResultsButtonDisabled]}
              onPress={() => setShowResults(true)}
              disabled={filteredGames.length === 0}
            >
              <Text style={[styles.seeResultsButtonText, filteredGames.length === 0 && styles.seeResultsButtonTextDisabled]}>
                See Results
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

        {/* Results Display */}
        {showResults && filteredGames.length > 0 && (
          <View 
            ref={resultsContainerRef}
            onLayout={(event) => {
              const { y } = event.nativeEvent.layout;
              resultsContainerY.current = y;
            }}
            style={styles.resultsContainer}
          >
            {/* Pagination info */}
            {filteredGames.length > GAMES_PER_PAGE && (
              <View style={styles.paginationHeader}>
                <Text style={styles.paginationInfo}>
                  Showing {paginatedGames.length.toLocaleString()} of {filteredGames.length.toLocaleString()} games
                </Text>
              </View>
            )}
            
            {/* Games Grid - only render paginated games */}
            <View style={styles.gamesGrid}>
              {paginatedGames.map((game, index) => renderGameCard(game, index))}
            </View>
            
            {/* Load More Button */}
            {hasMoreGames && (
              <View style={styles.loadMoreContainer}>
                <Pressable style={styles.loadMoreButton} onPress={loadMoreGames}>
                  <Text style={styles.loadMoreButtonText}>
                    Load More ({Math.min(GAMES_PER_PAGE, filteredGames.length - displayedGamesCount).toLocaleString()} more games)
                  </Text>
                </Pressable>
              </View>
            )}
            
            {/* All games loaded indicator */}
            {!hasMoreGames && filteredGames.length > GAMES_PER_PAGE && (
              <View style={styles.loadMoreContainer}>
                <Text style={styles.paginationInfo}>
                  All {filteredGames.length.toLocaleString()} games displayed
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Empty State */}
        {showResults && filteredGames.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No games match your filters</Text>
            <Pressable style={styles.resetButton} onPress={resetFilters}>
              <Text style={styles.resetButtonText}>Reset Filters</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      
      {/* Back to Top Button */}
      {showBackToTop && (
        <Pressable
          style={styles.backToTopButton}
          onPress={scrollToTop}
        >
          <Text style={styles.backToTopButtonText}>↑</Text>
          <Text style={styles.backToTopButtonLabel}>Top</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  searchContainer: {
    marginBottom: theme.spacing.md,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: theme.colors.meepleRed,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    fontWeight: theme.typography.fontWeight.medium,
  },
  searchButton: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  browseAllButtonContainer: {
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  browseAllButton: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: '33.333%',
    minWidth: 120,
  },
  browseAllButtonActive: {
    backgroundColor: theme.colors.meepleRed,
    opacity: 0.9,
  },
  browseAllButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  browseAllButtonTextActive: {
    color: '#fff',
  },
  filterPanel: {
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  filterPanelTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  filterSection: {
    marginBottom: theme.spacing.lg,
  },
  filterSectionLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.woodLight,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  chipSelected: {
    backgroundColor: theme.colors.meepleRed,
    borderColor: theme.colors.meepleRed,
  },
  chipText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  sliderContainer: {
    marginVertical: theme.spacing.sm,
  },
  sliderLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  sliderTrackContainer: {
    alignItems: 'center',
  },
  sliderTrack: {
    height: 6,
    backgroundColor: theme.colors.woodMedium,
    borderRadius: 3,
    position: 'relative',
    marginBottom: theme.spacing.xs,
  },
  sliderActiveRange: {
    height: 6,
    backgroundColor: theme.colors.meepleRed,
    borderRadius: 3,
    position: 'absolute',
    top: 0,
    opacity: 0.5,
  },
  sliderHandle: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: 10,
    position: 'absolute',
    top: -7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  sliderTicks: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
  },
  sliderTick: {
    position: 'absolute',
    top: -4,
    width: 1,
    height: 16,
    backgroundColor: theme.colors.woodDark,
  },
  sliderIncrementLabels: {
    position: 'relative',
    height: 20,
    marginTop: theme.spacing.xs,
  },
  sliderIncrementLabelContainer: {
    position: 'absolute',
    top: 0,
    width: 20,
    alignItems: 'center',
  },
  sliderIncrementLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  sliderValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',

  },
  sliderValueText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  filterActions: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
  },
  resultsCount: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  filterButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  filterButton: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    minWidth: 120,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: theme.colors.woodLight,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  resetButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  seeResultsButton: {
    backgroundColor: theme.colors.meepleRed,
  },
  seeResultsButtonDisabled: {
    backgroundColor: theme.colors.woodMedium,
    opacity: 0.5,
  },
  seeResultsButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  seeResultsButtonTextDisabled: {
    color: theme.colors.textSecondary,
  },
  resultsContainer: {
    marginTop: theme.spacing.md,
  },
  gamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  gameCardWrapper: {
    width: '32%',
    marginBottom: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  matchScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.woodLight,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 183, 156, 0.5)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201, 183, 156, 0.5)',
  },
  matchScoreIcon: {
    fontSize: 18,
    marginRight: 4,
  },
  matchScoreText: {
    fontSize: 12,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  listContainer: {
    paddingBottom: 10,
    paddingHorizontal: theme.spacing.md,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  placeholderContainer: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  paginationHeader: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  paginationInfo: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  loadMoreContainer: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
  },
  loadMoreButton: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  loadMoreButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  backToTopButton: {
    position: 'absolute',
    bottom: theme.spacing.xl,
    right: theme.spacing.lg,
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 1000,
  },
  backToTopButtonText: {
    fontSize: 24,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
    lineHeight: 24,
  },
  backToTopButtonLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
    marginTop: -2,
  },
});

export default GameCollectionView;
