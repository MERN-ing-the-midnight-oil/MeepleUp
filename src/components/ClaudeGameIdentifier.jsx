import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
  const [correctionCandidate, setCorrectionCandidate] = useState(null);
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
          
          const searchPromise = query ? searchGamesByName(query) : Promise.resolve([]);
          
          // Add a timeout wrapper to prevent hanging
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Search timeout after 8 seconds')), 8000);
          });
          
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] Awaiting Promise.race...');
          }
          
          try {
            searchResults = await Promise.race([searchPromise, timeoutPromise]);
            
            if (__DEV__) {
              console.log('[ClaudeGameIdentifier] Promise.race resolved, result type:', typeof searchResults, 'isArray:', Array.isArray(searchResults));
            }
          } catch (raceError) {
            if (__DEV__) {
              console.error('[ClaudeGameIdentifier] Promise.race error:', raceError);
            }
            throw raceError;
          }
          
          // Ensure searchResults is an array
          if (!Array.isArray(searchResults)) {
            if (__DEV__) {
              console.warn('[ClaudeGameIdentifier] searchGamesByName returned non-array:', searchResults);
            }
            searchResults = [];
          }
          
          if (__DEV__) {
            console.log('[ClaudeGameIdentifier] searchGamesByName completed, results:', searchResults.length);
            console.log('[ClaudeGameIdentifier] searchResults type:', Array.isArray(searchResults) ? 'array' : typeof searchResults);
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
            details = await getGameDetails(primaryResult.id);
          }
        } catch (detailError) {
          console.warn('[ClaudeGameIdentifier] BGG detail fetch failed:', detailError);
          // Continue with primaryResult data even if details fetch fails
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
          setError('Claude could not recognise any games in this photo.');
          return;
        }

        filteredGames.forEach((game, index) => {
          try {
            const candidateId = `${sessionKey}-${index}-${Date.now()}`;
            
            // Validate and normalize styling if present
            let styling = null;
            if (game.styling) {
              try {
                // Ensure styling is an object
                if (typeof game.styling === 'object' && game.styling !== null) {
                  styling = game.styling;
                  if (__DEV__) {
                    console.log('[ClaudeGameIdentifier] Styling for', game.title, ':', JSON.stringify(styling, null, 2));
                    console.log('[ClaudeGameIdentifier] Font name from Claude:', styling.fontName || styling.fontStyle || 'NOT PROVIDED');
                  }
                }
              } catch (stylingError) {
                console.warn('[ClaudeGameIdentifier] Error processing styling:', stylingError);
                styling = null;
              }
            } else if (__DEV__) {
              console.log('[ClaudeGameIdentifier] No styling object for', game.title);
            }
            
            const candidate = {
              id: candidateId,
              claudeTitle: game.title || 'Untitled',
              claudeConfidence: game.confidence || 'unknown',
              claudeNotes: game.notes || '',
              styling: styling || null, // Store AI-extracted styling (ensure it's null if invalid)
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
        setError(identifyError.message || 'Failed to identify games. Please try again.');
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
      // Prevent opening modal if one is already open or if we're selecting a suggestion
      if (isCorrectionModalVisible || isSelectingSuggestionRef.current) {
        if (__DEV__) {
          console.log('[Correction Modal] Modal already open or selecting, ignoring request');
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
          // Double-check modal is still open before searching
          if (isCorrectionModalVisible && !isSelectingSuggestionRef.current) {
            handleCorrectionSearch(searchQuery);
          }
        }, 150);
      }
    },
    [gameCandidates, handleCorrectionSearch, isCorrectionModalVisible]
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
      claudeComments: comments,
      createdAt: now,
      updatedAt: now,
        bggId: candidate.bggData?.id || null,
        bggThumbnail: candidate.bggData?.thumbnail || null,
        bggImage: candidate.bggData?.image || null,
        yearPublished: candidate.bggData?.yearPublished || null,
        styling: candidate.styling || null, // Store AI-extracted styling
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
              const details = await getGameDetails(match.id);
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
                styling: candidate.styling || null,
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
          console.log('[Inline Correction] Searching for:', searchQuery);
        }

        const matches = await searchGamesByName(searchQuery);

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
            details = await getGameDetails(selectedMatch.id);
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
              <Text style={[styles.gameTitle, { fontSize: 16, marginBottom: 8 }]} numberOfLines={3}>{title}</Text>
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
            <Text style={[styles.gameTitle, { fontSize: 16, marginBottom: 8 }]} numberOfLines={3}>
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

      // Safe fallback for first character
      const firstChar = title && typeof title === 'string' && title.length > 0 ? title.charAt(0).toUpperCase() : '?';
      
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
            <Text style={styles.gameTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.gameSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
            {candidate.bggStatus === 'no_match' || candidate.bggStatus === 'error' ? (
              <View style={styles.gameStatusContainer}>
                <Text style={styles.gameStatusMessage}>{candidate.bggErrorMessage || 'Error loading data'}</Text>
                {candidate.bggStatus === 'no_match' && (
                  <View style={styles.inlineCorrectionContainer}>
                    <Text style={styles.inlineCorrectionLabel}>Correct game title:</Text>
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
            <View style={[styles.statusBadge, styles.statusBadgeConfirmed]}>
              <Text style={styles.statusBadgeText}>Confirmed</Text>
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
                onCameraReady={() => setCameraReady(true)}
              />
              <View style={styles.cameraModalFooter}>
                <Button 
                  label="Capture Photo" 
                  onPress={handleCapturePhoto} 
                  style={styles.captureButtonModal}
                  disabled={!cameraReady}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  // Results Modal - Shows identified games
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
                label="Add to Collection"
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

  // Original full-screen view (fallback)
  return (
    <View style={styles.flex}>
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Identify Games with Claude</Text>
      <Text style={styles.subheader}>
          Capture a photo of your games. As soon as Claude sees titles, they will stream into your library with
          BoardGameGeek artwork.
      </Text>

      <View style={styles.cameraWrapper}>
        {photo ? (
          <View>
            <Image source={{ uri: photo.uri }} style={styles.previewImage} />
            <View style={styles.previewActions}>
              <Button label="Retake Photo" onPress={resetCapture} variant="outline" />
            </View>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
              mode="picture"
              animateShutter={false}
              onCameraReady={() => setCameraReady(true)}
            />
            <Button label="Capture Photo" onPress={handleCapturePhoto} style={styles.captureButton} />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Narration (optional)</Text>
        <Text style={styles.sectionDescription}>
          Provide extra context about the games in the photo. You can type or record a short voice note.
        </Text>
        <TextInput
          value={narrationText}
          onChangeText={setNarrationText}
          placeholder="e.g. “The photo shows Catan, Azul, and Ticket to Ride on the table.”"
          style={styles.narrationInput}
          multiline
        />

        <View style={styles.audioControls}>
          <Button
            label={isRecording ? 'Stop Recording' : 'Record Voice Note'}
            onPress={isRecording ? stopRecording : startRecording}
          />
          {audioClip.base64 && (
            <Button label="Discard Voice Note" onPress={discardAudio} variant="outline" style={styles.audioButton} />
          )}
        </View>
        {isRecording && <Text style={styles.recordingIndicator}>Recording… tap to stop.</Text>}
        {audioClip.base64 && (
          <Text style={styles.audioSummary}>
            Voice note captured ({Math.round(audioClip.durationMs / 1000)} sec)
          </Text>
        )}
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

      {comments ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Claude’s Notes</Text>
          <Text style={styles.comments}>{comments}</Text>
        </View>
      ) : null}

        {photo || gameCandidates.length > 0 ? (
        <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Detected Games</Text>
              {gameCandidates.length > 0 ? (
                <Text style={styles.sectionCaption}>
                  Tap ✓ to confirm or ✕ to correct wrong suggestions.
          </Text>
              ) : null}
        </View>
            <View style={styles.gameGrid}>
              {gameCandidates.map((candidate) => renderCandidateCard(candidate))}
            </View>
            {!isProcessing && gameCandidates.length === 0 && photo ? (
              <Text style={styles.gameEmptyState}>Waiting for Claude's results…</Text>
      ) : null}
        </View>
      ) : null}

        {gameCandidates.some((c) => c.status === 'confirmed') ? (
        <View style={styles.section}>
                <Button
              label="I'm done identifying games"
              onPress={handleDone}
              style={styles.doneButton}
                />
              </View>
        ) : null}
      </ScrollView>

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
    </View>
  );
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  gameCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8, // Reduced padding for more compact cards
    marginHorizontal: 6,
    marginBottom: 12, // Reduced margin
    flexBasis: '47%',
    maxWidth: '47%',
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
    marginBottom: 6, // Reduced margin
    backgroundColor: '#f5f5f5',
    height: 60, // Reduced to half height
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
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
    fontSize: 14, // Slightly smaller
    fontWeight: '600',
    color: '#2a2a2a',
    marginBottom: 3, // Reduced margin
  },
  gameSubtitle: {
    fontSize: 12, // Slightly smaller
    color: '#777',
    marginBottom: 4, // Reduced margin
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
  captureButtonModal: {
    width: '100%',
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


