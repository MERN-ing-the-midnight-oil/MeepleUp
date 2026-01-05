/**
 * Optimized recommendation system with pre-calculation
 * Pre-calculates all matches once, then applies weights quickly on slider changes
 */

/**
 * Decode HTML entities in text
 * Converts entities like &#039; to '
 */
const decodeHTML = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  // Common HTML entities
  const entities = {
    '&#039;': "'",
    '&apos;': "'",
    '&quot;': '"',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
  };
  
  let decoded = text;
  // Replace numeric entities (like &#039;)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });
  
  // Replace named entities
  Object.keys(entities).forEach(entity => {
    decoded = decoded.replace(new RegExp(entity, 'g'), entities[entity]);
  });
  
  return decoded;
};

/**
 * Pre-calculate all matches for all games (~200ms)
 * Returns a map of gameId -> preCalculatedMatches
 */
export const preCalculateAllMatches = (games, userCollection) => {
  const preCalculated = new Map();

  // Normalize user collection data once
  // BGG data can be in _bggData or directly on the game object
  const normalizedUserCollection = userCollection.map(game => {
    const bggData = game._bggData || game;
    // Try multiple ways to get publisher
    const publisherValue = bggData.publisher || 
      (Array.isArray(bggData.publishers) && bggData.publishers.length > 0 ? bggData.publishers[0] : null) ||
      (Array.isArray(game.publishers) && game.publishers.length > 0 ? game.publishers[0] : null) ||
      game.publisher || null;
    
    // Try multiple ways to get mechanics
    const mechanicsValue = bggData.mechanics || game.mechanics || [];
    
    // Try multiple ways to get categories
    const categoriesValue = bggData.categories || game.categories || [];
    
    // Try multiple ways to get complexity
    const complexityValue = bggData.averageWeight || bggData.complexity || game.averageWeight || game.complexity || null;
    
    // Try multiple ways to get BGG rating
    const ratingValue = bggData.average || bggData.bayesAverage || game.average || game.bayesAverage || game.bggRating || 0;
    const bggRating = typeof ratingValue === 'number' ? ratingValue : (typeof ratingValue === 'string' ? parseFloat(ratingValue) || 0 : 0);
    
    return {
      id: game.bggId || game.id,
      title: game.title || game.name || 'Unknown Game',
      isFavorite: game.isFavorite === true,
      publisher: normalizeString(publisherValue),
      mechanics: normalizeArray(mechanicsValue),
      categories: normalizeArray(categoriesValue),
      complexity: complexityValue,
      bggRating: bggRating, // BGG rating for sorting
    };
  });

  // Debug: Log favorited games data to see what we have (only log once per session to reduce noise)
  // Use a static flag to prevent repeated logging
  if (__DEV__ && normalizedUserCollection.length > 0 && !preCalculateAllMatches._hasLogged) {
    const favorited = normalizedUserCollection.filter(g => g.isFavorite);
    if (favorited.length > 0) {
      // Check if all favorites are "Unknown Game" - this indicates a data loading issue
      const allUnknown = favorited.every(g => g.title === 'Unknown Game');
      if (allUnknown) {
        console.warn('[optimizedRecommendations] All favorited games are "Unknown Game" - collection data may not be loaded properly');
        console.log('[optimizedRecommendations] Sample favorite game data:', favorited[0]);
      } else {
        console.log('[optimizedRecommendations] Normalized favorited games:', favorited.length);
        favorited.slice(0, 3).forEach((game, idx) => {
          console.log(`[optimizedRecommendations] Normalized favorite ${idx + 1}:`, {
            title: game.title,
            publisher: game.publisher || '(none)',
            mechanicsCount: game.mechanics.length,
            categoriesCount: game.categories.length,
            complexity: game.complexity || '(none)',
            mechanics: game.mechanics.slice(0, 3),
            categories: game.categories.slice(0, 3),
          });
        });
      }
      preCalculateAllMatches._hasLogged = true;
    }
  }

  // Pre-calculate matches for each game
  games.forEach((game, index) => {
    const gameId = game.bggId || game.id;
    if (!gameId) {
      // Still add to map with empty matches if no gameId
      preCalculated.set(String(gameId || 'unknown'), {
        publisher: [],
        mechanics: [],
        category: [],
        complexity: []
      });
      return;
    }
    
    // Log first few game IDs being calculated for debugging
    if (index < 3) {
      console.log(`[optimizedRecommendations] Pre-calculating for game ${index}:`, {
        gameId: String(gameId),
        bggId: game.bggId,
        id: game.id,
        title: game.title || game.name,
      });
    }

    const bggData = game._bggData || game;
    // Try multiple ways to get publisher for proposed games
    const proposedPublisher = normalizeString(
      bggData.publisher || 
      (Array.isArray(bggData.publishers) && bggData.publishers.length > 0 ? bggData.publishers[0] : null) ||
      (Array.isArray(game.publishers) && game.publishers.length > 0 ? game.publishers[0] : null) ||
      game.publisher || null
    );
    const proposedMechanics = normalizeArray(bggData.mechanics || game.mechanics || []);
    const proposedCategories = normalizeArray(bggData.categories || game.categories || []);
    const proposedComplexity = bggData.averageWeight || bggData.complexity || game.averageWeight || game.complexity || null;

    const matches = {
      publisher: [],
      mechanics: [],
      category: [],
      complexity: []
    };

    // Find all matches (without weights)
    normalizedUserCollection.forEach(userGame => {
      // Publisher match - check both normalized strings
      if (proposedPublisher && userGame.publisher && 
          proposedPublisher.length > 0 && userGame.publisher.length > 0 &&
          proposedPublisher === userGame.publisher) {
        matches.publisher.push({
          game: userGame.title,
          isFavorite: userGame.isFavorite,
          bggRating: userGame.bggRating || 0,
        });
      }

      // Mechanics match - find any shared mechanics
      if (proposedMechanics.length > 0 && userGame.mechanics.length > 0) {
        const sharedMechanics = proposedMechanics.filter(m => 
          m && userGame.mechanics.includes(m)
        );
        sharedMechanics.forEach(mechanic => {
          matches.mechanics.push({
            game: userGame.title,
            mechanic: formatMechanic(mechanic),
            isFavorite: userGame.isFavorite,
            bggRating: userGame.bggRating || 0,
          });
        });
      }

      // Category match - find any shared categories
      if (proposedCategories.length > 0 && userGame.categories.length > 0) {
        const sharedCategories = proposedCategories.filter(c => 
          c && userGame.categories.includes(c)
        );
        sharedCategories.forEach(category => {
          matches.category.push({
            game: userGame.title,
            category: formatCategory(category),
            isFavorite: userGame.isFavorite,
            bggRating: userGame.bggRating || 0,
          });
        });
      }

      // Complexity match (within 0.5 range)
      if (proposedComplexity != null && userGame.complexity != null &&
          !isNaN(proposedComplexity) && !isNaN(userGame.complexity)) {
        const diff = Math.abs(proposedComplexity - userGame.complexity);
        if (diff <= 0.5) {
          matches.complexity.push({
            game: userGame.title,
            weight: userGame.complexity,
            isFavorite: userGame.isFavorite,
            bggRating: userGame.bggRating || 0,
          });
        }
      }
    });

    // Always add to map, even if matches are empty
    preCalculated.set(String(gameId), matches);
  });

  // Debug logging - only in development mode and only for significant batches
  // Skip logging for single-game calculations to reduce noise
  if (__DEV__ && games.length > 1) {
    const gamesWithMatches = Array.from(preCalculated.values()).filter(m => 
      m.publisher.length > 0 || 
      m.mechanics.length > 0 || 
      m.category.length > 0 || 
      m.complexity.length > 0
    ).length;
    
    // Always log to help debug matching issues
    console.log('[optimizedRecommendations] Pre-calculated matches:', {
      totalGames: games.length,
      totalUserGames: normalizedUserCollection.length,
      favoritedUserGames: normalizedUserCollection.filter(g => g.isFavorite).length,
      gamesWithMatches,
    });
    
    // If no matches found, log sample data to debug
    if (gamesWithMatches === 0 && normalizedUserCollection.length > 0 && games.length > 0) {
      console.log('[optimizedRecommendations] No matches found - debugging sample data:');
      
      // Sample a few user games
      const sampleUserGames = normalizedUserCollection.slice(0, 3);
      sampleUserGames.forEach((userGame, idx) => {
        console.log(`[optimizedRecommendations] Sample user game ${idx + 1}:`, {
          title: userGame.title,
          isFavorite: userGame.isFavorite,
          publisher: userGame.publisher || '(none)',
          mechanicsCount: userGame.mechanics.length,
          categoriesCount: userGame.categories.length,
          complexity: userGame.complexity || '(none)',
          sampleMechanics: userGame.mechanics.slice(0, 3),
          sampleCategories: userGame.categories.slice(0, 3),
        });
      });
      
      // Sample a few games being matched
      const sampleGames = games.slice(0, 3);
      sampleGames.forEach((game, idx) => {
        const bggData = game._bggData || game;
        const proposedPublisher = normalizeString(
          bggData.publisher || 
          (Array.isArray(bggData.publishers) && bggData.publishers.length > 0 ? bggData.publishers[0] : null) ||
          (Array.isArray(game.publishers) && game.publishers.length > 0 ? game.publishers[0] : null) ||
          game.publisher || null
        );
        const proposedMechanics = normalizeArray(bggData.mechanics || game.mechanics || []);
        const proposedCategories = normalizeArray(bggData.categories || game.categories || []);
        
        console.log(`[optimizedRecommendations] Sample game ${idx + 1} being matched:`, {
          title: game.title || game.name,
          publisher: proposedPublisher || '(none)',
          mechanicsCount: proposedMechanics.length,
          categoriesCount: proposedCategories.length,
          sampleMechanics: proposedMechanics.slice(0, 3),
          sampleCategories: proposedCategories.slice(0, 3),
        });
      });
    }
  }

  return preCalculated;
};

