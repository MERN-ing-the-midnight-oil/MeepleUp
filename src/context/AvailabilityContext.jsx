import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import zipcodes from 'zipcodes';
import * as Location from 'expo-location';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

const AvailabilityContext = createContext();

const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DEFAULT_RADIUS_MILES = 5;

const ensureNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const padTime = (value) => {
  const str = String(value || '').trim();
  if (!str.includes(':')) {
    return str;
  }
  const [hours, minutes] = str.split(':');
  return `${hours.padStart(2, '0')}:${(minutes || '00').padStart(2, '0')}`;
};

const timeToMinutes = (time) => {
  if (!time) {
    return null;
  }
  const [hourStr, minuteStr] = time.split(':');
  const hours = Number(hourStr);
  const minutes = Number(minuteStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
};

const haversineMiles = (lat1, lon1, lat2, lon2) => {
  const R = 3958.8; // Radius of the Earth in miles
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const geocodeQuery = async (query) => {
  if (!query) {
    return null;
  }

  try {
    const results = await Location.geocodeAsync(query);
    if (!results || results.length === 0) {
      return null;
    }

    const [primary] = results;
    const latitude = typeof primary.latitude === 'number' ? primary.latitude : null;
    const longitude = typeof primary.longitude === 'number' ? primary.longitude : null;

    if (latitude === null || longitude === null) {
      return null;
    }

    const nameParts = [
      primary.name,
      primary.city,
      primary.region || primary.subregion,
      primary.isoCountryCode,
    ].filter(Boolean);

    return {
      lat: latitude,
      lng: longitude,
      label: nameParts.length > 0 ? nameParts.join(', ') : query,
      postalCode: primary.postalCode || (query.match(/^\d{5}$/) ? query : ''),
    };
  } catch (error) {
    console.warn('[Availability] geocodeAsync failed', error?.message || error);
    return null;
  }
};

const resolveLocation = async (rawLocation = {}) => {
  const query = (rawLocation.query || rawLocation.label || rawLocation.postalCode || '').trim();
  const radiusMiles = ensureNumber(rawLocation.radiusMiles, DEFAULT_RADIUS_MILES);

  let lat =
    typeof rawLocation.lat === 'number'
      ? rawLocation.lat
      : null;
  let lng =
    typeof rawLocation.lng === 'number'
      ? rawLocation.lng
      : null;

  let label = rawLocation.label || '';
  let postalCode = rawLocation.postalCode || '';

  if ((lat === null || lng === null) && query && /^\d{5}$/.test(query)) {
    const zipRecord = zipcodes.lookup(query);
    if (zipRecord) {
      lat = ensureNumber(zipRecord.latitude, null);
      lng = ensureNumber(zipRecord.longitude, null);
      label = label || `${zipRecord.city}, ${zipRecord.state}`;
      postalCode = query;
    }
  }

  if ((lat === null || lng === null) && query) {
    const geocoded = await geocodeQuery(query);
    if (geocoded) {
      lat = geocoded.lat;
      lng = geocoded.lng;
      label = label || geocoded.label;
      postalCode = postalCode || geocoded.postalCode || query;
    }
  }

  return {
    query: query || label || postalCode || '',
    label: label || query || postalCode || 'Unknown area',
    postalCode,
    radiusMiles,
    lat,
    lng,
  };
};

const normalizeSlot = (slot) => {
  if (!slot) {
    return null;
  }

  const safeDay = typeof slot.day === 'string' ? slot.day.toLowerCase() : '';
  const day = DAYS_OF_WEEK.includes(safeDay) ? safeDay : 'monday';

  const startTime = padTime(slot.startTime || '18:00');
  const endTime = padTime(slot.endTime || '21:00');

  return {
    id: slot.id || `slot_${Date.now()}`,
    day,
    startTime,
    endTime,
    notes: slot.notes || '',
    location: {
      query: slot.location?.query || slot.location?.label || slot.location?.postalCode || '',
      label: slot.location?.label || '',
      postalCode: slot.location?.postalCode || '',
      radiusMiles: ensureNumber(slot.location?.radiusMiles, DEFAULT_RADIUS_MILES),
      lat:
        typeof slot.location?.lat === 'number'
          ? slot.location.lat
          : null,
      lng:
        typeof slot.location?.lng === 'number'
          ? slot.location.lng
          : null,
    },
    createdAt: slot.createdAt || new Date().toISOString(),
    updatedAt: slot.updatedAt || new Date().toISOString(),
  };
};

const normalizeProfile = (userId, data) => {
  const slotsRaw = Array.isArray(data?.slots) ? data.slots : [];
  const slots = slotsRaw
    .map(normalizeSlot)
    .filter(Boolean);

  const preferences = {
    defaultRadiusMiles: ensureNumber(data?.preferences?.defaultRadiusMiles, DEFAULT_RADIUS_MILES),
  };

  return {
    userId,
    slots,
    owner: {
      userId,
      displayName: data?.owner?.displayName || '',
      location: data?.owner?.location || '',
      bio: data?.owner?.bio || '',
      photoURL: data?.owner?.photoURL || '',
    },
    isLooking: data?.isLooking !== undefined ? !!data.isLooking : true,
    preferences,
    updatedAt: data?.updatedAt || null,
  };
};

const slotsOverlap = (slotA, slotB) => {
  if (!slotA || !slotB) {
    return false;
  }

  if (slotA.day !== slotB.day) {
    return false;
  }

  const startA = timeToMinutes(slotA.startTime);
  const endA = timeToMinutes(slotA.endTime);
  const startB = timeToMinutes(slotB.startTime);
  const endB = timeToMinutes(slotB.endTime);

  if (
    startA === null ||
    endA === null ||
    startB === null ||
    endB === null ||
    endA <= startA ||
    endB <= startB
  ) {
    return false;
  }

  return startA < endB && startB < endA;
};

const withinMutualRadius = (slotA, slotB) => {
  if (!slotA.location || !slotB.location) {
    return false;
  }

  const radiusA = ensureNumber(slotA.location.radiusMiles, DEFAULT_RADIUS_MILES);
  const radiusB = ensureNumber(slotB.location.radiusMiles, DEFAULT_RADIUS_MILES);

  const latA = typeof slotA.location.lat === 'number' ? slotA.location.lat : null;
  const lngA = typeof slotA.location.lng === 'number' ? slotA.location.lng : null;
  const latB = typeof slotB.location.lat === 'number' ? slotB.location.lat : null;
  const lngB = typeof slotB.location.lng === 'number' ? slotB.location.lng : null;

  if (latA !== null && lngA !== null && latB !== null && lngB !== null) {
    const distance = haversineMiles(latA, lngA, latB, lngB);
    return distance <= radiusA && distance <= radiusB;
  }

  if (
    slotA.location.postalCode &&
    slotB.location.postalCode &&
    slotA.location.postalCode === slotB.location.postalCode
  ) {
    return true;
  }

  return false;
};

const computeMatches = (currentProfile, otherProfiles) => {
  if (!currentProfile || !Array.isArray(currentProfile.slots) || currentProfile.slots.length === 0) {
    return [];
  }

  const matches = [];

  currentProfile.slots.forEach((mySlot) => {
    otherProfiles.forEach((profile) => {
      if (!profile.isLooking) {
        return;
      }

      profile.slots.forEach((otherSlot) => {
        if (!slotsOverlap(mySlot, otherSlot)) {
          return;
        }

        if (!withinMutualRadius(mySlot, otherSlot)) {
          return;
        }

        const distanceMiles =
          mySlot.location.lat !== null &&
          otherSlot.location.lat !== null &&
          mySlot.location.lng !== null &&
          otherSlot.location.lng !== null
            ? haversineMiles(
                mySlot.location.lat,
                mySlot.location.lng,
                otherSlot.location.lat,
                otherSlot.location.lng,
              )
            : null;

        matches.push({
          userId: profile.userId,
          owner: profile.owner,
          mySlot,
          otherSlot,
          distanceMiles,
        });
      });
    });
  });

  const grouped = matches.reduce((acc, match) => {
    const existing = acc.get(match.userId);
    if (!existing) {
      acc.set(match.userId, {
        userId: match.userId,
        owner: match.owner,
        overlaps: [match],
      });
    } else {
      existing.overlaps.push(match);
    }
    return acc;
  }, new Map());

  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    overlaps: entry.overlaps.sort((a, b) => {
      if (a.mySlot.day !== b.mySlot.day) {
        return DAYS_OF_WEEK.indexOf(a.mySlot.day) - DAYS_OF_WEEK.indexOf(b.mySlot.day);
      }
      const timeA = timeToMinutes(a.mySlot.startTime) || 0;
      const timeB = timeToMinutes(b.mySlot.startTime) || 0;
      return timeA - timeB;
    }),
  }));
};

