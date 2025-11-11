import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useAuth } from '../context/AuthContext';

const MODES = {
  LOGIN: 'login',
  SIGNUP: 'signup',
  FORGOT: 'forgot',
};

const initialFormState = {
  email: '',
  password: '',
  confirmPassword: '',
  name: '',
};

const AuthScreen = () => {
  const { login, signup, resetPassword } = useAuth();
  const [mode, setMode] = useState(MODES.LOGIN);
  const [form, setForm] = useState(initialFormState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const title = useMemo(() => {
    switch (mode) {
      case MODES.SIGNUP:
        return 'Create your MeepleUp account';
      case MODES.FORGOT:
        return 'Reset your password';
      default:
        return 'Welcome back to MeepleUp';
    }
  }, [mode]);

  const subtitle = useMemo(() => {
    switch (mode) {
      case MODES.SIGNUP:
        return 'Join the community and organise unforgettable board game nights.';
      case MODES.FORGOT:
        return 'Enter your email address and we will send you a reset link.';
      default:
        return 'Sign in to plan events, manage your collection, and connect with other gamers.';
    }
  }, [mode]);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setError('');
    setMessage('');
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setForm((prev) => ({
      ...prev,
      password: '',
      confirmPassword: '',
    }));
    setError('');
    setMessage('');
  };

  const handleLogin = async () => {
    if (!form.email.trim() || !form.password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await login({ email: form.email, password: form.password });
    } catch (authError) {
      setError(authError.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!form.name.trim()) {
      setError('Please provide your name so friends recognise you.');
      return;
    }

    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }

    if (!form.password || form.password.length < 6) {
      setError('Password should be at least 6 characters long.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await signup({
        email: form.email,
        password: form.password,
        name: form.name,
      });
      setMessage('Account created! Please check your email for a verification link.');
    } catch (authError) {
      setError(authError.message || 'Unable to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!form.email.trim()) {
      setError('Enter the email address associated with your account.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(form.email);
      setMessage('Password reset email sent! Check your inbox (and spam).');
    } catch (authError) {
      setError(authError.message || 'Unable to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    switch (mode) {
      case MODES.SIGNUP:
        handleSignup();
        break;
      case MODES.FORGOT:
        handleReset();
        break;
      default:
        handleLogin();
    }
  };

  const renderFooter = () => {
    switch (mode) {
      case MODES.LOGIN:
        return (
          <View style={styles.footerActions}>
            <Button
              label="Forgot password?"
              onPress={() => switchMode(MODES.FORGOT)}
              variant="outline"
              style={styles.secondaryButton}
            />
            <Button
              label="Create account"
              onPress={() => switchMode(MODES.SIGNUP)}
              variant="outline"
            />
          </View>
        );
      case MODES.SIGNUP:
        return (
          <View style={styles.footerActions}>
            <Text style={styles.inlineText}>Already have an account?</Text>
            <Button
              label="Sign in"
              onPress={() => switchMode(MODES.LOGIN)}
              variant="outline"
            />
          </View>
        );
      case MODES.FORGOT:
        return (
          <View style={styles.footerActions}>
            <Text style={styles.inlineText}>Remembered your password?</Text>
            <Button
              label="Back to sign in"
              onPress={() => switchMode(MODES.LOGIN)}
              variant="outline"
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {error ? (
          <View style={[styles.banner, styles.errorBanner]}>
            <Text style={styles.bannerText}>{error}</Text>
          </View>
        ) : null}

        {message ? (
          <View style={[styles.banner, styles.infoBanner]}>
            <Text style={styles.bannerText}>{message}</Text>
          </View>
        ) : null}

        {mode === MODES.SIGNUP && (
          <Input
            placeholder="Name"
            value={form.name}
            onChangeText={(value) => handleChange('name', value)}
            style={styles.input}
          />
        )}

        <Input
          placeholder="Email"
          value={form.email}
          onChangeText={(value) => handleChange('email', value)}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        {mode !== MODES.FORGOT && (
          <Input
            placeholder="Password"
            value={form.password}
            onChangeText={(value) => handleChange('password', value)}
            secureTextEntry
            style={styles.input}
          />
        )}

        {mode === MODES.SIGNUP && (
          <Input
            placeholder="Confirm password"
            value={form.confirmPassword}
            onChangeText={(value) => handleChange('confirmPassword', value)}
            secureTextEntry
            style={styles.input}
          />
        )}

        <Button
          label={
            loading
              ? 'Please wait...'
              : mode === MODES.SIGNUP
              ? 'Create account'
              : mode === MODES.FORGOT
              ? 'Send reset email'
              : 'Sign in'
          }
          onPress={handleSubmit}
          disabled={loading}
          style={styles.primaryButton}
        />

        {renderFooter()}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    marginBottom: 12,
  },
  primaryButton: {
    marginTop: 8,
    marginBottom: 16,
  },
  footerActions: {
    marginTop: 8,
    alignItems: 'center',
  },
  inlineText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  secondaryButton: {
    marginBottom: 12,
  },
  banner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: '#fdecea',
  },
  infoBanner: {
    backgroundColor: '#e8f4fd',
  },
  bannerText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
});

export default AuthScreen;
