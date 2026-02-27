import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Alert, Keyboard, TouchableWithoutFeedback, Platform } from 'react-native';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import KeyboardAwareScrollView from '../components/common/KeyboardAwareScrollView';
import { db } from '../config/firebase';

const Landing = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const isMobile = screenWidth < 600;

  const handleSubmit = async () => {
    setError('');

    const trimmed = (email || '').trim();
    if (!trimmed) {
      setError('Please enter your email');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      if (!db) {
        throw new Error('Service temporarily unavailable. Please try again later.');
      }
      await db.collection('maintenanceNotify').add({
        email: trimmed.toLowerCase(),
        createdAt: new Date(),
      });
      setSubmitted(true);
      setEmail('');
    } catch (err) {
      console.error('Maintenance signup error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <KeyboardAwareScrollView
      style={styles.keyboardAvoidingView}
      contentContainerStyle={[styles.scrollContainer, { paddingBottom: isMobile ? 40 : 80 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <View style={[styles.content, { padding: isMobile ? 20 : 40 }]}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../../assets/images/app-icon.png')}
              style={[styles.logo, { width: isMobile ? 100 : 140, height: isMobile ? 100 : 140 }]}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.title, { fontSize: isMobile ? 26 : 42 }]}>MeepleUp</Text>
          <Text style={[styles.message, { fontSize: isMobile ? 16 : 20, marginTop: isMobile ? 12 : 20 }]}>
            MeepleUp is closed for emergency maintenance.
          </Text>
          <Text style={[styles.question, { fontSize: isMobile ? 15 : 18, marginTop: isMobile ? 16 : 24 }]}>
            Can I send you an email when MeepleUp is feeling better?
          </Text>

          {submitted ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>Thanks! We'll email you when we're back.</Text>
            </View>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Input
                placeholder="Your email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { marginBottom: isMobile ? 12 : 16 }]}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                autoComplete="email"
                textContentType="emailAddress"
              />
              <Button
                label={loading ? 'Please wait...' : "Notify me"}
                onPress={handleSubmit}
                disabled={loading}
                style={styles.submitButton}
              />
            </>
          )}
        </View>
      </View>
    </KeyboardAwareScrollView>
  );

  return Platform.OS === 'web' ? (
    content
  ) : (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      {content}
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: 'transparent',
    paddingBottom: 80,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 440,
    padding: 40,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 12,
  },
  logo: {
    alignSelf: 'center',
  },
  title: {
    fontWeight: 'bold',
    color: '#d45d5d',
    textAlign: 'center',
  },
  message: {
    color: '#2b2b2b',
    textAlign: 'center',
    lineHeight: 24,
  },
  question: {
    color: '#6f6f6f',
    textAlign: 'center',
    lineHeight: 26,
  },
  input: {
    width: '100%',
    marginTop: 8,
  },
  error: {
    color: '#c0392b',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
    width: '100%',
  },
  submitButton: {
    width: '100%',
    marginTop: 8,
  },
  successBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    width: '100%',
  },
  successText: {
    fontSize: 16,
    color: '#2e7d32',
    textAlign: 'center',
  },
});

export default Landing;
