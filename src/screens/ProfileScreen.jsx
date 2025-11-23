import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

const ProfileScreen = () => {
  const {
    user,
    updateUser,
    changePassword,
    resendVerificationEmail,
    refreshUser,
    isEmailVerified,
    logout,
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

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView style={styles.container}>
        <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Manage your account settings</Text>
      </View>

      <View style={styles.form}>
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
          <Text style={styles.label}>Email</Text>
          <Input
            value={userData.email}
            placeholder="Email address"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            disabled
          />
          <Text style={styles.helpText}>
            Email changes require contacting support so we can keep your account secure.
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Zipcode</Text>
          <Input
            value={userData.zipcode}
            onChangeText={(text) => handleChange('zipcode', text)}
            placeholder="12345 or 12345-6789"
            keyboardType="default"
            style={styles.input}
          />
          {zipcodeError ? (
            <Text style={[styles.helpText, styles.errorText]}>{zipcodeError}</Text>
          ) : null}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>BoardGameGeek Username</Text>
          <Input
            value={userData.bggUsername}
            onChangeText={(text) => handleChange('bggUsername', text)}
            placeholder="Enter your BGG username"
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={styles.helpText}>
            Connect your BGG account to import your collection. Make sure your BGG collection is set to public.
          </Text>
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
        <Text style={styles.sectionTitle}>Update Password</Text>
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

        <Button
          label={passwordState.loading ? 'Updating...' : 'Update password'}
          onPress={handlePasswordChange}
          disabled={passwordState.loading}
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
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    marginBottom: 4,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  helpText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  message: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
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
    fontSize: 14,
    color: '#1a1a1a',
  },
  successText: {
    color: '#155724',
  },
  errorText: {
    color: '#721c24',
  },
  saveButton: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  messageButton: {
    marginBottom: 8,
  },
  logoutButton: {
    marginTop: 8,
    borderColor: '#d45d5d',
  },
});

export default ProfileScreen;
