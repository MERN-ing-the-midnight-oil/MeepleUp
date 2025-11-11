import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';

const VerifyEmailScreen = () => {
  const { user, resendVerificationEmail, refreshUser, logout } = useAuth();
  const [status, setStatus] = useState({ message: '', error: '' });
  const [loading, setLoading] = useState(false);
  const email = user?.email;

  const handleResend = async () => {
    setLoading(true);
    setStatus({ message: '', error: '' });
    try {
      await resendVerificationEmail();
      setStatus({
        message: 'Verification email sent. Check your inbox (and spam folder).',
        error: '',
      });
    } catch (error) {
      setStatus({
        message: '',
        error: error.message || 'Unable to send verification email. Please try again later.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setStatus({ message: '', error: '' });
    try {
      const refreshed = await refreshUser();
      if (refreshed?.emailVerified) {
        setStatus({
          message: 'Great! We detected that your email is verified. Redirecting...',
          error: '',
        });
      } else {
        setStatus({
          message: '',
          error: 'Still waiting for verification. Tap resend or try again shortly.',
        });
      }
    } catch (error) {
      setStatus({
        message: '',
        error: error.message || 'Unable to refresh status right now.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We&apos;ve sent a verification link to
        </Text>
        <Text style={styles.email}>{email}</Text>
        <Text style={styles.instructions}>
          Open the email and tap the verification button. Once complete, return here and
          continue. If you don&apos;t see the email, check your spam folder or resend it below.
        </Text>

        {status.error ? (
          <View style={[styles.banner, styles.errorBanner]}>
            <Text style={styles.bannerText}>{status.error}</Text>
          </View>
        ) : null}

        {status.message ? (
          <View style={[styles.banner, styles.infoBanner]}>
            <Text style={styles.bannerText}>{status.message}</Text>
          </View>
        ) : null}

        <Button
          label={loading ? 'Please wait...' : 'I have verified my email'}
          onPress={handleRefresh}
          disabled={loading}
          style={styles.primaryButton}
        />

        <Button
          label="Resend verification email"
          onPress={handleResend}
          disabled={loading}
          variant="outline"
          style={styles.secondaryButton}
        />

        <Button
          label="Sign out"
          onPress={logout}
          variant="outline"
        />
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
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  instructions: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    marginBottom: 12,
  },
  secondaryButton: {
    marginBottom: 16,
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

export default VerifyEmailScreen;
