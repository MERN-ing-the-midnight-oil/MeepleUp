import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import NotificationSettings from '../components/NotificationSettings';
import { pickAndUploadImage, deleteImageFromFirebase } from '../utils/imageUpload';
import { theme, commonStyles } from '../utils/theme';

const ProfileScreen = () => {
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

  useEffect(() => {
    if (user) {
      setUserData({
        name: user.name || '',
        email: user.email || '',
        bio: user.bio || '',
        bggUsername: user.bggUsername || '',
        zipcode: user.zipcode || user.location || '', // Support both for backward compatibility
      });
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

  const handleSubmit = async () => {
    // Validate zipcode before submitting
    const zipcodeValidationError = validateZipcode(userData.zipcode);
    if (zipcodeValidationError) {
      setZipcodeError(zipcodeValidationError);
      setMessage('');
      return;
    }

    setSaving(true);
    setMessage('');
    setZipcodeError('');

    try {
      await updateUser({
        name: userData.name,
        bio: userData.bio,
        bggUsername: userData.bggUsername,
        zipcode: userData.zipcode.trim() || '', // Save as zipcode, trim whitespace
      });
      await refreshUser();
      setMessage('Profile updated successfully!');
    } catch (error) {
      setMessage(error.message || 'Failed to update profile. Please try again.');
      console.error('Profile update error:', error);
    } finally {
      setSaving(false);
    }
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
        setMessage('Profile picture updated successfully!');
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
        <Text style={styles.subtitle}>{user?.email || ''}</Text>
      </View>

      <View style={styles.form}>
        {/* Profile Picture Section */}
        <View style={styles.profilePictureSection}>
          <View style={styles.profilePictureContainer}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.profilePicture} />
            ) : (
              <View style={[styles.profilePicture, styles.profilePicturePlaceholder]}>
                <Text style={styles.profilePicturePlaceholderText}>
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
            {uploadingPhoto && (
              <View style={styles.profilePictureOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.profilePictureActions}>
            <Button
              label={uploadingPhoto ? 'Uploading...' : 'Change Photo'}
              onPress={handlePhotoUpload}
              disabled={uploadingPhoto}
              variant="outline"
            />
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
              label={verificationStatus.loading ? 'Please wait...' : 'Resend verification email'}
              onPress={handleResendVerification}
              disabled={verificationStatus.loading}
              style={styles.messageButton}
            />
            <Button
              label="I have verified"
              onPress={handleVerifyRefresh}
              disabled={verificationStatus.loading}
              variant="outline"
            />
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Name</Text>
          <Input
            value={userData.name}
            onChangeText={(text) => handleChange('name', text)}
            placeholder="Enter your name"
            style={styles.input}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            value={userData.bio}
            onChangeText={(text) => handleChange('bio', text)}
            placeholder="Tell us about yourself"
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {message ? (
          <View style={[styles.message, styles.successMessage]}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        ) : null}

        <Button
          label={saving ? 'Saving...' : 'Save Profile'}
          onPress={handleSubmit}
          disabled={saving}
          style={styles.saveButton}
        />
      </View>

      <View style={styles.form}>
        <Button
          label="Notification Settings"
          onPress={() => setShowNotificationModal(true)}
          variant="outline"
          style={styles.saveButton}
        />
      </View>

      <View style={styles.form}>
        <Button
          label="Update Password"
          onPress={() => setShowPasswordModal(true)}
          variant="outline"
          style={styles.saveButton}
        />
      </View>

      <View style={styles.form}>
        <Button
          label="Logout"
          onPress={logout}
          variant="outline"
          style={styles.logoutButton}
        />
      </View>

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <View style={styles.dangerZone}>
          <Text style={styles.dangerText}>
            Deleting your account will permanently remove all your data, including your profile, games, events, and posts. This action cannot be undone.
          </Text>
          <Button
            label="Delete Account"
            onPress={() => setShowDeleteModal(true)}
            variant="outline"
            style={styles.deleteButton}
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
              label="Cancel"
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
              style={styles.cancelButton}
              disabled={passwordState.loading}
            />
            <Button
              label={passwordState.loading ? 'Updating...' : 'Update password'}
              onPress={handlePasswordChange}
              disabled={passwordState.loading}
              style={styles.saveButton}
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
              label="Cancel"
              onPress={() => {
                setShowDeleteModal(false);
                setDeleteConfirmText('');
              }}
              variant="outline"
              style={styles.cancelButton}
              disabled={deleting}
            />
            {deleting && (
              <Text style={styles.deletingNote}>
                This may take a few moments. Please don't close the app...
              </Text>
            )}
            <Button
              label={deleting ? 'Deleting Account...' : 'Delete My Account'}
              onPress={handleDeleteAccount}
              style={styles.confirmDeleteButton}
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
    paddingBottom: 100,
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
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
  },
  profilePictureContainer: {
    position: 'relative',
    marginBottom: theme.spacing.md,
  },
  profilePicture: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.woodMedium,
  },
  profilePicturePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.meepleRed,
  },
  profilePicturePlaceholderText: {
    fontSize: 48,
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
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePictureActions: {
    width: '100%',
    maxWidth: 300,
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
