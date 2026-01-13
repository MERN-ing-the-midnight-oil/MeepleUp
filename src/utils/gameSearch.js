import { searchGamesByName, getGames } from './api';
import { addPendingRetry } from './pendingGameRetries';
import logger from './inAppLogger';

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
  const { setLoadingGames, setSearchResults, setSelectedGames, setProcessingGameIndex, isSkipped, setSkippedGames, addPendingRetry, setStuckGames, setGameSearchStartTimes } = callbacks;
  const results = {};
  const selected = {};
  const searchStartTime = Date.now();
  const gameTimings = {}; // Track timing for each game
  const gameSearchStartTimes = {}; // Track when each game search started
  const stuckBucket = []; // Collect stuck games to retry after all other games complete
  const performanceStats = {
    gamesAutoSkipped: 0, // Games auto-skipped due to 10s timeout
    rateLimitHits: 0, // Number of times we hit rate limits
    gamesNotFound: 0, // Games BGG said don't exist
    gamesFound: 0, // Games with results
  };

  const logPrefix = source === 'image_recognition' ? '[ClaudeGameIdentifier → BGG]' : '[TextListGameIdentifier → BGG]';

  logger.info(`🚀 Starting search for ${games.length} games`, {
    estimatedTimeMinutes: Math.ceil(games.length * 0.5),
    games,
  });
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
    let firstFailureTime = null; // Track when the first failure occurs (after retries with backoff)
    
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
      // Check if user skipped this game
      if (isSkipped && isSkipped(gameTitle)) {
        console.log(`${logPrefix} ⏭️ Skipping "${gameTitle}" - user chose to try again later`);
        results[gameTitle] = [];
        setLoadingGames(prev => {
          const updated = new Set(prev);
          updated.delete(gameTitle);
          return updated;
        });
        setSearchResults({ ...results });
        break;
      }
      
      // Check if this search has been running too long (> 10 seconds) - add to stuck bucket
      const STUCK_TIMEOUT_MS = 10000; // 10 seconds
      const elapsedMs = Date.now() - gameSearchStartTime;
      if (elapsedMs > STUCK_TIMEOUT_MS) {
        performanceStats.gamesAutoSkipped++;
        logger.warn(`⏱️ "${gameTitle}" stuck after ${(elapsedMs / 1000).toFixed(1)}s - adding to bucket`, {
          elapsedSeconds: (elapsedMs / 1000).toFixed(1),
          bucketSize: stuckBucket.length + 1,
        });
        console.log(`${logPrefix} ⏱️ Search for "${gameTitle}" has been running for ${(elapsedMs / 1000).toFixed(1)}s - adding to stuck bucket for batch retry`);
        results[gameTitle] = [];
        
        // Add to stuck bucket instead of immediately adding to pending retries
        // We'll retry all stuck games together after all other games complete
        stuckBucket.push(gameTitle);
        console.log(`${logPrefix} 📦 Added "${gameTitle}" to stuck bucket (${stuckBucket.length} games in bucket)`);
        
        // Keep in loading state - we'll retry it later
        // Don't mark as skipped yet - let the batch retry handle it
        setSearchResults({ ...results });
        break;
      }
      
      try {
        if (retryCount > 0) {
          const backoffMs = Math.min(10000 * Math.pow(2, Math.min(retryCount - 1, 4)), 80000); // Cap at 80s
          console.log(`${logPrefix} 🔄 Retry ${retryCount}/${maxRetries} for "${gameTitle}" after ${backoffMs}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          
          // Check again after backoff delay (user might have skipped during delay)
          if (isSkipped && isSkipped(gameTitle)) {
            console.log(`${logPrefix} ⏭️ Skipping "${gameTitle}" after backoff - user chose to try again later`);
            results[gameTitle] = [];
            setLoadingGames(prev => {
              const updated = new Set(prev);
              updated.delete(gameTitle);
              return updated;
            });
            setSearchResults({ ...results });
            break;
          }
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
        logger.debug(`Searching for "${searchQuery}"`, {
          gameTitle,
          cleanedTitle,
          attempt: retryCount + 1,
        });
        searchResults = await searchGamesByName(searchQuery, true);
        const searchAttemptDuration = ((Date.now() - searchAttemptStartTime) / 1000).toFixed(2);
        
        // Log if Firebase search might have timed out (took > 2.5 seconds)
        if (parseFloat(searchAttemptDuration) > 2.5) {
          logger.warn(`Search for "${searchQuery}" took ${searchAttemptDuration}s - Firebase may have timed out`, {
            duration: searchAttemptDuration,
            resultCount: searchResults?.length || 0,
          });
        }
        
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
            performanceStats.gamesNotFound++;
            
            // Track when the first failure occurs (after we've tried at least once)
            // Only start the "stuck" timer after multiple retries with exponential backoff
            // This ensures we've given BGG API multiple chances before showing "stuck" message
            if (firstFailureTime === null) {
              firstFailureTime = Date.now();
              console.log(`${logPrefix} ⏱️ First failure for "${gameTitle}" at attempt ${retryCount + 1}`);
            }
            
            // Only update the stuck timer start time after we've tried multiple times (retryCount >= 2 means 3+ attempts)
            // This ensures the 30-second stuck timer only starts after we've tried with exponential backoff
            if (retryCount >= 2 && setGameSearchStartTimes) {
              // Update the start time to when we first failed, so the 30-second timer starts from first failure
              // But only after we've tried multiple times (3+ attempts)
              setGameSearchStartTimes(prev => {
                // Only update if not already set to first failure time
                if (!prev[gameTitle] || prev[gameTitle] > firstFailureTime) {
                  return {
                    ...prev,
                    [gameTitle]: firstFailureTime,
                  };
                }
                return prev;
              });
              console.log(`${logPrefix} ⏱️ "${gameTitle}" has failed ${retryCount + 1} times - stuck timer starts from first failure (${((Date.now() - firstFailureTime) / 1000).toFixed(1)}s ago)`);
            }
            
            logger.warn(`⚠️ No results for "${gameTitle}" - adding to pending retries`, {
              attempt: retryCount + 1,
              gameTitle,
            });
            console.warn(`${logPrefix} ⚠️ No search results returned for "${gameTitle}" - adding to pending retries for later (BGG API may need multiple attempts)`);
            // Add to pending retries instead of showing alert - BGG API often needs multiple attempts
            if (addPendingRetry) {
              try {
                await addPendingRetry(gameTitle);
                console.log(`${logPrefix} 💾 Saved "${gameTitle}" to pending retries (no results found - will retry later)`);
                // Don't mark as stuck immediately - let the 30-second check handle it
                // This prevents showing the stuck message too quickly
              } catch (retryError) {
                console.error(`${logPrefix} ❌ Error saving "${gameTitle}" to pending retries:`, retryError);
              }
            }
          } else {
            performanceStats.gamesFound++;
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
                const gameDetails = await getGames(result.id, source);
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
              let matchType = 'none';
              const normalizedResultName = (result.name || '').toLowerCase().trim();
              
              // 1. Exact name match gets highest priority (score +1000)
              if (normalizedResultName === normalizedSearchTitle) {
                score += 1000;
                matchType = 'exact';
              }
              // 2. Starts with search title (score +500)
              else if (normalizedResultName.startsWith(normalizedSearchTitle)) {
                score += 500;
                matchType = 'startsWith';
              }
              // 3. Contains search title (score +100)
              else if (normalizedResultName.includes(normalizedSearchTitle)) {
                score += 100;
                matchType = 'contains';
              }
              // 4. REVERSE contains match (game name is in search term) - NEW!
              // This handles cases like: search="Feudum: Alter Ego - Forest", game="Feudum: Alter Ego"
              else if (normalizedResultName.length >= 4 && normalizedSearchTitle.includes(normalizedResultName)) {
                // Calculate similarity based on how much of the game name matches
                const matchRatio = normalizedResultName.length / normalizedSearchTitle.length;
                score += Math.max(80, Math.floor(100 * matchRatio)); // 80-100 points based on match ratio
                matchType = 'reverseContains';
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
              
              return { ...result, _matchScore: score, _matchType: matchType };
            });
            
            // Sort by match type priority first, then by score
            const typePriority = { 
              exact: 0, 
              startsWith: 1, 
              contains: 2, 
              reverseContains: 3,
              none: 4 
            };
            
            scoredResults.sort((a, b) => {
              const aPriority = typePriority[a._matchType] ?? 4;
              const bPriority = typePriority[b._matchType] ?? 4;
              
              if (aPriority !== bPriority) {
                return aPriority - bPriority;
              }
              
              // Within same type, sort by score (higher is better)
              if (b._matchScore !== a._matchScore) {
                return b._matchScore - a._matchScore;
              }
              
              // Tie-breaker: sort by name
              return (a.name || '').localeCompare(b.name || '');
            });
            
            const bestMatch = scoredResults[0];
            const matchScore = bestMatch._matchScore;
            
            // Remove the temporary _matchScore and _matchType fields before storing
            const { _matchScore, _matchType, ...cleanResult } = bestMatch;
            
            // Update results with cleaned data (remove _matchScore and _matchType from all)
            results[gameTitle] = scoredResults.map(({ _matchScore, _matchType, ...clean }) => clean);
            
            console.log(`${logPrefix} Auto-selected BGG ID ${bestMatch.id} ("${bestMatch.name}") for "${gameTitle}" (score: ${matchScore}, rank: ${bestMatch.rank || 'N/A'})`);
            
            selected[gameTitle] = bestMatch.id;
            setSelectedGames({ ...selected });
            
            console.log(`${logPrefix} Updated selectedGames, total selected: ${Object.keys(selected).length + 1}`);
            console.log(`${logPrefix} Auto-selected BGG ID ${bestMatch.id} ("${bestMatch.name}") for "${gameTitle}" (score: ${matchScore}, rank: ${bestMatch.rank || 'N/A'})`);
          } else {
            console.warn(`${logPrefix} No BGG results found for "${gameTitle}" - added to pending retries (will try again later)`);
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
          performanceStats.rateLimitHits++;
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
            // Exhausted retries - mark as failed and save for retry
            console.error(`${logPrefix} ❌ Failed to search for "${gameTitle}" after ${retryCount + 1} attempts - saving for later retry`);
            results[gameTitle] = [];
            
            // Save to pending retries for background retry
            try {
              await addPendingRetry(gameTitle);
              console.log(`${logPrefix} 💾 Saved "${gameTitle}" to pending retries for background retry`);
              // No alert - BGG API retries with exponential backoff, so failures are expected and will retry automatically
            } catch (retryError) {
              console.error(`${logPrefix} ❌ Error saving "${gameTitle}" to pending retries:`, retryError);
            }
            
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
  
  const gamesPerMinute = games.length > 0 && parseFloat(totalSearchDuration) > 0 
    ? ((games.length / parseFloat(totalSearchDuration)) * 60).toFixed(2)
    : '0';
  
  console.log(`${logPrefix} ✅ Completed searching all games. Summary:`, {
    totalGames: games.length,
    gamesWithResults,
    gamesWithNoResults,
    gamesSelected: Object.keys(selected).length,
    totalDurationSeconds: totalSearchDuration,
    totalDurationMinutes: (totalSearchDuration / 60).toFixed(2),
    gamesPerMinute: gamesPerMinute,
    averageTimePerGame: avgTime + 's',
    minTimePerGame: minTime + 's',
    maxTimePerGame: maxTime + 's',
    gamesWithTiming: timings.length,
    stuckBucketSize: stuckBucket.length,
    performanceStats: {
      gamesAutoSkipped: performanceStats.gamesAutoSkipped,
      rateLimitHits: performanceStats.rateLimitHits,
      gamesNotFound: performanceStats.gamesNotFound,
      gamesFound: performanceStats.gamesFound,
    },
  });
  
  // Log detailed timing for each game
  console.log(`${logPrefix} 📊 Detailed timing breakdown:`, gameTimings);

  setSearchResults(results);
  setSelectedGames(selected);
  
  // Retry all stuck games in the bucket now that other games are done
  if (stuckBucket.length > 0) {
    console.log(`${logPrefix} 🔄 Retrying ${stuckBucket.length} stuck games from bucket...`);
    const bucketRetryStartTime = Date.now();
    
    for (const stuckGameTitle of stuckBucket) {
      // Skip if user manually skipped this game
      if (isSkipped && isSkipped(stuckGameTitle)) {
        console.log(`${logPrefix} ⏭️ Skipping bucket retry for "${stuckGameTitle}" - user chose to skip`);
        continue;
      }
      
      console.log(`${logPrefix} 🔄 Retrying stuck game: "${stuckGameTitle}"`);
      
      // Mark as loading again
      setLoadingGames(prev => new Set(prev).add(stuckGameTitle));
      
      const cleanedTitle = cleanGameTitle(stuckGameTitle);
      let bucketRetrySuccess = false;
      let bucketRetryResults = null;
      
      try {
        // Try cleaned title first, then original
        const queriesToTry = cleanedTitle !== stuckGameTitle ? [cleanedTitle, stuckGameTitle] : [stuckGameTitle];
        
        for (const query of queriesToTry) {
          try {
            console.log(`${logPrefix} 📡 Bucket retry: searching for "${query}" (from "${stuckGameTitle}")`);
            bucketRetryResults = await searchGamesByName(query, true);
            
            if (bucketRetryResults && bucketRetryResults.length > 0) {
              bucketRetrySuccess = true;
              console.log(`${logPrefix} ✅ Bucket retry SUCCESS for "${stuckGameTitle}" - found ${bucketRetryResults.length} results`);
              break;
            }
          } catch (queryError) {
            console.warn(`${logPrefix} ⚠️ Bucket retry query "${query}" failed:`, queryError.message);
            // Try next query
            continue;
          }
        }
        
        if (bucketRetrySuccess && bucketRetryResults && bucketRetryResults.length > 0) {
          // Success! Process results similar to main loop
          const MAX_THUMBNAIL_FETCHES = 3;
          const resultsToEnrich = bucketRetryResults.slice(0, MAX_THUMBNAIL_FETCHES);
          const remainingResults = bucketRetryResults.slice(MAX_THUMBNAIL_FETCHES);
          
          const enrichedResults = await Promise.all(
            resultsToEnrich.map(async (result) => {
              try {
                const details = await getGames(result.id);
                return {
                  ...result,
                  thumbnail: details?.thumbnail || result.thumbnail || null,
                  image: details?.image || result.image || null,
                };
              } catch (detailError) {
                console.warn(`${logPrefix} ⚠️ Failed to fetch details for bucket retry result ${result.id}:`, detailError.message);
                return result;
              }
            })
          );
          
          const resultsWithThumbnails = [...enrichedResults, ...remainingResults];
          results[stuckGameTitle] = resultsWithThumbnails;
          
          // Auto-select best match
          if (resultsWithThumbnails.length > 0) {
            const normalizedSearchTitle = stuckGameTitle.toLowerCase().trim();
            const scoredResults = resultsWithThumbnails.map(result => {
              let score = 0;
              const normalizedResultName = (result.name || '').toLowerCase().trim();
              
              if (normalizedResultName === normalizedSearchTitle) score += 1000;
              else if (normalizedResultName.startsWith(normalizedSearchTitle)) score += 500;
              else if (normalizedResultName.includes(normalizedSearchTitle)) score += 100;
              
              if (result.type === 'boardgame') score += 50;
              if (result.rank && result.rank > 0) score += Math.max(0, 10000 - result.rank);
              if (result.thumbnail) score += 10;
              
              return { ...result, _matchScore: score };
            });
            
            scoredResults.sort((a, b) => {
              if (b._matchScore !== a._matchScore) return b._matchScore - a._matchScore;
              return (a.name || '').localeCompare(b.name || '');
            });
            
            const bestMatch = scoredResults[0];
            const { _matchScore, ...cleanResult } = bestMatch;
            results[stuckGameTitle] = scoredResults.map(({ _matchScore, ...clean }) => clean);
            selected[stuckGameTitle] = bestMatch.id;
            setSelectedGames({ ...selected });
            
            console.log(`${logPrefix} ✅ Bucket retry auto-selected "${bestMatch.name}" (ID: ${bestMatch.id}) for "${stuckGameTitle}"`);
            performanceStats.gamesFound++;
          }
        } else {
          // Bucket retry also failed - add to pending retries for background retry
          console.log(`${logPrefix} ⚠️ Bucket retry failed for "${stuckGameTitle}" - adding to pending retries`);
          results[stuckGameTitle] = [];
          
          if (addPendingRetry) {
            try {
              await addPendingRetry(stuckGameTitle);
              console.log(`${logPrefix} 💾 Saved "${stuckGameTitle}" to pending retries (bucket retry failed)`);
            } catch (retryError) {
              console.error(`${logPrefix} ❌ Error saving "${stuckGameTitle}" to pending retries:`, retryError);
            }
          }
          
          performanceStats.gamesNotFound++;
        }
      } catch (bucketError) {
        console.error(`${logPrefix} ❌ Error during bucket retry for "${stuckGameTitle}":`, bucketError);
        results[stuckGameTitle] = [];
        
        // Add to pending retries on error
        if (addPendingRetry) {
          try {
            await addPendingRetry(stuckGameTitle);
            console.log(`${logPrefix} 💾 Saved "${stuckGameTitle}" to pending retries (bucket retry error)`);
          } catch (retryError) {
            console.error(`${logPrefix} ❌ Error saving "${stuckGameTitle}" to pending retries:`, retryError);
          }
        }
      } finally {
        // Always update loading state and results
        setLoadingGames(prev => {
          const updated = new Set(prev);
          updated.delete(stuckGameTitle);
          return updated;
        });
        setSearchResults({ ...results });
        setSelectedGames({ ...selected });
      }
    }
    
    const bucketRetryDuration = ((Date.now() - bucketRetryStartTime) / 1000).toFixed(2);
    const bucketSuccessCount = stuckBucket.filter(title => results[title] && results[title].length > 0).length;
    logger.info(`✅ Bucket retry complete: ${bucketSuccessCount}/${stuckBucket.length} games resolved`, {
      successCount: bucketSuccessCount,
      totalStuck: stuckBucket.length,
      durationSeconds: bucketRetryDuration,
    });
    console.log(`${logPrefix} ✅ Bucket retry complete: ${bucketSuccessCount}/${stuckBucket.length} games resolved (${bucketRetryDuration}s)`);
  }
  
  // Clear processing index if callback provided
  if (setProcessingGameIndex) {
    setProcessingGameIndex(null);
  }
};

