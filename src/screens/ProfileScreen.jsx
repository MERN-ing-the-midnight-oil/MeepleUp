import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert, Image, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '../context/AuthContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import NotificationSettings from '../components/NotificationSettings';
import PersonalMatchSettings from '../components/PersonalMatchSettings';
import { pickAndUploadImage, deleteImageFromFirebase } from '../utils/imageUpload';
import { theme, commonStyles } from '../utils/theme';
import { useResponsive, getResponsiveValue } from '../utils/responsive';

const ProfileScreen = () => {
  const { width } = useWindowDimensions();
  const { isMobile, isTablet, isDesktop } = useResponsive();
  const isSmallScreen = width ? width < 400 : false;
  const {
    user,
    updateUser,
    updateUserPhoto,
    changePassword,
    resendVerificationEmail,
    refreshUser,
    isEmailVerified,
    logout,
    deleteAccount,
  } = useAuth();

  const [userData, setUserData] = useState({
    name: '',
    email: '',
    bio: '',
    bggUsername: '',
    zipcode: '',
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [zipcodeError, setZipcodeError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [passwordState, setPasswordState] = useState({
    current: '',
    next: '',
    confirm: '',
    message: '',
    error: '',
    loading: false,
  });
  const [verificationStatus, setVerificationStatus] = useState({
    loading: false,
    message: '',
    error: '',
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showPersonalMatchModal, setShowPersonalMatchModal] = useState(false);

  // Responsive values for profile picture
  const profilePictureSize = getResponsiveValue({ xs: 120, md: 140, lg: 160 }, width);
  const profilePictureRadius = profilePictureSize / 2;
  const placeholderFontSize = getResponsiveValue({ xs: 48, md: 56, lg: 64 }, width);

  useEffect(() => {
    if (user) {
      setUserData({
        name: user.name || '',
        email: user.email || '',
        bio: user.bio || '',
        bggUsername: user.bggUsername || '',
        zipcode: user.zipcode || user.location || '', // Support both for backward compatibility
      });
      setEditingName(user.name || '');
    }
  }, [user]);

  // Close password modal on successful password update
  useEffect(() => {
    if (passwordState.message && !passwordState.error && !passwordState.loading && showPasswordModal) {
      const timer = setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordState({
          current: '',
          next: '',
          confirm: '',
          message: '',
          error: '',
          loading: false,
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [passwordState.message, passwordState.error, passwordState.loading, showPasswordModal]);

  const validateZipcode = (zipcode) => {
    if (!zipcode || zipcode.trim() === '') {
      return ''; // Empty is valid (optional field)
    }
    // US zipcode format: 5 digits, or 5+4 format (12345-6789)
    const zipcodeRegex = /^\d{5}(-\d{4})?$/;
    if (!zipcodeRegex.test(zipcode.trim())) {
      return 'Please enter a valid zipcode (e.g., 12345 or 12345-6789)';
    }
    return '';
  };

  const handleChange = (field, value) => {
    setUserData({
      ...userData,
      [field]: value,
    });
    setMessage('');
    
    // Validate zipcode on change
    if (field === 'zipcode') {
      const error = validateZipcode(value);
      setZipcodeError(error);
    }
  };

  const handleNameEdit = () => {
    setIsEditingName(true);
    setEditingName(userData.name);
  };

  const handleNameSave = async () => {
    if (editingName.trim() === '') {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }
    
    setSaving(true);
    setMessage('');
    
    try {
      await updateUser({
        name: editingName.trim(),
      });
      await refreshUser();
      setUserData(prev => ({ ...prev, name: editingName.trim() }));
      setIsEditingName(false);
      Alert.alert('Success', 'Name updated successfully!');
    } catch (error) {
      setMessage(error.message || 'Failed to update name. Please try again.');
      console.error('Name update error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleNameCancel = () => {
    setIsEditingName(false);
    setEditingName(userData.name);
  };

  const handleSubmit = async () => {
    console.log('[ProfileScreen] handleSubmit called');
    console.log('[ProfileScreen] Current userData:', {
      bio: userData.bio?.substring(0, 50) + '...',
      bggUsername: userData.bggUsername,
      zipcode: userData.zipcode,
      bioLength: userData.bio?.length || 0,
    });

    // Validate zipcode before submitting
    console.log('[ProfileScreen] Validating zipcode...');
    const zipcodeValidationError = validateZipcode(userData.zipcode);
    if (zipcodeValidationError) {
      console.log('[ProfileScreen] Zipcode validation failed:', zipcodeValidationError);
      setZipcodeError(zipcodeValidationError);
      setMessage('');
      return;
    }
    console.log('[ProfileScreen] Zipcode validation passed');

    console.log('[ProfileScreen] Setting saving state to true');
    setSaving(true);
    setMessage('');
    setZipcodeError('');

    try {
      const updateData = {
        bio: userData.bio,
        bggUsername: userData.bggUsername,
        zipcode: userData.zipcode.trim() || '', // Save as zipcode, trim whitespace
      };
      console.log('[ProfileScreen] Calling updateUser with data:', {
        ...updateData,
        bio: updateData.bio?.substring(0, 50) + '...',
        bioLength: updateData.bio?.length || 0,
      });
      
      const updateStartTime = Date.now();
      await updateUser(updateData);
      const updateDuration = Date.now() - updateStartTime;
      console.log('[ProfileScreen] updateUser completed in', updateDuration, 'ms');

      console.log('[ProfileScreen] Calling refreshUser...');
      const refreshStartTime = Date.now();
      await refreshUser();
      const refreshDuration = Date.now() - refreshStartTime;
      console.log('[ProfileScreen] refreshUser completed in', refreshDuration, 'ms');

      console.log('[ProfileScreen] Profile update successful');
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.error('[ProfileScreen] Profile update error:', error);
      console.error('[ProfileScreen] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      setMessage(error.message || 'Failed to update profile. Please try again.');
    } finally {
      console.log('[ProfileScreen] Setting saving state to false');
      setSaving(false);
      console.log('[ProfileScreen] handleSubmit completed');
    }
  };

  const getWordCount = (text) => {
    return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  };

  const handlePasswordChange = async () => {
    if (!passwordState.current || !passwordState.next || !passwordState.confirm) {
      setPasswordState((prev) => ({
        ...prev,
        error: 'Please complete all password fields.',
        message: '',
      }));
      return;
    }

    if (passwordState.next.length < 6) {
      setPasswordState((prev) => ({
        ...prev,
        error: 'New password must be at least 6 characters.',
        message: '',
      }));
      return;
    }

    if (passwordState.next !== passwordState.confirm) {
      setPasswordState((prev) => ({
        ...prev,
        error: 'New passwords do not match.',
        message: '',
      }));
      return;
    }

    setPasswordState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      message: '',
    }));

    try {
      await changePassword(passwordState.current, passwordState.next);
      setPasswordState({
        current: '',
        next: '',
        confirm: '',
        loading: false,
        message: 'Password updated successfully!',
        error: '',
      });
    } catch (error) {
      setPasswordState((prev) => ({
        ...prev,
        loading: false,
        error: error.message || 'Unable to update password. Please try again.',
      }));
    }
  };

  const handleResendVerification = async () => {
    setVerificationStatus({
      loading: true,
      message: '',
      error: '',
    });

    try {
      await resendVerificationEmail();
      setVerificationStatus({
        loading: false,
        message: 'Verification email sent! Check your inbox.',
        error: '',
      });
    } catch (error) {
      setVerificationStatus({
        loading: false,
        message: '',
        error: error.message || 'Unable to send verification email right now.',
      });
    }
  };

  const handleVerifyRefresh = async () => {
    setVerificationStatus({
      loading: true,
      message: '',
      error: '',
    });

    try {
      const refreshed = await refreshUser();
      if (refreshed?.emailVerified) {
        setVerificationStatus({
          loading: false,
          message: 'Email verified! Thank you.',
          error: '',
        });
      } else {
        setVerificationStatus({
          loading: false,
          message: '',
          error: 'Still waiting for verification. Tap resend or check again shortly.',
        });
      }
    } catch (error) {
      setVerificationStatus({
        loading: false,
        message: '',
        error: error.message || 'Unable to refresh verification status at the moment.',
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete') {
      Alert.alert('Confirmation Required', 'Please type "DELETE" to confirm account deletion.');
      return;
    }

    setDeleting(true);
    try {
      // Show a message that this may take a moment
      console.log('Starting account deletion...');
      await deleteAccount();
      // User will be logged out automatically
      console.log('Account deletion successful');
    } catch (error) {
      setDeleting(false);
      console.error('Account deletion error:', error);
      const errorMessage = error.message || 'Failed to delete account. Please try again or contact support.';
      Alert.alert(
        'Error',
        errorMessage + (errorMessage.includes('timeout') ? ' The operation may have partially completed.' : ''),
        [{ text: 'OK' }]
      );
    }
  };

  const handlePhotoUpload = async () => {
    if (!user?.uid) {
      Alert.alert('Error', 'User not found. Please try logging in again.');
      return;
    }

    setUploadingPhoto(true);
    try {
      const photoURL = await pickAndUploadImage(user.uid);
      
      // If user cancelled, photoURL will be null - just stop loading
      if (photoURL === null) {
        setUploadingPhoto(false);
        return;
      }
      
      if (photoURL) {
        // Delete old photo if it exists (don't wait for this to complete)
        if (user.photoURL) {
          deleteImageFromFirebase(user.photoURL).catch(err => 
            console.warn('Error deleting old photo:', err)
          );
        }
        
        // Update user profile with new photo URL
        await updateUserPhoto(photoURL);
        await refreshUser();
        Alert.alert('Success', 'Profile picture updated successfully!');
      }
    } catch (error) {
      console.error('Photo upload error:', error);
      const errorMessage = error.message || 'Failed to upload photo. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setUploadingPhoto(false);
    }
  };


  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
    >
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
        <Text style={styles.title}>Profile/Settings</Text>
      </View>

      <View style={styles.form}>
        {/* Profile Picture Section */}
        <View style={[
          styles.profilePictureSection,
          isSmallScreen && styles.profilePictureSectionMobile
        ]}>
          <View style={styles.profilePictureContainer}>
            {user?.photoURL ? (
              <Image 
                source={{ uri: user.photoURL }} 
                style={[
                  styles.profilePicture,
                  {
                    width: profilePictureSize,
                    height: profilePictureSize,
                    borderRadius: profilePictureRadius,
                  }
                ]} 
              />
            ) : (
              <View 
                style={[
                  styles.profilePicture, 
                  styles.profilePicturePlaceholder,
                  {
                    width: profilePictureSize,
                    height: profilePictureSize,
                    borderRadius: profilePictureRadius,
                  }
                ]}
              >
                <Text 
                  style={[
                    styles.profilePicturePlaceholderText,
                    { fontSize: placeholderFontSize }
                  ]}
                >
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
            {uploadingPhoto && (
              <View 
                style={[
                  styles.profilePictureOverlay,
                  {
                    borderRadius: profilePictureRadius,
                  }
                ]}
              >
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
            <TouchableOpacity
              style={styles.editPhotoButton}
              onPress={handlePhotoUpload}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={theme.colors.textPrimary} />
              ) : (
                <MaterialIcons name="edit" size={16} color={theme.colors.textPrimary} />
              )}
            </TouchableOpacity>
          </View>
          <View style={[
            styles.profileInfo,
            isSmallScreen && styles.profileInfoMobile
          ]}>
            {isEditingName ? (
              <View style={styles.nameEditContainer}>
                <TextInput
                  value={editingName}
                  onChangeText={setEditingName}
                  style={styles.nameInput}
                  autoFocus
                  maxLength={50}
                />
                <TouchableOpacity
                  style={styles.nameSaveButton}
                  onPress={handleNameSave}
                  disabled={saving}
                >
                  <MaterialIcons name="check" size={18} color={theme.colors.feltGreen} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nameCancelButton}
                  onPress={handleNameCancel}
                  disabled={saving}
                >
                  <MaterialIcons name="close" size={18} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>{userData.name || 'No name'}</Text>
                <TouchableOpacity
                  style={styles.nameEditButton}
                  onPress={handleNameEdit}
                >
                  <MaterialIcons name="edit" size={16} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          </View>
        </View>

        {!isEmailVerified && (
          <View style={[styles.message, styles.warningMessage]}>
            <Text style={styles.messageText}>
              Your email is not verified yet. Verify your email to unlock every feature.
            </Text>
            {verificationStatus.error ? (
              <Text style={[styles.messageText, styles.errorText]}>{verificationStatus.error}</Text>
            ) : null}
            {verificationStatus.message ? (
              <Text style={[styles.messageText, styles.successText]}>{verificationStatus.message}</Text>
            ) : null}
            <Button
              label={`📧 ${verificationStatus.loading ? 'Please wait...' : 'Resend verification email'}`}
              onPress={handleResendVerification}
              disabled={verificationStatus.loading}
              style={[styles.messageButton, styles.compactButton]}
            />
            <Button
              label="✓ I have verified"
              onPress={handleVerifyRefresh}
              disabled={verificationStatus.loading}
              variant="outline"
              style={styles.compactButton}
            />
          </View>
        )}

        <View style={styles.bioCard}>
          <View style={styles.bioHeader}>
            <Text style={styles.bioLabel}>Bio</Text>
            <Text style={[
              styles.wordCount,
              getWordCount(userData.bio) > 450 && styles.wordCountWarning,
              getWordCount(userData.bio) >= 500 && styles.wordCountError
            ]}>
              {getWordCount(userData.bio)} / 500 words
            </Text>
          </View>
          <TextInput
            value={userData.bio}
            onChangeText={(text) => {
              const wordCount = getWordCount(text);
              if (wordCount <= 500) {
                handleChange('bio', text);
              }
            }}
            placeholder="Tell us about yourself (500 word limit)"
            style={styles.bioInput}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={3000}
          />
        </View>


        <Button
          label={`💾 ${saving ? 'Saving...' : 'Save Profile'}`}
          onPress={handleSubmit}
          disabled={saving}
          style={[styles.saveButton, styles.compactButton]}
        />
      </View>

      <View style={styles.buttonGroup}>
        <Button
          label="🔔 Notification Settings"
          onPress={() => setShowNotificationModal(true)}
          variant="outline"
          style={[styles.compactButton, styles.tightButton]}
        />
        <Button
          label="🤖 Beeple's Recommendation Weights"
          onPress={() => setShowPersonalMatchModal(true)}
          variant="outline"
          style={[styles.compactButton, styles.tightButton]}
        />
        <Button
          label="🔒 Update Password"
          onPress={() => setShowPasswordModal(true)}
          variant="outline"
          style={[styles.compactButton, styles.tightButton]}
        />
        <Button
          label="🚪 Logout"
          onPress={logout}
          variant="outline"
          style={[styles.logoutButton, styles.compactButton, styles.tightButton]}
        />
      </View>

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <View style={styles.dangerZone}>
          <Text style={styles.dangerText}>
            Deleting your account will permanently remove all your data, including your profile, games, events, and posts. This action cannot be undone.
          </Text>
          <Button
            label="🗑️ Delete Account"
            onPress={() => setShowDeleteModal(true)}
            variant="outline"
            style={[styles.deleteButton, styles.compactButton]}
          />
        </View>
      </View>

      <Modal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        title="Notification Settings"
      >
        <NotificationSettings inModal={true} />
      </Modal>

      <Modal
        isOpen={showPersonalMatchModal}
        onClose={() => setShowPersonalMatchModal(false)}
        title="Beeple's Recommendation Weights"
      >
        <PersonalMatchSettings onSave={() => setShowPersonalMatchModal(false)} />
      </Modal>

      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordState({
            current: '',
            next: '',
            confirm: '',
            message: '',
            error: '',
            loading: false,
          });
        }}
        title="Update Password"
      >
        <View style={styles.passwordModalContent}>
          {passwordState.error ? (
            <View style={[styles.message, styles.errorMessage]}>
              <Text style={[styles.messageText, styles.errorText]}>{passwordState.error}</Text>
            </View>
          ) : null}
          {passwordState.message ? (
            <View style={[styles.message, styles.successMessage]}>
              <Text style={[styles.messageText, styles.successText]}>{passwordState.message}</Text>
            </View>
          ) : null}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Current password</Text>
            <Input
              value={passwordState.current}
              onChangeText={(text) =>
                setPasswordState((prev) => ({ ...prev, current: text, error: '', message: '' }))
              }
              placeholder="Enter current password"
              secureTextEntry
              style={styles.input}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>New password</Text>
            <Input
              value={passwordState.next}
              onChangeText={(text) =>
                setPasswordState((prev) => ({ ...prev, next: text, error: '', message: '' }))
              }
              placeholder="Enter new password"
              secureTextEntry
              style={styles.input}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Confirm new password</Text>
            <Input
              value={passwordState.confirm}
              onChangeText={(text) =>
                setPasswordState((prev) => ({ ...prev, confirm: text, error: '', message: '' }))
              }
              placeholder="Confirm new password"
              secureTextEntry
              style={styles.input}
            />
          </View>

          <View style={styles.passwordModalButtons}>
            <Button
              label="✕ Cancel"
              onPress={() => {
                setShowPasswordModal(false);
                setPasswordState({
                  current: '',
                  next: '',
                  confirm: '',
                  message: '',
                  error: '',
                  loading: false,
                });
              }}
              variant="outline"
              style={[styles.cancelButton, styles.compactButton]}
              disabled={passwordState.loading}
            />
            <Button
              label={`🔒 ${passwordState.loading ? 'Updating...' : 'Update password'}`}
              onPress={handlePasswordChange}
              disabled={passwordState.loading}
              style={[styles.saveButton, styles.compactButton]}
            />
          </View>
        </View>
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText('');
        }}
        title="Delete Account"
      >
        <View style={styles.deleteModalContent}>
          <Text style={styles.deleteWarningText}>
            This action cannot be undone. This will permanently delete:
          </Text>
          <View style={styles.deleteList}>
            <Text style={styles.deleteListItem}>• Your profile and account information</Text>
            <Text style={styles.deleteListItem}>• All your game collections</Text>
            <Text style={styles.deleteListItem}>• All events you've created or joined</Text>
            <Text style={styles.deleteListItem}>• All your posts and comments</Text>
            <Text style={styles.deleteListItem}>• Your availability profile</Text>
          </View>
          <Text style={styles.deleteWarningText}>
            If you are an organizer of any events, those events will be archived.
          </Text>
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Type <Text style={styles.confirmText}>DELETE</Text> to confirm:
            </Text>
            <Input
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="Type DELETE to confirm"
              style={styles.input}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.deleteModalButtons}>
            <Button
              label="✕ Cancel"
              onPress={() => {
                setShowDeleteModal(false);
                setDeleteConfirmText('');
              }}
              variant="outline"
              style={[styles.cancelButton, styles.compactButton]}
              disabled={deleting}
            />
            {deleting && (
              <Text style={styles.deletingNote}>
                This may take a few moments. Please don't close the app...
              </Text>
            )}
            <Button
              label={`🗑️ ${deleting ? 'Deleting Account...' : 'Delete My Account'}`}
              onPress={handleDeleteAccount}
              style={[styles.confirmDeleteButton, styles.compactButton]}
              disabled={deleting || deleteConfirmText.toLowerCase() !== 'delete'}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgColor,
  },
  scrollContent: {
    paddingBottom: 200, // Increased padding to ensure submit button is visible above keyboard
  },
  header: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing['2xl'],
  },
  title: {
    fontSize: theme.typography.fontSize.h1,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    backgroundColor: theme.colors.woodLight,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  form: {
    padding: theme.spacing.lg,
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    marginBottom: theme.spacing.xs,
  },
  textArea: {
    minHeight: 100,
    paddingTop: theme.spacing.md,
  },
  helpText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  message: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  successMessage: {
    backgroundColor: '#d4edda',
  },
  errorMessage: {
    backgroundColor: '#f8d7da',
  },
  warningMessage: {
    backgroundColor: '#fff7e6',
  },
  messageText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
  },
  successText: {
    color: '#155724',
  },
  errorText: {
    color: theme.colors.error,
  },
  saveButton: {
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  messageButton: {
    marginBottom: theme.spacing.sm,
  },
  logoutButton: {
    marginTop: theme.spacing.xs,
    borderColor: theme.colors.meepleRed,
  },
  dangerZone: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.meepleRed,
  },
  dangerText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
    lineHeight: theme.typography.fontSize.sm * theme.typography.lineHeight.normal,
  },
  deleteButton: {
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.surfaceColor,
  },
  deleteModalContent: {
    padding: theme.spacing.sm,
  },
  deleteWarningText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
    lineHeight: theme.typography.fontSize.sm * theme.typography.lineHeight.normal,
  },
  deleteList: {
    marginBottom: theme.spacing.lg,
    paddingLeft: theme.spacing.sm,
  },
  deleteListItem: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    lineHeight: theme.typography.fontSize.sm * theme.typography.lineHeight.normal,
  },
  confirmText: {
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.error,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  cancelButton: {
    flex: 1,
  },
  confirmDeleteButton: {
    flex: 1,
    backgroundColor: theme.colors.error,
  },
  deletingNote: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  profilePictureSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    gap: theme.spacing.md,
  },
  profilePictureSectionMobile: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  profilePictureContainer: {
    position: 'relative',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  profileInfoMobile: {
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  profileName: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  nameEditButton: {
    padding: theme.spacing.xs,
  },
  nameEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  nameInput: {
    flex: 1,
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    paddingBottom: theme.spacing.xs,
  },
  nameSaveButton: {
    padding: theme.spacing.xs,
  },
  nameCancelButton: {
    padding: theme.spacing.xs,
  },
  profileEmail: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  bioCard: {
    backgroundColor: theme.colors.cardSurface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  bioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  bioLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  wordCount: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  wordCountWarning: {
    color: theme.colors.warning,
  },
  wordCountError: {
    color: theme.colors.error,
  },
  bioInput: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    minHeight: 120,
    padding: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  buttonGroup: {
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  tightButton: {
    marginBottom: theme.spacing.xs,
  },
  editPhotoButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  profilePicture: {
    backgroundColor: theme.colors.woodMedium,
  },
  profilePicturePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.meepleRed,
  },
  profilePicturePlaceholderText: {
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
  },
  profilePictureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    minHeight: 36,
  },
  passwordModalContent: {
    padding: theme.spacing.sm,
  },
  passwordModalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
});

export default ProfileScreen;
