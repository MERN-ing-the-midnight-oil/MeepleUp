import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import storage from '../utils/storage';
import firebase, { auth } from '../config/firebase';

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
    };
  }

  return {
    name: profile.name || '',
    bio: profile.bio || '',
    bggUsername: profile.bggUsername || '',
    location: profile.location || '',
    zipcode: profile.zipcode || profile.location || '', // Support both for backward compatibility
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
        const stored = await storage.getItem(PROFILE_STORAGE_KEY(cacheKey));
        cachedProfile = stored ? JSON.parse(stored) : {};
        profileCacheRef.current[cacheKey] = cachedProfile;
      }

      setUser(mapUser(firebaseUser, cachedProfile));
    } catch (error) {
      console.error('Error loading user profile:', error);
      setUser(mapUser(firebaseUser));
    }
  };

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

    await credential.user.sendEmailVerification();

    const storedProfile = await saveProfile(credential.user.uid, {
      name: name || '',
      bio: '',
      bggUsername: '',
      location: '',
      zipcode: '',
    });

    setUser(mapUser(credential.user, storedProfile));
    return credential.user;
  };

  const login = async ({ email, password }) => {
    const credential = await auth.signInWithEmailAndPassword(email.trim(), password);
    const stored = await storage.getItem(PROFILE_STORAGE_KEY(credential.user.uid));
    const profile = stored ? JSON.parse(stored) : {};
    setUser(mapUser(credential.user, profile));
    return credential.user;
  };

  const logout = async () => {
    await auth.signOut();
    setUser(null);
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }
    await auth.currentUser.sendEmailVerification();
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

    if (typeof updates.name === 'string' && updates.name.trim() !== auth.currentUser.displayName) {
      await auth.currentUser.updateProfile({ displayName: updates.name.trim() });
    }

    const savedProfile = await saveProfile(auth.currentUser.uid, nextProfile);
    await auth.currentUser.reload();
    const updatedUser = mapUser(auth.currentUser, savedProfile);
    setUser(updatedUser);
    return updatedUser;
  };

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    isEmailVerified: !!user?.emailVerified,
    signup,
    login,
    logout,
    resendVerificationEmail,
    resetPassword,
    changePassword,
    refreshUser,
    updateUser,
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};