export const AvailabilityProvider = ({ children }) => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const colRef = collection(db, 'availabilityProfiles');
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const nextProfiles = snapshot.docs.map((docSnapshot) =>
          normalizeProfile(docSnapshot.id, docSnapshot.data()),
        );
        setProfiles(nextProfiles);
        setLoading(false);
      },
      (snapshotError) => {
        console.error('[Availability] Failed to subscribe', snapshotError);
        setError(snapshotError);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const currentProfile = useMemo(() => {
    if (!user?.uid) {
      return null;
    }
    return profiles.find((profile) => profile.userId === user.uid) || null;
  }, [profiles, user?.uid]);

  const otherProfiles = useMemo(() => {
    if (!user?.uid) {
      return profiles;
    }
    return profiles.filter((profile) => profile.userId !== user.uid);
  }, [profiles, user?.uid]);

  const matches = useMemo(
    () => computeMatches(currentProfile, otherProfiles),
    [currentProfile, otherProfiles],
  );

  const upsertProfileDoc = useCallback(
    async (transformer) => {
      if (!user?.uid) {
        throw new Error('You must be logged in to update availability.');
      }

      setSaving(true);
      setError(null);

      try {
        const docRef = doc(db, 'availabilityProfiles', user.uid);
        const existing = await getDoc(docRef);
        const currentData = existing.exists()
          ? normalizeProfile(user.uid, existing.data())
          : {
              userId: user.uid,
              slots: [],
              isLooking: true,
              owner: {
                userId: user.uid,
                displayName: user?.name || user?.displayName || user?.email?.split('@')[0] || '',
                location: user?.location || '',
                bio: user?.bio || '',
                photoURL: user?.photoURL || '',
              },
              preferences: {
                defaultRadiusMiles: DEFAULT_RADIUS_MILES,
              },
            };

        const nextData = await transformer(currentData);

        await setDoc(
          docRef,
          {
            slots: nextData.slots,
            isLooking: nextData.isLooking,
            owner: {
              userId: user.uid,
              displayName:
                user?.name ||
                user?.displayName ||
                nextData.owner?.displayName ||
                user?.email?.split('@')[0] ||
                '',
              location: user?.location || nextData.owner?.location || '',
              bio: user?.bio || nextData.owner?.bio || '',
              photoURL: user?.photoURL || nextData.owner?.photoURL || '',
            },
            preferences: {
              defaultRadiusMiles:
                ensureNumber(
                  nextData.preferences?.defaultRadiusMiles,
                  DEFAULT_RADIUS_MILES,
                ),
            },
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      } catch (updateError) {
        console.error('[Availability] Failed to update profile', updateError);
        setError(updateError);
        throw updateError;
      } finally {
        setSaving(false);
      }
    },
    [user],
  );

  const saveSlot = useCallback(
    async (slotInput) => {
      await upsertProfileDoc(async (profile) => {
        const resolvedLocation = await resolveLocation(slotInput.location);

        const normalized = normalizeSlot({
          ...slotInput,
          location: resolvedLocation,
          id: slotInput.id,
        });

        normalized.location = resolvedLocation;
        normalized.updatedAt = new Date().toISOString();
        if (!normalized.createdAt) {
          normalized.createdAt = normalized.updatedAt;
        }

        const existingIndex = profile.slots.findIndex((slot) => slot.id === normalized.id);
        let nextSlots;
        if (existingIndex === -1) {
          nextSlots = [...profile.slots, normalized];
        } else {
          const existing = profile.slots[existingIndex];
          nextSlots = [...profile.slots];
          nextSlots[existingIndex] = {
            ...existing,
            ...normalized,
            createdAt: existing.createdAt || normalized.createdAt,
            updatedAt: normalized.updatedAt,
          };
        }

        return {
          ...profile,
          slots: nextSlots,
        };
      });
    },
    [upsertProfileDoc],
  );

  const deleteSlot = useCallback(
    async (slotId) => {
      if (!slotId) {
        return;
      }
      await upsertProfileDoc(async (profile) => ({
        ...profile,
        slots: profile.slots.filter((slot) => slot.id !== slotId),
      }));
    },
    [upsertProfileDoc],
  );

  const setLookingForMatches = useCallback(
    async (isLooking) => {
      await upsertProfileDoc(async (profile) => ({
        ...profile,
        isLooking: !!isLooking,
      }));
    },
    [upsertProfileDoc],
  );

  const setDefaultRadius = useCallback(
    async (radiusMiles) => {
      await upsertProfileDoc(async (profile) => ({
        ...profile,
        preferences: {
          ...profile.preferences,
          defaultRadiusMiles: ensureNumber(radiusMiles, DEFAULT_RADIUS_MILES),
        },
      }));
    },
    [upsertProfileDoc],
  );

  const value = useMemo(
    () => ({
      loading,
      saving,
      error,
      profile: currentProfile,
      slots: currentProfile?.slots || [],
      isLooking: currentProfile?.isLooking ?? true,
      preferences: currentProfile?.preferences || {
        defaultRadiusMiles: DEFAULT_RADIUS_MILES,
      },
      matches,
      saveSlot,
      deleteSlot,
      setLookingForMatches,
      setDefaultRadius,
    }),
    [
      loading,
      saving,
      error,
      currentProfile,
      matches,
      saveSlot,
      deleteSlot,
      setLookingForMatches,
      setDefaultRadius,
    ],
  );

  return <AvailabilityContext.Provider value={value}>{children}</AvailabilityContext.Provider>;
};

export const useAvailability = () => {
  const context = useContext(AvailabilityContext);
  if (!context) {
    throw new Error('useAvailability must be used within an AvailabilityProvider');
  }
  return context;
};

export default AvailabilityContext;








