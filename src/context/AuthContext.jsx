import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import storage from '../utils/storage';
import firebase, { auth, db } from '../config/firebase';

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
        newPublicMeepleups: true,
        newPublicMeepleupsEmail: false,
        gameMarking: true,
        gameMarkingEmail: false,
        nearbyMeepleupDistance: 25, // Default 25 miles
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
      newPublicMeepleups: true,
      newPublicMeepleupsEmail: false,
      gameMarking: true,
      gameMarkingEmail: false,
      nearbyMeepleupDistance: 25,
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
                  newPublicMeepleups: true,
                  newPublicMeepleupsEmail: false,
                  gameMarking: true,
                  gameMarkingEmail: false,
                  nearbyMeepleupDistance: 25,
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
      notificationPreferences: {
        meepleupChanges: true,
        meepleupChangesEmail: false,
        newPublicMeepleups: true,
        newPublicMeepleupsEmail: false,
        gameMarking: true,
        gameMarkingEmail: false,
        nearbyMeepleupDistance: 25,
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
            newPublicMeepleups: true,
            gameMarking: true,
            nearbyMeepleupDistance: 25,
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
              newPublicMeepleups: true,
              newPublicMeepleupsEmail: false,
              gameMarking: true,
              gameMarkingEmail: false,
              nearbyMeepleupDistance: 25,
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
      newPublicMeepleups: true,
      newPublicMeepleupsEmail: false,
      gameMarking: true,
      gameMarkingEmail: false,
      nearbyMeepleupDistance: 25,
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