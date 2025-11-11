import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAvailability } from '../context/AvailabilityContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

const DAY_OPTIONS = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

const LONG_DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const UserProfile = () => {
  const {
    user,
    updateUser,
    changePassword,
    resendVerificationEmail,
    refreshUser,
    isEmailVerified,
  } = useAuth();
  const {
    slots: availabilitySlots,
    saveSlot,
    deleteSlot,
    loading: availabilityLoading,
    saving: availabilitySaving,
    error: availabilityError,
    isLooking,
    setLookingForMatches,
    preferences: availabilityPreferences,
  } = useAvailability();
  const navigation = useNavigation();
  const [userData, setUserData] = useState({
    name: '',
    email: '',
    bio: '',
    bggUsername: '',
    location: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [availabilityMessage, setAvailabilityMessage] = useState({
    type: '',
    text: '',
  });
  const [slotForm, setSlotForm] = useState({
    id: undefined,
    day: 'thursday',
    startTime: '18:00',
    endTime: '21:00',
    locationQuery: '',
    radiusMiles: '5',
    notes: '',
  });
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
        location: user.location || '',
      });
    }
  }, [user]);

  useEffect(() => {
    if (availabilityPreferences?.defaultRadiusMiles) {
      setSlotForm((prev) => ({
        ...prev,
        radiusMiles:
          prev.radiusMiles || `${availabilityPreferences.defaultRadiusMiles}`,
      }));
    }
  }, [availabilityPreferences]);

  useEffect(() => {
    if (user?.location) {
      setSlotForm((prev) => ({
        ...prev,
        locationQuery: prev.locationQuery || user.location,
      }));
    }
  }, [user?.location]);

  const parseMinutes = useMemo(
    () => (time) => {
      if (!time) {
        return null;
      }
      const [hours, minutes] = time.split(':');
      const h = Number(hours);
      const m = Number(minutes);
      if (!Number.isFinite(h) || !Number.isFinite(m)) {
        return null;
      }
      return h * 60 + m;
    },
    [],
  );

  const sortedAvailabilitySlots = useMemo(() => {
    const order = DAY_OPTIONS.map((option) => option.value);
    return [...availabilitySlots].sort((a, b) => {
      if (a.day !== b.day) {
        return order.indexOf(a.day) - order.indexOf(b.day);
      }
      const aTime = parseMinutes(a.startTime) ?? 0;
      const bTime = parseMinutes(b.startTime) ?? 0;
      return aTime - bTime;
    });
  }, [availabilitySlots, parseMinutes]);

  const formatTimeLabel = useMemo(
    () => (value) => {
      if (!value) {
        return '';
      }
      const [hoursStr, minutesStr] = value.split(':');
      const hours = Number(hoursStr);
      const minutes = Number(minutesStr);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return value;
      }
      const suffix = hours >= 12 ? 'PM' : 'AM';
      const normalizedHour = ((hours + 11) % 12) + 1;
      return `${normalizedHour}:${minutesStr} ${suffix}`;
    },
    [],
  );

  const handleChange = (field, value) => {
    setUserData({
      ...userData,
      [field]: value,
    });
    setMessage('');
  };

  const handleSubmit = async () => {
    setSaving(true);
    setMessage('');

    try {
      await updateUser({
        name: userData.name,
        bio: userData.bio,
        bggUsername: userData.bggUsername,
        location: userData.location,
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

  const resetSlotForm = () => {
    setSlotForm({
      id: undefined,
      day: 'thursday',
      startTime: '18:00',
      endTime: '21:00',
      locationQuery: user?.location || '',
      radiusMiles: String(availabilityPreferences?.defaultRadiusMiles || 5),
      notes: '',
    });
  };

  const handleSelectDay = (day) => {
    setSlotForm((prev) => ({
      ...prev,
      day,
    }));
  };

  const handleSlotInputChange = (field, value) => {
    setSlotForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setAvailabilityMessage({ type: '', text: '' });
  };

  const handleEditSlot = (slot) => {
    setSlotForm({
      id: slot.id,
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      locationQuery: slot.location?.query || slot.location?.label || '',
      radiusMiles: String(slot.location?.radiusMiles || availabilityPreferences?.defaultRadiusMiles || 5),
      notes: slot.notes || '',
    });
    setAvailabilityMessage({
      type: '',
      text: '',
    });
  };

  const handleDeleteSlot = async (slotId) => {
    try {
      await deleteSlot(slotId);
      if (slotForm.id === slotId) {
        resetSlotForm();
      }
      setAvailabilityMessage({
        type: 'success',
        text: 'Availability window removed.',
      });
    } catch (error) {
      setAvailabilityMessage({
        type: 'error',
        text: error.message || 'Unable to remove this availability right now.',
      });
    }
  };

  const handleSlotSubmit = async () => {
    if (!slotForm.locationQuery?.trim()) {
      setAvailabilityMessage({
        type: 'error',
        text: 'Add a city or zip code so we can match you locally.',
      });
      return;
    }

    const timePattern = /^([01]?\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(slotForm.startTime) || !timePattern.test(slotForm.endTime)) {
      setAvailabilityMessage({
        type: 'error',
        text: 'Use 24-hour time like 18:00 for start and 21:30 for end.',
      });
      return;
    }

    const startMinutes = parseMinutes(slotForm.startTime);
    const endMinutes = parseMinutes(slotForm.endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      setAvailabilityMessage({
        type: 'error',
        text: 'End time must be later than start time.',
      });
      return;
    }

    const radiusValue = Number(slotForm.radiusMiles);
    if (!Number.isFinite(radiusValue) || radiusValue <= 0) {
      setAvailabilityMessage({
        type: 'error',
        text: 'Radius should be a positive number of miles.',
      });
      return;
    }

    try {
      await saveSlot({
        id: slotForm.id,
        day: slotForm.day,
        startTime: slotForm.startTime,
        endTime: slotForm.endTime,
        notes: slotForm.notes,
        location: {
          query: slotForm.locationQuery,
          radiusMiles: radiusValue,
        },
      });
      setAvailabilityMessage({
        type: 'success',
        text: slotForm.id ? 'Availability updated!' : 'Availability saved!',
      });
      resetSlotForm();
    } catch (error) {
      setAvailabilityMessage({
        type: 'error',
        text: error.message || 'Unable to save availability right now.',
      });
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
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>User Profile</Text>
        <Text style={styles.subtitle}>Manage your profile information</Text>
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
          <Text style={styles.label}>Location</Text>
          <Input
            value={userData.location}
            onChangeText={(text) => handleChange('location', text)}
            placeholder="City, State"
            autoCapitalize="words"
            style={styles.input}
          />
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

        <View style={styles.formActions}>
          <Button
            label={saving ? 'Saving...' : 'Save Profile'}
            onPress={handleSubmit}
            disabled={saving}
            style={styles.saveButton}
          />
          {userData.bggUsername ? (
            <Button
              label="Import BGG Collection"
              onPress={() => navigation.navigate('Collection', { tab: 'bgg' })}
              variant="outline"
              style={styles.importButton}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.availabilitySection}>
        <View style={styles.availabilityHeader}>
          <Text style={styles.sectionTitle}>Recurring Availability</Text>
          <Text style={styles.availabilityHint}>
            Share your weekly windows so MeepleUp can introduce you to nearby players with
            matching schedules.
          </Text>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Show my availability to other Meeples</Text>
          <Pressable
            onPress={async () => {
              try {
                await setLookingForMatches(!isLooking);
              } catch (error) {
                setAvailabilityMessage({
                  type: 'error',
                  text: error.message || 'Unable to update your visibility right now.',
                });
              }
            }}
            style={[
              styles.toggleButton,
              isLooking && styles.toggleButtonActive,
            ]}
          >
            <Text
              style={[
                styles.toggleButtonText,
                isLooking && styles.toggleButtonTextActive,
              ]}
            >
              {isLooking ? 'On' : 'Off'}
            </Text>
          </Pressable>
        </View>

        {availabilityMessage.text ? (
          <View
            style={[
              styles.message,
              availabilityMessage.type === 'error'
                ? styles.errorMessage
                : styles.successMessage,
              styles.formSpacer,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                availabilityMessage.type === 'error'
                  ? styles.errorText
                  : styles.successText,
              ]}
            >
              {availabilityMessage.text}
            </Text>
          </View>
        ) : null}

        {availabilityError ? (
          <View style={[styles.message, styles.errorMessage, styles.formSpacer]}>
            <Text style={[styles.messageText, styles.errorText]}>
              {availabilityError.message ||
                'We hit a snag loading your availability. Pull to refresh or try again soon.'}
            </Text>
          </View>
        ) : null}

        {availabilityLoading ? (
          <Text style={[styles.helpText, styles.formSpacer]}>
            Loading your availability…
          </Text>
        ) : null}

        {!availabilityLoading && sortedAvailabilitySlots.length === 0 ? (
          <View style={styles.emptyAvailability}>
            <Text style={styles.cardMeta}>
              Add your first weekly window and MeepleUp will let you know when someone nearby
              overlaps.
            </Text>
          </View>
        ) : null}

        {sortedAvailabilitySlots.map((slot) => (
          <View key={slot.id} style={styles.availabilityCard}>
            <View style={styles.availabilityCardHeader}>
              <Text style={styles.availabilityCardTitle}>
                {LONG_DAY_LABELS[slot.day] || slot.day}
              </Text>
              <Text style={styles.cardMeta}>
                {formatTimeLabel(slot.startTime)} — {formatTimeLabel(slot.endTime)}
              </Text>
            </View>
            <Text style={styles.cardMeta}>
              {slot.location?.label || slot.location?.query || 'Location TBD'} · within{' '}
              {slot.location?.radiusMiles || 5} miles
            </Text>
            {slot.notes ? (
              <Text style={[styles.cardMeta, styles.formSpacer]}>{slot.notes}</Text>
            ) : null}
            <View style={styles.cardActions}>
              <Pressable onPress={() => handleEditSlot(slot)}>
                <Text style={styles.actionLink}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => handleDeleteSlot(slot.id)}>
                <Text style={styles.actionLink}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.availabilityForm}>
          <Text style={styles.sectionSubtitle}>
            {slotForm.id ? 'Update time block' : 'Add a new time block'}
          </Text>

          <Text style={styles.formFieldLabel}>Day of the week</Text>
          <View style={styles.chipGroup}>
            {DAY_OPTIONS.map((option) => {
              const active = slotForm.day === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelectDay(option.value)}
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.inlineFields, styles.formSpacer]}>
            <View style={[styles.inlineField, styles.inlineFieldSpacing]}>
              <Text style={styles.formFieldLabel}>Start (24-hour)</Text>
              <Input
                value={slotForm.startTime}
                onChangeText={(text) => handleSlotInputChange('startTime', text)}
                placeholder="18:00"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.formFieldLabel}>End (24-hour)</Text>
              <Input
                value={slotForm.endTime}
                onChangeText={(text) => handleSlotInputChange('endTime', text)}
                placeholder="21:30"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.formSpacer}>
            <Text style={styles.formFieldLabel}>Zip code or city</Text>
            <Input
              value={slotForm.locationQuery}
              onChangeText={(text) => handleSlotInputChange('locationQuery', text)}
              placeholder="e.g. 98225 or Seattle, WA"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formSpacer}>
            <Text style={styles.formFieldLabel}>Radius (miles)</Text>
            <Input
              value={slotForm.radiusMiles}
              onChangeText={(text) => handleSlotInputChange('radiusMiles', text)}
              keyboardType="numeric"
              autoCapitalize="none"
              placeholder="5"
            />
          </View>

          <View style={styles.formSpacer}>
            <Text style={styles.formFieldLabel}>Notes (optional)</Text>
            <TextInput
              value={slotForm.notes}
              onChangeText={(text) => handleSlotInputChange('notes', text)}
              placeholder="Add details like ideal player count or specific games."
              style={[styles.input, styles.notesInput]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.availabilityActions}>
            <Button
              label={
                availabilitySaving
                  ? 'Saving...'
                  : slotForm.id
                  ? 'Update availability'
                  : 'Save availability'
              }
              onPress={handleSlotSubmit}
              disabled={availabilitySaving}
            />
            {slotForm.id ? (
              <Button
                label="Cancel edit"
                onPress={resetSlotForm}
                variant="outline"
                style={styles.buttonInline}
              />
            ) : null}
          </View>
        </View>
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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
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
  formActions: {
    marginTop: 8,
  },
  saveButton: {
    marginBottom: 12,
  },
  importButton: {
    marginBottom: 12,
  },
  availabilitySection: {
    padding: 20,
    paddingTop: 0,
  },
  availabilityHeader: {
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  availabilityHint: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eef4ff',
    borderWidth: 1,
    borderColor: '#d6e4ff',
  },
  toggleLabel: {
    fontSize: 15,
    color: '#23395d',
    fontWeight: '600',
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4a90e2',
  },
  toggleButtonActive: {
    backgroundColor: '#4a90e2',
  },
  toggleButtonText: {
    fontSize: 14,
    color: '#4a90e2',
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  availabilityCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  availabilityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  availabilityCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  cardMeta: {
    fontSize: 13,
    color: '#666',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  actionLink: {
    marginLeft: 16,
    fontSize: 13,
    color: '#4a90e2',
    fontWeight: '600',
  },
  emptyAvailability: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#fff7e6',
    borderWidth: 1,
    borderColor: '#ffdaa6',
    marginBottom: 16,
  },
  availabilityForm: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dae0e6',
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: '#4a90e2',
    borderColor: '#4a90e2',
  },
  chipText: {
    fontSize: 13,
    color: '#4a4a4a',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
  },
  inlineFields: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inlineField: {
    flex: 1,
  },
  inlineFieldSpacing: {
    marginRight: 12,
  },
  notesInput: {
    minHeight: 80,
  },
  formFieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  formSpacer: {
    marginBottom: 16,
  },
  availabilityActions: {
    marginTop: 12,
  },
  buttonInline: {
    marginTop: 8,
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
});

export default UserProfile;
