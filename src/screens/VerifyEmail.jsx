import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';

const VerifyEmail = () => {
  const { user, resendVerificationEmail, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleResend = async () => {
    setLoading(true);
    setMessage('');

    try {
      await resendVerificationEmail();
      setMessage('Verification email sent! Please check your inbox.');
    } catch (error) {
      setMessage(error.message || 'Failed to send verification email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    setLoading(true);
    setMessage('');

    try {
      await refreshUser();
      if (user?.emailVerified) {
        setMessage('Email verified! You can now access all features.');
      } else {
        setMessage('Email not yet verified. Please check your inbox and click the verification link.');
      }
    } catch (error) {
      setMessage('Unable to check verification status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          We've sent a verification email to{'\n'}
          <Text style={styles.email}>{user?.email}</Text>
        </Text>
        <Text style={styles.instructions}>
          Please check your inbox and click the verification link to activate your account.
        </Text>

        {message ? (
          <View style={styles.messageContainer}>
            <Text style={styles.message}>{message}</Text>
          </View>
        ) : null}

        <Button
          label={loading ? 'Please wait...' : 'Resend Verification Email'}
          onPress={handleResend}
          disabled={loading}
          style={styles.button}
        />

        <Button
          label="I've Verified My Email"
          onPress={handleCheckVerification}
          disabled={loading}
          variant="outline"
          style={styles.button}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#d45d5d',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  email: {
    fontWeight: '600',
    color: '#333',
  },
  instructions: {
    fontSize: 14,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 20,
  },
  messageContainer: {
    backgroundColor: '#d4edda',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  message: {
    color: '#155724',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    marginBottom: 12,
  },
});

export default VerifyEmail;

