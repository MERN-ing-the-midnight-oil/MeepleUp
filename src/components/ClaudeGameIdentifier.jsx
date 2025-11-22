import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import Button from './common/Button';
import { identifyGamesFromImage } from '../services/claudeVision';
import { searchGamesByName, getGameDetails } from '../utils/api';

const defaultAudioState = {
  uri: null,
  base64: null,
  durationMs: 0,
  mediaType: 'audio/m4a',
};

const PulsingControl = ({ type, onPress, disabled, size = 'normal' }) => {
  const pulse = useRef(new Animated.Value(1)).current;
  const loopRef = useRef(null);

  useEffect(() => {
    try {
      if (disabled) {
        if (loopRef.current) {
          try {
            loopRef.current.stop();
          } catch (stopError) {
            console.warn('[PulsingControl] Error stopping animation:', stopError);
          }
          loopRef.current = null;
        }
        try {
          pulse.setValue(1);
        } catch (setValueError) {
          console.warn('[PulsingControl] Error setting pulse value:', setValueError);
        }
        return;
      }

      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0.6,
            duration: 420,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
          }),
        ])
      );

      try {
        loop.start();
        loopRef.current = loop;
      } catch (startError) {
        console.warn('[PulsingControl] Error starting animation:', startError);
      }

      return () => {
        try {
          if (loopRef.current) {
            loopRef.current.stop();
            loopRef.current = null;
          }
        } catch (cleanupError) {
          console.warn('[PulsingControl] Error cleaning up animation:', cleanupError);
        }
      };
    } catch (effectError) {
      console.error('[PulsingControl] Error in useEffect:', effectError);
    }
  }, [disabled]); // Removed pulse from dependencies - it's a ref value that doesn't change

  const backgroundColor = type === 'confirm' ? '#2ecc71' : type === 'edit' ? '#4a90e2' : '#e74c3c';
  const icon = type === 'confirm' ? '✓' : type === 'edit' ? '✎' : '✕';

  try {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.controlWrapper,
          disabled && styles.controlWrapperDisabled,
          pressed && !disabled && styles.controlWrapperPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          type === 'confirm'
            ? 'Confirm and add to collection'
            : type === 'edit'
              ? 'View similar games'
              : 'Reject game identification'
        }
      >
        <Animated.View
          style={[
            styles.control,
            size === 'small' && styles.controlSmall,
            {
              backgroundColor,
              opacity: disabled ? 0.5 : pulse,
            },
          ]}
        >
          <Text style={[styles.controlIcon, size === 'small' && styles.controlIconSmall]}>{icon}</Text>
        </Animated.View>
      </Pressable>
    );
  } catch (renderError) {
    console.error('[PulsingControl] Error rendering:', renderError);
    // Fallback to simple button without animation
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.controlWrapper, disabled && styles.controlWrapperDisabled]}
      >
        <View style={[styles.control, size === 'small' && styles.controlSmall, { backgroundColor, opacity: disabled ? 0.5 : 1 }]}>
          <Text style={[styles.controlIcon, size === 'small' && styles.controlIconSmall]}>{icon}</Text>
        </View>
      </Pressable>
    );
  }
};

const CorrectionSuggestionCard = ({ suggestion, onSelect }) => {
  const handleSelect = (e) => {
    e?.stopPropagation?.();
    onSelect(suggestion);
  };

  return (
    <View style={styles.suggestionCard}>
      <Pressable style={styles.suggestionCardContent} onPress={handleSelect}>
        {suggestion.thumbnail ? (
          <Image source={{ uri: suggestion.thumbnail }} style={styles.suggestionThumbnail} />
        ) : (
          <View style={styles.suggestionThumbnailPlaceholder}>
            <Text style={styles.suggestionPlaceholderText}>BGG</Text>
          </View>
        )}
        <Text style={styles.suggestionName} numberOfLines={2}>
          {suggestion.name}
        </Text>
        {suggestion.yearPublished ? (
          <Text style={styles.suggestionYear}>{suggestion.yearPublished}</Text>
        ) : null}
      </Pressable>
      <Pressable
        style={styles.suggestionConfirmButton}
        onPress={handleSelect}
        accessibilityRole="button"
        accessibilityLabel={`Select ${suggestion.name}`}
      >
        <View style={styles.suggestionConfirmIcon}>
          <Text style={styles.suggestionConfirmIconText}>✓</Text>
        </View>
      </Pressable>
    </View>
  );
};

