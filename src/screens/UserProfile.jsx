import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

const UserProfile = () => {
  const { user, updateUser } = useAuth();
  const navigation = useNavigation();
    const [userData, setUserData] = useState({
        name: '',
        email: '',
    bio: '',
    bggUsername: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user) {
      setUserData({
        name: user.name || '',
        email: user.email || '',
        bio: user.bio || '',
        bggUsername: user.bggUsername || '',
      });
    }
  }, [user]);

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
      await updateUser(userData);
      setMessage('Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Failed to update profile. Please try again.');
      console.error('Profile update error:', error);
    } finally {
      setSaving(false);
    }
    };

    return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>User Profile</Text>
        <Text style={styles.subtitle}>Manage your profile information</Text>
      </View>

      <View style={styles.form}>
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
            onChangeText={(text) => handleChange('email', text)}
                        placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
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

        {message && (
          <View style={[styles.message, message.includes('success') ? styles.messageSuccess : styles.messageError]}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        <View style={styles.formActions}>
          <Button
            label={saving ? 'Saving...' : 'Save Profile'}
            onPress={handleSubmit}
            disabled={saving}
            style={styles.saveButton}
          />
          {userData.bggUsername && (
            <Button
              label="Import BGG Collection"
              onPress={() => navigation.navigate('Collection', { tab: 'bgg' })}
              variant="outline"
              style={styles.importButton}
            />
          )}
        </View>
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
    color: '#333',
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
  messageSuccess: {
    backgroundColor: '#d4edda',
  },
  messageError: {
    backgroundColor: '#f8d7da',
  },
  messageText: {
    fontSize: 14,
    color: '#155724',
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
});

export default UserProfile;
