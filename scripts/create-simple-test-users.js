#!/usr/bin/env node

/**
 * Create Simple Test Users with Game Collections
 * Creates 6 users with easy login names and populates each with ~40 popular board games
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
const ANTHROPIC_DEFAULT_MODEL = process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-3-haiku-20240307';

// Helper functions
const log = (message, type = 'info') => {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
  }[type] || 'ℹ️';
  console.log(`${prefix} ${message}`);
};

// Popular board games list (~40 games)
const POPULAR_BOARD_GAMES = [
  'Catan',
  'Ticket to Ride',
  'Pandemic',
  'Carcassonne',
  'Splendor',
  'Wingspan',
  'Azul',
  '7 Wonders',
  'Scythe',
  'Terraforming Mars',
  'Gloomhaven',
  'Spirit Island',
  'Root',
  'Everdell',
  'Brass: Birmingham',
  'Great Western Trail',
  'Agricola',
  'Castles of Burgundy',
  'Concordia',
  'Power Grid',
  'Dominion',
  'Race for the Galaxy',
  'Puerto Rico',
  'Twilight Struggle',
  'Through the Ages',
  'Gaia Project',
  'Mage Knight',
  'Ark Nova',
  'Dune: Imperium',
  'Lost Ruins of Arnak',
  'The Crew: The Quest for Planet Nine',
  'Codenames',
  'The Resistance',
  'One Night Ultimate Werewolf',
  'King of Tokyo',
  'Dixit',
  'Betrayal at House on the Hill',
  'Dead of Winter',
  'Robinson Crusoe',
  'A Feast for Odin',
];

// Test users configuration
const testUsers = [
  { name: 'Alice', email: 'Alice@meepleup.com', bio: 'Board game enthusiast and event organizer' },
  { name: 'Bob', email: 'Bob@meepleup.com', bio: 'Love strategy games and game nights' },
  { name: 'Charlie', email: 'Charlie@meepleup.com', bio: 'Casual gamer, always up for a game night' },
  { name: 'Diana', email: 'Diana@meepleup.com', bio: 'Card game specialist and social gamer' },
  { name: 'Eve', email: 'Eve@meepleup.com', bio: 'Miniatures and tabletop gaming fan' },
  { name: 'Frank', email: 'Frank@meepleup.com', bio: 'Collector and game night regular' },
];

/**
 * Format a game list using Claude API
 */
