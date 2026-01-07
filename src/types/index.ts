/**
 * Type Definitions for MeepleUp
 * 
 * This file contains shared type definitions used across the application.
 * As we migrate to TypeScript, types will be added here gradually.
 */

// Game Types
export interface Game {
  id: string;
  bggId?: number;
  title: string;
  name?: string; // Alias for title (for compatibility)
  yearPublished?: number;
  minPlayers?: number;
  maxPlayers?: number;
  playingTime?: number;
  minPlayTime?: number;
  maxPlayTime?: number;
  minAge?: number;
  bggRating?: number;
  userRating?: number;
  numplays?: number;
  isFavorite?: boolean;
  thumbnail?: string;
  image?: string;
  description?: string;
  categories?: string[];
  mechanics?: string[];
  designers?: string[];
  publishers?: string[];
  artists?: string[];
  complexity?: number;
  source?: 'manual' | 'bgg';
  addedAt?: string;
  updatedAt?: string;
  alternateNames?: Array<{ type: string; value: string }>;
  bestPlayerCount?: number;
  languageDependence?: string;
  suggestedPlayerAge?: number;
  weight?: number;
  dimensions?: string;
  // Category ranks
  strategyGamesRank?: string;
  familyGamesRank?: string;
  partyGamesRank?: string;
  abstractsRank?: string;
  thematicRank?: string;
  wargamesRank?: string;
  childrensGamesRank?: string;
  cgsRank?: string;
}

// User Types
export interface User {
  uid: string;
  id?: string; // Alias for uid
  email: string;
  name: string;
  displayName?: string;
  bio?: string;
  bggUsername?: string;
  location?: string;
  zipcode?: string;
  photoURL?: string;
  avatarUrl?: string;
  emailVerified: boolean;
  notificationPreferences?: NotificationPreferences;
  personalMatchWeights?: PersonalMatchWeights;
  metadata?: {
    creationTime?: string;
    lastSignInTime?: string;
  };
}

export interface NotificationPreferences {
  meepleupChanges: boolean;
  meepleupChangesEmail: boolean;
  eventReminders: boolean;
  eventReminderHours: number;
  discussion: boolean;
  discussionEmail: boolean;
  discussionFrequency: 'all' | 'daily' | 'mentions' | 'responses';
}

export interface PersonalMatchWeights {
  publisher: number;
  mechanics: number;
  category: number;
  complexity: number;
  favorite: number;
}

// Event Types
export interface Event {
  id: string;
  name: string;
  description?: string;
  organizerId: string;
  location: string;
  address?: string;
  eventDates: EventDate[];
  scheduledFor?: string; // ISO string for backward compatibility
  usualStartTime?: string; // ISO string
  usualEndTime?: string; // ISO string
  joinCode: string;
  joinCodes?: string[];
  isActive: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  rsvpSettings?: RSVPSettings;
  memberIds?: string[];
  members?: Member[];
  visibility?: 'private' | 'public';
}

export interface EventDate {
  date: string; // ISO string
  startTime: string; // ISO string
  endTime: string; // ISO string
  location?: string;
  note?: string;
}

export interface RSVPSettings {
  enabled: boolean;
  allowMaybe: boolean;
  attendanceLimit?: number;
}

export interface Member {
  userId: string;
  role: 'organizer' | 'co-organizer' | 'member';
  rsvpStatus?: 'going' | 'maybe' | 'cant-make-it';
  rsvpStatuses?: Record<string, 'going' | 'maybe' | 'cant-make-it'>; // Date-indexed RSVPs
  canShareJoinCode?: boolean;
  userName?: string;
  userAvatarUrl?: string;
  joinedAt?: string;
}

// Availability Types
export interface AvailabilitySlot {
  day: string; // Day of week
  startTime: string; // Time string
  endTime: string; // Time string
  location?: string;
  notes?: string;
}

export interface AvailabilityProfile {
  userId: string;
  slots: AvailabilitySlot[];
  isLooking: boolean;
  preferences?: {
    defaultRadiusMiles?: number;
  };
  owner?: {
    name: string;
    avatarUrl?: string;
  };
}

// Message Types
export interface Message {
  id: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  createdAt: string;
  readAt?: string;
}

// Post/Comment Types
export interface Post {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  eventId: string;
}

export interface Comment {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  postId: string;
}

// Game Interest Types
export interface GameInterest {
  gameId: string;
  userId: string;
  rating: number; // 3 = really want, 2 = interested, 1 = maybe, -1 = rather not, 0 = no vote
  dateIndex: string;
}

// Subscription Types
export interface Subscription {
  userId: string;
  status: 'active' | 'expired' | 'cancelled';
  productId?: string;
  purchaseDate?: string;
  expiryDate?: string;
}

// API Response Types
export interface BGGSearchResult {
  id: string;
  name: string;
  yearPublished?: string;
}

export interface BGGGameDetails extends Game {
  average?: number;
  bayesAverage?: number;
  usersRated?: number;
  rank?: number;
  ownedCount?: number;
}

// Utility Types
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'NONE';

export type Platform = 'web' | 'ios' | 'android';

// Component Props Types (to be expanded)
export interface BaseComponentProps {
  style?: any;
  testID?: string;
}

