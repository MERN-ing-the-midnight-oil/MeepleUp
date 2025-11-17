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
    if (disabled) {
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
      pulse.setValue(1);
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

    loop.start();
    loopRef.current = loop;

    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, [disabled, pulse]);

  const backgroundColor = type === 'confirm' ? '#2ecc71' : type === 'edit' ? '#4a90e2' : '#e74c3c';
  const icon = type === 'confirm' ? '✓' : type === 'edit' ? '✎' : '✕';

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

const ClaudeGameIdentifier = ({ onAddToCollection, onRemoveFromCollection, onDone }) => {
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
    setGameCandidates((prev) =>
      prev.map((candidate) => {
        if (candidate.id !== candidateId) {
          return candidate;
        }
        const updated = updater(candidate);
        return updated;
      })
    );
  }, []);

  const fetchBGGMetadata = useCallback(
    async (sessionKey, candidateId, rawTitle) => {
      if (sessionKey !== activeSessionRef.current) {
        return;
      }

      updateCandidate(candidateId, (candidate) => ({
        ...candidate,
        bggStatus: 'loading',
        bggErrorMessage: null,
      }));

      if (__DEV__) {
        console.log('[ClaudeGameIdentifier] Fetching BGG metadata', {
          candidateId,
          title: rawTitle,
        });
      }

      try {
        const query = rawTitle?.trim();
        const searchResults = query ? await searchGamesByName(query) : [];

        if (__DEV__) {
          console.log('[ClaudeGameIdentifier] BGG search results', {
            candidateId,
            title: rawTitle,
            resultCount: searchResults.length,
            firstResult: searchResults[0],
          });
        }

        if (!searchResults || searchResults.length === 0) {
          if (sessionKey === activeSessionRef.current) {
            updateCandidate(candidateId, (candidate) => ({
              ...candidate,
              bggStatus: 'no_match',
              bggErrorMessage: 'No matches on BoardGameGeek yet.',
            }));
          }
          return;
        }

        const primaryResult = searchResults[0];
        let details = null;

        try {
          details = await getGameDetails(primaryResult.id);
        } catch (detailError) {
          console.warn('BGG detail fetch failed:', detailError);
        }

        if (sessionKey !== activeSessionRef.current) {
          return;
        }

        updateCandidate(candidateId, (candidate) => ({
          ...candidate,
          bggStatus: 'matched',
          bggData: {
            id: primaryResult.id,
            name: details?.name || primaryResult.name,
            thumbnail: details?.thumbnail || null,
            image: details?.image || null,
            yearPublished: details?.yearPublished || primaryResult.yearPublished || '',
          },
        }));
      } catch (searchError) {
        console.error('BGG search failed:', searchError);
        if (sessionKey === activeSessionRef.current) {
          // BGG API requires authentication - show game without metadata but still allow confirmation
          updateCandidate(candidateId, (candidate) => ({
            ...candidate,
            bggStatus: 'error',
            bggErrorMessage: 'BGG metadata unavailable. You can still confirm this game.',
            // Don't block the user - they can still confirm with just the Claude title
          }));
        }
      }
    },
    [updateCandidate]
  );

  const scheduleBGGFetch = useCallback(
    (sessionKey, candidateId, title, delayMs = 0) => {
      const timerId = setTimeout(() => {
        pendingFetchTimersRef.current = pendingFetchTimersRef.current.filter((id) => id !== timerId);
        fetchBGGMetadata(sessionKey, candidateId, title);
      }, delayMs);

      pendingFetchTimersRef.current.push(timerId);
    },
    [fetchBGGMetadata]
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
          const candidateId = `${sessionKey}-${index}-${Date.now()}`;
          const candidate = {
            id: candidateId,
            claudeTitle: game.title || 'Untitled',
            claudeConfidence: game.confidence || 'unknown',
            claudeNotes: game.notes || '',
            status: 'pending',
            bggStatus: 'idle',
            bggData: null,
            bggErrorMessage: null,
            origin: 'claude',
            createdAt: Date.now(),
            collectionRecordId: null,
          };

          setGameCandidates((prev) => {
            if (sessionKey !== activeSessionRef.current) {
              return prev;
            }
            return [...prev, candidate];
          });

          const delayMs = index * 220;
          scheduleBGGFetch(sessionKey, candidateId, game.title, delayMs);
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
      beginIdentificationWorkflow(capturedPhoto, sessionKey);
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
      const searchQuery = candidate.bggData?.name || candidate.claudeTitle || '';
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
      };

      setGameCandidates((prev) => {
        const updated = prev.map((item) =>
          item.id === candidateId ? { ...item, status: 'confirmed', collectionRecordId } : item
        );

        // Check if all candidates are now confirmed
        const allConfirmed = updated.every((item) => item.status === 'confirmed');
        if (allConfirmed && updated.length > 0) {
          // Auto-reset photo capture after a short delay to show confirmation
          setTimeout(() => {
            resetPhotoCapture();
          }, 500);
        }

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

  const renderCandidateCard = (candidate) => {
    const title = candidate.bggData?.name || candidate.claudeTitle;
    const subtitle = candidate.bggData?.yearPublished
      ? `${candidate.bggData.yearPublished} · Claude confidence: ${candidate.claudeConfidence}`
      : `Claude confidence: ${candidate.claudeConfidence}`;

    let borderStyle = styles.gameCardPending;
    if (candidate.status === 'confirmed') {
      borderStyle = styles.gameCardConfirmed;
    }

    return (
      <View key={candidate.id} style={[styles.gameCard, borderStyle]}>
        {/* Red X in upper right for pending cards */}
        {candidate.status !== 'confirmed' ? (
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
        ) : null}

        {/* Delete button for confirmed cards */}
        {candidate.status === 'confirmed' ? (
          <Pressable
            style={styles.confirmedDeleteButton}
            onPress={() => handleRemoveConfirmedCandidate(candidate.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${title} from your collection`}
          >
            <Text style={styles.confirmedDeleteIcon}>✕</Text>
          </Pressable>
        ) : null}

        <View style={styles.gameThumbnailWrapper}>
          {candidate.bggStatus === 'loading' && !candidate.bggData?.thumbnail ? (
            <View style={styles.gameThumbnailPlaceholder}>
              <ActivityIndicator size="small" color="#4a90e2" />
              <Text style={styles.thumbnailLoadingText}>Fetching BGG data…</Text>
            </View>
          ) : candidate.bggData?.thumbnail ? (
            <Image source={{ uri: candidate.bggData.thumbnail }} style={styles.gameThumbnail} />
          ) : (
            <View style={styles.gameThumbnailPlaceholder}>
              <Text style={styles.thumbnailFallbackText}>{title.charAt(0)}</Text>
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
            <Text style={styles.gameStatusMessage}>{candidate.bggErrorMessage}</Text>
          ) : null}
        </View>

        {candidate.status !== 'confirmed' ? (
          <View style={styles.controlRow}>
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
          </View>
        ) : null}

        {candidate.status === 'confirmed' ? (
          <View style={[styles.statusBadge, styles.statusBadgeConfirmed]}>
            <Text style={styles.statusBadgeText}>Confirmed</Text>
          </View>
        ) : null}
      </View>
    );
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
    padding: 12,
    marginHorizontal: 6,
    marginBottom: 16,
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
    marginBottom: 10,
    backgroundColor: '#f5f5f5',
    height: 120,
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
    fontSize: 28,
    fontWeight: '700',
    color: '#c0c4cc',
  },
  gameBody: {
    flexGrow: 1,
  },
  gameTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2a2a2a',
    marginBottom: 4,
  },
  gameSubtitle: {
    fontSize: 13,
    color: '#777',
    marginBottom: 6,
  },
  gameStatusMessage: {
    fontSize: 12,
    color: '#c0392b',
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
});

export default ClaudeGameIdentifier;


