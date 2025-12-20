import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../utils/theme';
import FaderSlider from './FaderSlider';

const PersonalMatchSettings = ({ onSave }) => {
  const { user, updateUser } = useAuth();
  const [weights, setWeights] = useState({
    publisher: 3,
    mechanics: 3,
    category: 2,
    complexity: 1.5,
    favorite: 2,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.personalMatchWeights) {
      setWeights(user.personalMatchWeights);
    }
  }, [user]);

  const handleWeightChange = (key, value) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      return;
    }
    setWeights(prev => ({
      ...prev,
      [key]: numValue,
    }));
  };

  const handleReset = () => {
    setWeights({
      publisher: 3,
      mechanics: 3,
      category: 2,
      complexity: 1.5,
      favorite: 2,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUser({
        personalMatchWeights: weights,
      });
      Alert.alert('Success', 'Beeple\'s recommendation weights saved successfully!');
      if (onSave) {
        onSave();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save weights. Please try again.');
      console.error('Error saving personal match weights:', error);
    } finally {
      setSaving(false);
    }
  };

  const weightDescriptions = {
    publisher: 'How much to weight games from the same publisher',
    mechanics: 'How much to weight games with similar mechanics',
    category: 'How much to weight games in the same category/theme',
    complexity: 'How much to weight games with similar complexity',
    favorite: 'Multiplier for games you\'ve marked as favorites',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.description}>
        Adjust the weight points for each matching criteria that Beeple uses to make recommendations. Higher values mean that criteria will have more influence on recommendations. The proportions between weights determine their relative importance.
      </Text>

      {Object.entries(weights).map(([key, value]) => (
        <FaderSlider
          key={key}
          label={key.charAt(0).toUpperCase() + key.slice(1)}
          description={weightDescriptions[key]}
          value={value}
          onValueChange={(newValue) => handleWeightChange(key, newValue)}
          minimumValue={0}
          maximumValue={5}
          step={0.1}
          disabled={saving}
        />
      ))}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.resetButton]}
          onPress={handleReset}
          disabled={saving}
        >
          <Text style={styles.resetButtonText}>Reset to Defaults</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.saveButton]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Weights'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.lg,
  },
  description: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButton: {
    backgroundColor: theme.colors.surfaceColor,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  resetButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  saveButton: {
    backgroundColor: theme.colors.meepleRed,
  },
  saveButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
});

export default PersonalMatchSettings;

