import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import Button from './common/Button';
import Input from './common/Input';

/**
 * Simple Create Event Form Component
 * Used for basic event creation (web version)
 * For more complex forms with calendar/dates, use the full form in Onboarding
 */
const CreateEventForm = ({
  eventForm,
  onFormChange,
  onSubmit,
  onCancel,
  loading = false,
  error,
}) => {
  const rsvpSettings = eventForm.rsvpSettings || {
    enabled: true,
    allowMaybe: true,
    attendanceLimit: null,
  };

  const handleRSVPSettingChange = (key, value) => {
    onFormChange({
      ...eventForm,
      rsvpSettings: {
        ...rsvpSettings,
        [key]: value,
      },
    });
  };

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      
      <Text style={styles.fieldLabel}>
        MeepleUp name <Text style={styles.requiredAsterisk}>*</Text>
      </Text>
      <Input
        value={eventForm.name}
        onChangeText={(text) => onFormChange({ ...eventForm, name: text })}
        placeholder="MeepleUp name"
        style={styles.input}
      />
      
      <Text style={styles.fieldLabel}>
        Location <Text style={styles.requiredAsterisk}>*</Text>
      </Text>
      <Input
        value={eventForm.location}
        onChangeText={(text) => onFormChange({ ...eventForm, location: text })}
        placeholder="Location (e.g., Jason's house)"
        style={styles.input}
      />
      
      <Text style={styles.fieldLabel}>Address</Text>
      <Input
        value={eventForm.address}
        onChangeText={(text) => onFormChange({ ...eventForm, address: text })}
        placeholder="Address (e.g., 123 Tolkien Dr.)"
        style={styles.input}
      />
      
      <Input
        value={eventForm.scheduledFor}
        onChangeText={(text) => onFormChange({ ...eventForm, scheduledFor: text })}
        placeholder="Date & time (optional)"
        style={styles.input}
      />
      
      <Input
        value={eventForm.description}
        onChangeText={(text) => onFormChange({ ...eventForm, description: text })}
        placeholder="Description (optional)"
        multiline
        numberOfLines={3}
        style={styles.input}
      />

      {/* RSVP Settings */}
      <View style={styles.rsvpSection}>
        <Text style={styles.sectionTitle}>RSVP Settings</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Enable RSVP:</Text>
          <Switch
            value={rsvpSettings.enabled}
            onValueChange={(value) => handleRSVPSettingChange('enabled', value)}
          />
        </View>

        {rsvpSettings.enabled && (
          <>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Allow Maybe Option:</Text>
              <Switch
                value={rsvpSettings.allowMaybe}
                onValueChange={(value) => handleRSVPSettingChange('allowMaybe', value)}
              />
            </View>

            <Text style={styles.fieldLabel}>Attendance Limit (optional):</Text>
            <Input
              value={rsvpSettings.attendanceLimit?.toString() || ''}
              onChangeText={(text) => {
                const limit = text.trim() ? parseInt(text.trim(), 10) : null;
                handleRSVPSettingChange('attendanceLimit', isNaN(limit) ? null : limit);
              }}
              placeholder="e.g., 10 (leave empty for no limit)"
              keyboardType="numeric"
              style={styles.input}
            />
            <Text style={styles.hint}>
              When the limit is reached, new RSVPs will be waitlisted
            </Text>
          </>
        )}
      </View>
      
      <View style={styles.actions}>
        <Button
          label={loading ? 'Organizing...' : 'Organize MeepleUp'}
          onPress={onSubmit}
          disabled={loading || !eventForm.name?.trim()}
          style={styles.submitButton}
        />
        <Button
          label="Cancel"
          onPress={onCancel}
          variant="outline"
          style={styles.cancelButton}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  requiredAsterisk: {
    color: '#d45d5d',
  },
  input: {
    marginBottom: 16,
  },
  error: {
    color: '#d32f2f',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  rsvpSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: -12,
    marginBottom: 16,
  },
  actions: {
    marginTop: 8,
  },
  submitButton: {
    marginBottom: 12,
  },
  cancelButton: {
    marginBottom: 12,
  },
});

export default CreateEventForm;