/**
 * Calculate score for a single game using pre-calculated matches and weights (~5-10ms)
 * Applies a normalized BGG rating multiplier behind the scenes
 */
export const calculateGameScore = (preCalculatedMatches, weights, game = null) => {
  if (!preCalculatedMatches) return 0;

  let totalScore = 0;

  // Publisher matches
  preCalculatedMatches.publisher.forEach(match => {
    const favoriteMultiplier = match.isFavorite ? weights.favorite : 1;
    totalScore += weights.publisher * favoriteMultiplier;
  });

  // Mechanics matches
  preCalculatedMatches.mechanics.forEach(match => {
    const favoriteMultiplier = match.isFavorite ? weights.favorite : 1;
    totalScore += weights.mechanics * favoriteMultiplier;
  });

  // Category matches
  preCalculatedMatches.category.forEach(match => {
    const favoriteMultiplier = match.isFavorite ? weights.favorite : 1;
    totalScore += weights.category * favoriteMultiplier;
  });

  // Complexity matches
  preCalculatedMatches.complexity.forEach(match => {
    const favoriteMultiplier = match.isFavorite ? weights.favorite : 1;
    totalScore += weights.complexity * favoriteMultiplier;
  });

  // Apply BGG rating multiplier behind the scenes
  // Normalized multiplier: 0.8 to 1.2 based on rating (0-10 scale)
  // This gives a subtle boost to highly-rated games without overriding personal preferences
  if (game) {
    const bggData = game._bggData || game;
    const ratingValue = bggData.average || bggData.bayesAverage || game.average || game.bayesAverage || null;
    
    if (ratingValue != null) {
      const rating = typeof ratingValue === 'string' ? parseFloat(ratingValue) : ratingValue;
      
      if (!isNaN(rating) && rating > 0) {
        // Normalize rating to 0-1 scale (assuming BGG ratings are 0-10)
        // Then map to multiplier range 0.8-1.2
        // Games with rating 5.0 get 1.0x, games with 10.0 get 1.2x, games with 0 get 0.8x
        const normalizedRating = Math.max(0, Math.min(10, rating)) / 10; // Clamp to 0-10, then normalize
        const ratingMultiplier = 0.8 + (normalizedRating * 0.4); // Maps 0->0.8, 1->1.2
        
        totalScore *= ratingMultiplier;
      }
    }
  }

  return totalScore;
};