async function formatGameListForBGG(gameListText) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key is not configured');
  }

  const prompt = `You are an expert on board games and BoardGameGeek (BGG). Your task is to interpret the user's input and generate a list of board game titles based on your best guess of what they're referring to.

The user may provide:
1. A direct list of game titles (one per line, comma-separated, or mixed format)
2. A descriptive query about games they own

Your task is to:
1. Extract all valid board game titles, format them properly, remove duplicates, and standardize them
2. Format each title as the full, proper game name as it would appear on BoardGameGeek
3. Remove any duplicates
4. Standardize capitalization and formatting

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
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const response = await axios.post(endpoint, payload, { headers });
      const contentBlocks = response.data?.content || [];
      const textBlock = contentBlocks.find((block) => block.type === 'text');
      const rawText = textBlock?.text || '';

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Claude returned an empty response');
      }

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
      return { games: parsed.games || [], rawText };
    } catch (error) {
      lastError = error;
      const errorMessage = error.response?.data?.error?.message || 
                          error.response?.data?.error ||
                          error.message || 
                          'Unknown error';
      
      if (errorMessage.toLowerCase().includes('overloaded') && attempt < maxRetries) {
        continue;
      }
      
      if (attempt === maxRetries) {
        throw new Error(errorMessage);
      }
    }
  }

  throw lastError || new Error('Failed to contact Claude after multiple attempts.');
}

async function createUser(userConfig) {
  try {
    log(`Creating user: ${userConfig.name} (${userConfig.email})`, 'info');
    
    const user = await auth.createUser({
      email: userConfig.email,
      password: 'asdfasdf',
      displayName: userConfig.name,
      emailVerified: true,
    });
    
    // Create user profile in Firestore
    await db.collection('users').doc(user.uid).set({
      id: user.uid,
      email: user.email,
      name: userConfig.name,
      bio: userConfig.bio,
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
    
    log(`✓ Created user: ${userConfig.name}`, 'success');
    return { uid: user.uid, name: userConfig.name, email: user.email };
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      log(`User ${userConfig.email} already exists, skipping...`, 'warning');
      // Try to get existing user
      const existingUser = await auth.getUserByEmail(userConfig.email);
      return { uid: existingUser.uid, name: userConfig.name, email: userConfig.email };
    }
    log(`✗ Failed to create user ${userConfig.name}: ${error.message}`, 'error');
    throw error;
  }
}

async function addGamesToCollection(userId, userName, gameTitles) {
  log(`\nAdding games to ${userName}'s collection...`, 'info');
  
  const userGamesRef = db.collection('userGames').doc(userId).collection('games');
  let addedCount = 0;
  let skippedCount = 0;
  
  for (const gameTitle of gameTitles) {
    try {
      // Check if game already exists
      const existingQuery = await userGamesRef
        .where('title', '==', gameTitle)
        .limit(1)
        .get();
      
      if (!existingQuery.empty) {
        skippedCount++;
        continue;
      }
      
      // Try to find game in Firestore for full details
      let gameData = {
        title: gameTitle,
        bggId: null,
        source: 'text_list',
        addedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        isFavorite: false,
      };
      
      try {
        const gamesRef = db.collection('games');
        const searchTerm = gameTitle.toLowerCase().trim();
        const exactQuery = gamesRef
          .where('name_lower', '==', searchTerm)
          .limit(1);
        
        const exactSnapshot = await Promise.race([
          exactQuery.get(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Query timeout')), 3000)
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
        }
      } catch (searchError) {
        // Continue with minimal data if search fails
      }
      
      // Add the game
      await userGamesRef.add(gameData);
      addedCount++;
    } catch (error) {
      log(`Error adding game "${gameTitle}": ${error.message}`, 'error');
    }
  }
  
  log(`✓ Added ${addedCount} games to ${userName}'s collection${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`, 'success');
  return addedCount;
}

async function main() {
  log('\n🚀 Creating Simple Test Users with Game Collections\n', 'info');
  
  if (!ANTHROPIC_API_KEY) {
    log('⚠️ Anthropic API key not found. Games will be added with minimal data.', 'warning');
  }
  
  const createdUsers = [];
  
  // Create users
  log('\n=== Creating Users ===', 'info');
  for (const userConfig of testUsers) {
    try {
      const user = await createUser(userConfig);
      createdUsers.push(user);
    } catch (error) {
      log(`Failed to create ${userConfig.name}: ${error.message}`, 'error');
    }
  }
  
  log(`\n✓ Created ${createdUsers.length} users`, 'success');
  
  // Add games to each user
  log('\n=== Adding Games to Collections ===', 'info');
  
  // Format the game list using Claude (if API key is available)
  let formattedGames = POPULAR_BOARD_GAMES;
  
  if (ANTHROPIC_API_KEY) {
    try {
      log('Formatting game list with Claude...', 'info');
      const gameListText = POPULAR_BOARD_GAMES.join(', ');
      const formatted = await formatGameListForBGG(gameListText);
      formattedGames = formatted.games.length > 0 ? formatted.games : POPULAR_BOARD_GAMES;
      log(`✓ Claude formatted list into ${formattedGames.length} games`, 'success');
    } catch (error) {
      log(`⚠️ Claude formatting failed, using original list: ${error.message}`, 'warning');
    }
  }
  
  let totalGamesAdded = 0;
  for (const user of createdUsers) {
    try {
      const count = await addGamesToCollection(user.uid, user.name, formattedGames);
      totalGamesAdded += count;
      // Small delay between users
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      log(`Failed to add games to ${user.name}: ${error.message}`, 'error');
    }
  }
  
  // Summary
  log('\n=== Summary ===', 'info');
  log(`Created ${createdUsers.length} users:`, 'info');
  createdUsers.forEach(user => {
    log(`  - ${user.name} (${user.email})`, 'info');
  });
  
  log(`\nTotal games added: ${totalGamesAdded}`, 'info');
  log(`Average games per user: ${Math.round(totalGamesAdded / createdUsers.length)}`, 'info');
  
  log('\n✨ Done!', 'success');
  log('\nLogin credentials:', 'info');
  log('Password for all users: asdfasdf', 'info');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });

