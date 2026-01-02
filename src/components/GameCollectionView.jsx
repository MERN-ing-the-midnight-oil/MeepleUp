import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, useWindowDimensions, PanResponder, Animated } from 'react-native';
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
const SimpleSlider = ({ value, onValueChange, min = 0, max = 5, step = 0.1, label, disabled = false }) => {
  const sliderWidth = 200;
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

  return (
    <View style={styles.sliderContainer}>
      {label && <Text style={styles.sliderLabel}>{label}</Text>}
      <View style={styles.sliderTrackContainer}>
        <View style={[styles.sliderTrack, { width: sliderWidth }]}>
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
        <View style={styles.sliderValues}>
          <Text style={styles.sliderValueText}>{min}</Text>
          <Text style={styles.sliderValueText}>{currentValue.toFixed(step < 1 ? 1 : 0)}</Text>
          <Text style={styles.sliderValueText}>{max}</Text>
        </View>
      </View>
    </View>
  );
};

// Double Slider Component for Range Selection
const DoubleSlider = ({ minValue, maxValue, onMinChange, onMaxChange, min = 0, max = 11, step = 1, label, disabled = false }) => {
  const sliderWidth = 200;
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

  return (
    <View style={styles.sliderContainer}>
      {label && <Text style={styles.sliderLabel}>{label}</Text>}
      <View style={styles.sliderTrackContainer}>
        <View style={[styles.sliderTrack, { width: sliderWidth }]}>
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
        <View style={styles.sliderValues}>
          <Text style={styles.sliderValueText}>{formatPlayerLabel(min)}</Text>
          <Text style={styles.sliderValueText}>
            {formatPlayerLabel(currentMinValue)} - {formatPlayerLabel(currentMaxValue)}
          </Text>
          <Text style={styles.sliderValueText}>{formatPlayerLabel(max)}</Text>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const scrollViewRef = useRef(null);
  const flatListRef = useRef(null);

  // Filter state
  const [selectedCategories, setSelectedCategories] = useState([]); // Array of selected category names
  const [selectedOwners, setSelectedOwners] = useState([]); // Array of selected owner names
  const [minPlayers, setMinPlayers] = useState(1); // Minimum player count (1-11, where 11 = 10+)
  const [maxPlayers, setMaxPlayers] = useState(11); // Maximum player count (1-11, where 11 = 10+)
  const [minStarRating, setMinStarRating] = useState(0); // Minimum star rating (0-5)
  const [minMatchRating, setMinMatchRating] = useState(0); // Minimum match rating (0-100)
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
      // Helper to get category from rank fields
      const getCategoryFromRanks = (data) => {
        if (!data) return 'Other';
        return data.strategyGamesRank ? 'Strategy' :
               data.familyGamesRank ? 'Family' :
               data.partyGamesRank ? 'Party' :
               data.wargamesRank ? 'War' :
               data.thematicRank ? 'Thematic' :
               data.abstractsRank ? 'Abstract' :
               data.childrensGamesRank ? 'Children' :
               data.cgsRank ? 'CCG' : 'Other';
      };
      
      const hasCategoryRanks = game.strategyGamesRank !== undefined || game.familyGamesRank !== undefined || game.partyGamesRank !== undefined;
      const effectiveBggData = hasCategoryRanks ? game : null;
      
      if (effectiveBggData) {
        const rating = effectiveBggData.average 
          ? getStarRating(effectiveBggData.average) 
          : (game.bggRating ? getStarRating(game.bggRating) : 0);
        const primaryCategory = getCategoryFromRanks(effectiveBggData);
        
        return {
          ...game,
          _rating: rating,
          _primaryCategory: primaryCategory,
        };
      }
      
      return {
        ...game,
        _rating: game.bggRating ? getStarRating(game.bggRating) : 0,
        _primaryCategory: 'Other',
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
      minStarRating,
      minMatchRating,
      maxPlayTime,
    });
    
    if (!Array.isArray(enrichedGames) || enrichedGames.length === 0) {
      console.log('[GameCollectionView] No enriched games to filter');
      return [];
    }
    
    let filtered = enrichedGames;

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(game => {
        const title = (game.title || game.name || '').toLowerCase();
        return title.includes(query);
      });
    }

    // Category filter
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(game => {
        const category = game._primaryCategory || 'Other';
        return selectedCategories.includes(category);
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
    if (minPlayers > 1 || maxPlayers < 11) {
      filtered = filtered.filter(game => {
        const gameMinPlayers = game.minPlayers || 1;
        const gameMaxPlayers = game.maxPlayers || 999;
        // Check if game's player range overlaps with filter range
        // Game is included if its range overlaps with [minPlayers, maxPlayers]
        // For maxPlayers = 11 (10+), treat as 10+
        const filterMax = maxPlayers >= 11 ? 999 : maxPlayers;
        return gameMinPlayers <= filterMax && gameMaxPlayers >= minPlayers;
      });
    }

    // Star rating filter
    if (minStarRating > 0) {
      filtered = filtered.filter(game => {
        const rating = game._rating || 0;
        return rating >= minStarRating;
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

    // Play time filter
    if (maxPlayTime < 300) {
      filtered = filtered.filter(game => {
        const playTime = game.playingTime || game.maxPlayTime || 999;
        return playTime <= maxPlayTime;
      });
    }

    console.log('[GameCollectionView] filteredGames complete', { 
      originalCount: enrichedGames.length,
      filteredCount: filtered.length 
    });
    return filtered;
  }, [enrichedGames, searchQuery, selectedCategories, selectedOwners, minPlayers, maxPlayers, minStarRating, minMatchRating, maxPlayTime, showOwners, ownersMap, showMatchScores, matchScores]);


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
    setMaxPlayers(11);
    setMinStarRating(0);
    setMinMatchRating(0);
    setMaxPlayTime(300);
    setShowResults(false);
  }, []);

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
    
    return (
      <View key={gameId || `game-${index}`} style={styles.gameCardWrapper}>
        <View style={{ width: cardWidthPixels }}>
          <Pressable onPress={() => onGamePress?.(game)}>
            <GameCard 
              game={game} 
              onDelete={onGameDelete}
              preloadedBggData={game._bggData}
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
    
    return (
      <Pressable onPress={() => onGamePress?.(item)} style={{ width: cardWidthPixels }}>
        <GameCard 
          game={item} 
          onDelete={onGameDelete}
          preloadedBggData={item._bggData}
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
        <View style={styles.searchContainer}>
          <Input
            placeholder="Find by title..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
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
            label="Best Played With"
            minValue={minPlayers}
            maxValue={maxPlayers}
            onMinChange={setMinPlayers}
            onMaxChange={setMaxPlayers}
            min={1}
            max={11}
            step={1}
          />
        </View>

        {/* Star Rating Slider */}
        <View style={styles.filterSection}>
          <SimpleSlider
            label="Minimum Board Game Geek Rating"
            value={minStarRating}
            onValueChange={setMinStarRating}
            min={0}
            max={5}
            step={0.5}
          />
        </View>

        {/* Match Rating Slider */}
        {showMatchScores && (
          <View style={styles.filterSection}>
            <SimpleSlider
              label="Minimum Beeple Rating"
              value={minMatchRating}
              onValueChange={setMinMatchRating}
              min={0}
              max={100}
              step={1}
            />
          </View>
        )}

        {/* Play Time Slider */}
        <View style={styles.filterSection}>
          <SimpleSlider
            label="Maximum Play Time (minutes)"
            value={maxPlayTime}
            onValueChange={setMaxPlayTime}
            min={0}
            max={300}
            step={15}
          />
        </View>

        {/* Results Count and Actions */}
        <View style={styles.filterActions}>
          <Text style={styles.resultsCount}>
            {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''} found
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
        <View style={styles.resultsContainer}>
          {usePagination ? (
            <ScrollView style={styles.scrollView}>
              {renderGamesGrid(filteredGames)}
            </ScrollView>
          ) : (
            <FlatList
              ref={flatListRef}
              data={filteredGames}
              keyExtractor={(item, index) => {
                const key = item.id || (item.bggId ? `bgg_${item.bggId}` : null);
                return key ? `${key}-${index}` : `game-${index}-${Math.random()}`;
              }}
              renderItem={renderListItem}
              numColumns={3}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.listContainer}
              scrollEnabled={true}
              showsVerticalScrollIndicator={true}
            />
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  searchContainer: {
    marginBottom: theme.spacing.md,
  },
  searchInput: {
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
  sliderValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 200,
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
    flex: 1,
  },
  scrollView: {
    flex: 1,
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
});

export default GameCollectionView;
