import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Input from './common/Input';
import Button from './common/Button';

const NotificationSettings = () => {
  const { user, updateNotificationPreferences } = useAuth();
  const [preferences, setPreferences] = useState({
    meepleupChanges: true,
    meepleupChangesEmail: false,
    newPublicMeepleups: true,
    newPublicMeepleupsEmail: false,
    gameMarking: true,
    gameMarkingEmail: false,
    nearbyMeepleupDistance: 25,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [distanceError, setDistanceError] = useState('');

  useEffect(() => {
    if (user?.notificationPreferences) {
      setPreferences({
        meepleupChanges: user.notificationPreferences.meepleupChanges !== false,
        meepleupChangesEmail: user.notificationPreferences.meepleupChangesEmail === true,
        newPublicMeepleups: user.notificationPreferences.newPublicMeepleups !== false,
        newPublicMeepleupsEmail: user.notificationPreferences.newPublicMeepleupsEmail === true,
        gameMarking: user.notificationPreferences.gameMarking !== false,
        gameMarkingEmail: user.notificationPreferences.gameMarkingEmail === true,
        nearbyMeepleupDistance: user.notificationPreferences.nearbyMeepleupDistance || 25,
      });
    }
  }, [user]);

  const validateDistance = (value) => {
    if (!value || value.trim() === '') {
      return 'Please enter a distance';
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      return 'Distance must be a positive number';
    }
    if (numValue > 500) {
      return 'Distance cannot exceed 500 miles';
    }
    return '';
  };

  const handlePreferenceChange = (key, value) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value,
    }));
    setMessage('');
    if (key === 'nearbyMeepleupDistance') {
      const error = validateDistance(value.toString());
      setDistanceError(error);
    }
  };

  const handleDistanceChange = (value) => {
    setMessage('');
    
    // Allow empty value while typing
    if (!value || value.trim() === '') {
      setDistanceError('');
      setPreferences((prev) => ({
        ...prev,
        nearbyMeepleupDistance: value,
      }));
      return;
    }

    const error = validateDistance(value);
    setDistanceError(error);
    
    if (!error) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue > 0 && numValue <= 500) {
        handlePreferenceChange('nearbyMeepleupDistance', numValue);
      }
    } else {
      // Still update the value so user can see what they're typing
      setPreferences((prev) => ({
        ...prev,
        nearbyMeepleupDistance: value,
      }));
    }
  };

  const handleSave = async () => {
    // Validate distance before saving (only if newPublicMeepleups is enabled)
    if (preferences.newPublicMeepleups) {
      const distanceValue = preferences.nearbyMeepleupDistance;
      const distanceStr = distanceValue ? distanceValue.toString() : '';
      const distanceValidationError = validateDistance(distanceStr);
      if (distanceValidationError) {
        setDistanceError(distanceValidationError);
        setMessage('');
        return;
      }
    }

    setSaving(true);
    setMessage('');
    setDistanceError('');

    try {
      const distance = preferences.newPublicMeepleups && preferences.nearbyMeepleupDistance
        ? parseFloat(preferences.nearbyMeepleupDistance)
        : (preferences.nearbyMeepleupDistance || 25);

      await updateNotificationPreferences({
        meepleupChanges: preferences.meepleupChanges,
        meepleupChangesEmail: preferences.meepleupChangesEmail,
        newPublicMeepleups: preferences.newPublicMeepleups,
        newPublicMeepleupsEmail: preferences.newPublicMeepleupsEmail,
        gameMarking: preferences.gameMarking,
        gameMarkingEmail: preferences.gameMarkingEmail,
        nearbyMeepleupDistance: distance,
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
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Notification Settings</Text>
      <Text style={styles.sectionDescription}>
        Choose what types of notifications you want to receive
      </Text>

      {/* MeepleUp Changes Notification */}
      <View style={styles.settingItem}>
        <View style={styles.settingContent}>
          <Text style={styles.settingLabel}>MeepleUp Changes</Text>
          <Text style={styles.settingDescription}>
            Get notified when there are changes to MeepleUp's you are part of
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

      {/* New Public MeepleUp's Near You */}
      <View style={styles.settingItem}>
        <View style={styles.settingContent}>
          <Text style={styles.settingLabel}>New Public MeepleUp's Near You</Text>
          <Text style={styles.settingDescription}>
            Get notified when new public MeepleUp's are created near your zip code
          </Text>
        </View>
        <Switch
          value={preferences.newPublicMeepleups}
          onValueChange={(value) => handlePreferenceChange('newPublicMeepleups', value)}
          trackColor={{ false: '#ddd', true: '#d45d5d' }}
          thumbColor="#fff"
        />
      </View>
      {preferences.newPublicMeepleups && (
        <View style={styles.emailSettingItem}>
          <View style={styles.settingContent}>
            <Text style={styles.emailSettingLabel}>Also send email notifications</Text>
          </View>
          <Switch
            value={preferences.newPublicMeepleupsEmail}
            onValueChange={(value) => handlePreferenceChange('newPublicMeepleupsEmail', value)}
            trackColor={{ false: '#ddd', true: '#d45d5d' }}
            thumbColor="#fff"
          />
        </View>
      )}

      {/* Distance Setting (only show when newPublicMeepleups is enabled) */}
      {preferences.newPublicMeepleups && (
        <View style={styles.distanceContainer}>
          <Text style={styles.distanceLabel}>
            Notification radius: {preferences.nearbyMeepleupDistance || 25} miles
          </Text>
          <View style={styles.distanceInputContainer}>
            <Input
              value={preferences.nearbyMeepleupDistance ? preferences.nearbyMeepleupDistance.toString() : ''}
              onChangeText={handleDistanceChange}
              placeholder="Enter distance in miles"
              keyboardType="numeric"
              style={styles.distanceInput}
            />
            <Text style={styles.distanceUnit}>miles</Text>
          </View>
          {distanceError ? (
            <Text style={[styles.helpText, styles.errorText]}>{distanceError}</Text>
          ) : (
            <Text style={styles.helpText}>
              Set the distance in miles to define "near" your zip code (1-500 miles)
            </Text>
          )}
        </View>
      )}

      {/* Game Marking Notification */}
      <View style={styles.settingItem}>
        <View style={styles.settingContent}>
          <Text style={styles.settingLabel}>Game Title Marking</Text>
          <Text style={styles.settingDescription}>
            Get notified when other users mark interest on your game titles
          </Text>
        </View>
        <Switch
          value={preferences.gameMarking}
          onValueChange={(value) => handlePreferenceChange('gameMarking', value)}
          trackColor={{ false: '#ddd', true: '#d45d5d' }}
          thumbColor="#fff"
        />
      </View>
      {preferences.gameMarking && (
        <View style={styles.emailSettingItem}>
          <View style={styles.settingContent}>
            <Text style={styles.emailSettingLabel}>Also send email notifications</Text>
          </View>
          <Switch
            value={preferences.gameMarkingEmail}
            onValueChange={(value) => handlePreferenceChange('gameMarkingEmail', value)}
            trackColor={{ false: '#ddd', true: '#d45d5d' }}
            thumbColor="#fff"
          />
        </View>
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
        disabled={saving || !!distanceError}
        style={styles.saveButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
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
  distanceContainer: {
    marginTop: 8,
    marginBottom: 16,
    paddingLeft: 0,
    paddingRight: 0,
  },
  distanceLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  distanceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  distanceInput: {
    flex: 1,
    marginRight: 8,
    marginBottom: 0,
  },
  distanceUnit: {
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
});

export default NotificationSettings;

