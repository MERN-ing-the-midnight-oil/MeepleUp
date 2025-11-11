import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
    };
  }

  return {
    name: profile.name || '',
    bio: profile.bio || '',
    bggUsername: profile.bggUsername || '',
    location: profile.location || '',
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

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(
      async (firebaseUser) => {
        try {
          if (!firebaseUser) {
            setUser(null);
            setLoading(false);
            return;
          }

          const cacheKey = firebaseUser.uid;
          let cachedProfile = profileCacheRef.current[cacheKey];

          if (!cachedProfile) {
            const stored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY(cacheKey));
            cachedProfile = stored ? JSON.parse(stored) : {};
            profileCacheRef.current[cacheKey] = cachedProfile;
          }

          setUser(mapUser(firebaseUser, cachedProfile));
        } catch (error) {
          console.error('Auth state change error:', error);
          setUser(mapUser(firebaseUser));
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error('Failed to initialize auth listener:', error);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const saveProfile = async (uid, profile) => {
    try {
      const parsedProfile = parseProfile(profile);
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY(uid), JSON.stringify(parsedProfile));
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
    });

    setUser(mapUser(credential.user, storedProfile));
    return credential.user;
  };

  const login = async ({ email, password }) => {
    const credential = await auth.signInWithEmailAndPassword(email.trim(), password);
    const stored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY(credential.user.uid));
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

    const stored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY(auth.currentUser.uid));
    const profile = stored ? JSON.parse(stored) : {};
    setUser(mapUser(auth.currentUser, profile));
  };

  const refreshUser = async () => {
    if (!auth.currentUser) {
      return null;
    }

    await auth.currentUser.reload();
    const stored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY(auth.currentUser.uid));
    const profile = stored ? JSON.parse(stored) : {};
    const mappedUser = mapUser(auth.currentUser, profile);
    setUser(mappedUser);
    return mappedUser;
  };

  const updateUser = async (updates = {}) => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }

    const currentProfileRaw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY(auth.currentUser.uid));
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