/**
 * Get recommendation text for a game using pre-calculated matches and weights
 */
export const getRecommendationText = (preCalculatedMatches, gameTitle, game, weights) => {
  if (!preCalculatedMatches) return null;

  const matches = {
    publisher: preCalculatedMatches.publisher.map(m => ({
      ...m,
      score: weights.publisher * (m.isFavorite ? weights.favorite : 1)
    })),
    mechanics: preCalculatedMatches.mechanics.map(m => ({
      ...m,
      score: weights.mechanics * (m.isFavorite ? weights.favorite : 1)
    })),
    category: preCalculatedMatches.category.map(m => ({
      ...m,
      score: weights.category * (m.isFavorite ? weights.favorite : 1)
    })),
    complexity: preCalculatedMatches.complexity.map(m => ({
      ...m,
      score: weights.complexity * (m.isFavorite ? weights.favorite : 1)
    }))
  };

  return buildRecommendationText(matches, gameTitle, game);
};

/**
 * Helper: Normalize string for comparison
 */
const normalizeString = (str) => {
  if (!str) return '';
  return str.toLowerCase().trim();
};

/**
 * Helper: Normalize array of strings
 */
const normalizeArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => normalizeString(item)).filter(Boolean);
};

/**
 * Helper: Format mechanic name for display
 */
const formatMechanic = (mechanic) => {
  return mechanic
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Helper: Format category name for display
 */
const formatCategory = (category) => {
  return formatMechanic(category); // Same formatting logic
};

/**
 * Build personalized recommendation text from matches
 */
const buildRecommendationText = (matches, proposedTitle, game) => {
  // Get owner name(s)
  const owners = game?._owners || [];
  const ownerName = owners.length > 0 ? owners[0] : 'someone';
  
  // Get publisher name
  const bggData = game?._bggData || game;
  const publisher = bggData?.publisher || 
    (Array.isArray(bggData?.publishers) && bggData.publishers.length > 0 ? bggData.publishers[0] : null) ||
    (Array.isArray(game?.publishers) && game.publishers.length > 0 ? game.publishers[0] : null) ||
    game?.publisher || null;
  
  if (!publisher) {
    return null; // Can't make recommendation without publisher
  }

  // Helper function to get top 3 games: prioritize favorited, then by BGG rating
  const getTopGames = (matchArray, maxGames = 3) => {
    if (!matchArray || matchArray.length === 0) {
      return [];
    }
    
    // Separate favorited and non-favorited games
    const favorited = matchArray.filter(m => m && m.isFavorite);
    const nonFavorited = matchArray.filter(m => m && !m.isFavorite);
    
    // Sort each group by BGG rating (highest first)
    favorited.sort((a, b) => (b.bggRating || 0) - (a.bggRating || 0));
    nonFavorited.sort((a, b) => (b.bggRating || 0) - (a.bggRating || 0));
    
    // Combine: favorited first, then non-favorited, up to maxGames
    const combined = [...favorited, ...nonFavorited];
    
    // Remove duplicates by game title
    const seen = new Set();
    const unique = [];
    for (const match of combined) {
      if (match && match.game && !seen.has(match.game)) {
        seen.add(match.game);
        unique.push(match.game);
        if (unique.length >= maxGames) break;
      }
    }
    
    return unique;
  };

  // Get publisher matches - top 3 favorited games by BGG rating
  const publisherGames = getTopGames(matches.publisher, 3);

  // Get mechanics matches - group by mechanic, then get top 3 per mechanic
  const mechanicGroups = {};
  if (matches.mechanics.length > 0) {
    matches.mechanics.forEach(m => {
      if (!mechanicGroups[m.mechanic]) {
        mechanicGroups[m.mechanic] = [];
      }
      mechanicGroups[m.mechanic].push(m);
    });
  }

  // Sort mechanics by score and take top 2, with top 3 games per mechanic
  const topMechanics = Object.entries(mechanicGroups)
    .map(([mechanic, matchArray]) => {
      const bestMatch = matches.mechanics.find(m => m.mechanic === mechanic);
      const topGames = getTopGames(matchArray, 3);
      return {
        mechanic,
        games: topGames,
        score: bestMatch ? bestMatch.score : 0
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  // Return null if no meaningful matches
  if (publisherGames.length === 0 && topMechanics.length === 0) {
    return null;
  }

  // Build the recommendation text
  const gameTitle = decodeHTML(proposedTitle || game?.title || game?.name || 'this game');
  let text = `Hello, I'm Beeple the MeepleBot. You might want to propose "${gameTitle}" owned by ${ownerName}.`;
  
  // Add publisher information
  if (publisherGames.length > 0) {
    const decodedPublisherGames = publisherGames.map(g => decodeHTML(g));
    const publisherList = decodedPublisherGames.length === 1 
      ? `"${decodedPublisherGames[0]}"`
      : decodedPublisherGames.length === 2
        ? `"${decodedPublisherGames[0]}" and "${decodedPublisherGames[1]}"`
        : `"${decodedPublisherGames.slice(0, -1).join('", "')}", and "${decodedPublisherGames[decodedPublisherGames.length - 1]}"`;
    text += ` Its published by "${decodeHTML(publisher)}" just like ${publisherList}.`;
  }
  
  // Add mechanics information
  topMechanics.forEach(({ mechanic, games }, index) => {
    const mechanicName = formatMechanic(mechanic);
    const decodedGames = games.map(g => decodeHTML(g));
    const gameList = decodedGames.length === 1
      ? `"${decodedGames[0]}"`
      : decodedGames.length === 2
        ? `"${decodedGames[0]}" and "${decodedGames[1]}"`
        : `"${decodedGames.slice(0, -1).join('", "')}", and "${decodedGames[decodedGames.length - 1]}"`;
    const verb = decodedGames.length === 1 ? 'does' : 'do';
    
    if (index === 0) {
      text += ` It uses a ${mechanicName} Mechanic like ${gameList} ${verb}.`;
    } else {
      text += ` It also uses a ${mechanicName} Mechanic like ${gameList} ${verb}.`;
    }
  });

  return text;
};

