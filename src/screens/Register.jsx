import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { validateJoinCode } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import Button from '../components/common/Button';
import Input from '../components/common/Input';

const RegisterScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const initialCode = typeof route.params?.joinCode === 'string' ? route.params.joinCode : '';

  const { signup } = useAuth();
  const { getEventByJoinCode, joinEventWithCode } = useEvents();

  const [joinCode, setJoinCode] = useState(initialCode.toUpperCase());
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const normalizedJoinCode = useMemo(() => joinCode.trim().toUpperCase(), [joinCode]);

  const eventPreview = useMemo(() => {
    if (!validateJoinCode(normalizedJoinCode)) {
      return null;
    }
    return getEventByJoinCode(normalizedJoinCode);
  }, [normalizedJoinCode, getEventByJoinCode]);

  useEffect(() => {
    if (initialCode) {
      setJoinCode(initialCode.toUpperCase());
    }
  }, [initialCode]);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedName = displayName.trim();

    console.log('[Register] Submit pressed', {
      hasCode: !!normalizedJoinCode,
      email: trimmedEmail,
      name: trimmedName,
    });

    if (!trimmedEmail) {
      setError('Please enter an email address.');
      return;
    }

    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (normalizedJoinCode && !validateJoinCode(normalizedJoinCode)) {
      setError('Join code should be six characters (letters or numbers).');
      return;
    }

    if (normalizedJoinCode && !eventPreview) {
      setError('We could not find an event with that join code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('[Register] Calling signup...');
      const userCredential = await signup({
        email: trimmedEmail,
        password,
        name: trimmedName,
      });
      console.log('[Register] Signup success', userCredential?.uid);

      if (eventPreview && normalizedJoinCode) {
        console.log('[Register] Attempting to join event', normalizedJoinCode);
        const joinedEvent = joinEventWithCode(normalizedJoinCode, userCredential.uid);
        console.log('[Register] joinEventWithCode result', joinedEvent?.id);
      }

      console.log('[Register] Awaiting auth state change – stack will update automatically');
    } catch (signupError) {
      console.error('[Register] Signup error', signupError);
      const message =
        signupError?.message ||
        'We were unable to create your account. Please double-check your details and try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Create your MeepleUp account</Text>
          <Text style={styles.subtitle}>
            Join with a code from a host or register without one to explore community events later.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Join with code (optional)</Text>
            <Input
              placeholder="Enter join code (e.g. ABC123)"
              value={joinCode}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              onChangeText={(value) => {
                setJoinCode(value.toUpperCase());
                setError('');
              }}
              style={styles.input}
            />

            {normalizedJoinCode.length === 6 && !eventPreview && (
              <Text style={styles.eventWarning}>
                We can&apos;t find an event with that code. Double-check with your host.
              </Text>
            )}

            {eventPreview && (
              <View style={styles.eventPreview}>
                <Text style={styles.eventLabel}>You&apos;re joining</Text>
                <Text style={styles.eventName}>{eventPreview.name}</Text>
                {eventPreview.generalLocation ? (
                  <Text style={styles.eventDetail}>{eventPreview.generalLocation}</Text>
                ) : null}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Create your account</Text>
            <Input
              placeholder="Name"
              value={displayName}
              onChangeText={(value) => {
                setDisplayName(value);
                setError('');
              }}
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <Input
              placeholder="Email"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setError('');
              }}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          <View style={styles.passwordField}>
            <Input
              placeholder="Password"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setError('');
              }}
              style={[styles.input, styles.passwordInput]}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable
              style={styles.passwordToggle}
              onPress={() => setShowPassword((prev) => !prev)}
              accessible
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          <View style={styles.passwordField}>
            <Input
              placeholder="Confirm password"
              value={confirmPassword}
              onChangeText={(value) => {
                setConfirmPassword(value);
                setError('');
              }}
              style={[styles.input, styles.passwordInput]}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
            />
            <Pressable
              style={styles.passwordToggle}
              onPress={() => setShowConfirmPassword((prev) => !prev)}
              accessible
              accessibilityRole="button"
              accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            >
              <Text style={styles.toggleText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={loading ? 'Creating account...' : 'Create account'}
            onPress={handleSubmit}
            disabled={loading}
            style={styles.primaryButton}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Already have an account? Once you sign in you can join or create events from the
              Onboarding screen.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 48,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  input: {
    marginBottom: 14,
  },
  eventPreview: {
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    padding: 16,
  },
  eventLabel: {
    color: '#3b51a3',
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  eventName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2a60',
  },
  eventDetail: {
    marginTop: 4,
    color: '#3b51a3',
  },
  eventWarning: {
    color: '#d9534f',
    fontSize: 13,
    marginTop: -6,
    marginBottom: 12,
  },
  error: {
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    width: '100%',
    marginTop: 4,
  },
  footer: {
    marginTop: 24,
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  passwordField: {
    position: 'relative',
    marginBottom: 14,
  },
  passwordInput: {
    paddingRight: 72,
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toggleText: {
    color: '#3b51a3',
    fontWeight: '600',
  },
});

export default RegisterScreen;

