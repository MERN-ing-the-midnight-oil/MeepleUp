import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Keyboard, TouchableWithoutFeedback, Image, Dimensions, TouchableOpacity, Animated } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '../context/AuthContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import KeyboardAwareScrollView from '../components/common/KeyboardAwareScrollView';
import { bggLogoColor } from '../components/BGGLogoAssets';

const Auth = ({ route: routeProp }) => {
  const navigation = useNavigation();
  const routeHook = useRoute();
  // Use provided route prop (for web) or hook result (for React Native)
  const route = routeProp || routeHook;
  const { login, signup, signInWithGoogle, resetPassword } = useAuth();
  const mode = route.params?.mode || 'login'; // 'login' or 'register'
  const { width: screenWidth } = Dimensions.get('window');
  const isMobile = screenWidth < 600;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
              // Navigation will happen automatically via auth state change to VerifyEmail screen
            },
          ]
        );
      } else {
        await login({ email, password });
        // Navigation will happen automatically via auth state change
      }
    } catch (err) {
      // Provide more helpful error messages
      let errorMessage = err.message || 'An error occurred. Please try again.';
      
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Try signing in instead, or use "Forgot Password" if you don\'t remember your password.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.';
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email. Please create an account first.';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = 'Incorrect password. Try again or use "Forgot Password" to reset it.';
      }
      
      setError(errorMessage);
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await signInWithGoogle();
      // Navigation will happen automatically via auth state change
    } catch (err) {
      setError(err.message || 'Failed to sign in with Google. Please try again.');
      console.error('Google sign-in error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Please enter your email address first');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await resetPassword(email.trim());
      Alert.alert(
        'Password Reset Email Sent',
        'Check your email for instructions to reset your password.',
        [{ text: 'OK' }]
      );
      setShowForgotPassword(false);
    } catch (err) {
      setError(err.message || 'Failed to send password reset email. Please try again.');
      console.error('Password reset error:', err);
    } finally {
      setLoading(false);
    }
  };


  const lastInputRef = useRef(null);
  const scrollViewRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const scrollToInput = (inputRef) => {
    // Scroll to ensure the input and submit button are visible
    // This helps when browser password manager appears
    if (scrollViewRef?.current) {
      setTimeout(() => {
        // Scroll to end to ensure submit button is visible
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAwareScrollView
        ref={scrollViewRef}
          style={styles.keyboardAvoidingView}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardVerticalOffset={0}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
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
            autoComplete="email"
            textContentType="emailAddress"
          />

          <View style={styles.passwordContainer}>
            <Input
              placeholder="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError('');
              }}
              secureTextEntry={!showPassword}
              style={styles.input}
              returnKeyType={mode === 'register' ? 'next' : 'done'}
              blurOnSubmit={mode === 'register' ? false : true}
              onSubmitEditing={mode === 'register' ? undefined : handleSubmit}
              ref={mode === 'register' ? passwordInputRef : lastInputRef}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              textContentType={mode === 'register' ? 'newPassword' : 'password'}
              onFocus={() => scrollToInput(passwordInputRef)}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={showPassword ? 'visibility' : 'visibility-off'}
                size={24}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          {mode === 'login' && !showForgotPassword && (
            <Pressable
              onPress={() => setShowForgotPassword(true)}
              style={styles.forgotPasswordContainer}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </Pressable>
          )}

          {showForgotPassword && (
            <View style={styles.forgotPasswordView}>
              <Text style={styles.forgotPasswordLabel}>
                Enter your email and we'll send you a password reset link.
              </Text>
              <View style={styles.forgotPasswordActions}>
                <Button
                  label="Send Reset Link"
                  onPress={handleForgotPassword}
                  disabled={loading || !email.trim()}
                  style={styles.forgotPasswordButton}
                />
                <Pressable
                  onPress={() => {
                    setShowForgotPassword(false);
                    setError('');
                  }}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          {mode === 'register' && (
            <View style={styles.passwordContainer}>
              <Input
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setError('');
                }}
                secureTextEntry={!showConfirmPassword}
                style={styles.input}
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={handleSubmit}
                ref={confirmPasswordInputRef}
                autoComplete="new-password"
                textContentType="newPassword"
                onFocus={() => scrollToInput(confirmPasswordInputRef)}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeIcon}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
          )}

          <Button
            label={loading ? 'Please wait...' : mode === 'register' ? 'Create Account' : 'Sign In'}
            onPress={handleSubmit}
            disabled={loading}
            style={styles.submitButton}
          />

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <Button
            label="Sign in with Google"
            onPress={handleGoogleSignIn}
            disabled={loading}
            variant="outline"
            style={styles.googleButton}
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
    backgroundColor: 'transparent', // Transparent to show parallax background
    paddingBottom: 200,
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    width: '100%',
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  googleButton: {
    width: '100%',
    marginBottom: 8,
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
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 16,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#4a90e2',
    fontWeight: '500',
  },
  forgotPasswordView: {
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  forgotPasswordLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  forgotPasswordActions: {
    gap: 8,
  },
  forgotPasswordButton: {
    width: '100%',
  },
  cancelButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#666',
  },
  passwordContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    top: 10,
    padding: 4,
    zIndex: 1,
  },
});

export default Auth;

