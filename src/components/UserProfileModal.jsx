import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import { useEvents } from '../context/EventsContext';
import { db } from '../config/firebase';
import Modal from './common/Modal';
import GameCard from './GameCard';
import { blockUser, unblockUser, isUserBlocked, reportUser } from '../services/blocking';
import Input from './common/Input';
import Button from './common/Button';
import { theme } from '../utils/theme';

// All game categories in order
const ALL_CATEGORIES = ['Strategy', 'Family', 'Party', 'War', 'Thematic', 'Abstract', 'Children', 'CCG', 'Other'];

const UserProfileModal = ({ 
  isOpen, 
  onClose, 
  userId, 
  userName: initialUserName,
  avatarUrl: initialAvatarUrl 
}) => {
  const { user: currentUser } = useAuth();
  const { getUserCollection } = useCollections();
  const { getUserEvents } = useEvents();
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('profile'); // 'profile', 'library'
  const [userGames, setUserGames] = useState([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reporting, setReporting] = useState(false);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserProfile();
      fetchUserGames();
      checkIfBlocked();
      setView('profile');
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
    }
  }, [isOpen, userId]);


  const checkIfBlocked = async () => {
    if (!userId || !currentUser) return;
    const currentUserId = currentUser?.uid || currentUser?.id;
    try {
      const blocked = await isUserBlocked(currentUserId, userId);
      setIsBlocked(blocked);
    } catch (error) {
      console.error('Error checking if user is blocked:', error);
    }
  };

  const fetchUserProfile = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        setUserProfile({
          name: userData.name || initialUserName || 'Unknown User',
          bio: userData.bio || '',
          bggUsername: userData.bggUsername || '',
          location: userData.location || '',
          zipcode: userData.zipcode || '',
          avatarUrl: userData.avatarUrl || initialAvatarUrl || null,
          email: userData.email || '',
        });
      } else {
        // Fallback to initial values if user doc doesn't exist
        setUserProfile({
          name: initialUserName || 'Unknown User',
          bio: '',
          bggUsername: '',
          location: '',
          zipcode: '',
          avatarUrl: initialAvatarUrl || null,
          email: '',
        });
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Fallback to initial values on error
      setUserProfile({
        name: initialUserName || 'Unknown User',
        bio: '',
        bggUsername: '',
        location: '',
        zipcode: '',
        avatarUrl: initialAvatarUrl || null,
        email: '',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserGames = () => {
    if (!userId) return;
    const games = getUserCollection(userId) || [];
    setUserGames(games);
  };


  const handleBlockUser = async () => {
    if (!userId || !currentUser) return;
    const currentUserId = currentUser?.uid || currentUser?.id;

    Alert.alert(
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? `Are you sure you want to unblock ${userProfile?.name || 'this user'}?`
        : `Are you sure you want to block ${userProfile?.name || 'this user'}? You won't see their messages or posts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setBlocking(true);
            try {
              if (isBlocked) {
                await unblockUser(currentUserId, userId);
                setIsBlocked(false);
                Alert.alert('Success', 'User has been unblocked.');
              } else {
                await blockUser(currentUserId, userId);
                setIsBlocked(true);
                Alert.alert('User Blocked', 'This user has been blocked. You won\'t see their messages or posts.');
              }
            } catch (error) {
              console.error('Error blocking/unblocking user:', error);
              Alert.alert('Error', 'Failed to block/unblock user. Please try again.');
            } finally {
              setBlocking(false);
            }
          },
        },
      ]
    );
  };

  const handleReportUser = () => {
    setShowReportModal(true);
  };

  const handleSubmitReport = async () => {
    if (!reportReason.trim()) {
      Alert.alert('Required Field', 'Please select a reason for reporting.');
      return;
    }

    if (!userId || !currentUser) return;
    const currentUserId = currentUser?.uid || currentUser?.id;

    setReporting(true);
    try {
      await reportUser(
        currentUserId,
        userId,
        reportReason,
        reportDescription,
        { type: 'profile' }
      );
      Alert.alert(
        'Report Submitted',
        'Thank you for your report. We will review it and take appropriate action.',
        [{ text: 'OK', onPress: () => {
          setShowReportModal(false);
          setReportReason('');
          setReportDescription('');
        }}]
      );
    } catch (error) {
      console.error('Error reporting user:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setReporting(false);
    }
  };

  const isCurrentUser = currentUser?.uid === userId || currentUser?.id === userId;

  const renderProfileView = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#d45d5d" />
        </View>
      );
    }

    if (!userProfile) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>User not found</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.profileHeader}>
          {userProfile.avatarUrl ? (
            <Image 
              source={{ uri: userProfile.avatarUrl }} 
              style={styles.avatar}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {userProfile.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.name}>{userProfile.name}</Text>
          {userProfile.bggUsername && (
            <Text style={styles.bggUsername}>BGG: {userProfile.bggUsername}</Text>
          )}
        </View>

        <View style={styles.section}>
          {userProfile.bio && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Bio:</Text>
              <Text style={styles.value}>{userProfile.bio}</Text>
            </View>
          )}
          {userProfile.location && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Location:</Text>
              <Text style={styles.value}>{userProfile.location}</Text>
            </View>
          )}
          {userProfile.zipcode && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Zipcode:</Text>
              <Text style={styles.value}>{userProfile.zipcode}</Text>
            </View>
          )}
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setView('library')}
          >
            <Text style={styles.actionButtonText}>📚 Browse Game Library</Text>
            <Text style={styles.actionButtonSubtext}>
              {userGames.length} {userGames.length === 1 ? 'game' : 'games'}
            </Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    );
  };

  const renderLibraryView = () => {
    const gamesByCategory = userGames.reduce((acc, game) => {
      const category = game.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(game);
      return acc;
    }, {});

    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.libraryHeader}>
          <Text style={styles.libraryTitle}>
            {userProfile?.name || 'User'}'s Collection
          </Text>
          <Text style={styles.librarySubtitle}>
            {userGames.length} {userGames.length === 1 ? 'game' : 'games'}
          </Text>
        </View>

        {userGames.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No games in collection yet</Text>
          </View>
        ) : (
          <View style={styles.gamesContainer}>
            {ALL_CATEGORIES.map((category) => {
              const games = gamesByCategory[category] || [];
              if (games.length === 0) return null;

              return (
                <View key={category} style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>
                    {category} ({games.length})
                  </Text>
                  <View style={styles.gamesGrid}>
                    {games.map((game) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        disableModal={false}
                      />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  };


  const getModalTitle = () => {
    if (view === 'library') {
      return `${userProfile?.name || 'User'}'s Collection`;
    }
    return userProfile?.name || 'User Profile';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getModalTitle()}
      fullScreen={view === 'library'}
    >
      {view === 'profile' && renderProfileView()}
      {view === 'library' && renderLibraryView()}
      
      {view !== 'profile' && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setView('profile')}
        >
          <Text style={styles.backButtonText}>← Back to Profile</Text>
        </TouchableOpacity>
      )}

      {/* Report Modal */}
      <Modal
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setReportReason('');
          setReportDescription('');
        }}
        title="Report User"
      >
        <ScrollView style={styles.reportModalContent}>
          <Text style={styles.reportModalText}>
            Help us keep the community safe. Please select a reason for reporting {userProfile?.name || 'this user'}.
          </Text>

          <Text style={styles.reportLabel}>Reason *</Text>
          <View style={styles.reportReasonsContainer}>
            {[
              'Harassment or bullying',
              'Spam or scams',
              'Inappropriate content',
              'Hate speech',
              'Impersonation',
              'Other'
            ].map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[
                  styles.reportReasonOption,
                  reportReason === reason && styles.reportReasonOptionSelected,
                ]}
                onPress={() => setReportReason(reason)}
              >
                <Text
                  style={[
                    styles.reportReasonText,
                    reportReason === reason && styles.reportReasonTextSelected,
                  ]}
                >
                  {reason}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.reportLabel}>Additional Details (Optional)</Text>
          <Input
            value={reportDescription}
            onChangeText={setReportDescription}
            placeholder="Please provide any additional information that may help us review this report..."
            multiline
            style={styles.reportDescriptionInput}
          />

          <TouchableOpacity
            style={[styles.submitReportButton, !reportReason.trim() && styles.submitReportButtonDisabled]}
            onPress={handleSubmitReport}
            disabled={!reportReason.trim() || reporting}
          >
            <Text style={styles.submitReportButtonText}>
              {reporting ? 'Submitting...' : 'Submit Report'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.meepleRed,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  avatarInitial: {
    fontSize: 40,
    color: '#fff',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  name: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#333',
    marginBottom: 4,
  },
  bggUsername: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  infoRow: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    color: '#666',
  },
  actionsContainer: {
    marginTop: 24,
  },
  actionButton: {
    backgroundColor: '#d45d5d',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonSubtext: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.9,
  },
  libraryHeader: {
    marginBottom: 20,
  },
  libraryTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  librarySubtitle: {
    fontSize: 14,
    color: '#666',
  },
  gamesContainer: {
    marginTop: 16,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  gamesGrid: {
    gap: 12,
  },
  backButton: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  },
  backButtonText: {
    fontSize: 16,
    color: '#4a90e2',
    fontWeight: '500',
  },
  blockedBanner: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  blockedBannerText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
  safetyActionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  safetyButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  safetyButtonBlocked: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  reportButton: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
  },
  safetyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  reportModalContent: {
    padding: 16,
  },
  reportModalText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  reportLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  reportReasonsContainer: {
    marginBottom: 20,
  },
  reportReasonOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  reportReasonOptionSelected: {
    borderColor: '#d45d5d',
    backgroundColor: '#fff5f5',
  },
  reportReasonText: {
    fontSize: 14,
    color: '#333',
  },
  reportReasonTextSelected: {
    color: '#d45d5d',
    fontWeight: '600',
  },
  reportDescriptionInput: {
    marginBottom: 20,
    minHeight: 100,
  },
  submitReportButton: {
    backgroundColor: '#d45d5d',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitReportButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitReportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default UserProfileModal;

