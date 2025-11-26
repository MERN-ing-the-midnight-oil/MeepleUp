import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Keyboard, TouchableWithoutFeedback, Image, Dimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import KeyboardAwareScrollView from '../components/common/KeyboardAwareScrollView';
import { bggLogoColor } from '../components/BGGLogoAssets';

const Auth = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { login, signup } = useAuth();
  const mode = route.params?.mode || 'login'; // 'login' or 'register'
  const { width: screenWidth } = Dimensions.get('window');
  const isMobile = screenWidth < 600;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');

    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) {
        setError('Please enter your name');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'register') {
        await signup({ email, password, name });
        Alert.alert(
          'Account Created',
          'Please check your email to verify your account before signing in.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Auth', { mode: 'login' }),
            },
          ]
        );
      } else {
        await login({ email, password });
        // Navigation will happen automatically via auth state change
      }
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  const lastInputRef = useRef(null);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAwareScrollView
        style={styles.keyboardAvoidingView}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardVerticalOffset={0}
      >
        <View style={styles.content}>
          <Button
            label="← Back"
            onPress={() => navigation.goBack()}
            variant="outline"
            style={styles.backButton}
          />

          <Text style={[styles.title, {
            fontSize: isMobile ? 32 : 40,
            paddingHorizontal: isMobile ? 20 : 0,
          }]}>MeepleUp.com</Text>
          <Image 
            source={bggLogoColor} 
            style={styles.bggLogo}
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>
            {mode === 'register'
              ? 'Game night made easy.'
              : 'Welcome back! Sign in to continue'}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {mode === 'register' && (
            <Input
              placeholder="Full Name"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError('');
              }}
              autoCapitalize="words"
              style={styles.input}
              returnKeyType="next"
              blurOnSubmit={false}
            />
          )}

          <Input
            placeholder="Email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError('');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            returnKeyType="next"
            blurOnSubmit={false}
          />

          <Input
            placeholder="Password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError('');
            }}
            secureTextEntry
            style={styles.input}
            returnKeyType={mode === 'register' ? 'next' : 'done'}
            blurOnSubmit={mode === 'register' ? false : true}
            onSubmitEditing={mode === 'register' ? undefined : handleSubmit}
            ref={mode === 'register' ? undefined : lastInputRef}
          />

          {mode === 'register' && (
            <Input
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError('');
              }}
              secureTextEntry
              style={styles.input}
              returnKeyType="done"
              blurOnSubmit={true}
              onSubmitEditing={handleSubmit}
              ref={lastInputRef}
            />
          )}

          <Button
            label={loading ? 'Please wait...' : mode === 'register' ? 'Create Account' : 'Sign In'}
            onPress={handleSubmit}
            disabled={loading}
            style={styles.submitButton}
          />

          <View style={styles.switchContainer}>
            <Text style={styles.switchText}>
              {mode === 'register'
                ? 'Already have an account? '
                : "Don't have an account? "}
            </Text>
            <Pressable
              onPress={() =>
                navigation.navigate('Auth', {
                  mode: mode === 'register' ? 'login' : 'register',
                })
              }
            >
              <Text style={styles.switchLink}>
                {mode === 'register' ? 'Sign In' : 'Create Account'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: 100,
  },
  content: {
    padding: 20,
    paddingVertical: 40,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontWeight: 'bold',
    color: '#d45d5d',
    marginBottom: 16,
    textAlign: 'center',
  },
  bggLogo: {
    width: 200,
    height: 60,
    alignSelf: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
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
  submitButton: {
    width: '100%',
    marginTop: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
  },
  switchText: {
    fontSize: 14,
    color: '#666',
  },
  switchLink: {
    fontSize: 14,
    color: '#4a90e2',
    fontWeight: '600',
  },
});

export default Auth;

