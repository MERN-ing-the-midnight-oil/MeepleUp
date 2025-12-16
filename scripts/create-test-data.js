#!/usr/bin/env node

/**
 * Create Test Data Script for MeepleUp
 * Creates multiple test users, has them create meepleups, join each other's events,
 * and populate their collections with board games using the "submit list" feature
 */

// Load environment variables from .env file
require('dotenv').config();

const admin = require('firebase-admin');
const axios = require('axios');
const serviceAccount = require('../firebase-service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const auth = admin.auth();

// Claude API configuration
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
// Use the same model as the app config, or try a more common model
const ANTHROPIC_DEFAULT_MODEL = process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-3-haiku-20240307';

// Helper functions
const log = (message, type = 'info') => {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    test: '🧪',
    debug: '🔍',
  }[type] || 'ℹ️';
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${prefix} ${message}`);
};

// Log flow steps
const logFlow = (step, details = '') => {
  log(`[FLOW] ${step}${details ? ` - ${details}` : ''}`, 'debug');
};

// Generate a random join code (3 words)
const generateJoinCode = () => {
  const wordList1 = [
    'lovely', 'ugly', 'strange', 'weird', 'odd', 'bright', 'dull', 'dim', 'clever', 'silly',
    'wise', 'calm', 'wild', 'gentle', 'fierce', 'kind', 'cruel', 'brave', 'timid', 'bold',
    'shy', 'proud', 'humble', 'clumsy', 'smooth', 'rough', 'sharp', 'blunt', 'clean', 'dirty',
  ];
  const wordList2 = [
    'red', 'blue', 'green', 'gold', 'golden', 'silver', 'black', 'white', 'grey', 'gray',
    'brown', 'pink', 'purple', 'yellow', 'orange', 'beige', 'tan', 'bronze', 'copper', 'amber',
  ];
  const wordList3 = [
    'robot', 'drone', 'mech', 'cyborg', 'alien', 'beast', 'dragon', 'wizard', 'witch', 'mage',
    'knight', 'dwarf', 'elf', 'orc', 'troll', 'goblin', 'ghost', 'demon', 'angel', 'titan',
  ];
  
  const word1 = wordList1[Math.floor(Math.random() * wordList1.length)];
  const word2 = wordList2[Math.floor(Math.random() * wordList2.length)];
  const word3 = wordList3[Math.floor(Math.random() * wordList3.length)];
  
  return `${word1} ${word2} ${word3}`;
};

// Test users configuration
const testUsersConfig = [
  { name: 'Alice GameMaster', email: 'alice', bio: 'Board game enthusiast and event organizer' },
  { name: 'Bob BoardGamer', email: 'bob', bio: 'Love strategy games and game nights' },
  { name: 'Charlie DiceRoller', email: 'charlie', bio: 'Casual gamer, always up for a game night' },
  { name: 'Diana CardShark', email: 'diana', bio: 'Card game specialist and social gamer' },
  { name: 'Eve TabletopFan', email: 'eve', bio: 'Miniatures and tabletop gaming fan' },
  { name: 'Frank MeepleLover', email: 'frank', bio: 'Collector and game night regular' },
];

// Meepleup configurations
const meepleupConfigs = [
  {
    name: 'Weekly Strategy Night',
    description: 'Come join us for weekly strategy board games! We play games like Terraforming Mars, Scythe, and Twilight Imperium.',
    location: { name: 'The Game Cafe', address: '123 Main St, Downtown' },
  },
  {
    name: 'Casual Game Night',
    description: 'A relaxed evening of casual board games. All skill levels welcome!',
    location: { name: 'Community Center', address: '456 Oak Ave' },
  },
  {
    name: 'Euro Games Meetup',
    description: 'Focused on European-style board games. Think Catan, Ticket to Ride, and more!',
    location: { name: 'Local Library', address: '789 Elm St' },
  },
  {
    name: 'Card Game Tournament',
    description: 'Competitive card game night. Magic, Pokemon, and more!',
    location: { name: 'Game Store', address: '321 Pine Rd' },
  },
  {
    name: 'Family Game Night',
    description: 'Family-friendly games for all ages. Perfect for introducing kids to board games!',
    location: { name: 'Recreation Center', address: '654 Maple Dr' },
  },
  {
    name: 'Heavy Games Session',
    description: 'For serious gamers. We tackle complex, long-form games that take hours to play.',
    location: { name: 'Private Residence', address: '987 Cedar Ln' },
  },
];

// Store created users and events
const createdUsers = [];
const createdEvents = [];

async function createTestUsers() {
  log('\n=== Creating Test Users ===', 'test');
  
  for (const config of testUsersConfig) {
    try {
      const timestamp = Date.now();
      const email = `test-${config.email}-${timestamp}@meepleup.test`;
      
      log(`Creating user: ${config.name} (${email})`, 'info');
      
      const user = await auth.createUser({
        email: email,
        password: 'TestPassword123!',
        displayName: config.name,
        emailVerified: true,
      });
      
      // Create user profile in Firestore
      await db.collection('users').doc(user.uid).set({
        id: user.uid,
        email: user.email,
        name: config.name,
        bio: config.bio,
        bggUsername: '',
        zipcode: '',
        avatarUrl: '',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        notificationPreferences: {
          meepleupChanges: true,
          eventReminders: true,
          eventReminderHours: 24,
          gameMarking: true,
        },
      });
      
      createdUsers.push({
        uid: user.uid,
        name: config.name,
        email: user.email,
      });
      
      log(`✓ Created user: ${config.name}`, 'success');
    } catch (error) {
      log(`✗ Failed to create user ${config.name}: ${error.message}`, 'error');
    }
  }
  
  log(`\n✓ Created ${createdUsers.length} test users`, 'success');
}

async function createMeepleups() {
  log('\n=== Creating Meepleups ===', 'test');
  
  if (createdUsers.length === 0) {
    log('No users created, skipping meepleup creation', 'warning');
    return;
  }
  
  // Each user creates 1-2 meepleups
  for (let i = 0; i < createdUsers.length; i++) {
    const user = createdUsers[i];
    const meepleupConfig = meepleupConfigs[i % meepleupConfigs.length];
    
    try {
      log(`Creating meepleup for ${user.name}: ${meepleupConfig.name}`, 'info');
      
      // Create future date (7-30 days from now)
      const daysFromNow = 7 + (i * 3); // Stagger dates
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + daysFromNow);
      eventDate.setHours(18, 0, 0, 0); // 6 PM
      
      const endDate = new Date(eventDate);
      endDate.setHours(22, 0, 0, 0); // 10 PM
      
      const joinCode = generateJoinCode();
      
      const eventData = {
        name: meepleupConfig.name,
        organizerId: user.uid,
        organizerName: user.name,
        description: meepleupConfig.description,
        location: meepleupConfig.location,
        joinCode: joinCode,
        joinCodes: [joinCode],
        privacy: 'private',
        scheduledFor: admin.firestore.Timestamp.fromDate(eventDate),
        eventDates: [
          {
            date: admin.firestore.Timestamp.fromDate(eventDate),
            startTime: admin.firestore.Timestamp.fromDate(eventDate),
            endTime: admin.firestore.Timestamp.fromDate(endDate),
            location: meepleupConfig.location.name,
            exactLocation: meepleupConfig.location.address,
            note: '',
          },
        ],
        usualStartTime: admin.firestore.Timestamp.fromDate(new Date(2000, 0, 1, 18, 0, 0)),
        usualEndTime: admin.firestore.Timestamp.fromDate(new Date(2000, 0, 1, 22, 0, 0)),
        memberIds: [user.uid],
        memberCount: 1,
        isActive: true,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        createdBy: user.uid,
        rsvpSettings: {
          enabled: true,
          allowMaybe: true,
          attendanceLimit: null,
        },
      };
      
      const eventRef = await db.collection('gamingGroups').add(eventData);
      
      // Create organizer member document
      await db.collection('gamingGroups')
        .doc(eventRef.id)
        .collection('members')
        .doc(user.uid)
        .set({
          userId: user.uid,
          userName: user.name,
          userAvatarUrl: '',
          role: 'organizer',
          joinedAt: admin.firestore.Timestamp.now(),
          rsvpStatus: null,
          rsvpStatuses: {},
        });
      
      createdEvents.push({
        id: eventRef.id,
        organizerId: user.uid,
        organizerName: user.name,
        name: meepleupConfig.name,
        joinCode: joinCode,
      });
      
      log(`✓ Created meepleup: ${meepleupConfig.name} (ID: ${eventRef.id})`, 'success');
      log(`  Join code: ${joinCode}`, 'info');
    } catch (error) {
      log(`✗ Failed to create meepleup for ${user.name}: ${error.message}`, 'error');
    }
  }
  
  log(`\n✓ Created ${createdEvents.length} meepleups`, 'success');
}

async function joinMeepleups() {
  log('\n=== Joining Meepleups ===', 'test');
  
  if (createdUsers.length === 0 || createdEvents.length === 0) {
    log('No users or events created, skipping join operations', 'warning');
    return;
  }
  
  // Create a cross-joining pattern:
  // Each user joins 2-3 other users' meepleups
  // This creates a network where everyone is connected
  
  let joinCount = 0;
  
  for (let i = 0; i < createdUsers.length; i++) {
    const user = createdUsers[i];
    
    // Each user joins events from other users (not their own)
    // Join 2-3 events per user
    const eventsToJoin = createdEvents.filter(e => e.organizerId !== user.uid);
    const numJoins = Math.min(2 + (i % 2), eventsToJoin.length); // 2-3 joins per user
    
    // Select random events to join
    const selectedEvents = eventsToJoin
      .sort(() => Math.random() - 0.5)
      .slice(0, numJoins);
    
    for (const event of selectedEvents) {
      try {
        log(`Adding ${user.name} to ${event.name}`, 'info');
        
        // Add to memberIds array
        await db.collection('gamingGroups').doc(event.id).update({
          memberIds: admin.firestore.FieldValue.arrayUnion(user.uid),
          memberCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.Timestamp.now(),
        });
        
        // Create member document
        await db.collection('gamingGroups')
          .doc(event.id)
          .collection('members')
          .doc(user.uid)
          .set({
            userId: user.uid,
            userName: user.name,
            userAvatarUrl: '',
            role: 'member',
            joinedAt: admin.firestore.Timestamp.now(),
            rsvpStatus: null,
            rsvpStatuses: {},
          }, { merge: true });
        
        joinCount++;
        log(`✓ ${user.name} joined ${event.name}`, 'success');
      } catch (error) {
        log(`✗ Failed to add ${user.name} to ${event.name}: ${error.message}`, 'error');
      }
    }
  }
  
  log(`\n✓ Created ${joinCount} memberships`, 'success');
}

async function addSomeRSVPs() {
  log('\n=== Adding Sample RSVPs ===', 'test');
  
  if (createdEvents.length === 0) {
    return;
  }
  
  // Add some RSVPs to make the data more realistic
  let rsvpCount = 0;
  
  for (const event of createdEvents) {
    // Get members for this event
    const membersSnapshot = await db.collection('gamingGroups')
      .doc(event.id)
      .collection('members')
      .get();
    
    const members = membersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // Get event dates
    const eventDoc = await db.collection('gamingGroups').doc(event.id).get();
    const eventData = eventDoc.data();
    const eventDates = eventData.eventDates || [];
    
    if (eventDates.length === 0) continue;
    
    const firstDate = eventDates[0].date.toDate().toISOString().split('T')[0];
    
    // Set RSVPs for some members (not the organizer)
    const membersToRSVP = members
      .filter(m => m.role !== 'organizer')
      .slice(0, Math.min(3, members.length - 1)); // RSVP for up to 3 members
    
    const rsvpStatuses = ['going', 'maybe', 'not-going'];
    
    for (let i = 0; i < membersToRSVP.length; i++) {
      const member = membersToRSVP[i];
      const rsvpStatus = rsvpStatuses[i % rsvpStatuses.length];
      
      try {
        await db.collection('gamingGroups')
          .doc(event.id)
          .collection('members')
          .doc(member.id)
          .update({
            rsvpStatus: rsvpStatus, // Legacy field
            rsvpStatuses: {
              [firstDate]: rsvpStatus,
            },
            rsvpUpdatedAt: admin.firestore.Timestamp.now(),
          });
        
        rsvpCount++;
        log(`✓ Set RSVP for ${member.userName || member.id}: ${rsvpStatus}`, 'success');
      } catch (error) {
        log(`✗ Failed to set RSVP for ${member.id}: ${error.message}`, 'error');
      }
    }
  }
  
  log(`\n✓ Set ${rsvpCount} RSVPs`, 'success');
}

/**
 * Format a game list using Claude API (simulating the "submit list" feature)
 */
async function formatGameListForBGG(gameListText) {
  logFlow('formatGameListForBGG', `Input: "${gameListText.substring(0, 100)}..."`);
  
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key is not configured. Set EXPO_PUBLIC_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY');
  }

  const prompt = `You are an expert on board games and BoardGameGeek (BGG). Your task is to interpret the user's input and generate a list of board game titles based on your best guess of what they're referring to.

The user may provide:
1. A direct list of game titles (one per line, comma-separated, or mixed format)
2. A descriptive query about games they own (e.g., "Pretty much all the 'Dominion' games", "I have almost all the Settlers Expansions", "All the Ticket to Ride games except the base game")

Your task is to:
1. If the input is a direct list: Extract all valid board game titles, format them properly, remove duplicates, and standardize them
2. If the input is a descriptive query: Make your best guess about which specific games the description is referring to. For example:
   - "Pretty much all the 'Dominion' games" → Likely means the main Dominion base games and major expansions (Dominion, Dominion: Intrigue, Dominion: Seaside, Dominion: Prosperity, Dominion: Hinterlands, Dominion: Dark Ages, Dominion: Guilds, Dominion: Adventures, Dominion: Empires, Dominion: Nocturne, Dominion: Renaissance, Dominion: Menagerie, Dominion: Allies, etc.)
   - "I have almost all the Settlers Expansions" → Likely means the main Catan expansions (Catan: Seafarers, Catan: Cities & Knights, Catan: Traders & Barbarians, Catan: Explorers & Pirates, etc.)
   - "All Ticket to Ride games" → Likely means the main Ticket to Ride base games and popular map expansions
   - "All Pandemic games" → Likely means the main Pandemic base games and major expansions
3. When generating lists from descriptions, make your best judgment:
   - Consider the context and wording (e.g., "almost all" vs "all", "pretty much all" vs "all")
   - Include the games that most likely match the description
   - Focus on commonly owned/well-known games in a series rather than obscure promos or micro-expansions
   - Use your knowledge of board game series and what games are typically available
4. Format each title as the full, proper game name as it would appear on BoardGameGeek
5. Remove any duplicates
6. Standardize capitalization and formatting

IMPORTANT: Make your best guess about which games the user is referring to. The user can always remove games from the staging area if they don't have them, or add more if something is missing.

Return your response as valid JSON in this exact format:
{
  "games": [
    "Game Title 1",
    "Game Title 2",
    "Game Title 3"
  ]
}

Return ONLY valid JSON, no additional commentary, no Markdown formatting.

User's input:
${gameListText.trim()}`;

  const payload = {
    model: ANTHROPIC_DEFAULT_MODEL,
    max_tokens: 4096,
    temperature: 0,
    system: 'Always produce output in strict JSON that conforms to the documented schema. Do not use Markdown code blocks. Return only the raw JSON object.',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  const headers = {
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': ANTHROPIC_VERSION,
    'content-type': 'application/json',
  };

  const endpoint = `${ANTHROPIC_BASE_URL}/v1/messages`;
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        logFlow('formatGameListForBGG', `Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms delay`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      logFlow('formatGameListForBGG', `Calling Claude API with model: ${ANTHROPIC_DEFAULT_MODEL}`);
      const response = await axios.post(endpoint, payload, { headers });
      
      logFlow('formatGameListForBGG', `API response status: ${response.status}`);
      
      // Extract text from Claude response (matching the codebase pattern)
      const contentBlocks = response.data?.content || [];
      const textBlock = contentBlocks.find((block) => block.type === 'text');
      const rawText = textBlock?.text || '';
      
      logFlow('formatGameListForBGG', `Received response (${rawText.length} chars)`);
      
      if (rawText.length === 0) {
        log(`Claude response structure: ${JSON.stringify(response.data, null, 2).substring(0, 500)}`, 'debug');
      }

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Claude returned an empty response');
      }

      // Parse JSON (handle markdown code blocks if present)
      let cleanedText = rawText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanedText);
      const games = parsed.games || [];
      
      logFlow('formatGameListForBGG', `Parsed ${games.length} games`);
      return { games, rawText };
    } catch (error) {
      lastError = error;
      
      // Log more details about the error for debugging
      if (attempt === maxRetries) {
        if (error.response?.data) {
          log(`Claude API error response: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
        }
        if (error.response?.status) {
          log(`HTTP Status: ${error.response.status}`, 'error');
        }
        if (error.response?.headers) {
          log(`Response headers: ${JSON.stringify(error.response.headers)}`, 'debug');
        }
        log(`Request payload model: ${payload.model}`, 'debug');
      }
      
      // Handle different error response formats
      let errorMessage = 'Unknown error';
      if (error.response?.data) {
        if (error.response.data.error) {
          if (typeof error.response.data.error === 'string') {
            errorMessage = error.response.data.error;
          } else if (error.response.data.error.message) {
            errorMessage = error.response.data.error.message;
          } else {
            errorMessage = JSON.stringify(error.response.data.error);
          }
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else {
          errorMessage = JSON.stringify(error.response.data);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      if (errorMessage.toLowerCase().includes('overloaded') && attempt < maxRetries) {
        log(`Claude API overloaded, retrying... (attempt ${attempt + 1}/${maxRetries})`, 'warning');
        continue;
      }
      
      if (attempt === maxRetries) {
        log(`Failed to format game list after ${maxRetries} attempts: ${errorMessage}`, 'error');
        throw new Error(errorMessage);
      }
    }
  }

  throw lastError || new Error('Failed to contact Claude after multiple attempts.');
}

