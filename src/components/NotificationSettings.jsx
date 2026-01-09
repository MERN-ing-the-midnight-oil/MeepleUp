import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Input from './common/Input';
import Button from './common/Button';

const NotificationSettings = ({ inModal = false }) => {
  const { user, updateNotificationPreferences } = useAuth();
  const [preferences, setPreferences] = useState({
    meepleupChanges: true,
    meepleupChangesEmail: false,
    eventReminders: true,
    eventReminderHours: 24, // Default: 24 hours before
    discussion: true,
    discussionEmail: false,
    discussionFrequency: 'all', // 'all', 'daily', 'mentions', 'responses'
    mentionAlert: true, // Default: yes to device alerts
    mentionEmail: false, // Default: no email
    mentionSMS: false, // Default: no SMS
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [hoursError, setHoursError] = useState('');

  useEffect(() => {
    if (user?.notificationPreferences) {
      setPreferences({
        meepleupChanges: user.notificationPreferences.meepleupChanges !== false,
        meepleupChangesEmail: user.notificationPreferences.meepleupChangesEmail === true,
        eventReminders: user.notificationPreferences.eventReminders !== false,
        eventReminderHours: user.notificationPreferences.eventReminderHours || 24,
        discussion: user.notificationPreferences.discussion !== false && user.notificationPreferences.gameMarking !== false,
        discussionEmail: user.notificationPreferences.discussionEmail === true || user.notificationPreferences.gameMarkingEmail === true,
        discussionFrequency: user.notificationPreferences.discussionFrequency || user.notificationPreferences.gameMarkingFrequency || 'all',
        mentionAlert: user.notificationPreferences.mentionAlert !== false,
        mentionEmail: user.notificationPreferences.mentionEmail === true,
        mentionSMS: user.notificationPreferences.mentionSMS === true,
      });
    }
  }, [user]);

  const validateHours = (value) => {
    if (!value || value.trim() === '') {
      return 'Please enter hours';
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      return 'Hours must be a positive number';
    }
    if (numValue > 168) {
      return 'Hours cannot exceed 168 (1 week)';
    }
    return '';
  };

  const handlePreferenceChange = (key, value) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value,
    }));
    setMessage('');
    if (key === 'eventReminderHours') {
      const error = validateHours(value.toString());
      setHoursError(error);
    }
  };

  const handleHoursChange = (value) => {
    setMessage('');
    
    // Allow empty value while typing
    if (!value || value.trim() === '') {
      setHoursError('');
      setPreferences((prev) => ({
        ...prev,
        eventReminderHours: value,
      }));
      return;
    }

    const error = validateHours(value);
    setHoursError(error);
    
    if (!error) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue > 0 && numValue <= 168) {
        handlePreferenceChange('eventReminderHours', numValue);
      }
    } else {
      // Still update the value so user can see what they're typing
      setPreferences((prev) => ({
        ...prev,
        eventReminderHours: value,
      }));
    }
  };

  const handleSave = async () => {
    // Validate hours before saving (only if eventReminders is enabled)
    if (preferences.eventReminders) {
      const hoursValue = preferences.eventReminderHours;
      const hoursStr = hoursValue ? hoursValue.toString() : '';
      const hoursValidationError = validateHours(hoursStr);
      if (hoursValidationError) {
        setHoursError(hoursValidationError);
        setMessage('');
        return;
      }
    }

    setSaving(true);
    setMessage('');
    setHoursError('');

    try {
      const hours = preferences.eventReminders && preferences.eventReminderHours
        ? parseFloat(preferences.eventReminderHours)
        : (preferences.eventReminderHours || 24);

      await updateNotificationPreferences({
        meepleupChanges: preferences.meepleupChanges,
        meepleupChangesEmail: preferences.meepleupChangesEmail,
        eventReminders: preferences.eventReminders,
        eventReminderHours: hours,
        discussion: preferences.discussion,
        discussionEmail: preferences.discussionEmail,
        discussionFrequency: preferences.discussionFrequency,
        mentionAlert: preferences.mentionAlert,
        mentionEmail: preferences.mentionEmail,
        mentionSMS: preferences.mentionSMS,
      });
      setMessage('Notification preferences saved successfully!');
    } catch (error) {
      setMessage(error.message || 'Failed to save preferences. Please try again.');
      console.error('Error saving notification preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, inModal && styles.containerModal]}>
      {!inModal && <Text style={styles.sectionTitle}>Notification Settings</Text>}
      <Text style={styles.sectionDescription}>
        Choose what types of notifications you want to receive
      </Text>

      {/* MeepleUp Changes Notification */}
      <View style={styles.settingItem}>
        <View style={styles.settingContent}>
          <Text style={styles.settingLabel}>MeepleUp Changes</Text>
          <Text style={styles.settingDescription}>
            Get notified when event details change
          </Text>
        </View>
        <Switch
          value={preferences.meepleupChanges}
          onValueChange={(value) => handlePreferenceChange('meepleupChanges', value)}
          trackColor={{ false: '#ddd', true: '#d45d5d' }}
          thumbColor="#fff"
        />
      </View>
      {preferences.meepleupChanges && (
        <View style={styles.emailSettingItem}>
          <View style={styles.settingContent}>
            <Text style={styles.emailSettingLabel}>Also send email notifications</Text>
          </View>
          <Switch
            value={preferences.meepleupChangesEmail}
            onValueChange={(value) => handlePreferenceChange('meepleupChangesEmail', value)}
            trackColor={{ false: '#ddd', true: '#d45d5d' }}
            thumbColor="#fff"
          />
        </View>
      )}

      {/* Event Reminders */}
      <View style={styles.settingItem}>
        <View style={styles.settingContent}>
          <Text style={styles.settingLabel}>Event Reminders</Text>
          <Text style={styles.settingDescription}>
            Get reminded before upcoming MeepleUp events you're attending
          </Text>
        </View>
        <Switch
          value={preferences.eventReminders}
          onValueChange={(value) => handlePreferenceChange('eventReminders', value)}
          trackColor={{ false: '#ddd', true: '#d45d5d' }}
          thumbColor="#fff"
        />
      </View>
      {preferences.eventReminders && (
        <View style={styles.hoursContainer}>
          <Text style={styles.hoursLabel}>
            Remind me {preferences.eventReminderHours || 24} hours before upcoming meetings
          </Text>
          <View style={styles.hoursInputContainer}>
            <Input
              value={preferences.eventReminderHours ? preferences.eventReminderHours.toString() : ''}
              onChangeText={handleHoursChange}
              placeholder="Enter hours"
              keyboardType="numeric"
              style={styles.hoursInput}
            />
            <Text style={styles.hoursUnit}>hours</Text>
          </View>
          {hoursError ? (
            <Text style={[styles.helpText, styles.errorText]}>{hoursError}</Text>
          ) : (
            <Text style={styles.helpText}>
              Set how many hours before an event you want to be reminded (1-168 hours / 1 week)
            </Text>
          )}
        </View>
      )}

      {/* Discussion Notification */}
      <View style={styles.settingItem}>
        <View style={styles.settingContent}>
          <Text style={styles.settingLabel}>Discussion</Text>
          <Text style={styles.settingDescription}>
            Get notified about new activity in the Discussion section of your MeepleUps
          </Text>
        </View>
        <Switch
          value={preferences.discussion}
          onValueChange={(value) => handlePreferenceChange('discussion', value)}
          trackColor={{ false: '#ddd', true: '#d45d5d' }}
          thumbColor="#fff"
        />
      </View>
      {preferences.discussion && (
        <>
          <View style={styles.emailSettingItem}>
            <View style={styles.settingContent}>
              <Text style={styles.emailSettingLabel}>Also send email notifications</Text>
            </View>
            <Switch
              value={preferences.discussionEmail}
              onValueChange={(value) => handlePreferenceChange('discussionEmail', value)}
              trackColor={{ false: '#ddd', true: '#d45d5d' }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.frequencyContainer}>
            <View style={styles.frequencyOptions}>
              <TouchableOpacity
                style={[
                  styles.frequencyOption,
                  preferences.discussionFrequency === 'all' && styles.frequencyOptionActive
                ]}
                onPress={() => handlePreferenceChange('discussionFrequency', 'all')}
              >
                <Text style={[
                  styles.frequencyOptionText,
                  preferences.discussionFrequency === 'all' && styles.frequencyOptionTextActive
                ]}>
                  All activity
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.frequencyOption,
                  preferences.discussionFrequency === 'daily' && styles.frequencyOptionActive
                ]}
                onPress={() => handlePreferenceChange('discussionFrequency', 'daily')}
              >
                <Text style={[
                  styles.frequencyOptionText,
                  preferences.discussionFrequency === 'daily' && styles.frequencyOptionTextActive
                ]}>
                  Daily summary
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.frequencyOption,
                  preferences.discussionFrequency === 'mentions' && styles.frequencyOptionActive
                ]}
                onPress={() => handlePreferenceChange('discussionFrequency', 'mentions')}
              >
                <Text style={[
                  styles.frequencyOptionText,
                  preferences.discussionFrequency === 'mentions' && styles.frequencyOptionTextActive
                ]}>
                  Mentions only
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.frequencyOption,
                  preferences.discussionFrequency === 'responses' && styles.frequencyOptionActive
                ]}
                onPress={() => handlePreferenceChange('discussionFrequency', 'responses')}
              >
                <Text style={[
                  styles.frequencyOptionText,
                  preferences.discussionFrequency === 'responses' && styles.frequencyOptionTextActive
                ]}>
                  Responses to my comments
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helpText}>
              {preferences.discussionFrequency === 'all' && 'Get notified about all new posts and comments'}
              {preferences.discussionFrequency === 'daily' && 'Receive one daily summary of all Discussion activity'}
              {preferences.discussionFrequency === 'mentions' && 'Only get notified when someone mentions you'}
              {preferences.discussionFrequency === 'responses' && 'Only get notified when someone replies to your comments'}
            </Text>
          </View>
        </>
      )}

      {/* @Mention Notifications */}
      <View style={styles.settingItem}>
        <View style={styles.settingContent}>
          <Text style={styles.settingLabel}>@Mention Notifications</Text>
          <Text style={styles.settingDescription}>
            Get notified when someone mentions you in a post using @YourName
          </Text>
        </View>
        <Switch
          value={preferences.mentionAlert}
          onValueChange={(value) => handlePreferenceChange('mentionAlert', value)}
          trackColor={{ false: '#ddd', true: '#d45d5d' }}
          thumbColor="#fff"
        />
      </View>
      {preferences.mentionAlert && (
        <>
          <View style={styles.emailSettingItem}>
            <View style={styles.settingContent}>
              <Text style={styles.emailSettingLabel}>Also send email notifications</Text>
            </View>
            <Switch
              value={preferences.mentionEmail}
              onValueChange={(value) => handlePreferenceChange('mentionEmail', value)}
              trackColor={{ false: '#ddd', true: '#d45d5d' }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.emailSettingItem}>
            <View style={styles.settingContent}>
              <Text style={styles.emailSettingLabel}>Also send text (SMS) alerts</Text>
            </View>
            <Switch
              value={preferences.mentionSMS}
              onValueChange={(value) => handlePreferenceChange('mentionSMS', value)}
              trackColor={{ false: '#ddd', true: '#d45d5d' }}
              thumbColor="#fff"
            />
          </View>
        </>
      )}

      {message ? (
        <View style={[styles.message, message.includes('successfully') ? styles.successMessage : styles.errorMessage]}>
          <Text style={[styles.messageText, message.includes('successfully') ? styles.successText : styles.errorText]}>
            {message}
          </Text>
        </View>
      ) : null}

      <Button
        label={saving ? 'Saving...' : 'Save Notification Settings'}
        onPress={handleSave}
        disabled={saving || !!hoursError}
        style={styles.saveButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  containerModal: {
    padding: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  hoursContainer: {
    marginTop: 8,
    marginBottom: 16,
    paddingLeft: 0,
    paddingRight: 0,
  },
  hoursLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  hoursInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  hoursInput: {
    flex: 1,
    marginRight: 8,
    marginBottom: 0,
  },
  hoursUnit: {
    fontSize: 16,
    color: '#666',
    minWidth: 50,
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
    marginTop: 8,
  },
  emailSettingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 0,
    paddingLeft: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  emailSettingLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666',
  },
  frequencyContainer: {
    marginTop: 8,
    marginBottom: 16,
    paddingLeft: 20,
    paddingRight: 0,
  },
  frequencyLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 12,
  },
  frequencyOptions: {
    flexDirection: 'column',
    gap: 8,
  },
  frequencyOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  frequencyOptionActive: {
    borderColor: '#d45d5d',
    backgroundColor: '#fef5f5',
  },
  frequencyOptionText: {
    fontSize: 14,
    color: '#666',
  },
  frequencyOptionTextActive: {
    color: '#d45d5d',
    fontWeight: '500',
  },
});

export default NotificationSettings;