const ClaudeGameIdentifier = ({ 
  onAddToCollection, 
  onRemoveFromCollection, 
  onDone,
  showCameraModal = false,
  showResultsModal = false,
  onCameraModalClose,
  onResultsModalClose,
}) => {
  const cameraRef = useRef(null);
  const activeSessionRef = useRef(null);
  const pendingFetchTimersRef = useRef([]);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [narrationText, setNarrationText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [comments, setComments] = useState('');
  const [error, setError] = useState(null);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioClip, setAudioClip] = useState(defaultAudioState);
  const [audioPermissionStatus, setAudioPermissionStatus] = useState(null);
  const [gameCandidates, setGameCandidates] = useState([]);
  const gameCandidatesRef = useRef([]); // Keep a ref for synchronous access
  const [correctionCandidate, setCorrectionCandidate] = useState(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    gameCandidatesRef.current = gameCandidates;
  }, [gameCandidates]);
  const [isCorrectionModalVisible, setIsCorrectionModalVisible] = useState(false);
  const [correctionQuery, setCorrectionQuery] = useState('');
  const [correctionSuggestions, setCorrectionSuggestions] = useState([]);
  const [isCorrectionSearching, setIsCorrectionSearching] = useState(false);
  const [correctionError, setCorrectionError] = useState(null);
  const isSelectingSuggestionRef = useRef(false);
  // Inline correction input for no_match candidates
  const [inlineCorrectionInputs, setInlineCorrectionInputs] = useState({});
  const [inlineCorrectionSearching, setInlineCorrectionSearching] = useState({});
  // Queue for sequential BGG fetches to prevent concurrent Firestore queries
  const bggFetchQueueRef = useRef([]);
  const isProcessingBggQueueRef = useRef(false);
  // Multiple search results modal (when more than 1 match found)
  const [multipleResultsCandidate, setMultipleResultsCandidate] = useState(null);
  const [isMultipleResultsModalVisible, setIsMultipleResultsModalVisible] = useState(false);
  const [multipleResultsOptions, setMultipleResultsOptions] = useState([]);
  const [isLoadingMultipleResults, setIsLoadingMultipleResults] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselFlatListRef = useRef(null);

  useEffect(() => {
    if (!permission || permission.status === 'undetermined') {
      requestPermission().catch((permError) => {
        console.error('Camera permission request failed:', permError);
        setError('Unable to access the camera. Check permissions in your device settings.');
      });
    } else if (!permission.granted && !permission.canAskAgain) {
      setError('Camera access is blocked. Enable it in your device settings to identify games.');
    }
  }, [permission, requestPermission]);

  // Reset torch when camera modal closes
  useEffect(() => {
    if (!showCameraModal) {
      setTorchEnabled(false);
    }
  }, [showCameraModal]);

  const clearPendingFetchTimers = useCallback(() => {
    pendingFetchTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    pendingFetchTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearPendingFetchTimers();
    };
  }, [clearPendingFetchTimers]);

  const requestAudioPermission = async () => {
    if (audioPermissionStatus !== null) {
      return audioPermissionStatus;
    }
    const { status } = await Audio.requestPermissionsAsync();
    const granted = status === 'granted';
    setAudioPermissionStatus(granted);
    return granted;
  };

  const updateCandidate = useCallback((candidateId, updater) => {
    try {
      setGameCandidates((prev) =>
        prev.map((candidate) => {
          if (candidate.id !== candidateId) {
            return candidate;
          }
          try {
            const result = updater(candidate);
            return result;
          } catch (updateError) {
            console.error('[ClaudeGameIdentifier] Error updating candidate:', updateError, candidate);
            return candidate; // Return unchanged candidate on error
          }
        })
      );
    } catch (error) {
      console.error('[ClaudeGameIdentifier] Error in updateCandidate:', error);
    }
  }, []);

  const fetchBGGMetadata = useCallback(
    async (sessionKey, candidateId, rawTitle) => {
      if (sessionKey !== activeSessionRef.current) {
        return;
      }

      // Get candidate to check confidence before doing anything
      const currentCandidate = gameCandidatesRef.current.find((c) => c.id === candidateId);
      
      // If low confidence, skip BGG search and show description + text input
      if (currentCandidate && currentCandidate.claudeConfidence === 'low') {
        updateCandidate(candidateId, (candidate) => {
          try {
            return {
              ...candidate,
              bggStatus: 'low_confidence',
              bggErrorMessage: null,
            };
          } catch (updateError) {
            console.error('[ClaudeGameIdentifier] Error in updateCandidate (low_confidence):', updateError);
            return candidate;
          }
        });
        return; // Don't search BGG for low confidence
      }

      updateCandidate(candidateId, (candidate) => {
        try {
          const updated = {
            ...candidate,
            bggStatus: 'loading',
            bggErrorMessage: null,
          };
          // Preserve styling - ensure it's a valid object
          if (candidate && candidate.styling && typeof candidate.styling === 'object') {
            updated.styling = { ...candidate.styling };
          }
          return updated;
        } catch (updateError) {
          console.error('[ClaudeGameIdentifier] Error in updateCandidate (loading):', updateError);
          return candidate; // Return unchanged on error
        }
      });

      if (__DEV__) {
        console.log('[ClaudeGameIdentifier] Fetching BGG metadata', {
          candidateId,
          title: rawTitle,
        });
      }

      try {
        const query = rawTitle?.trim();
        let searchResults = [];
        
        if (__DEV__) {
          console.log('[ClaudeGameIdentifier] About to call searchGamesByName for:', query, 'candidateId:', candidateId);
        }
        
        try {
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] Creating search promise for:', query);
          }
          
          // First try backend search (Firestore/Local DB) without BGG fallback
          const backendSearchPromise = query ? searchGamesByName(query, false) : Promise.resolve([]);
          
          // Add a timeout wrapper to prevent hanging
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Search timeout after 8 seconds')), 8000);
          });
          
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] Searching backend first (no BGG fallback)...');
          }
          
          try {
            searchResults = await Promise.race([backendSearchPromise, timeoutPromise]);
            
            if (__DEV__) {
              console.log('[ClaudeGameIdentifier] Backend search completed, results:', searchResults.length);
            }
          } catch (raceError) {
            if (__DEV__) {
              console.error('[ClaudeGameIdentifier] Backend search error:', raceError);
            }
            searchResults = [];
          }
          
          // Ensure searchResults is an array
          if (!Array.isArray(searchResults)) {
            if (__DEV__) {
              console.warn('[ClaudeGameIdentifier] Backend search returned non-array:', searchResults);
            }
            searchResults = [];
          }
          
          // If no backend results, try BGG API
          if (searchResults.length === 0 && query) {
            if (__DEV__) {
              console.log('[ClaudeGameIdentifier] No backend results, trying BGG API...');
            }
            try {
              const { searchBGGAPI } = await import('../services/bggApi');
              const bggResults = await searchBGGAPI(query, 50);
              if (bggResults && Array.isArray(bggResults) && bggResults.length > 0) {
                if (__DEV__) {
                  console.log(`[ClaudeGameIdentifier] BGG API found ${bggResults.length} games`);
                }
                searchResults = bggResults;
              } else {
                if (__DEV__) {
                  console.log('[ClaudeGameIdentifier] BGG API also returned no results');
                }
              }
            } catch (bggError) {
              if (__DEV__) {
                console.warn('[ClaudeGameIdentifier] BGG API search failed:', bggError);
              }
            }
          }
          
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] Final search results:', searchResults.length);
          }
        } catch (searchError) {
          console.error('[ClaudeGameIdentifier] Error calling searchGamesByName:', searchError);
          searchResults = [];
        }

        if (__DEV__) {
          console.log('[ClaudeGameIdentifier] BGG search results', {
            candidateId,
            title: rawTitle,
            resultCount: searchResults.length,
            firstResult: searchResults.length > 0 ? searchResults[0] : null,
          });
        }

        // Add a timeout to prevent infinite loading
        // If search takes too long, mark as error
        const searchTimeout = setTimeout(() => {
          if (sessionKey === activeSessionRef.current) {
            console.warn('[ClaudeGameIdentifier] Search timeout for:', candidateId);
            updateCandidate(candidateId, (candidate) => {
              // Only update if still in loading/idle state
              if (candidate && (candidate.bggStatus === 'loading' || candidate.bggStatus === 'idle')) {
                try {
                  const updated = {
                    ...candidate,
                    bggStatus: 'error',
                    bggErrorMessage: 'Search timed out. You can still confirm this game.',
                  };
                  if (candidate && candidate.styling && typeof candidate.styling === 'object') {
                    updated.styling = { ...candidate.styling };
                  }
                  return updated;
                } catch (updateError) {
                  console.error('[ClaudeGameIdentifier] Error in updateCandidate (timeout):', updateError);
                  return candidate;
                }
              }
              return candidate; // Don't change if already updated
            });
          }
        }, 10000); // 10 second timeout

        // Clear timeout if search completes
        const clearTimeoutOnComplete = () => {
          clearTimeout(searchTimeout);
        };

        // Safety check: ensure we're still in the right session
        if (sessionKey !== activeSessionRef.current) {
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] Session changed, aborting update for:', candidateId);
          }
          clearTimeoutOnComplete();
          return;
        }

        if (!searchResults || searchResults.length === 0) {
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] No search results, updating to no_match state');
          }
          clearTimeoutOnComplete();
          
          // Double-check session before updating
          if (sessionKey !== activeSessionRef.current) {
            if (__DEV__) {
              console.log('[ClaudeGameIdentifier] Session changed, aborting no_match update');
            }
            return;
          }
          
          // Use requestAnimationFrame to defer state update and prevent render crashes
          requestAnimationFrame(() => {
            if (sessionKey !== activeSessionRef.current) {
              return;
            }
            
            if (__DEV__) {
              console.log('[ClaudeGameIdentifier] Updating candidate to no_match in requestAnimationFrame');
            }
            
            updateCandidate(candidateId, (candidate) => {
              try {
                const searchedTitle = query || rawTitle || candidate.claudeTitle || 'this game';
                const updated = {
                  ...candidate,
                  bggStatus: 'no_match',
                  bggErrorMessage: `No matches for "${searchedTitle}" on BGG`,
                  searchedTitle: searchedTitle, // Store the searched title for the correction button
                };
                // Preserve styling - ensure it's a valid object
                if (candidate && candidate.styling && typeof candidate.styling === 'object') {
                  updated.styling = { ...candidate.styling };
                }
                if (__DEV__) {
                  console.log('[ClaudeGameIdentifier] Updated candidate to no_match:', candidateId);
                }
                return updated;
              } catch (updateError) {
                console.error('[ClaudeGameIdentifier] Error in updateCandidate (no_match):', updateError);
                return candidate;
              }
            });
          });
          return;
        }

        // Get the current candidate to check confidence
        const currentCandidate = gameCandidatesRef.current.find((c) => c.id === candidateId) || {
          id: candidateId,
          claudeTitle: rawTitle || 'Unknown',
          claudeConfidence: 'unknown',
        };
        
        const isHighOrMediumConfidence = currentCandidate.claudeConfidence === 'high' || currentCandidate.claudeConfidence === 'medium';
        
        // For high/medium confidence: show first result + "More Titles" button
        if (isHighOrMediumConfidence && searchResults.length > 0) {
          clearTimeoutOnComplete();
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] High/medium confidence, showing first result with More Titles option');
          }
          
          if (sessionKey === activeSessionRef.current) {
            // Load details for first result - always fetch from BGG API to get thumbnails
            let details = null;
            try {
              if (searchResults[0].id) {
                // Always fetch from BGG API to ensure we get thumbnails
                const { fetchBGGGameDetails } = await import('../services/bggApi');
                const bggDetails = await fetchBGGGameDetails(searchResults[0].id);
                
                // If BGG API doesn't have it, fall back to getGameDetails
                if (!bggDetails || !bggDetails.thumbnail) {
                  details = await getGameDetails(searchResults[0].id);
                } else {
                  details = bggDetails;
                }
              }
            } catch (detailError) {
              console.warn('[ClaudeGameIdentifier] Detail fetch failed, trying getGameDetails:', detailError);
              // Fallback to getGameDetails if BGG API fails
              try {
                if (searchResults[0].id) {
                  details = await getGameDetails(searchResults[0].id);
                }
              } catch (fallbackError) {
                console.warn('[ClaudeGameIdentifier] Fallback detail fetch also failed:', fallbackError);
              }
            }
            
            updateCandidate(candidateId, (candidate) => {
              return {
                ...candidate,
                bggStatus: 'matched',
                bggSearchResults: searchResults, // Store all results for carousel
                bggData: {
                  id: searchResults[0].id,
                  name: details?.name || searchResults[0].name,
                  thumbnail: details?.thumbnail || null,
                  image: details?.image || null,
                  yearPublished: details?.yearPublished || searchResults[0].yearPublished || '',
                },
              };
            });
          }
          return;
        }
        
        // If multiple results found (shouldn't happen for high/medium, but handle it)
        if (searchResults.length > 1) {
          clearTimeoutOnComplete();
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] Multiple results found:', searchResults.length);
          }
          
          if (sessionKey === activeSessionRef.current) {
            // Fallback: show all options
            if (false) { // This branch shouldn't be reached for high/medium
            } else {
              // Low confidence: show all options as before
              // Remove the original candidate (we'll replace it with multiple cards)
              setGameCandidates((prev) => prev.filter((c) => c.id !== candidateId));
              
              // Load details for top 10 results and create candidate cards
              const topResults = searchResults.slice(0, 10);
              Promise.all(
                topResults.map(async (result, index) => {
                  try {
                    // Always fetch from BGG API first to ensure we get thumbnails
                    const { fetchBGGGameDetails } = await import('../services/bggApi');
                    let details = null;
                    try {
                      const bggDetails = await fetchBGGGameDetails(result.id);
                      if (bggDetails && bggDetails.thumbnail) {
                        details = bggDetails;
                      } else {
                        details = await getGameDetails(result.id);
                        // Merge BGG API thumbnail if available
                        if (bggDetails && bggDetails.thumbnail) {
                          details.thumbnail = bggDetails.thumbnail;
                          details.image = bggDetails.image || details.image;
                        }
                      }
                    } catch (bggError) {
                      // Fallback to getGameDetails if BGG API fails
                      details = await getGameDetails(result.id);
                    }
                    
                    return {
                      id: result.id,
                      name: details?.name || result.name,
                      thumbnail: details?.thumbnail || null,
                      image: details?.image || null,
                      yearPublished: details?.yearPublished || result.yearPublished || '',
                      rank: details?.rank || result.rank || '0',
                    };
                  } catch (error) {
                    console.warn('[ClaudeGameIdentifier] Error loading details for result:', result.id, error);
                    return {
                      id: result.id,
                      name: result.name,
                      thumbnail: null,
                      image: null,
                      yearPublished: result.yearPublished || '',
                      rank: result.rank || '0',
                    };
                  }
                })
              ).then((enrichedResults) => {
                if (sessionKey === activeSessionRef.current) {
                  // Create a candidate card for each result
                  const newCandidates = enrichedResults.map((result, index) => {
                    // Create unique ID for each candidate card
                    const newCandidateId = `${candidateId}-option-${index}`;
                    
                    return {
                      id: newCandidateId,
                      claudeTitle: result.name,
                      claudeConfidence: currentCandidate.claudeConfidence || 'unknown',
                      bggStatus: 'matched',
                      bggData: {
                        id: result.id,
                        name: result.name,
                        thumbnail: result.thumbnail,
                        image: result.image,
                        yearPublished: result.yearPublished,
                      },
                      status: 'pending',
                      originalCandidateId: candidateId, // Track which original candidate this came from
                    };
                  });
                  
                  // Add all new candidates to staging area
                  setGameCandidates((prev) => [...prev, ...newCandidates]);
                  
                  if (__DEV__) {
                    console.log('[ClaudeGameIdentifier] Created', newCandidates.length, 'candidate cards in staging area');
                  }
                }
              }).catch((error) => {
                console.error('[ClaudeGameIdentifier] Error loading multiple results:', error);
                // Fall back to first result if available
                if (searchResults && searchResults.length > 0 && searchResults[0]) {
                  handleSelectFromMultipleResults(searchResults[0], candidateId, sessionKey);
                }
              });
            }
          }
          return;
        }
        
        const primaryResult = searchResults[0];
        
        // Validate primaryResult has required fields
        if (!primaryResult || !primaryResult.id) {
          clearTimeoutOnComplete();
          if (__DEV__) {
            console.warn('[ClaudeGameIdentifier] Invalid primaryResult:', primaryResult);
          }
          if (sessionKey === activeSessionRef.current) {
            updateCandidate(candidateId, (candidate) => {
              try {
                const searchedTitle = rawTitle || candidate.claudeTitle || 'this game';
                const updated = {
                  ...candidate,
                  bggStatus: 'no_match',
                  bggErrorMessage: `No matches for "${searchedTitle}" on BGG`,
                  searchedTitle: searchedTitle, // Store the searched title for the correction button
                };
                if (candidate && candidate.styling && typeof candidate.styling === 'object') {
                  updated.styling = { ...candidate.styling };
                }
                return updated;
              } catch (updateError) {
                console.error('[ClaudeGameIdentifier] Error in updateCandidate (invalid result):', updateError);
                return candidate;
              }
            });
          }
          return;
        }

        let details = null;

        try {
          if (primaryResult.id) {
            // Always fetch from BGG API first to ensure we get thumbnails
            const { fetchBGGGameDetails } = await import('../services/bggApi');
            const bggDetails = await fetchBGGGameDetails(primaryResult.id);
            
            // If BGG API doesn't have it, fall back to getGameDetails
            if (!bggDetails || !bggDetails.thumbnail) {
              details = await getGameDetails(primaryResult.id);
              // Merge BGG API thumbnail if available
              if (bggDetails && bggDetails.thumbnail) {
                details.thumbnail = bggDetails.thumbnail;
                details.image = bggDetails.image || details.image;
              }
            } else {
              details = bggDetails;
            }
          }
        } catch (detailError) {
          console.warn('[ClaudeGameIdentifier] BGG detail fetch failed, trying getGameDetails:', detailError);
          // Fallback to getGameDetails if BGG API fails
          try {
            if (primaryResult.id) {
              details = await getGameDetails(primaryResult.id);
            }
          } catch (fallbackError) {
            console.warn('[ClaudeGameIdentifier] Fallback detail fetch also failed:', fallbackError);
          }
        }

        if (sessionKey !== activeSessionRef.current) {
          return;
        }

        clearTimeoutOnComplete();
        
        // Double-check session before updating
        if (sessionKey !== activeSessionRef.current) {
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] Session changed before matched update, aborting:', candidateId);
          }
          return;
        }

        // Use requestAnimationFrame to defer state update and prevent render crashes
        requestAnimationFrame(() => {
          if (sessionKey !== activeSessionRef.current) {
            return;
          }
          
          updateCandidate(candidateId, (candidate) => {
            try {
              // Ensure we preserve styling and other important fields
              const updatedCandidate = {
                ...candidate,
                bggStatus: 'matched',
                bggData: {
                  id: primaryResult.id || candidate.bggData?.id || null,
                  name: details?.name || primaryResult.name || candidate.claudeTitle || 'Unknown',
                  thumbnail: details?.thumbnail || primaryResult.thumbnail || null,
                  image: details?.image || primaryResult.image || null,
                  yearPublished: details?.yearPublished || primaryResult.yearPublished || candidate.bggData?.yearPublished || '',
                },
              };
              // Preserve styling if it exists - ensure it's a valid object
              if (candidate && candidate.styling && typeof candidate.styling === 'object') {
                updatedCandidate.styling = { ...candidate.styling };
              }
              if (__DEV__) {
                console.log('[ClaudeGameIdentifier] Updated candidate to matched:', candidateId, updatedCandidate.bggData.name);
              }
              return updatedCandidate;
            } catch (updateError) {
              console.error('[ClaudeGameIdentifier] Error in updateCandidate (matched):', updateError, candidate);
              return candidate;
            }
          });
        });
      } catch (searchError) {
        console.error('[ClaudeGameIdentifier] BGG search failed:', searchError);
        // Clear timeout on error
        if (typeof clearTimeoutOnComplete === 'function') {
          clearTimeoutOnComplete();
        }
        if (sessionKey === activeSessionRef.current) {
          // BGG API requires authentication - show game without metadata but still allow confirmation
          updateCandidate(candidateId, (candidate) => {
            try {
              const updated = {
                ...candidate,
                bggStatus: 'error',
                bggErrorMessage: 'BGG metadata unavailable. You can still confirm this game.',
              };
              // Preserve styling - ensure it's a valid object
              if (candidate && candidate.styling && typeof candidate.styling === 'object') {
                updated.styling = { ...candidate.styling };
              }
              if (__DEV__) {
                console.log('[ClaudeGameIdentifier] Updated candidate to error state:', candidateId);
              }
              return updated;
            } catch (updateError) {
              console.error('[ClaudeGameIdentifier] Error in updateCandidate (error):', updateError);
              return candidate;
            }
          });
        }
      }
    },
    [updateCandidate]
  );

  const processBggQueue = useCallback(async () => {
    if (isProcessingBggQueueRef.current || bggFetchQueueRef.current.length === 0) {
      return;
    }

    isProcessingBggQueueRef.current = true;
    const item = bggFetchQueueRef.current.shift();
    
    if (item && item.sessionKey === activeSessionRef.current) {
      try {
        await fetchBGGMetadata(item.sessionKey, item.candidateId, item.title);
      } catch (error) {
        console.error('[ClaudeGameIdentifier] Error processing BGG queue item:', error);
      }
    }

    isProcessingBggQueueRef.current = false;
    
    // Process next item in queue after a short delay
    if (bggFetchQueueRef.current.length > 0) {
      setTimeout(() => processBggQueue(), 300);
    }
  }, [fetchBGGMetadata]);

  const scheduleBGGFetch = useCallback(
    (sessionKey, candidateId, title, delayMs = 0) => {
      // Add to queue instead of scheduling directly to prevent concurrent Firestore queries
      const queueItem = { sessionKey, candidateId, title };
      
      if (delayMs > 0) {
        const timerId = setTimeout(() => {
          pendingFetchTimersRef.current = pendingFetchTimersRef.current.filter((id) => id !== timerId);
          bggFetchQueueRef.current.push(queueItem);
          processBggQueue();
        }, delayMs);
        pendingFetchTimersRef.current.push(timerId);
      } else {
        bggFetchQueueRef.current.push(queueItem);
        processBggQueue();
      }
    },
    [processBggQueue]
  );

  const beginIdentificationWorkflow = useCallback(
    async (capturedPhoto, sessionKey) => {
      setIsProcessing(true);
      setError(null);
      setComments('');
      setGameCandidates([]);

      try {
        const imageBase64 =
          capturedPhoto.base64 ||
          (await FileSystem.readAsStringAsync(capturedPhoto.uri, {
            encoding: FileSystem.EncodingType.Base64,
          }));

        const result = await identifyGamesFromImage({
          imageBase64,
          imageMediaType: capturedPhoto?.mimeType || 'image/jpeg',
          narrationText,
          audioNarration: audioClip.base64
            ? { data: audioClip.base64, mediaType: audioClip.mediaType }
            : undefined,
          rejectedTitles: [],
        });

        setComments(result.comments || '');
        const rawGames = Array.isArray(result.games) ? result.games : [];

        const uniqueTitles = new Set();
        const filteredGames = rawGames.filter((game) => {
          const titleKey = `${game.title}`.toLowerCase();
          if (uniqueTitles.has(titleKey)) {
            return false;
          }
          uniqueTitles.add(titleKey);
          return true;
        });

        if (__DEV__) {
          console.log('Claude identified titles:', filteredGames.map((game) => game.title));
        }

        if (!filteredGames.length) {
          // Check if comments contain lighting/glare guidance
          const comments = result.comments || '';
          const hasLightingGuidance = comments.toLowerCase().includes('light') || 
                                     comments.toLowerCase().includes('glare') || 
                                     comments.toLowerCase().includes('lighting') ||
                                     comments.toLowerCase().includes('reflection');
          
          if (hasLightingGuidance && comments.trim()) {
            // Show the lighting guidance as an error message
            setError(comments.trim());
          } else {
            setError('Claude could not recognise any games in this photo.');
          }
          return;
        }

        filteredGames.forEach((game, index) => {
          try {
            const candidateId = `${sessionKey}-${index}-${Date.now()}`;
            
            // Validate and normalize styling if present
            let styling = null;
            let fontReasoning = null;
            if (game.styling) {
              try {
                // Ensure styling is an object
                if (typeof game.styling === 'object' && game.styling !== null) {
                  styling = game.styling;
                  if (__DEV__) {
                    console.log('[ClaudeGameIdentifier] Styling for', game.title, ':', JSON.stringify(styling, null, 2));
                    console.log('[ClaudeGameIdentifier] Font family from Claude:', styling.fontFamily || 'NOT PROVIDED');
                    console.log('[ClaudeGameIdentifier] Font reasoning:', game.fontReasoning || 'NOT PROVIDED');
                  }
                }
              } catch (stylingError) {
                console.warn('[ClaudeGameIdentifier] Error processing styling:', stylingError);
                styling = null;
              }
            } else if (__DEV__) {
              console.log('[ClaudeGameIdentifier] No styling object for', game.title);
            }
            
            // Store fontReasoning if provided
            if (game.fontReasoning) {
              fontReasoning = game.fontReasoning;
            }
            
            const candidate = {
              id: candidateId,
              claudeTitle: game.title || 'Untitled',
              additionalText: game.additionalText || null, // Store additional text that's not part of the title
              claudeConfidence: game.confidence || 'unknown',
              boxDescription: game.boxDescription || null, // Description for low confidence games
              claudeNotes: game.notes || '',
              // Styling removed - we use BGG thumbnails instead of AI-generated styling
              status: 'pending',
              bggStatus: 'idle',
              bggData: null,
              bggErrorMessage: null,
              origin: 'claude',
              createdAt: Date.now(),
              collectionRecordId: null,
            };
            
            // Validate candidate structure
            if (!candidate.id || !candidate.claudeTitle) {
              console.warn('[ClaudeGameIdentifier] Invalid candidate structure:', candidate);
              return; // Skip invalid candidates
            }

            setGameCandidates((prev) => {
              if (sessionKey !== activeSessionRef.current) {
                return prev;
              }
              return [...prev, candidate];
            });

            // Stagger searches more aggressively to prevent concurrent Firestore queries
            // Start with 500ms delay, then add 800ms for each subsequent game
            const delayMs = 500 + (index * 800);
            scheduleBGGFetch(sessionKey, candidateId, game.title, delayMs);
          } catch (candidateError) {
            console.error('[ClaudeGameIdentifier] Error creating candidate:', candidateError, game);
            // Continue with next game instead of crashing
          }
        });
      } catch (identifyError) {
        console.error('Claude identification failed:', identifyError);
        const errorMessage = identifyError.message || 'Failed to identify games. Please try again.';
        
        // Provide more helpful error messages
        let userFriendlyMessage = errorMessage;
        if (errorMessage.toLowerCase().includes('overloaded')) {
          userFriendlyMessage = 'Claude API is temporarily overloaded. Please wait a few seconds and try again.';
        } else if (errorMessage.toLowerCase().includes('rate limit')) {
          userFriendlyMessage = 'Too many requests. Please wait a moment before trying again.';
        }
        
        setError(userFriendlyMessage);
      } finally {
        if (sessionKey === activeSessionRef.current) {
          setIsProcessing(false);
        }
      }
    },
    [audioClip, narrationText, scheduleBGGFetch]
  );

  const handleCapturePhoto = async () => {
    setError(null);
    if (!cameraRef.current || !cameraReady) {
      return;
    }

    clearPendingFetchTimers();

    try {
      const capturedPhoto = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: true,
      });

      const sessionKey = `session-${Date.now()}`;
      activeSessionRef.current = sessionKey;

      setPhoto(capturedPhoto);
      
      // Start identification workflow first
      beginIdentificationWorkflow(capturedPhoto, sessionKey);
      
      // Close camera modal - results modal will be opened by parent
      if (onCameraModalClose) {
        onCameraModalClose();
      }
    } catch (captureError) {
      console.error('Error capturing photo:', captureError);
      setError('Unable to capture photo. Please try again.');
    }
  };

  const resetPhotoCapture = useCallback(() => {
    clearPendingFetchTimers();
    activeSessionRef.current = null;
    setPhoto(null);
    // Only clear pending candidates, keep confirmed ones
    setGameCandidates((prev) => prev.filter((c) => c.status === 'confirmed'));
    setComments('');
    setAudioClip(defaultAudioState);
    setNarrationText('');
    setError(null);
    setCorrectionCandidate(null);
    setIsCorrectionModalVisible(false);
    setCorrectionSuggestions([]);
    setCorrectionQuery('');
    setCorrectionError(null);
    setIsProcessing(false);
  }, [clearPendingFetchTimers]);

  const resetCapture = () => {
    clearPendingFetchTimers();
    activeSessionRef.current = null;
    setPhoto(null);
    setGameCandidates([]);
    setComments('');
    setAudioClip(defaultAudioState);
    setNarrationText('');
    setError(null);
    setCorrectionCandidate(null);
    setIsCorrectionModalVisible(false);
    setCorrectionSuggestions([]);
    setCorrectionQuery('');
    setCorrectionError(null);
    setIsProcessing(false);
  };

  const handleDone = () => {
    if (onDone) {
      onDone();
    } else {
      resetCapture();
    }
  };

  const startRecording = async () => {
    setError(null);
    const granted = await requestAudioPermission();
    if (!granted) {
      setError('Microphone access is required to record narration.');
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
    } catch (recordError) {
      console.error('Error starting recording:', recordError);
      setError('Unable to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) {
      return;
    }

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setAudioClip({
        uri,
        base64,
        durationMs: recording.getDurationMillis() || 0,
        mediaType: 'audio/m4a',
      });
    } catch (stopError) {
      console.error('Error stopping recording:', stopError);
      setError('Unable to save recording. Please try again.');
    } finally {
      setRecording(null);
      setIsRecording(false);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    }
  };

  const discardAudio = () => {
    setAudioClip(defaultAudioState);
  };

  const handleViewSimilarGames = useCallback(
    (candidateId) => {
      // Prevent opening modal if we're currently selecting a suggestion
      if (isSelectingSuggestionRef.current) {
        if (__DEV__) {
          console.log('[Correction Modal] Currently selecting suggestion, ignoring request');
        }
        return;
      }

      const candidate = gameCandidates.find((item) => item.id === candidateId);
      if (!candidate || candidate.status === 'confirmed') {
        return;
      }

      if (__DEV__) {
        console.log('[Correction Modal] Opening modal for candidate:', candidateId);
      }

      // Set up the correction modal with the current candidate's title
      // This will search for similar games and show them in a carousel
      // Use searchedTitle if available (from no_match), otherwise use bggData name or claudeTitle
      const searchQuery = candidate.searchedTitle || candidate.bggData?.name || candidate.claudeTitle || '';
      setCorrectionCandidate(candidate);
      setCorrectionQuery(searchQuery);
      setCorrectionSuggestions([]);
      setCorrectionError(null);
      setIsCorrectionModalVisible(true);

      // Automatically trigger search for similar games after modal opens
      if (searchQuery.trim()) {
        // Use setTimeout to ensure modal is visible before searching
        setTimeout(() => {
          handleCorrectionSearch(searchQuery);
        }, 300);
      }
    },
    [gameCandidates, handleCorrectionSearch]
  );

  const handleConfirmCandidate = useCallback(
    (candidateId) => {
      const candidate = gameCandidates.find((item) => item.id === candidateId);
      if (!candidate || candidate.status === 'confirmed') {
      return;
    }

      const title = candidate.bggData?.name || candidate.claudeTitle;
    const now = new Date().toISOString();
      const collectionRecordId = `claude-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const gameRecord = {
        id: collectionRecordId,
        title,
      source: 'claude_image',
        claudeConfidence: candidate.claudeConfidence,
        claudeNotes: candidate.claudeNotes || '',
        additionalText: candidate.additionalText || null, // Store additional text that's not part of the title
      claudeComments: comments,
      createdAt: now,
      updatedAt: now,
        bggId: candidate.bggData?.id || null,
        bggThumbnail: candidate.bggData?.thumbnail || null,
        bggImage: candidate.bggData?.image || null,
        yearPublished: candidate.bggData?.yearPublished || null,
        // Styling removed - we use BGG thumbnails instead of AI-generated styling
      };

      setGameCandidates((prev) => {
        const updated = prev.map((item) =>
          item.id === candidateId ? { ...item, status: 'confirmed', collectionRecordId } : item
        );

        // Don't auto-reset - let the user see their confirmed games
        // They can click "I'm done" or continue identifying more games

        return updated;
      });

      if (!onAddToCollection) {
        Alert.alert('Game confirmed', `${title} added from Claude identification.`);
        return;
      }

    onAddToCollection(gameRecord);
    },
    [comments, gameCandidates, onAddToCollection, resetPhotoCapture]
  );

  const handleEditCandidate = useCallback(
    (candidateId) => {
      const candidate = gameCandidates.find((item) => item.id === candidateId);
      if (!candidate) {
        return;
      }

      // Open correction modal for manual editing
      setCorrectionCandidate(candidate);
      setCorrectionQuery(candidate.bggData?.name || candidate.claudeTitle || '');
      setCorrectionSuggestions([]);
      setCorrectionError(null);
      setIsCorrectionModalVisible(true);
    },
    [gameCandidates]
  );

  const handleUndoConfirm = useCallback(
    (candidateId) => {
      const candidate = gameCandidates.find((item) => item.id === candidateId);
      if (!candidate || candidate.status !== 'confirmed') {
        return;
      }

      // Remove from collection if it was added
      if (onRemoveFromCollection && candidate.collectionRecordId) {
        onRemoveFromCollection(candidate.collectionRecordId);
      }

      // Change status back to pending and clear collectionRecordId
      setGameCandidates((prev) =>
        prev.map((item) =>
          item.id === candidateId
            ? { ...item, status: 'pending', collectionRecordId: null }
            : item
        )
      );
    },
    [gameCandidates, onRemoveFromCollection]
  );

  const handleRemoveConfirmedCandidate = useCallback(
    (candidateId) => {
      const candidate = gameCandidates.find((item) => item.id === candidateId);
      if (!candidate || candidate.status !== 'confirmed') {
        return;
      }

      const title = candidate.bggData?.name || candidate.claudeTitle;

      Alert.alert(
        'Remove game?',
        `Remove ${title} from your collection?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              setGameCandidates((prev) => prev.filter((item) => item.id !== candidateId));
              if (onRemoveFromCollection && candidate.collectionRecordId) {
                onRemoveFromCollection(candidate.collectionRecordId, {
                  title,
                  claudeConfidence: candidate.claudeConfidence,
                  claudeNotes: candidate.claudeNotes,
                  bggData: candidate.bggData,
                });
              }
            },
          },
        ],
        { cancelable: true }
      );
    },
    [gameCandidates, onRemoveFromCollection]
  );

  const handleRejectCandidate = useCallback(
    (candidateId) => {
      const candidate = gameCandidates.find((item) => item.id === candidateId);
      if (!candidate) {
        return;
      }

      setGameCandidates((prev) => prev.filter((item) => item.id !== candidateId));

      setCorrectionCandidate(candidate);
      setCorrectionQuery(candidate.bggData?.name || candidate.claudeTitle || '');
      setCorrectionSuggestions([]);
      setCorrectionError(null);
      setIsCorrectionModalVisible(true);
    },
    [gameCandidates]
  );

  const closeCorrectionModal = useCallback(() => {
    setIsCorrectionModalVisible(false);
    setCorrectionCandidate(null);
    setCorrectionQuery('');
    setCorrectionSuggestions([]);
    setCorrectionError(null);
    setIsCorrectionSearching(false);
  }, []);

  const handleCorrectionSearch = useCallback(
    async (queryOverride = null) => {
      // Use the query override if provided, otherwise use the current state
      const queryToSearch = queryOverride !== null ? queryOverride.trim() : correctionQuery.trim();
      
      if (!queryToSearch) {
        setCorrectionSuggestions([]);
        setCorrectionError('Enter a game title to search.');
        return;
      }

      if (__DEV__) {
        console.log('[Correction Modal] Searching for:', queryToSearch);
      }

      setIsCorrectionSearching(true);
      setCorrectionError(null);
      setCorrectionSuggestions([]);

      try {
        const matches = await searchGamesByName(queryToSearch);

        if (__DEV__) {
          console.log('[Correction Modal] Found matches:', matches.length);
        }

        if (!matches.length) {
          setCorrectionSuggestions([]);
          setCorrectionError('No similar games found. Try a different title.');
          return;
        }

        // Get more matches for carousel (limit to 20 for performance)
        const limitedMatches = matches.slice(0, 20);
        const enrichedMatches = await Promise.all(
          limitedMatches.map(async (match) => {
            try {
              // Always fetch from BGG API first to ensure we get thumbnails
              const { fetchBGGGameDetails } = await import('../services/bggApi');
              let details = null;
              try {
                const bggDetails = await fetchBGGGameDetails(match.id);
                if (bggDetails && bggDetails.thumbnail) {
                  details = bggDetails;
                } else {
                  details = await getGameDetails(match.id);
                  // Merge BGG API thumbnail if available
                  if (bggDetails && bggDetails.thumbnail) {
                    details.thumbnail = bggDetails.thumbnail;
                    details.image = bggDetails.image || details.image;
                  }
                }
              } catch (bggError) {
                // Fallback to getGameDetails if BGG API fails
                details = await getGameDetails(match.id);
              }
              
              return {
                id: match.id,
                name: details?.name || match.name,
                thumbnail: details?.thumbnail || null,
                image: details?.image || null,
                yearPublished: details?.yearPublished || match.yearPublished || '',
              };
            } catch (detailError) {
              console.warn('BGG detail fetch (correction) failed:', detailError);
              return {
                id: match.id,
                name: match.name,
                thumbnail: null,
                image: null,
                yearPublished: match.yearPublished || '',
              };
            }
          })
        );

        if (__DEV__) {
          console.log('[Correction Modal] Enriched matches:', enrichedMatches.length);
        }

        setCorrectionSuggestions(enrichedMatches);
      } catch (searchError) {
        console.error('[Correction Modal] Search failed:', searchError);
        setCorrectionSuggestions([]);
        setCorrectionError('Something went wrong while searching. Please try again.');
      } finally {
        setIsCorrectionSearching(false);
      }
    },
    [correctionQuery]
  );

  const handleSuggestionSelect = useCallback(
    (suggestion) => {
      if (!suggestion) {
        return;
      }

      // Prevent multiple selections
      if (isSelectingSuggestionRef.current) {
        if (__DEV__) {
          console.log('[Correction Modal] Already selecting, ignoring');
        }
        return;
      }

      isSelectingSuggestionRef.current = true;

      if (__DEV__) {
        console.log('[Correction Modal] Selecting suggestion:', suggestion.name);
      }

      // Close modal immediately and stop any searches
      setIsCorrectionModalVisible(false);
      setIsCorrectionSearching(false);
      setCorrectionSuggestions([]);

      // If we have a correction candidate, update it instead of creating a new one
      if (correctionCandidate) {
        setGameCandidates((prev) =>
          prev.map((candidate) => {
            if (candidate.id === correctionCandidate.id) {
              return {
                ...candidate,
                claudeTitle: suggestion.name,
                bggStatus: 'matched',
                bggData: {
                  id: suggestion.id,
                  name: suggestion.name,
                  thumbnail: suggestion.thumbnail,
                  image: suggestion.image,
                  yearPublished: suggestion.yearPublished,
                },
                bggErrorMessage: null,
                // Preserve styling if it exists
                // Styling removed - we use BGG thumbnails instead
              };
            }
            return candidate;
          })
        );
      } else {
        // Fallback: create a new candidate if no correction candidate exists
        const baseCandidate = {
          claudeConfidence: 'manual',
          claudeNotes: '',
        };

        const sessionKey = activeSessionRef.current || `session-${Date.now()}`;
        const candidateId = `${sessionKey}-manual-${Date.now()}`;

        const newCandidate = {
          id: candidateId,
          claudeTitle: suggestion.name,
          claudeConfidence: baseCandidate.claudeConfidence,
          claudeNotes: baseCandidate.claudeNotes,
          status: 'pending',
          bggStatus: 'matched',
          bggData: {
            id: suggestion.id,
            name: suggestion.name,
            thumbnail: suggestion.thumbnail,
            image: suggestion.image,
            yearPublished: suggestion.yearPublished,
          },
          bggErrorMessage: null,
          origin: 'correction',
          createdAt: Date.now(),
          collectionRecordId: null,
        };

        setGameCandidates((prev) => [newCandidate, ...prev]);
      }
      
      // Clear correction state after a delay to prevent race conditions
      setTimeout(() => {
        setCorrectionCandidate(null);
        setCorrectionQuery('');
        setCorrectionSuggestions([]);
        setCorrectionError(null);
        setIsCorrectionSearching(false);
        isSelectingSuggestionRef.current = false;
      }, 300);
    },
    [correctionCandidate]
  );

  const handleInlineCorrectionSearch = useCallback(
    async (candidateId) => {
      const searchQuery = inlineCorrectionInputs[candidateId]?.trim();
      if (!searchQuery) {
        return;
      }

      const candidate = gameCandidates.find((item) => item.id === candidateId);
      if (!candidate) {
        return;
      }

      // Set searching state
      setInlineCorrectionSearching((prev) => ({
        ...prev,
        [candidateId]: true,
      }));

      try {
        if (__DEV__) {
          console.log('[Inline Correction] Searching backend first for:', searchQuery);
        }

        // Try backend first (no BGG fallback)
        let matches = await searchGamesByName(searchQuery, false);
        
        // If no backend results, try BGG API
        if (matches.length === 0) {
          if (__DEV__) {
            console.log('[Inline Correction] No backend results, trying BGG API...');
          }
          try {
            const { searchBGGAPI } = await import('../services/bggApi');
            const bggResults = await searchBGGAPI(searchQuery, 50);
            if (bggResults && bggResults.length > 0) {
              matches = bggResults;
            }
          } catch (bggError) {
            console.warn('[Inline Correction] BGG API search failed:', bggError);
          }
        }

        if (!matches || matches.length === 0) {
          Alert.alert(
            'No matches found',
            `No games found for "${searchQuery}". Try a different spelling or search term.`,
            [{ text: 'OK' }]
          );
          setInlineCorrectionSearching((prev) => ({
            ...prev,
            [candidateId]: false,
          }));
          return;
        }

        // Take the first match
        const selectedMatch = matches[0];
        let details = null;

        try {
          if (selectedMatch.id) {
            // Always fetch from BGG API first to ensure we get thumbnails
            const { fetchBGGGameDetails } = await import('../services/bggApi');
            try {
              const bggDetails = await fetchBGGGameDetails(selectedMatch.id);
              if (bggDetails && bggDetails.thumbnail) {
                details = bggDetails;
              } else {
                details = await getGameDetails(selectedMatch.id);
                // Merge BGG API thumbnail if available
                if (bggDetails && bggDetails.thumbnail) {
                  details.thumbnail = bggDetails.thumbnail;
                  details.image = bggDetails.image || details.image;
                }
              }
            } catch (bggError) {
              // Fallback to getGameDetails if BGG API fails
              details = await getGameDetails(selectedMatch.id);
            }
          }
        } catch (detailError) {
          console.warn('[Inline Correction] Detail fetch failed:', detailError);
        }

        // Update the candidate with the found game
        setGameCandidates((prev) =>
          prev.map((c) => {
            if (c.id === candidateId) {
              return {
                ...c,
                claudeTitle: details?.name || selectedMatch.name || searchQuery,
                bggStatus: 'matched',
                bggData: {
                  id: selectedMatch.id,
                  name: details?.name || selectedMatch.name || searchQuery,
                  thumbnail: details?.thumbnail || selectedMatch.thumbnail || null,
                  image: details?.image || selectedMatch.image || null,
                  yearPublished: details?.yearPublished || selectedMatch.yearPublished || '',
                },
                bggErrorMessage: null,
                searchedTitle: null, // Clear searched title since we found a match
                // Preserve styling if it exists
                styling: c.styling || null,
              };
            }
            return c;
          })
        );

        // Clear the input for this candidate
        setInlineCorrectionInputs((prev) => {
          const updated = { ...prev };
          delete updated[candidateId];
          return updated;
        });
      } catch (searchError) {
        console.error('[Inline Correction] Search failed:', searchError);
        Alert.alert(
          'Search failed',
          'Something went wrong while searching. Please try again.',
          [{ text: 'OK' }]
        );
      } finally {
        setInlineCorrectionSearching((prev) => ({
          ...prev,
          [candidateId]: false,
        }));
      }
    },
    [gameCandidates, inlineCorrectionInputs]
  );

  const handleSelectFromMultipleResults = useCallback(
    async (selectedResult, candidateId, sessionKey) => {
      if (sessionKey !== activeSessionRef.current) {
        return;
      }

      setIsMultipleResultsModalVisible(false);
      setMultipleResultsOptions([]);
      setMultipleResultsCandidate(null);

      try {
        let details = null;
        try {
          if (selectedResult.id) {
            // Always fetch from BGG API first to ensure we get thumbnails
            const { fetchBGGGameDetails } = await import('../services/bggApi');
            try {
              const bggDetails = await fetchBGGGameDetails(selectedResult.id);
              if (bggDetails && bggDetails.thumbnail) {
                details = bggDetails;
              } else {
                details = await getGameDetails(selectedResult.id);
                // Merge BGG API thumbnail if available
                if (bggDetails && bggDetails.thumbnail) {
                  details.thumbnail = bggDetails.thumbnail;
                  details.image = bggDetails.image || details.image;
                }
              }
            } catch (bggError) {
              // Fallback to getGameDetails if BGG API fails
              details = await getGameDetails(selectedResult.id);
            }
          }
        } catch (detailError) {
          console.warn('[ClaudeGameIdentifier] Detail fetch failed for selected result:', detailError);
        }

        if (sessionKey !== activeSessionRef.current) {
          return;
        }

        // Use requestAnimationFrame to defer state update
        requestAnimationFrame(() => {
          if (sessionKey !== activeSessionRef.current) {
            return;
          }

          updateCandidate(candidateId, (candidate) => {
            try {
              const updatedCandidate = {
                ...candidate,
                claudeTitle: details?.name || selectedResult.name || candidate.claudeTitle,
                bggStatus: 'matched',
                bggData: {
                  id: selectedResult.id,
                  name: details?.name || selectedResult.name || candidate.claudeTitle || 'Unknown',
                  thumbnail: details?.thumbnail || selectedResult.thumbnail || null,
                  image: details?.image || selectedResult.image || null,
                  yearPublished: details?.yearPublished || selectedResult.yearPublished || candidate.bggData?.yearPublished || '',
                },
              };
              // Preserve styling if it exists
              if (candidate && candidate.styling && typeof candidate.styling === 'object') {
                updatedCandidate.styling = { ...candidate.styling };
              }
              if (__DEV__) {
                console.log('[ClaudeGameIdentifier] Updated candidate with selected result:', candidateId, updatedCandidate.bggData.name);
              }
              return updatedCandidate;
            } catch (updateError) {
              console.error('[ClaudeGameIdentifier] Error in updateCandidate (selected result):', updateError, candidate);
              return candidate;
            }
          });
        });
      } catch (error) {
        console.error('[ClaudeGameIdentifier] Error selecting from multiple results:', error);
      }
    },
    [updateCandidate]
  );

  const renderCandidateCard = (candidate) => {
    // Defensive checks to prevent crashes
    if (!candidate || !candidate.id) {
      console.warn('[ClaudeGameIdentifier] Invalid candidate:', candidate);
      return null;
    }

    // Simplified render for loading/idle state to prevent crashes
    // Avoids PulsingControl and complex nested structures during loading
    // Also handles 'idle' state (before BGG fetch starts) to avoid showing placeholder thumbnail
    if (candidate.bggStatus === 'loading' || candidate.bggStatus === 'idle') {
      try {
        const title = candidate.bggData?.name || candidate.claudeTitle || 'Unknown Game';
        
        return (
          <View key={candidate.id} style={[styles.gameCard, styles.gameCardPending]}>
            {/* Game info - no thumbnail placeholder to save space */}
            <View style={[styles.gameBody, { paddingVertical: 12 }]}>
              <Text style={[styles.gameTitle, { fontSize: 16, marginBottom: 8 }]}>{title}</Text>
              <Text style={styles.gameSubtitle}>Fetching BGG data…</Text>
            </View>
            
            {/* No controls during loading - they'll appear after BGG data loads */}
          </View>
        );
      } catch (minimalError) {
        console.error('[ClaudeGameIdentifier] Error in loading state render:', minimalError);
        // Fallback
        return (
          <View key={candidate.id} style={styles.gameCard}>
            <Text style={styles.gameTitle}>Loading game...</Text>
          </View>
        );
      }
    }

    // Additional safety check: if bggStatus is undefined or invalid, show error state
    if (!candidate.bggStatus || (candidate.bggStatus !== 'matched' && candidate.bggStatus !== 'no_match' && candidate.bggStatus !== 'error')) {
      if (__DEV__) {
        console.warn('[ClaudeGameIdentifier] Invalid bggStatus:', candidate.bggStatus, 'for candidate:', candidate.id);
      }
      // Force to error state to show something
      return (
        <View key={candidate.id} style={[styles.gameCard, styles.gameCardPending]}>
          <View style={[styles.gameBody, { paddingVertical: 12 }]}>
            <Text style={[styles.gameTitle, { fontSize: 16, marginBottom: 8 }]}>
              {candidate.bggData?.name || candidate.claudeTitle || 'Unknown Game'}
            </Text>
            <Text style={styles.gameSubtitle}>Error loading game data</Text>
          </View>
        </View>
      );
    }

    try {
      const title = candidate.bggData?.name || candidate.claudeTitle || 'Unknown Game';
      const subtitle = candidate.bggData?.yearPublished
        ? `${candidate.bggData.yearPublished} · Claude confidence: ${candidate.claudeConfidence || 'unknown'}`
        : `Claude confidence: ${candidate.claudeConfidence || 'unknown'}`;

      let borderStyle = styles.gameCardPending;
      if (candidate.status === 'confirmed') {
        borderStyle = styles.gameCardConfirmed;
      }
      
      let deleteButton = null;
      if (candidate.status !== 'confirmed') {
        try {
          deleteButton = (
            <Pressable
              style={styles.cardDeleteButton}
              onPress={() => handleRejectCandidate(candidate.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${title}`}
            >
              <PulsingControl
                type="reject"
                disabled={false}
                onPress={() => handleRejectCandidate(candidate.id)}
                size="small"
              />
            </Pressable>
          );
        } catch (deleteButtonError) {
          console.error('[ClaudeGameIdentifier] Error rendering delete button:', deleteButtonError);
          // Continue without delete button
        }
      }

      let confirmedDeleteButton = null;
      if (candidate.status === 'confirmed') {
        confirmedDeleteButton = (
          <Pressable
            style={styles.confirmedDeleteButton}
            onPress={() => handleRemoveConfirmedCandidate(candidate.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${title} from your collection`}
          >
            <Text style={styles.confirmedDeleteIcon}>✕</Text>
          </Pressable>
        );
      }
      // Safe fallback for first character
      const firstChar = title && typeof title === 'string' && title.length > 0 ? title.charAt(0).toUpperCase() : '?';
      
      const mainView = (
        <View key={candidate.id} style={[styles.gameCard, borderStyle]}>
          {deleteButton}
          {confirmedDeleteButton}

          <View style={styles.gameThumbnailWrapper}>
            {candidate.bggData?.thumbnail && typeof candidate.bggData.thumbnail === 'string' ? (
              <Image 
                source={{ uri: candidate.bggData.thumbnail }} 
                style={styles.gameThumbnail}
                onError={(error) => {
                  console.warn('[ClaudeGameIdentifier] Image load error:', error);
                }}
              />
            ) : (
              <View style={styles.gameThumbnailPlaceholder}>
                <Text style={styles.thumbnailFallbackText}>{firstChar}</Text>
              </View>
            )}
          </View>

          <View style={styles.gameBody}>
            <Text style={styles.gameTitle}>
              {title}
            </Text>
            <Text style={styles.gameSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
            {candidate.bggStatus === 'low_confidence' ? (
              <View style={styles.gameStatusContainer}>
                <Text style={styles.gameStatusMessage}>
                  Please type the title on the {candidate.boxDescription || 'game box'}
                </Text>
                <View style={styles.inlineCorrectionContainer}>
                  <TextInput
                    style={styles.inlineCorrectionInput}
                    value={inlineCorrectionInputs[candidate.id] || ''}
                    onChangeText={(text) => {
                      setInlineCorrectionInputs((prev) => ({
                        ...prev,
                        [candidate.id]: text,
                      }));
                    }}
                    placeholder="Enter game title"
                    onSubmitEditing={async () => {
                      const searchQuery = inlineCorrectionInputs[candidate.id]?.trim();
                      if (!searchQuery) return;
                      
                      setInlineCorrectionSearching((prev) => ({
                        ...prev,
                        [candidate.id]: true,
                      }));
                      
                      try {
                        // Try backend first (no BGG fallback)
                        let results = await searchGamesByName(searchQuery, false);
                        
                        // If no backend results, try BGG API
                        if (results.length === 0) {
                          if (__DEV__) {
                            console.log('[ClaudeGameIdentifier] No backend results, trying BGG API...');
                          }
                          try {
                            const { searchBGGAPI } = await import('../services/bggApi');
                            const bggResults = await searchBGGAPI(searchQuery, 50);
                            if (bggResults && bggResults.length > 0) {
                              results = bggResults;
                            }
                          } catch (bggError) {
                            console.warn('[ClaudeGameIdentifier] BGG API search failed:', bggError);
                          }
                        }
                        
                        if (results && results.length > 0) {
                          // Load details for first result
                          const details = await getGameDetails(results[0].id);
                          updateCandidate(candidate.id, (c) => ({
                            ...c,
                            bggStatus: 'matched',
                            bggData: {
                              id: results[0].id,
                              name: details?.name || results[0].name,
                              thumbnail: details?.thumbnail || null,
                              image: details?.image || null,
                              yearPublished: details?.yearPublished || results[0].yearPublished || '',
                            },
                          }));
                        } else {
                          updateCandidate(candidate.id, (c) => ({
                            ...c,
                            bggStatus: 'no_match',
                            bggErrorMessage: `No matches for "${searchQuery}" found`,
                          }));
                        }
                      } catch (error) {
                        console.error('[ClaudeGameIdentifier] Search error:', error);
                        updateCandidate(candidate.id, (c) => ({
                          ...c,
                          bggStatus: 'error',
                          bggErrorMessage: 'Search failed. Please try again.',
                        }));
                      } finally {
                        setInlineCorrectionSearching((prev) => ({
                          ...prev,
                          [candidate.id]: false,
                        }));
                      }
                    }}
                  />
                  {inlineCorrectionSearching[candidate.id] && (
                    <ActivityIndicator size="small" color="#4a90e2" style={{ marginLeft: 8 }} />
                  )}
                </View>
              </View>
            ) : candidate.bggStatus === 'matched' && candidate.bggSearchResults && candidate.bggSearchResults.length > 1 ? (
              <View style={styles.gameStatusContainer}>
                <Pressable
                  style={styles.moreTitlesButton}
                  onPress={async () => {
                    setIsLoadingMultipleResults(true);
                    setIsMultipleResultsModalVisible(true);
                    setMultipleResultsCandidate(candidate);
                    
                    try {
                      let resultsToShow = candidate.bggSearchResults || [];
                      
                      // If we only have backend results and user wants more, try BGG API
                      if (resultsToShow.length > 0 && resultsToShow.length < 10) {
                        const query = candidate.claudeTitle || '';
                        if (query) {
                          if (__DEV__) {
                            console.log('[ClaudeGameIdentifier] User wants more titles, searching BGG API...');
                          }
                          try {
                            const { searchBGGAPI } = await import('../services/bggApi');
                            const bggResults = await searchBGGAPI(query, 50);
                            if (bggResults && bggResults.length > 0) {
                              // Combine backend and BGG results, removing duplicates
                              const existingIds = new Set(resultsToShow.map(r => r.id));
                              const newBggResults = bggResults.filter(r => !existingIds.has(r.id));
                              resultsToShow = [...resultsToShow, ...newBggResults];
                              if (__DEV__) {
                                console.log(`[ClaudeGameIdentifier] Added ${newBggResults.length} BGG API results`);
                              }
                            }
                          } catch (bggError) {
                            console.warn('[ClaudeGameIdentifier] BGG API search failed:', bggError);
                          }
                        }
                      } else if (resultsToShow.length === 0) {
                        // No results at all, try BGG API
                        const query = candidate.claudeTitle || '';
                        if (query) {
                          if (__DEV__) {
                            console.log('[ClaudeGameIdentifier] No results, trying BGG API...');
                          }
                          try {
                            const { searchBGGAPI } = await import('../services/bggApi');
                            const bggResults = await searchBGGAPI(query, 50);
                            if (bggResults && bggResults.length > 0) {
                              resultsToShow = bggResults;
                            }
                          } catch (bggError) {
                            console.warn('[ClaudeGameIdentifier] BGG API search failed:', bggError);
                          }
                        }
                      }
                      
                      // Load details for all results
                          const enrichedResults = await Promise.all(
                            resultsToShow.slice(0, 10).map(async (result) => {
                              try {
                                // Always fetch from BGG API first to ensure we get thumbnails
                                const { fetchBGGGameDetails } = await import('../services/bggApi');
                                let details = null;
                                try {
                                  const bggDetails = await fetchBGGGameDetails(result.id);
                                  if (bggDetails && bggDetails.thumbnail) {
                                    details = bggDetails;
                                  } else {
                                    details = await getGameDetails(result.id);
                                    // Merge BGG API thumbnail if available
                                    if (bggDetails && bggDetails.thumbnail) {
                                      details.thumbnail = bggDetails.thumbnail;
                                      details.image = bggDetails.image || details.image;
                                    }
                                  }
                                } catch (bggError) {
                                  // Fallback to getGameDetails if BGG API fails
                                  details = await getGameDetails(result.id);
                                }
                                
                                return {
                                  id: result.id,
                                  name: details?.name || result.name,
                                  thumbnail: details?.thumbnail || null,
                                  image: details?.image || null,
                                  yearPublished: details?.yearPublished || result.yearPublished || '',
                                  rank: details?.rank || result.rank || '0',
                                };
                              } catch (error) {
                                console.warn('[ClaudeGameIdentifier] Error loading details:', error);
                                return {
                                  id: result.id,
                                  name: result.name,
                                  thumbnail: null,
                                  image: null,
                                  yearPublished: result.yearPublished || '',
                                  rank: result.rank || '0',
                                };
                              }
                            })
                          );
                      setMultipleResultsOptions(enrichedResults);
                    } catch (error) {
                      console.error('[ClaudeGameIdentifier] Error loading multiple results:', error);
                      setMultipleResultsOptions(candidate.bggSearchResults || []);
                    } finally {
                      setIsLoadingMultipleResults(false);
                    }
                  }}
                >
                  <Text style={styles.moreTitlesButtonText}>More Titles →</Text>
                </Pressable>
              </View>
            ) : candidate.bggStatus === 'no_match' || candidate.bggStatus === 'error' ? (
              <View style={styles.gameStatusContainer}>
                <Text style={styles.gameStatusMessage}>{candidate.bggErrorMessage || 'Error loading data'}</Text>
                {candidate.bggStatus === 'no_match' && (
                  <View style={styles.inlineCorrectionContainer}>
                    <Text style={styles.inlineCorrectionLabel}>Not the right title? Enter it here:</Text>
                    <View style={styles.inlineCorrectionInputRow}>
                      <TextInput
                        style={styles.inlineCorrectionInput}
                        value={inlineCorrectionInputs[candidate.id] || ''}
                        onChangeText={(text) => {
                          setInlineCorrectionInputs((prev) => ({
                            ...prev,
                            [candidate.id]: text,
                          }));
                        }}
                        placeholder="Type correct game name"
                        placeholderTextColor="#999"
                        autoCapitalize="words"
                        returnKeyType="search"
                        onSubmitEditing={() => handleInlineCorrectionSearch(candidate.id)}
                      />
                      <Pressable
                        style={[
                          styles.inlineCorrectionSearchButton,
                          (!inlineCorrectionInputs[candidate.id]?.trim() || inlineCorrectionSearching[candidate.id]) && styles.inlineCorrectionSearchButtonDisabled,
                        ]}
                        onPress={() => handleInlineCorrectionSearch(candidate.id)}
                        disabled={!inlineCorrectionInputs[candidate.id]?.trim() || inlineCorrectionSearching[candidate.id]}
                        accessibilityRole="button"
                        accessibilityLabel="Search for game"
                      >
                        {inlineCorrectionSearching[candidate.id] ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.inlineCorrectionSearchButtonText}>Search</Text>
                        )}
                      </Pressable>
                    </View>
                    <Text style={styles.inlineCorrectionHint}>
                      Or click green check to create game without BGG info
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          {candidate.status !== 'confirmed' ? (
            <View style={styles.controlRow}>
              {(() => {
                try {
                  return (
                    <>
                      <PulsingControl
                        type="confirm"
                        disabled={candidate.status === 'confirmed'}
                        onPress={() => handleConfirmCandidate(candidate.id)}
                      />
                      <PulsingControl
                        type="edit"
                        disabled={false}
                        onPress={() => handleViewSimilarGames(candidate.id)}
                      />
                    </>
                  );
                } catch (controlError) {
                  console.error('[ClaudeGameIdentifier] Error rendering controls:', controlError);
                  // Fallback to simple buttons without animation
                  return (
                    <>
                      <Pressable
                        style={[styles.simpleButton, { backgroundColor: '#2ecc71' }]}
                        onPress={() => handleConfirmCandidate(candidate.id)}
                      >
                        <Text style={styles.simpleButtonText}>✓</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.simpleButton, { backgroundColor: '#4a90e2' }]}
                        onPress={() => handleViewSimilarGames(candidate.id)}
                      >
                        <Text style={styles.simpleButtonText}>✎</Text>
                      </Pressable>
                    </>
                  );
                }
              })()}
            </View>
          ) : null}

          {candidate.status === 'confirmed' ? (
            <View style={styles.confirmedStatusRow}>
              <View style={[styles.statusBadge, styles.statusBadgeConfirmed]}>
                <Text style={styles.statusBadgeText}>Confirmed</Text>
              </View>
              <Pressable
                style={styles.undoButton}
                onPress={() => handleUndoConfirm(candidate.id)}
                accessibilityRole="button"
                accessibilityLabel={`Undo confirmation for ${title}`}
              >
                <Text style={styles.undoButtonText}>Undo</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      );
      return mainView;
    } catch (error) {
      console.error('[ClaudeGameIdentifier] Error rendering candidate card:', error, candidate);
      // Return a minimal fallback card to prevent crash
      return (
        <View key={candidate?.id || 'error'} style={[styles.gameCard, styles.gameCardPending]}>
          <Text style={styles.gameTitle}>Error loading game</Text>
        </View>
      );
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4a90e2" />
        <Text style={styles.centeredText}>Requesting camera access…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionTitle}>Camera access is required</Text>
        <Text style={styles.permissionText}>
          Enable camera permissions in your device settings to identify board games from photos.
        </Text>
        <Button
          label="Grant Permission"
          onPress={() =>
            requestPermission().catch((permError) => {
              console.error('Camera permission request failed:', permError);
            })
          }
          style={styles.permissionButton}
        />
      </View>
    );
  }

  // Camera Modal - Just camera and capture button
  const renderCameraModal = () => (
    <Modal
      animationType="slide"
      transparent={false}
      visible={showCameraModal}
      onRequestClose={onCameraModalClose}
    >
      <View style={styles.cameraModalContainer}>
        <View style={styles.cameraModalHeader}>
          <Pressable onPress={onCameraModalClose} style={styles.cameraModalCloseButton}>
            <Text style={styles.cameraModalCloseText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.cameraModalContent}>
          {!permission?.granted ? (
            <View style={styles.centered}>
              <Text style={styles.permissionTitle}>Camera access is required</Text>
              <Text style={styles.permissionText}>
                Enable camera permissions in your device settings to identify board games from photos.
              </Text>
              <Button
                label="Grant Permission"
                onPress={() =>
                  requestPermission().catch((permError) => {
                    console.error('Camera permission request failed:', permError);
                  })
                }
                style={styles.permissionButton}
              />
            </View>
          ) : (
            <>
              <CameraView
                ref={cameraRef}
                style={styles.cameraModal}
                facing="back"
                mode="picture"
                animateShutter={false}
                enableTorch={torchEnabled}
                onCameraReady={() => setCameraReady(true)}
              />
              <View style={styles.cameraModalFooter}>
                <View style={styles.cameraControlsRow}>
                  <Pressable
                    onPress={() => setTorchEnabled(!torchEnabled)}
                    style={[
                      styles.flashlightButton,
                      torchEnabled && styles.flashlightButtonActive
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={torchEnabled ? 'Turn off flashlight' : 'Turn on flashlight'}
                  >
                    <Text style={styles.flashlightIcon}>
                      🔦
                    </Text>
                    <Text style={[
                      styles.flashlightLabel,
                      torchEnabled && styles.flashlightLabelActive
                    ]}>
                      {torchEnabled ? 'On' : 'Off'}
                    </Text>
                  </Pressable>
                  <Button 
                    label="Capture Photo" 
                    onPress={handleCapturePhoto} 
                    style={styles.captureButtonModal}
                    disabled={!cameraReady}
                  />
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  // Results Modal - Shows identified games
  // Multiple results selection modal
  const renderMultipleResultsModal = () => {
    if (!multipleResultsCandidate) return null;

    return (
      <Modal
        animationType="slide"
        transparent
        visible={isMultipleResultsModalVisible}
        onRequestClose={() => {
          setIsMultipleResultsModalVisible(false);
          setMultipleResultsOptions([]);
          setMultipleResultsCandidate(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Multiple games found</Text>
              <Pressable
                onPress={() => {
                  setIsMultipleResultsModalVisible(false);
                  setMultipleResultsOptions([]);
                  setMultipleResultsCandidate(null);
                  setCarouselIndex(0);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.modalCloseLink}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.modalDescription}>
              Swipe through titles or use arrows to browse. Tap the checkmark to select.
            </Text>
            {isLoadingMultipleResults ? (
              <View style={styles.modalLoadingRow}>
                <ActivityIndicator size="small" color="#4a90e2" />
                <Text style={styles.modalLoadingText}>Loading game details…</Text>
              </View>
            ) : multipleResultsOptions.length > 0 ? (
              <View style={styles.carouselContainer}>
                {/* Left Arrow */}
                {carouselIndex > 0 && (
                  <Pressable
                    style={styles.carouselArrow}
                    onPress={() => {
                      const newIndex = Math.max(0, carouselIndex - 1);
                      setCarouselIndex(newIndex);
                      carouselFlatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
                    }}
                  >
                    <Text style={styles.carouselArrowText}>←</Text>
                  </Pressable>
                )}
                
                {/* Carousel Content */}
                <View style={styles.carouselContent}>
                  <FlatList
                    ref={(ref) => {
                      if (ref) {
                        carouselFlatListRef.current = ref;
                      }
                    }}
                    data={multipleResultsOptions}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item, index) => item.id?.toString() || index.toString()}
                    onMomentumScrollEnd={(event) => {
                      const index = Math.round(event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width);
                      setCarouselIndex(index);
                    }}
                    snapToInterval={300}
                    snapToAlignment="center"
                    decelerationRate="fast"
                    renderItem={({ item: option, index }) => (
                      <View style={styles.carouselCard}>
                        <View style={styles.carouselCardContent}>
                          {option.thumbnail ? (
                            <Image
                              source={{ uri: option.thumbnail }}
                              style={styles.carouselThumbnail}
                            />
                          ) : (
                            <View style={styles.carouselThumbnailPlaceholder}>
                              <Text style={styles.carouselPlaceholderText}>
                                {option.name?.charAt(0)?.toUpperCase() || '?'}
                              </Text>
                            </View>
                          )}
                          <View style={styles.carouselInfo}>
                            <Text style={styles.carouselName} numberOfLines={3}>
                              {option.name}
                            </Text>
                            {option.yearPublished ? (
                              <Text style={styles.carouselYear}>
                                {option.yearPublished}
                              </Text>
                            ) : null}
                            {option.rank && option.rank !== '0' ? (
                              <Text style={styles.carouselRank}>
                                BGG Rank: #{option.rank}
                              </Text>
                            ) : null}
                          </View>
                          <Pressable
                            style={styles.carouselCheckmarkButton}
                            onPress={() => {
                              if (multipleResultsCandidate && multipleResultsCandidate.id) {
                                handleSelectFromMultipleResults(
                                  option,
                                  multipleResultsCandidate.id,
                                  activeSessionRef.current
                                );
                              }
                            }}
                          >
                            <Text style={styles.carouselCheckmarkText}>✓</Text>
                          </Pressable>
                        </View>
                        <Text style={styles.carouselCounter}>
                          {index + 1} of {multipleResultsOptions.length}
                        </Text>
                      </View>
                    )}
                  />
                </View>
                
                {/* Right Arrow */}
                {carouselIndex < multipleResultsOptions.length - 1 && (
                  <Pressable
                    style={styles.carouselArrow}
                    onPress={() => {
                      const newIndex = Math.min(multipleResultsOptions.length - 1, carouselIndex + 1);
                      setCarouselIndex(newIndex);
                      carouselFlatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
                    }}
                  >
                    <Text style={styles.carouselArrowText}>→</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  };

  const renderResultsModal = () => (
    <Modal
      animationType="slide"
      transparent
      visible={showResultsModal}
      onRequestClose={onResultsModalClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.resultsModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Identified Games</Text>
            <Pressable onPress={onResultsModalClose} accessibilityRole="button">
              <Text style={styles.modalCloseLink}>Close</Text>
            </Pressable>
          </View>

          {isProcessing && (
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" color="#4a90e2" />
              <Text style={styles.processingText}>Claude is analysing your photo…</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {comments && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Claude's Notes</Text>
              <Text style={styles.comments}>{comments}</Text>
            </View>
          )}

          {gameCandidates.length > 0 ? (
            <ScrollView style={styles.resultsScrollView}>
              <Text style={styles.resultsInstructions}>
                Tap ✓ to confirm or ✎ to edit wrong suggestions.
              </Text>
              <View style={styles.gameGrid}>
                {gameCandidates.map((candidate) => {
                  try {
                    return renderCandidateCard(candidate);
                  } catch (mapError) {
                    console.error('[ClaudeGameIdentifier] Error mapping candidate:', mapError, candidate);
                    return null;
                  }
                }).filter(Boolean)}
              </View>
            </ScrollView>
          ) : isProcessing ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#4a90e2" />
              <Text style={styles.centeredText}>Waiting for Claude's results…</Text>
            </View>
          ) : null}

          {gameCandidates.some((c) => c.status === 'confirmed') && (
            <View style={styles.resultsModalActions}>
              <Button
                label="Add confirmed to Collection"
                onPress={() => {
                  if (onDone) {
                    onDone();
                  }
                  if (onResultsModalClose) {
                    onResultsModalClose();
                  }
                }}
                style={styles.doneButton}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  // If using modals, render them
  if (showCameraModal || showResultsModal) {
    return (
      <>
        {renderCameraModal()}
        {renderResultsModal()}
        {renderMultipleResultsModal()}
        {/* Correction modal for editing games */}
        <Modal
          animationType="slide"
          transparent
          visible={isCorrectionModalVisible}
          onRequestClose={closeCorrectionModal}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Help us fix that title</Text>
                <Pressable onPress={closeCorrectionModal} accessibilityRole="button">
                  <Text style={styles.modalCloseLink}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.modalDescription}>
                Say or type the correct game name and we will search BoardGameGeek for a match.
              </Text>
              <TextInput
                value={correctionQuery}
                onChangeText={setCorrectionQuery}
                placeholder="Correct game title"
                style={styles.modalInput}
              />
              <View style={styles.modalActions}>
                <Button
                  label={isCorrectionSearching ? 'Searching…' : 'Search BoardGameGeek'}
                  onPress={() => handleCorrectionSearch()}
                  disabled={isCorrectionSearching || !correctionQuery.trim()}
                />
              </View>
              {correctionError ? <Text style={styles.correctionError}>{correctionError}</Text> : null}
              {isCorrectionSearching ? (
                <View style={styles.modalLoadingRow}>
                  <ActivityIndicator size="small" color="#4a90e2" />
                  <Text style={styles.modalLoadingText}>Fetching suggestions…</Text>
                </View>
              ) : null}
              {correctionSuggestions.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsRow}>
                  {correctionSuggestions.map((suggestion) => (
                    <CorrectionSuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onSelect={handleSuggestionSelect}
                    />
                  ))}
                </ScrollView>
              ) : null}
            </View>
          </View>
        </Modal>
      </>
    );
  }

  // Original full-screen view (fallback) - hidden when using modals
  // Return null since we're using modal mode
  return null;
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centeredText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 16,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#d45d5d',
    marginBottom: 8,
  },
  subheader: {
    fontSize: 15,
    color: '#555',
    marginBottom: 16,
  },
  cameraWrapper: {
    marginBottom: 20,
  },
  cameraContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    height: 320,
  },
  captureButton: {
    marginTop: 12,
  },
  previewImage: {
    width: '100%',
    height: 320,
    borderRadius: 16,
  },
  previewActions: {
    marginTop: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionCaption: {
    fontSize: 13,
    color: '#777',
  },
  narrationInput: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
    backgroundColor: '#fff',
  },
  audioControls: {
    marginTop: 12,
  },
  audioButton: {
    marginTop: 8,
  },
  recordingIndicator: {
    marginTop: 8,
    color: '#d45d5d',
    fontWeight: '500',
  },
  audioSummary: {
    marginTop: 8,
    color: '#4a90e2',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  processingText: {
    color: '#666',
    marginLeft: 8,
  },
  errorBanner: {
    backgroundColor: '#fdecea',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#b3261e',
    fontSize: 14,
  },
  comments: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    color: '#444',
    fontSize: 15,
  },
  gameGrid: {
    flexDirection: 'column',
    marginHorizontal: 0,
  },
  gameCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 0,
    marginBottom: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    position: 'relative',
  },
  gameCardPending: {
    borderColor: '#e0e0e0',
  },
  gameCardConfirmed: {
    borderColor: '#2ecc71',
  },
  gameThumbnailWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#f5f5f5',
    height: 100,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  gameThumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
  },
  thumbnailLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#4a90e2',
  },
  thumbnailFallbackText: {
    fontSize: 20, // Reduced font size for smaller card
    fontWeight: '700',
    color: '#c0c4cc',
  },
  gameBody: {
    flexGrow: 1,
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2a2a2a',
    marginBottom: 6,
    lineHeight: 22,
  },
  gameSubtitle: {
    fontSize: 12, // Slightly smaller
    color: '#777',
    marginBottom: 4, // Reduced margin
  },
  seeOptionsButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#4a90e2',
    borderRadius: 8,
    alignItems: 'center',
  },
  seeOptionsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  moreTitlesButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#4a90e2',
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  moreTitlesButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  gameStatusContainer: {
    marginTop: 8,
    gap: 8,
  },
  gameStatusMessage: {
    fontSize: 12,
    color: '#c0392b',
  },
  inlineCorrectionContainer: {
    marginTop: 12,
    gap: 8,
  },
  inlineCorrectionLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  inlineCorrectionInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  inlineCorrectionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#fff',
    color: '#333',
  },
  inlineCorrectionSearchButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#4a90e2',
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineCorrectionSearchButtonDisabled: {
    backgroundColor: '#ccc',
  },
  inlineCorrectionSearchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inlineCorrectionHint: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  cardDeleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 10,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  simpleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  controlWrapper: {
    flex: 1,
    alignItems: 'center',
    minWidth: 44,
  },
  controlWrapperDisabled: {
    opacity: 0.6,
  },
  controlWrapperPressed: {
    transform: [{ scale: 0.96 }],
  },
  control: {
    width: 44,
    height: 44,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  controlIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  controlIconSmall: {
    fontSize: 16,
  },
  statusBadge: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusBadgeConfirmed: {
    backgroundColor: '#e9f9f0',
  },
  statusBadgeText: {
    color: '#2ecc71',
    fontSize: 12,
    fontWeight: '600',
  },
  confirmedStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  undoButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#d0d0d0',
  },
  undoButtonText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmedDeleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e74c3c',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  confirmedDeleteIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  doneButton: {
    marginTop: 8,
  },
  gameEmptyState: {
    fontSize: 14,
    color: '#777',
    marginTop: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222',
  },
  modalCloseLink: {
    fontSize: 15,
    color: '#4a90e2',
    fontWeight: '600',
  },
  modalDescription: {
    fontSize: 14,
    color: '#555',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  modalActions: {
    marginBottom: 12,
  },
  correctionError: {
    fontSize: 13,
    color: '#c0392b',
    marginBottom: 10,
  },
  modalLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalLoadingText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#666',
  },
  suggestionsRow: {
    marginHorizontal: -4,
  },
  suggestionCard: {
    width: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    marginHorizontal: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  suggestionCardContent: {
    padding: 8,
    alignItems: 'center',
  },
  suggestionConfirmButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 10,
  },
  suggestionConfirmIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2ecc71',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionConfirmIconText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  suggestionThumbnail: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    marginBottom: 8,
  },
  suggestionThumbnailPlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  suggestionPlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#a0a4ab',
  },
  suggestionName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  suggestionYear: {
    fontSize: 12,
    color: '#777',
  },
  suggestionsScrollView: {
    maxHeight: 400,
    marginTop: 8,
  },
  multipleResultCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  multipleResultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  multipleResultThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#e0e0e0',
  },
  // Carousel styles
  carouselContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    minHeight: 300,
  },
  carouselArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4a90e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  carouselArrowText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  carouselContent: {
    flex: 1,
    height: 300,
  },
  carouselCard: {
    width: 280,
    marginHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  carouselCardContent: {
    alignItems: 'center',
  },
  carouselThumbnail: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
  },
  carouselThumbnailPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  carouselPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#999',
  },
  carouselInfo: {
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 80,
  },
  carouselName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  carouselYear: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  carouselRank: {
    fontSize: 12,
    color: '#999',
  },
  carouselCheckmarkButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2ecc71',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  carouselCheckmarkText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  carouselCounter: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 12,
    color: '#999',
  },
  // Carousel styles
  carouselContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    minHeight: 300,
  },
  carouselArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4a90e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  carouselArrowText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  carouselContent: {
    flex: 1,
    height: 300,
  },
  carouselCard: {
    width: 280,
    marginHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  carouselCardContent: {
    alignItems: 'center',
  },
  carouselThumbnail: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
  },
  carouselThumbnailPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  carouselPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#999',
  },
  carouselInfo: {
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 80,
  },
  carouselName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  carouselYear: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  carouselRank: {
    fontSize: 12,
    color: '#999',
  },
  carouselCheckmarkButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2ecc71',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  carouselCheckmarkText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  carouselCounter: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 12,
    color: '#999',
  },
  multipleResultThumbnailPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#d0d0d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multipleResultPlaceholderText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#666',
  },
  multipleResultInfo: {
    flex: 1,
    marginRight: 12,
  },
  multipleResultName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    marginBottom: 4,
  },
  multipleResultYear: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  multipleResultRank: {
    fontSize: 12,
    color: '#888',
  },
  multipleResultSelectButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4a90e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multipleResultSelectText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  // Camera Modal Styles
  cameraModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraModalHeader: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 10,
  },
  cameraModalCloseButton: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraModalCloseText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  cameraModalContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraModal: {
    width: '100%',
    flex: 1,
  },
  cameraModalFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
  },
  cameraControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    width: '100%',
  },
  flashlightButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    minWidth: 80,
  },
  flashlightButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  flashlightIcon: {
    fontSize: 20,
    marginRight: 6,
  },
  flashlightLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  flashlightLabelActive: {
    color: '#fff',
    fontWeight: '700',
  },
  captureButtonModal: {
    flex: 1,
    maxWidth: 300,
  },
  // Results Modal Styles
  resultsModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
    width: '95%',
    alignSelf: 'center',
  },
  resultsScrollView: {
    maxHeight: 400,
  },
  resultsInstructions: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  resultsModalActions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});

export default ClaudeGameIdentifier;