/**
 * Search for a game by name (simplified - we'll use BGG API or Firestore)
 * For testing, we'll search Firestore first, then fall back to a simple match
 */
async function searchGameByName(gameTitle) {
  logFlow('searchGameByName', `Searching for: "${gameTitle}"`);
  
  try {
    // Try to find in Firestore games collection
    const gamesRef = db.collection('games');
    const query = gamesRef
      .where('name_lower', '==', gameTitle.toLowerCase())
      .limit(1);
    
    const snapshot = await query.get();
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      logFlow('searchGameByName', `Found in Firestore: ${data.name}`);
      return {
        id: data.bggId || doc.id,
        name: data.name,
        yearPublished: data.yearPublished,
        thumbnail: data.thumbnail,
        image: data.image,
      };
    }
    
    // If not found, we'll need to fetch from BGG API or create a placeholder
    // For testing purposes, we'll create a minimal game record
    logFlow('searchGameByName', `Not found in Firestore, will need BGG lookup for: "${gameTitle}"`);
    return null; // Will need to handle this in the calling code
  } catch (error) {
    log(`Error searching for game "${gameTitle}": ${error.message}`, 'error');
    return null;
  }
}

/**
 * Get game details by BGG ID (simplified version)
 */
async function getGameDetails(bggId) {
  logFlow('getGameDetails', `Fetching details for BGG ID: ${bggId}`);
  
  try {
    // Try Firestore first
    const gameDoc = await db.collection('games').where('bggId', '==', parseInt(bggId)).limit(1).get();
    
    if (!gameDoc.empty) {
      const data = gameDoc.docs[0].data();
      logFlow('getGameDetails', `Found in Firestore: ${data.name}`);
      return {
        id: bggId,
        name: data.name,
        yearPublished: data.yearPublished,
        thumbnail: data.thumbnail,
        image: data.image,
        description: data.description || '',
        minPlayers: data.minPlayers,
        maxPlayers: data.maxPlayers,
        playingTime: data.playingTime,
        bggRating: data.bggRating,
      };
    }
    
    // If not in Firestore, we'd need to fetch from BGG API
    // For now, return a minimal structure
    logFlow('getGameDetails', `Not found in Firestore for BGG ID: ${bggId}`);
    return null;
  } catch (error) {
    log(`Error getting game details for BGG ID ${bggId}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Add games to a user's collection using the "submit list" flow
 */
async function addGamesToUserCollection(userId, userName, gameListText) {
  log(`\n=== Adding Games to ${userName}'s Collection ===`, 'test');
  log(`Using game list: "${gameListText.substring(0, 100)}..."`, 'info');
  
  try {
    // Step 1: Format the game list using Claude
    logFlow('addGamesToUserCollection', 'Step 1: Formatting game list with Claude');
    const formatted = await formatGameListForBGG(gameListText);
    const gameTitles = formatted.games;
    
    log(`✓ Claude formatted list into ${gameTitles.length} games`, 'success');
    log(`Games: ${gameTitles.slice(0, 5).join(', ')}${gameTitles.length > 5 ? '...' : ''}`, 'info');
    
    if (gameTitles.length === 0) {
      log(`⚠️ No games found in list for ${userName}`, 'warning');
      return;
    }
    
    // Step 2: Search for each game and get details
    logFlow('addGamesToUserCollection', 'Step 2: Searching for games');
    const gamesToAdd = [];
    let foundCount = 0;
    let notFoundCount = 0;
    
    for (const gameTitle of gameTitles) {
      try {
        logFlow('addGamesToUserCollection', `Processing: "${gameTitle}"`);
        
        // Try to find the game in Firestore games collection
        let gameData = null;
        let foundInFirestore = false;
        
        try {
          // Search by name (case-insensitive)
          const gamesRef = db.collection('games');
          const searchTerm = gameTitle.toLowerCase().trim();
          
          // Try exact match first
          const exactQuery = gamesRef
            .where('name_lower', '==', searchTerm)
            .limit(1);
          
          const exactSnapshot = await Promise.race([
            exactQuery.get(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Query timeout')), 5000)
            ),
          ]);
          
          if (!exactSnapshot.empty) {
            const doc = exactSnapshot.docs[0];
            const data = doc.data();
            gameData = {
              title: data.name || gameTitle,
              bggId: data.bggId ? data.bggId.toString() : null,
              image: data.image || null,
              thumbnail: data.thumbnail || null,
              description: data.description || '',
              yearPublished: data.yearPublished || null,
              minPlayers: data.minPlayers || null,
              maxPlayers: data.maxPlayers || null,
              playingTime: data.playingTime || null,
              bggRating: data.bggRating || null,
              source: 'text_list',
              addedAt: admin.firestore.Timestamp.now(),
              updatedAt: admin.firestore.Timestamp.now(),
              isFavorite: false,
            };
            foundInFirestore = true;
            logFlow('addGamesToUserCollection', `Found in Firestore: ${gameTitle}`);
          }
        } catch (searchError) {
          // Firestore search failed or timed out - continue with minimal data
          logFlow('addGamesToUserCollection', `Firestore search failed for "${gameTitle}": ${searchError.message}`);
        }
        
        // If not found in Firestore, create minimal game data
        // In a real scenario, we'd search BGG API here
        if (!foundInFirestore) {
          gameData = {
            title: gameTitle,
            bggId: null, // Would be populated from BGG API search
            source: 'text_list',
            addedAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
            isFavorite: false,
          };
          logFlow('addGamesToUserCollection', `Created minimal data for: ${gameTitle} (not in Firestore)`);
          notFoundCount++;
        } else {
          foundCount++;
        }
        
        gamesToAdd.push(gameData);
      } catch (error) {
        log(`Error processing game "${gameTitle}": ${error.message}`, 'error');
        notFoundCount++;
      }
    }
    
    log(`✓ Prepared ${foundCount} games for addition${notFoundCount > 0 ? `, ${notFoundCount} not found` : ''}`, 'success');
    
    // Step 3: Add games to Firestore
    logFlow('addGamesToUserCollection', 'Step 3: Adding games to Firestore');
    const userGamesRef = db.collection('userGames').doc(userId).collection('games');
    let addedCount = 0;
    
    for (const gameData of gamesToAdd) {
      try {
        // Check if game already exists (by title)
        const existingQuery = await userGamesRef
          .where('title', '==', gameData.title)
          .limit(1)
          .get();
        
        if (!existingQuery.empty) {
          logFlow('addGamesToUserCollection', `Game already exists: ${gameData.title}`);
          continue;
        }
        
        // Add the game
        await userGamesRef.add(gameData);
        addedCount++;
        logFlow('addGamesToUserCollection', `Added: ${gameData.title}`);
      } catch (error) {
        log(`Error adding game "${gameData.title}" to collection: ${error.message}`, 'error');
      }
    }
    
    log(`✓ Added ${addedCount} games to ${userName}'s collection`, 'success');
    return addedCount;
  } catch (error) {
    log(`✗ Failed to add games to ${userName}'s collection: ${error.message}`, 'error');
    console.error('Full error:', error);
    return 0;
  }
}

/**
 * Create game collections for all test users with different request types
 */
async function createGameCollections() {
  log('\n=== Creating Game Collections ===', 'test');
  
  if (createdUsers.length === 0) {
    log('No users created, skipping game collection creation', 'warning');
    return;
  }
  
  if (!ANTHROPIC_API_KEY) {
    log('⚠️ Anthropic API key not found. Game list formatting will be skipped.', 'warning');
    log('Set EXPO_PUBLIC_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY to enable this feature.', 'info');
    return;
  }
  
  // Different types of game list requests to test
  const gameListRequests = [
    // Simple comma-separated list
    {
      userIndex: 0,
      request: 'Catan, Ticket to Ride, Pandemic, Carcassonne, Splendor',
      description: 'Simple comma-separated list',
    },
    // Line-separated list
    {
      userIndex: 1,
      request: `Wingspan
Azul
7 Wonders
Scythe
Terraforming Mars`,
      description: 'Line-separated list',
    },
    // Descriptive query - Dominion games
    {
      userIndex: 2,
      request: "Pretty much all the 'Dominion' games",
      description: 'Descriptive query for Dominion series',
    },
    // Descriptive query - Catan expansions
    {
      userIndex: 3,
      request: 'I have almost all the Settlers Expansions',
      description: 'Descriptive query for Catan expansions',
    },
    // Mixed format with descriptions
    {
      userIndex: 4,
      request: `All Ticket to Ride games
Also have: Gloomhaven, Spirit Island, Root`,
      description: 'Mixed format with series description',
    },
    // Another descriptive query
    {
      userIndex: 5,
      request: 'All Pandemic games and expansions',
      description: 'Descriptive query for Pandemic series',
    },
  ];
  
  let totalGamesAdded = 0;
  
  for (const requestConfig of gameListRequests) {
    if (requestConfig.userIndex >= createdUsers.length) {
      continue;
    }
    
    const user = createdUsers[requestConfig.userIndex];
    log(`\nTesting ${requestConfig.description} for ${user.name}`, 'info');
    
    const gamesAdded = await addGamesToUserCollection(
      user.uid,
      user.name,
      requestConfig.request
    );
    
    totalGamesAdded += gamesAdded;
    
    // Add a small delay between users to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  log(`\n✓ Total games added across all users: ${totalGamesAdded}`, 'success');
}

async function printSummary() {
  log('\n=== Summary ===', 'test');
  log(`Created ${createdUsers.length} test users:`, 'info');
  createdUsers.forEach(user => {
    log(`  - ${user.name} (${user.email})`, 'info');
  });
  
  log(`\nCreated ${createdEvents.length} meepleups:`, 'info');
  createdEvents.forEach(event => {
    log(`  - ${event.name} (Organizer: ${event.organizerName}, Join Code: ${event.joinCode})`, 'info');
  });
  
  // Count total memberships
  let totalMemberships = 0;
  for (const event of createdEvents) {
    const eventDoc = await db.collection('gamingGroups').doc(event.id).get();
    const memberIds = eventDoc.data()?.memberIds || [];
    totalMemberships += memberIds.length;
  }
  
  log(`\nTotal memberships across all events: ${totalMemberships}`, 'info');
  log(`(Each event has at least the organizer, plus cross-joined members)`, 'info');
  
  // Count total games in collections
  let totalGames = 0;
  for (const user of createdUsers) {
    try {
      const gamesSnapshot = await db.collection('userGames')
        .doc(user.uid)
        .collection('games')
        .get();
      totalGames += gamesSnapshot.size;
      if (gamesSnapshot.size > 0) {
        log(`  ${user.name}: ${gamesSnapshot.size} games`, 'info');
      }
    } catch (error) {
      log(`  Error counting games for ${user.name}: ${error.message}`, 'warning');
    }
  }
  
  log(`\nTotal games in all collections: ${totalGames}`, 'info');
}

async function main() {
  log('\n🚀 Starting Test Data Creation for MeepleUp\n', 'test');
  
  try {
    await createTestUsers();
    await createMeepleups();
    await joinMeepleups();
    await addSomeRSVPs();
    await createGameCollections(); // Add game collections using "submit list" feature
    await printSummary();
    
    log('\n✨ Test data creation complete!', 'success');
    log('\nYou can now use these test accounts to log in:', 'info');
    log('Email format: test-{name}-{timestamp}@meepleup.test', 'info');
    log('Password: TestPassword123!', 'info');
    log('\nNote: Check the console output above for specific email addresses.', 'info');
    
    if (ANTHROPIC_API_KEY) {
      log('\n✓ Game collections were created using the "submit list" feature', 'success');
      log('  Different request types were tested:', 'info');
      log('    - Simple comma-separated lists', 'info');
      log('    - Line-separated lists', 'info');
      log('    - Descriptive queries (e.g., "all Dominion games")', 'info');
      log('    - Mixed formats', 'info');
    } else {
      log('\n⚠️ Game collections were NOT created (Anthropic API key not found)', 'warning');
      log('  Set EXPO_PUBLIC_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY to enable game collection testing', 'info');
    }
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });

