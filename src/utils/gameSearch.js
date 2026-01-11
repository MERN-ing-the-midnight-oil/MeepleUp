import { searchGamesByName, getGameDetails } from './api';

/**
 * Shared utility function to search BGG for multiple game titles
 * Used by both TextListGameIdentifier and ClaudeGameIdentifier
 * 
 * @param {string[]} games - Array of game titles to search for
 * @param {Object} callbacks - Object containing state update callbacks
 * @param {Function} callbacks.setLoadingGames - Function to update loading games set
 * @param {Function} callbacks.setSearchResults - Function to update search results
 * @param {Function} callbacks.setSelectedGames - Function to update selected games
 * @param {Function} [callbacks.setProcessingGameIndex] - Optional function to update processing index (for TextListGameIdentifier)
 * @param {string} [source] - Source identifier for logging (e.g., 'text_list_import', 'image_recognition')
 * @returns {Promise<void>}
 */
export const searchForAllGames = async (games, callbacks, source = 'game_import') => {
  const { setLoadingGames, setSearchResults, setSelectedGames, setProcessingGameIndex } = callbacks;
  const results = {};
  const selected = {};
  const searchStartTime = Date.now();
  const gameTimings = {}; // Track timing for each game

  const logPrefix = source === 'image_recognition' ? '[ClaudeGameIdentifier → BGG]' : '[TextListGameIdentifier → BGG]';

  console.log(`${logPrefix} 🚀 Starting search for ${games.length} games`, {
    timestamp: new Date().toISOString(),
    estimatedTimeMinutes: Math.ceil(games.length * 0.5), // ~0.5 min per game (conservative)
  });
  console.log(`${logPrefix} Game titles to search:`, games);

  // Helper function to clean game title by removing parenthetical text
  // Example: "Bridge City Poker (modern published game)" -> "Bridge City Poker"
  const cleanGameTitle = (title) => {
    if (!title) return title;
    // Remove text in parentheses, brackets, or after dashes that look like metadata
    // Pattern: (anything in parentheses), [anything in brackets], or - metadata
    return title
      .replace(/\s*\([^)]*\)\s*/g, ' ') // Remove (parenthetical text)
      .replace(/\s*\[[^\]]*\]\s*/g, ' ') // Remove [bracketed text]
      .replace(/\s*-\s*(modern|published|game|expansion|edition).*$/i, '') // Remove trailing metadata after dash
      .trim();
  };

  for (let i = 0; i < games.length; i++) {
    const gameTitle = games[i];
    const cleanedTitle = cleanGameTitle(gameTitle);
    const gameSearchStartTime = Date.now();
    
    // Update processing index if callback provided (for TextListGameIdentifier)
    if (setProcessingGameIndex) {
      setProcessingGameIndex(i);
    }
    
    // Mark this game as loading (will persist through retries)
    setLoadingGames(prev => new Set(prev).add(gameTitle));
    
    console.log(`${logPrefix} ⏱️ Searching BGG for: "${gameTitle}" (${i + 1}/${games.length})`, {
      gameIndex: i + 1,
      totalGames: games.length,
      searchStartTime: new Date().toISOString(),
      elapsedSinceStart: ((Date.now() - searchStartTime) / 1000).toFixed(1) + 's',
      cleanedTitle: cleanedTitle !== gameTitle ? cleanedTitle : gameTitle,
      willUseCleaned: cleanedTitle !== gameTitle,
    });
    
    let searchResults = null;
    let retryCount = 0;
    const maxRetries = 20; // Keep trying up to 20 times for rate-limited errors
    let lastError = null;
    let searchQuery = cleanedTitle; // Start with cleaned title
    let triedOriginal = false;
    
    // Keep retrying until we get results (or exhaust retries for non-rate-limit errors)
    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          const backoffMs = Math.min(10000 * Math.pow(2, Math.min(retryCount - 1, 4)), 80000); // Cap at 80s
          console.log(`${logPrefix} 🔄 Retry ${retryCount}/${maxRetries} for "${gameTitle}" after ${backoffMs}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
        
        // Determine which query to use: cleaned title first, then original if no results
        if (retryCount === 0) {
          // First attempt: use cleaned title if different from original
          searchQuery = cleanedTitle !== gameTitle ? cleanedTitle : gameTitle;
        }
        
        console.log(`${logPrefix} 📡 Calling searchGamesByName for "${searchQuery}" with fallbackToBGG=true`, {
          attempt: retryCount + 1,
          maxRetries,
          isCleaned: searchQuery === cleanedTitle && cleanedTitle !== gameTitle,
          isOriginal: searchQuery === gameTitle,
        });
        
        const searchAttemptStartTime = Date.now();
        searchResults = await searchGamesByName(searchQuery, true);
        const searchAttemptDuration = ((Date.now() - searchAttemptStartTime) / 1000).toFixed(2);
        
        // If no results with cleaned title and we haven't tried original, try original
        if ((!searchResults || searchResults.length === 0) && searchQuery === cleanedTitle && cleanedTitle !== gameTitle && !triedOriginal) {
          console.log(`${logPrefix} 🔄 No results with cleaned title "${cleanedTitle}", trying original "${gameTitle}"...`);
          triedOriginal = true;
          searchQuery = gameTitle;
          // Continue to retry with original title (this counts as retryCount 0 still, so no delay)
          continue;
        }
        
        console.log(`${logPrefix} ✅ BGG search completed for "${gameTitle}"`, {
          durationSeconds: searchAttemptDuration,
          resultCount: searchResults?.length || 0,
          attempt: retryCount + 1,
        });
        
        // Process results and set timing data
        // Wrap in try-catch to ensure we always update loading state
        try {
          console.log(`${logPrefix} 📊 BGG search results for "${gameTitle}":`, {
            resultCount: searchResults?.length || 0,
            firstResult: searchResults?.length > 0 ? searchResults[0]?.name : null,
            hasResults: !!(searchResults && searchResults.length > 0),
          });
          
          if (!searchResults || searchResults.length === 0) {
            console.warn(`${logPrefix} ⚠️ No search results returned for "${gameTitle}" - this game may not exist in BGG (successful API call with no results)`);
          }
          
          // Fetch thumbnails for top 3 results only - enough to show user what was found
          // This balances speed with user experience (they can see which games were found)
          const MAX_THUMBNAIL_FETCHES = 3; // Only fetch for top 3 results
          const resultsToEnrich = (searchResults || []).slice(0, MAX_THUMBNAIL_FETCHES);
          const remainingResults = (searchResults || []).slice(MAX_THUMBNAIL_FETCHES);
          
          const thumbnailFetchStartTime = Date.now();
          const DELAY_BETWEEN_FETCHES = 1000; // 1 second between fetches (faster than before)
          
          // Fetch thumbnails for top results in parallel (but with rate limiting)
          const enrichedResults = await Promise.all(
            resultsToEnrich.map(async (result, index) => {
              // Add small delay between fetches to avoid rate limiting
              if (index > 0) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_FETCHES));
              }
              
              try {
                const gameDetails = await getGameDetails(result.id, source);
                return {
                  ...result,
                  thumbnail: gameDetails?.thumbnail || null,
                  rank: gameDetails?.rank || null,
                  type: gameDetails?.type || result.type || null,
                };
              } catch (err) {
                // If fetching fails, return result without thumbnail
                return {
                  ...result,
                  thumbnail: null,
                  rank: null,
                  type: result.type || null,
                };
              }
            })
          );
          
          // Add remaining results without thumbnails
          const resultsWithThumbnails = [
            ...enrichedResults,
            ...remainingResults.map(result => ({
              ...result,
              thumbnail: null,
              rank: null,
              type: result.type || null,
            }))
          ];
          
          const thumbnailFetchDuration = ((Date.now() - thumbnailFetchStartTime) / 1000).toFixed(2);
          
          if (searchResults && searchResults.length > MAX_THUMBNAIL_FETCHES) {
            console.log(`${logPrefix} ⚡ Fetched thumbnails for top ${MAX_THUMBNAIL_FETCHES} of ${searchResults.length} results (saved ${searchResults.length - MAX_THUMBNAIL_FETCHES} API calls)`);
          }
          
          const totalGameDuration = ((Date.now() - gameSearchStartTime) / 1000).toFixed(2);
          gameTimings[gameTitle] = {
            totalSeconds: parseFloat(totalGameDuration),
            searchSeconds: parseFloat(searchAttemptDuration),
            thumbnailSeconds: parseFloat(thumbnailFetchDuration),
            attempts: retryCount + 1,
            resultCount: searchResults?.length || 0,
          };
          
          console.log(`${logPrefix} ✅ Completed "${gameTitle}"`, {
            totalDurationSeconds: totalGameDuration,
            searchDurationSeconds: searchAttemptDuration,
            thumbnailFetchDurationSeconds: thumbnailFetchDuration,
            attempts: retryCount + 1,
            resultCount: searchResults?.length || 0,
            elapsedSinceStart: ((Date.now() - searchStartTime) / 1000).toFixed(1) + 's',
          });
          
          results[gameTitle] = resultsWithThumbnails;
          
          // Smart auto-selection: prefer exact name matches, then lower rank (more popular)
          if (resultsWithThumbnails && resultsWithThumbnails.length > 0) {
            const normalizedSearchTitle = gameTitle.toLowerCase().trim();
            
            // Score each result (higher score = better match)
            const scoredResults = resultsWithThumbnails.map(result => {
              let score = 0;
              const normalizedResultName = (result.name || '').toLowerCase().trim();
              
              // Exact name match gets highest priority (score +1000)
              if (normalizedResultName === normalizedSearchTitle) {
                score += 1000;
              }
              // Starts with search title (score +500)
              else if (normalizedResultName.startsWith(normalizedSearchTitle)) {
                score += 500;
              }
              // Contains search title (score +100)
              else if (normalizedResultName.includes(normalizedSearchTitle)) {
                score += 100;
              }
              
              // Prefer boardgames over expansions (score +50 for boardgame)
              if (result.type === 'boardgame') {
                score += 50;
              }
              
              // Prefer games with better (lower) rank (score = 10000 - rank, capped at 10000)
              // Rank 1 gets +9999, rank 100 gets +9900, rank 10000 gets +0
              if (result.rank && result.rank > 0) {
                score += Math.max(0, 10000 - result.rank);
              }
              
              // Prefer games with thumbnails (score +10)
              if (result.thumbnail) {
                score += 10;
              }
              
              return { ...result, _matchScore: score };
            });
            
            // Sort by score (highest first), then by name for tie-breaking
            scoredResults.sort((a, b) => {
              if (b._matchScore !== a._matchScore) {
                return b._matchScore - a._matchScore;
              }
              return (a.name || '').localeCompare(b.name || '');
            });
            
            const bestMatch = scoredResults[0];
            const matchScore = bestMatch._matchScore;
            
            // Remove the temporary _matchScore field before storing
            const { _matchScore, ...cleanResult } = bestMatch;
            
            // Update results with cleaned data (remove _matchScore from all)
            results[gameTitle] = scoredResults.map(({ _matchScore, ...clean }) => clean);
            
            console.log(`${logPrefix} Auto-selected BGG ID ${bestMatch.id} ("${bestMatch.name}") for "${gameTitle}" (score: ${matchScore}, rank: ${bestMatch.rank || 'N/A'})`);
            
            selected[gameTitle] = bestMatch.id;
            setSelectedGames({ ...selected });
            
            console.log(`${logPrefix} Updated selectedGames, total selected: ${Object.keys(selected).length + 1}`);
            console.log(`${logPrefix} Auto-selected BGG ID ${bestMatch.id} ("${bestMatch.name}") for "${gameTitle}" (score: ${matchScore}, rank: ${bestMatch.rank || 'N/A'})`);
          } else {
            console.warn(`${logPrefix} No BGG results found for "${gameTitle}" (definitive - successful API call returned empty)`);
          }
        } catch (processError) {
          console.error(`${logPrefix} ❌ Error processing results for "${gameTitle}":`, processError);
          // Still set results and timing even if processing failed
          results[gameTitle] = searchResults || [];
          const totalGameDuration = ((Date.now() - gameSearchStartTime) / 1000).toFixed(2);
          gameTimings[gameTitle] = {
            totalSeconds: parseFloat(totalGameDuration),
            searchSeconds: parseFloat(searchAttemptDuration),
            thumbnailSeconds: 0,
            attempts: retryCount + 1,
            resultCount: searchResults?.length || 0,
            processingError: processError.message,
          };
        } finally {
          // ALWAYS update loading state and search results, even if processing failed
          setLoadingGames(prev => {
            const updated = new Set(prev);
            updated.delete(gameTitle);
            return updated;
          });
          
          // Update search results incrementally so UI updates as each game finishes
          setSearchResults({ ...results });
        }
        
        // Successfully completed - break out of retry loop
        break;
        
      } catch (err) {
        lastError = err;
        const isRateLimited = err.isRateLimited || (err.message && err.message.includes('rate limited'));
        
        if (isRateLimited) {
          console.warn(`${logPrefix} ⚠️ Rate limited for "${gameTitle}" (attempt ${retryCount + 1}/${maxRetries})`, {
            error: err.message,
            willRetry: retryCount < maxRetries,
          });
          
          if (retryCount < maxRetries) {
            retryCount++;
            continue; // Retry
          } else {
            console.error(`${logPrefix} ❌ Exhausted ${maxRetries} retries for "${gameTitle}" due to rate limiting`);
            // Set timing data even for failed searches
            const totalGameDuration = ((Date.now() - gameSearchStartTime) / 1000).toFixed(2);
            gameTimings[gameTitle] = {
              totalSeconds: parseFloat(totalGameDuration),
              searchSeconds: 0,
              thumbnailSeconds: 0,
              attempts: retryCount + 1,
              resultCount: 0,
              error: 'rate_limited',
            };
            // Keep in loading state - don't mark as failed (user can retry later)
            // But still log timing
            console.log(`${logPrefix} ⏱️ Timing for "${gameTitle}" (rate limited):`, gameTimings[gameTitle]);
            break; // Move to next game but keep this one loading
          }
        } else {
          // Other error - retry a few times, then mark as failed
          console.error(`${logPrefix} ❌ Error searching for "${gameTitle}" (attempt ${retryCount + 1}/${maxRetries}):`, {
            error: err.message,
            stack: err.stack,
          });
          
          if (retryCount < 3) { // Retry up to 3 times for non-rate-limit errors
            retryCount++;
            continue; // Retry
          } else {
            // Exhausted retries - mark as failed
            console.error(`${logPrefix} ❌ Failed to search for "${gameTitle}" after ${retryCount + 1} attempts`);
            results[gameTitle] = [];
            
            // Set timing data for failed searches
            const totalGameDuration = ((Date.now() - gameSearchStartTime) / 1000).toFixed(2);
            gameTimings[gameTitle] = {
              totalSeconds: parseFloat(totalGameDuration),
              searchSeconds: 0,
              thumbnailSeconds: 0,
              attempts: retryCount + 1,
              resultCount: 0,
              error: err.message,
            };
            
            // Mark this game as no longer loading (search failed)
            setLoadingGames(prev => {
              const updated = new Set(prev);
              updated.delete(gameTitle);
              return updated;
            });
            
            // Update search results to show "No matches found"
            setSearchResults({ ...results });
            console.log(`${logPrefix} ⏱️ Timing for "${gameTitle}" (failed):`, gameTimings[gameTitle]);
            break; // Move to next game
          }
        }
      }
    }
    
    // Log timing for this game (whether successful or failed)
    if (gameTimings[gameTitle]) {
      console.log(`${logPrefix} ⏱️ Final timing for "${gameTitle}":`, gameTimings[gameTitle]);
    } else {
      // This shouldn't happen now, but log if it does
      const totalGameDuration = ((Date.now() - gameSearchStartTime) / 1000).toFixed(2);
      gameTimings[gameTitle] = {
        totalSeconds: parseFloat(totalGameDuration),
        searchSeconds: 0,
        thumbnailSeconds: 0,
        attempts: 0,
        resultCount: 0,
        error: 'unknown',
      };
      console.warn(`${logPrefix} ⚠️ No timing data for "${gameTitle}" - set default timing`, gameTimings[gameTitle]);
    }
  }

  const totalSearchDuration = ((Date.now() - searchStartTime) / 1000).toFixed(2);
  const gamesWithResults = Object.values(results).filter(r => r && r.length > 0).length;
  const gamesWithNoResults = Object.values(results).filter(r => !r || r.length === 0).length;
  
  // Calculate timing statistics
  const timings = Object.values(gameTimings);
  const avgTime = timings.length > 0 
    ? (timings.reduce((sum, t) => sum + t.totalSeconds, 0) / timings.length).toFixed(2)
    : 0;
  const minTime = timings.length > 0 
    ? Math.min(...timings.map(t => t.totalSeconds)).toFixed(2)
    : 0;
  const maxTime = timings.length > 0 
    ? Math.max(...timings.map(t => t.totalSeconds)).toFixed(2)
    : 0;
  
  console.log(`${logPrefix} ✅ Completed searching all games. Summary:`, {
    totalGames: games.length,
    gamesWithResults,
    gamesWithNoResults,
    gamesSelected: Object.keys(selected).length,
    totalDurationSeconds: totalSearchDuration,
    totalDurationMinutes: (totalSearchDuration / 60).toFixed(2),
    averageTimePerGame: avgTime + 's',
    minTimePerGame: minTime + 's',
    maxTimePerGame: maxTime + 's',
    gamesWithTiming: timings.length,
  });
  
  // Log detailed timing for each game
  console.log(`${logPrefix} 📊 Detailed timing breakdown:`, gameTimings);

  setSearchResults(results);
  setSelectedGames(selected);
  
  // Clear processing index if callback provided
  if (setProcessingGameIndex) {
    setProcessingGameIndex(null);
  }
};

