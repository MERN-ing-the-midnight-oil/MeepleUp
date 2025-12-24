import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import storage from '../utils/storage';
import firebase, { auth, db } from '../config/firebase';

// Helper to get the verification URL
const getVerificationUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  // For React Native or when window is not available, use authDomain
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.REACT_APP_FIREBASE_AUTH_DOMAIN;
  return authDomain ? `https://${authDomain}` : 'https://meepleup-951a1.firebaseapp.com';
};

const AuthContext = createContext();

const PROFILE_STORAGE_KEY = (uid) => `meepleup_profile_${uid}`;

const parseProfile = (profile) => {
  if (!profile) {
    return {
      name: '',
      bio: '',
      bggUsername: '',
      location: '',
      zipcode: '',
      notificationPreferences: {
        meepleupChanges: true,
        meepleupChangesEmail: false,
        eventReminders: true,
        eventReminderHours: 24, // Default: 24 hours before
        discussion: true,
        discussionEmail: false,
        discussionFrequency: 'all', // 'all', 'daily', 'mentions', 'responses'
      },
      personalMatchWeights: {
        publisher: 3,
        mechanics: 3,
        category: 2,
        complexity: 1.5,
        favorite: 2, // Multiplier for favorited games
      },
    };
  }

  return {
    name: profile.name || '',
    bio: profile.bio || '',
    bggUsername: profile.bggUsername || '',
    location: profile.location || '',
    zipcode: profile.zipcode || profile.location || '', // Support both for backward compatibility
    notificationPreferences: profile.notificationPreferences || {
      meepleupChanges: true,
      meepleupChangesEmail: false,
      eventReminders: true,
      eventReminderHours: 24,
      discussion: true,
      discussionEmail: false,
      discussionFrequency: 'all',
    },
    personalMatchWeights: profile.personalMatchWeights || {
      publisher: 3,
      mechanics: 3,
      category: 2,
      complexity: 1.5,
      favorite: 2,
    },
  };
};

const mapUser = (firebaseUser, storedProfile = {}) => {
  if (!firebaseUser) {
    return null;
  }

  const profile = parseProfile(storedProfile);

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    emailVerified: firebaseUser.emailVerified,
    name: profile.name || firebaseUser.displayName || '',
    displayName: firebaseUser.displayName || '',
    bio: profile.bio,
    bggUsername: profile.bggUsername,
    location: profile.location,
    zipcode: profile.zipcode,
    photoURL: firebaseUser.photoURL || null,
    notificationPreferences: profile.notificationPreferences,
    personalMatchWeights: profile.personalMatchWeights,
    metadata: {
      creationTime: firebaseUser.metadata?.creationTime,
      lastSignInTime: firebaseUser.metadata?.lastSignInTime,
    },
  };
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const profileCacheRef = useRef({});

  // Helper function to load user profile and set user state
  const loadUserProfile = async (firebaseUser) => {
    if (!firebaseUser) {
      setUser(null);
      return;
    }

    try {
      const cacheKey = firebaseUser.uid;
      let cachedProfile = profileCacheRef.current[cacheKey];

      if (!cachedProfile) {
        // Try to load from Firestore first
        let firestoreProfile = null;
        if (db) {
          try {
            const userDoc = await db.collection('users').doc(cacheKey).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              firestoreProfile = {
                name: userData.name || '',
                bio: userData.bio || '',
                bggUsername: userData.bggUsername || '',
                location: userData.location || '',
                zipcode: userData.zipcode || userData.location || '',
                notificationPreferences: userData.preferences?.notifications || userData.notificationPreferences || {
                  meepleupChanges: true,
                  meepleupChangesEmail: false,
                  eventReminders: true,
                  eventReminderHours: 24,
                  discussion: true,
                  discussionEmail: false,
                  discussionFrequency: 'all',
                },
                personalMatchWeights: userData.personalMatchWeights || {
                  publisher: 3,
                  mechanics: 3,
                  category: 2,
                  complexity: 1.5,
                  favorite: 2,
                },
              };
            }
          } catch (firestoreError) {
            console.error('Error loading from Firestore:', firestoreError);
          }
        }

        // Fall back to local storage if Firestore doesn't have it
        if (!firestoreProfile) {
          const stored = await storage.getItem(PROFILE_STORAGE_KEY(cacheKey));
          cachedProfile = stored ? JSON.parse(stored) : {};
        } else {
          cachedProfile = firestoreProfile;
          // Save to local storage as backup
          await storage.setItem(PROFILE_STORAGE_KEY(cacheKey), JSON.stringify(cachedProfile));
        }
        profileCacheRef.current[cacheKey] = cachedProfile;
      }

      setUser(mapUser(firebaseUser, cachedProfile));
    } catch (error) {
      console.error('Error loading user profile:', error);
      setUser(mapUser(firebaseUser));
    }
  };

  // Handle email verification callback from email link
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const handleEmailVerification = async () => {
      try {
        // Check if URL contains email verification parameters
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const actionCode = urlParams.get('oobCode');

        if (mode === 'verifyEmail' && actionCode) {
          console.log('Processing email verification callback...');
          
          // Apply the verification code (works even if user is not logged in)
          await auth.applyActionCode(actionCode);
          
          // Reload the current user to update emailVerified status if logged in
          const currentUser = auth.currentUser;
          if (currentUser) {
            await currentUser.reload();
            await loadUserProfile(currentUser);
          }
          
          // Clean up URL by removing query parameters
          window.history.replaceState({}, document.title, window.location.pathname);
          
          console.log('Email verification successful!');
        }
      } catch (error) {
        console.error('Error processing email verification:', error);
        // The error will be visible in console, and user can try resending from VerifyEmail screen
        // If user is logged in, we can try to reload to check status
        if (auth.currentUser) {
          try {
            await auth.currentUser.reload();
            await loadUserProfile(auth.currentUser);
          } catch (reloadError) {
            console.error('Error reloading user after verification failure:', reloadError);
          }
        }
      }
    };

    handleEmailVerification();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let authStateResolved = false;

    // Set up auth state listener
    // This will fire when auth state changes AND on initial load with persisted user
    // onAuthStateChanged fires immediately with the current user if one exists
    const unsubscribe = auth.onAuthStateChanged(
      async (firebaseUser) => {
        if (!isMounted) return;

        authStateResolved = true;

        try {
          if (!firebaseUser) {
            console.log('Auth state: No user');
            setUser(null);
            setLoading(false);
            return;
          }

          console.log('Auth state changed: User found', firebaseUser.email);
          await loadUserProfile(firebaseUser);
        } catch (error) {
          console.error('Auth state change error:', error);
          setUser(mapUser(firebaseUser));
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      },
      (error) => {
        console.error('Failed to initialize auth listener:', error);
        authStateResolved = true;
        if (isMounted) {
          setLoading(false);
        }
      },
    );

    // Fallback: If onAuthStateChanged doesn't fire within 2 seconds, check currentUser directly
    // This handles edge cases where the listener might not fire immediately
    const timeoutId = setTimeout(async () => {
      if (!authStateResolved && isMounted) {
        console.log('Auth state listener timeout, checking currentUser directly...');
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            console.log('Found currentUser after timeout:', currentUser.email);
            await loadUserProfile(currentUser);
          } else {
            console.log('No currentUser found after timeout');
            setUser(null);
          }
        } catch (error) {
          console.error('Error checking currentUser after timeout:', error);
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const saveProfile = async (uid, profile) => {
    try {
      const parsedProfile = parseProfile(profile);
      await storage.setItem(PROFILE_STORAGE_KEY(uid), JSON.stringify(parsedProfile));
      profileCacheRef.current[uid] = parsedProfile;
      return parsedProfile;
    } catch (error) {
      console.error('Error saving profile:', error);
      throw error;
    }
  };

  const signup = async ({ email, password, name }) => {
    const credential = await auth.createUserWithEmailAndPassword(email.trim(), password);

    if (name) {
      await credential.user.updateProfile({ displayName: name.trim() });
    }

    // Configure action code settings for email verification
    const actionCodeSettings = {
      url: getVerificationUrl(),
      handleCodeInApp: false, // Set to false to use email link directly
    };

    await credential.user.sendEmailVerification(actionCodeSettings);

    const storedProfile = await saveProfile(credential.user.uid, {
      name: name || '',
      bio: '',
      bggUsername: '',
      location: '',
      zipcode: '',
      notificationPreferences: {
        meepleupChanges: true,
        meepleupChangesEmail: false,
        eventReminders: true,
        eventReminderHours: 24,
        gameMarking: true,
        gameMarkingEmail: false,
      },
    });

    // Save to Firestore on signup
    if (db) {
      try {
        const userRef = db.collection('users').doc(credential.user.uid);
        await userRef.set({
          id: credential.user.uid,
          email: credential.user.email,
          name: name || '',
          bio: '',
          bggUsername: '',
          zipcode: '',
          avatarUrl: credential.user.photoURL || '',
          createdAt: firebase.firestore.Timestamp.now(),
          updatedAt: firebase.firestore.Timestamp.now(),
          notificationPreferences: {
            meepleupChanges: true,
            eventReminders: true,
            eventReminderHours: 24,
            gameMarking: true,
          },
        });
      } catch (error) {
        console.error('Error creating Firestore user:', error);
      }
    }

    setUser(mapUser(credential.user, storedProfile));
    return credential.user;
  };

  const login = async ({ email, password }) => {
    const credential = await auth.signInWithEmailAndPassword(email.trim(), password);
    
    // Try to load from Firestore first
    let profile = null;
    if (db) {
      try {
        const userDoc = await db.collection('users').doc(credential.user.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          profile = {
            name: userData.name || '',
            bio: userData.bio || '',
            bggUsername: userData.bggUsername || '',
            location: userData.location || '',
            zipcode: userData.zipcode || userData.location || '',
            notificationPreferences: userData.notificationPreferences || {
              meepleupChanges: true,
              meepleupChangesEmail: false,
              eventReminders: true,
              eventReminderHours: 24,
              gameMarking: true,
              gameMarkingEmail: false,
            },
          };
          // Save to local storage as backup
          await storage.setItem(PROFILE_STORAGE_KEY(credential.user.uid), JSON.stringify(profile));
        }
      } catch (firestoreError) {
        console.error('Error loading from Firestore on login:', firestoreError);
      }
    }

    // Fall back to local storage if Firestore doesn't have it
    if (!profile) {
      const stored = await storage.getItem(PROFILE_STORAGE_KEY(credential.user.uid));
      profile = stored ? JSON.parse(stored) : {};
    }
    
    setUser(mapUser(credential.user, profile));
    return credential.user;
  };

  const signInWithGoogle = async () => {
    console.log('🔵 [Google OAuth] Starting Google sign-in flow...');
    console.log('🔵 [Google OAuth] Platform:', Platform.OS);
    
    try {
      let credential;

      if (Platform.OS === 'web') {
        console.log('🔵 [Google OAuth] Using web popup method');
        // Web: Use Firebase's Google Auth Provider with popup
        const provider = new firebase.auth.GoogleAuthProvider();
        // Request additional scopes if needed
        provider.addScope('profile');
        provider.addScope('email');
        
        console.log('🔵 [Google OAuth] Opening Google sign-in popup...');
        credential = await auth.signInWithPopup(provider);
        console.log('🔵 [Google OAuth] Popup completed, credential received');
      } else {
        console.log('🔵 [Google OAuth] Using @react-native-google-signin/google-signin (native SDK)');
        // Native: Use Google's official React Native SDK
        // This handles all OAuth complexity internally and works with Firebase
        
        const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
        
        // Configure GoogleSignin with web client ID (required for Firebase)
        // iOS client ID is automatically read from GoogleService-Info.plist
        const webClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID || 
                           '177622732549-fcs381b9m3obb0jafdlcsvakg998kt8b.apps.googleusercontent.com';
        
        // iOS client ID (optional - also read from GoogleService-Info.plist automatically)
        const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID || 
                            '177622732549-7b4p8i1c5gopt58uamjlbrmlo56vtppf.apps.googleusercontent.com';
        
        console.log('🔵 [Google OAuth] Configuring GoogleSignin:');
        console.log('🔵 [Google OAuth]   Web Client ID:', webClientId);
        console.log('🔵 [Google OAuth]   iOS Client ID:', iosClientId, '(also in GoogleService-Info.plist)');
        
        GoogleSignin.configure({
          webClientId: webClientId, // Required for Firebase
          iosClientId: iosClientId, // Optional - also auto-read from GoogleService-Info.plist
          offlineAccess: true, // Get refresh token
        });
        
        console.log('🔵 [Google OAuth] GoogleSignin configured');
        
        // Check if Google Play Services is available (Android only)
        if (Platform.OS === 'android') {
          console.log('🔵 [Google OAuth] Checking Google Play Services...');
          await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
          console.log('🔵 [Google OAuth] Google Play Services available');
        }
        
        console.log('🔵 [Google OAuth] Starting native Google sign-in...');
        
        // Sign in with Google - this opens native Google sign-in UI
        const signInResult = await GoogleSignin.signIn();
        
        console.log('🔵 [Google OAuth] Sign-in result received:', {
          hasIdToken: !!signInResult.data?.idToken,
          hasUser: !!signInResult.data?.user,
        });
        
        // Get the ID token from the sign-in result
        const idToken = signInResult.data?.idToken;
        
        if (!idToken) {
          console.error('🔵 [Google OAuth] No ID token in sign-in result');
          throw new Error('No ID token received from Google sign-in');
        }
        
        console.log('🔵 [Google OAuth] ID token received, signing in with Firebase...');
        
        // Sign in with Firebase using the Google ID token
        const googleCredential = firebase.auth.GoogleAuthProvider.credential(idToken);
        credential = await auth.signInWithCredential(googleCredential);
        
        console.log('🔵 [Google OAuth] ✅ Firebase sign-in successful');
      }

      if (!credential || !credential.user) {
        console.error('🔵 [Google OAuth] No credential or user received');
        throw new Error('Failed to sign in with Google');
      }

      // Check if this is a new user or existing user
      const isNewUser = credential.additionalUserInfo?.isNewUser || false;
      console.log('🔵 [Google OAuth] User info:', {
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: credential.user.displayName,
        photoURL: credential.user.photoURL,
        isNewUser: isNewUser,
        providerId: credential.additionalUserInfo?.providerId,
      });

      // Try to load profile from Firestore
      let profile = null;
      if (db) {
        try {
          console.log('🔵 [Google OAuth] Loading user profile from Firestore...');
          const userDoc = await db.collection('users').doc(credential.user.uid).get();
          if (userDoc.exists) {
            console.log('🔵 [Google OAuth] Existing user profile found in Firestore');
            const userData = userDoc.data();
            profile = {
              name: userData.name || credential.user.displayName || '',
              bio: userData.bio || '',
              bggUsername: userData.bggUsername || '',
              location: userData.location || '',
              zipcode: userData.zipcode || userData.location || '',
              notificationPreferences: userData.notificationPreferences || {
                meepleupChanges: true,
                meepleupChangesEmail: false,
                gameMarking: true,
                gameMarkingEmail: false,
              },
            };
            // Save to local storage as backup
            await storage.setItem(PROFILE_STORAGE_KEY(credential.user.uid), JSON.stringify(profile));
            console.log('🔵 [Google OAuth] Profile loaded and saved to local storage');
          } else {
            console.log('🔵 [Google OAuth] No existing profile in Firestore');
          }
        } catch (firestoreError) {
          console.error('🔵 [Google OAuth] Error loading from Firestore:', firestoreError);
        }
      }

      // If new user, create profile in Firestore
      if (isNewUser && db) {
        try {
          console.log('🔵 [Google OAuth] 🆕 NEW USER - Creating profile in Firestore...');
          const userRef = db.collection('users').doc(credential.user.uid);
          const defaultProfile = {
            id: credential.user.uid,
            email: credential.user.email,
            name: credential.user.displayName || '',
            bio: '',
            bggUsername: '',
            zipcode: '',
            avatarUrl: credential.user.photoURL || '',
            createdAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
            notificationPreferences: {
              meepleupChanges: true,
              eventReminders: true,
              eventReminderHours: 24,
              gameMarking: true,
            },
          };
          await userRef.set(defaultProfile);
          console.log('🔵 [Google OAuth] ✅ New user profile created in Firestore');
          
          // Also save to local storage
          await saveProfile(credential.user.uid, {
            name: credential.user.displayName || '',
            bio: '',
            bggUsername: '',
            location: '',
            zipcode: '',
            notificationPreferences: defaultProfile.notificationPreferences,
          });
          console.log('🔵 [Google OAuth] Profile saved to local storage');
        } catch (error) {
          console.error('🔵 [Google OAuth] ❌ Error creating Firestore user:', error);
        }
      } else if (!isNewUser) {
        console.log('🔵 [Google OAuth] ✅ EXISTING USER - Logging in');
      }

      // Fall back to local storage if Firestore doesn't have it
      if (!profile) {
        console.log('🔵 [Google OAuth] Loading profile from local storage fallback...');
        const stored = await storage.getItem(PROFILE_STORAGE_KEY(credential.user.uid));
        profile = stored ? JSON.parse(stored) : {};
        if (stored) {
          console.log('🔵 [Google OAuth] Profile loaded from local storage');
        } else {
          console.log('🔵 [Google OAuth] No profile found in local storage either');
        }
      }

      const mappedUser = mapUser(credential.user, profile);
      setUser(mappedUser);
      console.log('🔵 [Google OAuth] ✅ Sign-in complete! User state updated:', {
        uid: mappedUser.uid,
        email: mappedUser.email,
        name: mappedUser.name,
        isNewUser: isNewUser,
      });
      return credential.user;
    } catch (error) {
      console.error('🔵 [Google OAuth] ❌ Sign-in error:', error);
      console.error('🔵 [Google OAuth] Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  };

  const signInWithApple = async () => {
    console.log('🍎 [Apple OAuth] Starting Apple sign-in flow...');
    console.log('🍎 [Apple OAuth] Platform:', Platform.OS);
    
    try {
      let credential;

      if (Platform.OS === 'web') {
        console.log('🍎 [Apple OAuth] Using web popup method');
        // Web: Use Firebase's Apple Auth Provider with popup
        const provider = new firebase.auth.OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');
        
        console.log('🍎 [Apple OAuth] Opening Apple sign-in popup...');
        credential = await auth.signInWithPopup(provider);
        console.log('🍎 [Apple OAuth] Popup completed, credential received');
      } else {
        console.log('🍎 [Apple OAuth] Using native Apple Authentication');
        // Native: Use expo-apple-authentication
        const AppleAuthenticationModule = await import('expo-apple-authentication');
        const AppleAuthentication = AppleAuthenticationModule.default || AppleAuthenticationModule;
        
        // Check if Apple Authentication is available
        console.log('🍎 [Apple OAuth] Checking if Apple Authentication is available...');
        const isAvailable = await AppleAuthentication.isAvailableAsync();
        console.log('🍎 [Apple OAuth] Apple Authentication available:', isAvailable);
        
        if (!isAvailable) {
          console.error('🍎 [Apple OAuth] ❌ Apple Sign-In not available on this device');
          throw new Error('Apple Sign-In is not available on this device');
        }

        // Request authentication
        console.log('🍎 [Apple OAuth] Requesting Apple authentication...');
        const appleCredential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        console.log('🍎 [Apple OAuth] Apple authentication response received:', {
          hasIdentityToken: !!appleCredential.identityToken,
          hasAuthorizationCode: !!appleCredential.authorizationCode,
          hasFullName: !!appleCredential.fullName,
          hasEmail: !!appleCredential.email,
        });

        if (!appleCredential.identityToken) {
          console.error('🍎 [Apple OAuth] ❌ No identity token received');
          throw new Error('Apple Sign-In failed: No identity token received');
        }

        // Create Firebase credential from Apple identity token
        console.log('🍎 [Apple OAuth] Creating Firebase credential from Apple token...');
        const appleAuthCredential = firebase.auth.AppleAuthProvider.credential(
          appleCredential.identityToken,
          appleCredential.authorizationCode
        );

        console.log('🍎 [Apple OAuth] Signing in with Firebase credential...');
        credential = await auth.signInWithCredential(appleAuthCredential);
        console.log('🍎 [Apple OAuth] Firebase sign-in successful');

        // Update user profile with name if provided (only on first sign-in)
        if (credential.additionalUserInfo?.isNewUser && appleCredential.fullName) {
          const displayName = appleCredential.fullName.givenName && appleCredential.fullName.familyName
            ? `${appleCredential.fullName.givenName} ${appleCredential.fullName.familyName}`
            : appleCredential.fullName.givenName || appleCredential.fullName.familyName || '';
          
          if (displayName) {
            console.log('🍎 [Apple OAuth] Updating user display name:', displayName);
            await credential.user.updateProfile({ displayName });
          }
        }
      }

      if (!credential || !credential.user) {
        console.error('🍎 [Apple OAuth] ❌ No credential or user received');
        throw new Error('Failed to sign in with Apple');
      }

      // Check if this is a new user or existing user
      const isNewUser = credential.additionalUserInfo?.isNewUser || false;
      console.log('🍎 [Apple OAuth] User info:', {
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: credential.user.displayName,
        photoURL: credential.user.photoURL,
        isNewUser: isNewUser,
        providerId: credential.additionalUserInfo?.providerId,
      });

      // Try to load profile from Firestore
      let profile = null;
      if (db) {
        try {
          console.log('🍎 [Apple OAuth] Loading user profile from Firestore...');
          const userDoc = await db.collection('users').doc(credential.user.uid).get();
          if (userDoc.exists) {
            console.log('🍎 [Apple OAuth] Existing user profile found in Firestore');
            const userData = userDoc.data();
            profile = {
              name: userData.name || credential.user.displayName || '',
              bio: userData.bio || '',
              bggUsername: userData.bggUsername || '',
              location: userData.location || '',
              zipcode: userData.zipcode || userData.location || '',
              notificationPreferences: userData.notificationPreferences || {
                meepleupChanges: true,
                meepleupChangesEmail: false,
                gameMarking: true,
                gameMarkingEmail: false,
              },
            };
            // Save to local storage as backup
            await storage.setItem(PROFILE_STORAGE_KEY(credential.user.uid), JSON.stringify(profile));
            console.log('🍎 [Apple OAuth] Profile loaded and saved to local storage');
          } else {
            console.log('🍎 [Apple OAuth] No existing profile in Firestore');
          }
        } catch (firestoreError) {
          console.error('🍎 [Apple OAuth] Error loading from Firestore:', firestoreError);
        }
      }

      // If new user, create profile in Firestore
      if (isNewUser && db) {
        try {
          console.log('🍎 [Apple OAuth] 🆕 NEW USER - Creating profile in Firestore...');
          const userRef = db.collection('users').doc(credential.user.uid);
          const defaultProfile = {
            id: credential.user.uid,
            email: credential.user.email,
            name: credential.user.displayName || '',
            bio: '',
            bggUsername: '',
            zipcode: '',
            avatarUrl: credential.user.photoURL || '',
            createdAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
            notificationPreferences: {
              meepleupChanges: true,
              eventReminders: true,
              eventReminderHours: 24,
              gameMarking: true,
            },
          };
          await userRef.set(defaultProfile);
          console.log('🍎 [Apple OAuth] ✅ New user profile created in Firestore');
          
          // Also save to local storage
          await saveProfile(credential.user.uid, {
            name: credential.user.displayName || '',
            bio: '',
            bggUsername: '',
            location: '',
            zipcode: '',
            notificationPreferences: defaultProfile.notificationPreferences,
          });
          console.log('🍎 [Apple OAuth] Profile saved to local storage');
        } catch (error) {
          console.error('🍎 [Apple OAuth] ❌ Error creating Firestore user:', error);
        }
      } else if (!isNewUser) {
        console.log('🍎 [Apple OAuth] ✅ EXISTING USER - Logging in');
      }

      // Fall back to local storage if Firestore doesn't have it
      if (!profile) {
        console.log('🍎 [Apple OAuth] Loading profile from local storage fallback...');
        const stored = await storage.getItem(PROFILE_STORAGE_KEY(credential.user.uid));
        profile = stored ? JSON.parse(stored) : {};
        if (stored) {
          console.log('🍎 [Apple OAuth] Profile loaded from local storage');
        } else {
          console.log('🍎 [Apple OAuth] No profile found in local storage either');
        }
      }

      const mappedUser = mapUser(credential.user, profile);
      setUser(mappedUser);
      console.log('🍎 [Apple OAuth] ✅ Sign-in complete! User state updated:', {
        uid: mappedUser.uid,
        email: mappedUser.email,
        name: mappedUser.name,
        isNewUser: isNewUser,
      });
      return credential.user;
    } catch (error) {
      console.error('🍎 [Apple OAuth] ❌ Sign-in error:', error);
      console.error('🍎 [Apple OAuth] Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  };

  const logout = async () => {
    await auth.signOut();
    setUser(null);
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }
    
    // Configure action code settings for email verification
    const actionCodeSettings = {
      url: getVerificationUrl(),
      handleCodeInApp: false, // Set to false to use email link directly
    };
    
    await auth.currentUser.sendEmailVerification(actionCodeSettings);
  };

  const resetPassword = async (email) => {
    await auth.sendPasswordResetEmail(email.trim());
  };

  const changePassword = async (currentPassword, newPassword) => {
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error('No authenticated user');
    }

    const credential = firebase.auth.EmailAuthProvider.credential(
      auth.currentUser.email,
      currentPassword,
    );

    await auth.currentUser.reauthenticateWithCredential(credential);
    await auth.currentUser.updatePassword(newPassword);
    await auth.currentUser.reload();

    const stored = await storage.getItem(PROFILE_STORAGE_KEY(auth.currentUser.uid));
    const profile = stored ? JSON.parse(stored) : {};
    setUser(mapUser(auth.currentUser, profile));
  };

  const refreshUser = async () => {
    if (!auth.currentUser) {
      return null;
    }

    await auth.currentUser.reload();
    const stored = await storage.getItem(PROFILE_STORAGE_KEY(auth.currentUser.uid));
    const profile = stored ? JSON.parse(stored) : {};
    const mappedUser = mapUser(auth.currentUser, profile);
    setUser(mappedUser);
    return mappedUser;
  };

  const updateUser = async (updates = {}) => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }

    const currentProfileRaw = await storage.getItem(PROFILE_STORAGE_KEY(auth.currentUser.uid));
    const currentProfile = currentProfileRaw ? JSON.parse(currentProfileRaw) : {};

    const nextProfile = {
      ...currentProfile,
      ...updates,
    };

    // Update Firebase Auth profile if name or photoURL changed
    const authUpdates = {};
    if (typeof updates.name === 'string' && updates.name.trim() !== auth.currentUser.displayName) {
      authUpdates.displayName = updates.name.trim();
    }
    if (typeof updates.photoURL === 'string' && updates.photoURL !== auth.currentUser.photoURL) {
      authUpdates.photoURL = updates.photoURL;
    }
    
    if (Object.keys(authUpdates).length > 0) {
      await auth.currentUser.updateProfile(authUpdates);
    }

    // Save to Firestore
    if (db) {
      try {
        const userRef = db.collection('users').doc(auth.currentUser.uid);
        const userData = {
          id: auth.currentUser.uid,
          email: auth.currentUser.email,
          name: nextProfile.name || auth.currentUser.displayName || '',
          bio: nextProfile.bio || '',
          bggUsername: nextProfile.bggUsername || '',
          zipcode: nextProfile.zipcode || '',
          avatarUrl: nextProfile.photoURL || auth.currentUser.photoURL || '',
          updatedAt: firebase.firestore.Timestamp.now(),
        };

        // Handle notification preferences separately
        if (nextProfile.notificationPreferences) {
          userData.notificationPreferences = nextProfile.notificationPreferences;
        }

        // Handle personal match weights separately
        if (nextProfile.personalMatchWeights) {
          userData.personalMatchWeights = nextProfile.personalMatchWeights;
        }

        await userRef.set(userData, { merge: true });
      } catch (firestoreError) {
        console.error('Error updating Firestore:', firestoreError);
        // Continue anyway, we still saved to local storage
      }
    }

    const savedProfile = await saveProfile(auth.currentUser.uid, nextProfile);
    await auth.currentUser.reload();
    const updatedUser = mapUser(auth.currentUser, savedProfile);
    setUser(updatedUser);
    return updatedUser;
  };

  const updateNotificationPreferences = async (preferences = {}) => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }

    const currentProfileRaw = await storage.getItem(PROFILE_STORAGE_KEY(auth.currentUser.uid));
    const currentProfile = currentProfileRaw ? JSON.parse(currentProfileRaw) : {};
    const currentPreferences = currentProfile.notificationPreferences || {
      meepleupChanges: true,
      meepleupChangesEmail: false,
      eventReminders: true,
      eventReminderHours: 24,
      discussion: true,
      discussionEmail: false,
      discussionFrequency: 'all',
    };

    const updatedPreferences = {
      ...currentPreferences,
      ...preferences,
    };

    return updateUser({ notificationPreferences: updatedPreferences });
  };

  const updateUserPhoto = async (photoURL) => {
    return updateUser({ photoURL });
  };

  const deleteAccount = async () => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }

    const userId = auth.currentUser.uid;

    // Add timeout wrapper (5 minutes max)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Account deletion timed out. Please try again or contact support.'));
      }, 5 * 60 * 1000); // 5 minutes
    });

    const deleteOperation = async () => {
      try {
        console.log('[deleteAccount] Starting account deletion for user:', userId);

      // 1. Delete all Firestore data
      if (db) {
        // Delete user profile, games, and availability in parallel
        const deletePromises = [];

        // Delete user profile document
        const userRef = db.collection('users').doc(userId);
        deletePromises.push(
          userRef.delete().catch((error) => {
            console.error('Error deleting user profile:', error);
          })
        );

        // Delete user games subcollection
        const deleteUserGames = async () => {
          const userGamesRef = db.collection('userGames').doc(userId);
          const userGamesDoc = await userGamesRef.get().catch(() => null);
          if (userGamesDoc?.exists) {
            const gamesSnapshot = await userGamesRef.collection('games').get().catch(() => null);
            if (gamesSnapshot && !gamesSnapshot.empty) {
              // Delete games in batches of 500
              const games = gamesSnapshot.docs;
              for (let i = 0; i < games.length; i += 500) {
                const batch = db.batch();
                games.slice(i, i + 500).forEach((doc) => {
                  batch.delete(doc.ref);
                });
                await batch.commit().catch((error) => {
                  console.error('Error deleting user games batch:', error);
                });
              }
            }
            await userGamesRef.delete().catch((error) => {
              console.error('Error deleting userGames document:', error);
            });
          }
        };
        deletePromises.push(deleteUserGames());

        // Delete availability profile
        const availabilityRef = db.collection('availabilityProfiles').doc(userId);
        deletePromises.push(
          availabilityRef.delete().catch((error) => {
            console.error('Error deleting availability profile:', error);
          })
        );

        await Promise.all(deletePromises);
        console.log('[deleteAccount] Deleted user profile, games, and availability');

        // Find all gaming groups where user is a member or organizer
        const [groupsByMemberQuery, groupsByOrganizerQuery] = await Promise.all([
          db
            .collection('gamingGroups')
            .where('memberIds', 'array-contains', userId)
            .get()
            .catch(() => ({ docs: [] })),
          db
            .collection('gamingGroups')
            .where('organizerId', '==', userId)
            .get()
            .catch(() => ({ docs: [] })),
        ]);

        // Combine and deduplicate groups
        const allGroupDocs = new Map();
        groupsByMemberQuery.docs.forEach((doc) => {
          allGroupDocs.set(doc.id, doc);
        });
        groupsByOrganizerQuery.docs.forEach((doc) => {
          allGroupDocs.set(doc.id, doc);
        });

        const groupDocs = Array.from(allGroupDocs.values());
        console.log(`[deleteAccount] Found ${groupDocs.length} groups to update`);

        if (groupDocs.length > 0) {
          // Process groups in smaller batches to avoid timeout
          const BATCH_SIZE = 10; // Process 10 groups at a time
          for (let i = 0; i < groupDocs.length; i += BATCH_SIZE) {
            const groupBatch = groupDocs.slice(i, i + BATCH_SIZE);
            const batch = db.batch();
            const groupsToUpdate = [];

            for (const groupDoc of groupBatch) {
              const groupData = groupDoc.data();
              const groupRef = groupDoc.ref;

              // Remove user from members subcollection
              const memberRef = groupRef.collection('members').doc(userId);
              batch.delete(memberRef);

              // Update memberIds array
              const updatedMemberIds = (groupData.memberIds || []).filter((id) => id !== userId);
              groupsToUpdate.push({
                ref: groupRef,
                data: groupData,
                updatedMemberIds,
              });
            }

            // Update all groups in this batch
            for (const { ref, data, updatedMemberIds } of groupsToUpdate) {
              const isOrganizer = data.organizerId === userId;

              if (isOrganizer) {
                // If user is organizer, archive the group
                batch.update(ref, {
                  isActive: false,
                  deletedAt: firebase.firestore.Timestamp.now(),
                  updatedAt: firebase.firestore.Timestamp.now(),
                  memberIds: updatedMemberIds,
                  memberCount: Math.max(0, (data.memberCount || 1) - 1),
                });
              } else {
                // Just remove from memberIds
                batch.update(ref, {
                  memberIds: updatedMemberIds,
                  memberCount: Math.max(0, (data.memberCount || 1) - 1),
                  updatedAt: firebase.firestore.Timestamp.now(),
                });
              }
            }

            await batch.commit().catch((error) => {
              console.error('Error updating gaming groups batch:', error);
            });
          }

          console.log('[deleteAccount] Updated all gaming groups');

          // Clean up posts, comments, and game interests in parallel for each group
          // But limit concurrency to avoid overwhelming Firestore
          const CONCURRENT_GROUPS = 3;
          for (let i = 0; i < groupDocs.length; i += CONCURRENT_GROUPS) {
            const groupBatch = groupDocs.slice(i, i + CONCURRENT_GROUPS);
            await Promise.all(
              groupBatch.map(async (groupDoc) => {
                const groupRef = groupDoc.ref;
                try {
                  // Get all posts by this user
                  const postsSnapshot = await groupRef
                    .collection('posts')
                    .where('userId', '==', userId)
                    .get()
                    .catch(() => null);

                  if (postsSnapshot && !postsSnapshot.empty) {
                    // Process posts in batches
                    const posts = postsSnapshot.docs;
                    for (let j = 0; j < posts.length; j += 500) {
                      const postsBatch = db.batch();
                      const postBatch = posts.slice(j, j + 500);
                      
                      for (const postDoc of postBatch) {
                        // Mark post as deleted
                        postsBatch.update(postDoc.ref, {
                          deleted: true,
                          content: '[Deleted]',
                          updatedAt: firebase.firestore.Timestamp.now(),
                        });
                      }
                      await postsBatch.commit().catch((error) => {
                        console.error('Error deleting posts batch:', error);
                      });
                    }
                  }

                  // Get all comments by this user (simplified - mark as deleted)
                  const allPostsSnapshot = await groupRef
                    .collection('posts')
                    .limit(100) // Limit to avoid too many queries
                    .get()
                    .catch(() => null);

                  if (allPostsSnapshot && !allPostsSnapshot.empty) {
                    const commentPromises = allPostsSnapshot.docs.map(async (postDoc) => {
                      const commentsSnapshot = await postDoc.ref
                        .collection('comments')
                        .where('userId', '==', userId)
                        .get()
                        .catch(() => null);
                      
                      if (commentsSnapshot && !commentsSnapshot.empty) {
                        const commentsBatch = db.batch();
                        commentsSnapshot.docs.forEach((commentDoc) => {
                          commentsBatch.update(commentDoc.ref, {
                            deleted: true,
                            content: '[Deleted]',
                            updatedAt: firebase.firestore.Timestamp.now(),
                          });
                        });
                        await commentsBatch.commit().catch((error) => {
                          console.error('Error deleting comments:', error);
                        });
                      }
                    });
                    await Promise.all(commentPromises);
                  }

                  // Delete game interests by this user
                  const interestsSnapshot = await groupRef
                    .collection('gameInterests')
                    .where('interestedUserId', '==', userId)
                    .get()
                    .catch(() => null);
                  
                  if (interestsSnapshot && !interestsSnapshot.empty) {
                    const interests = interestsSnapshot.docs;
                    for (let k = 0; k < interests.length; k += 500) {
                      const interestsBatch = db.batch();
                      interests.slice(k, k + 500).forEach((interestDoc) => {
                        interestsBatch.delete(interestDoc.ref);
                      });
                      await interestsBatch.commit().catch((error) => {
                        console.error('Error deleting game interests:', error);
                      });
                    }
                  }
                } catch (error) {
                  console.error(`Error cleaning up group ${groupDoc.id}:`, error);
                }
              })
            );
          }

          console.log('[deleteAccount] Cleaned up posts, comments, and interests');
        }
      }

      // 2. Clear local storage
      try {
        await storage.removeItem(PROFILE_STORAGE_KEY(userId));
        await storage.removeItem('meepleup_collections');
        await storage.removeItem('meepleup_events');
        console.log('[deleteAccount] Cleared local storage');
      } catch (error) {
        console.error('Error clearing local storage:', error);
      }

      // 3. Delete Firebase Auth user
      console.log('[deleteAccount] Deleting Firebase Auth user');
      await auth.currentUser.delete();

        // 4. Clear user state
        setUser(null);
        console.log('[deleteAccount] Account deletion complete');
      } catch (error) {
        console.error('[deleteAccount] Error deleting account:', error);
        throw error;
      }
    };

    // Race between delete operation and timeout
    return Promise.race([deleteOperation(), timeoutPromise]);
  };

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    isEmailVerified: !!user?.emailVerified,
    signup,
    login,
    signInWithGoogle,
    signInWithApple,
    logout,
    resendVerificationEmail,
    resetPassword,
    changePassword,
    refreshUser,
    updateUser,
    updateUserPhoto,
    updateNotificationPreferences,
    deleteAccount,
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};