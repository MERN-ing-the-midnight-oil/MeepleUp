#!/usr/bin/env node

/**
 * Pre-populate Top 1000 Games Script
 * Fetches the top 1000 BGG-ranked games and stores them in Firestore
 * Spreads downloads over several hours to be extra respectful to BGG API
 * 
 * Rate limits:
 * - 6-8 seconds between batches (within a group)
 * - 15-20 minutes between batch groups (spreads over hours)
 * - Processes ~200 games per group, then takes a break
 * - 1000 games will take approximately 2-3 hours total
 * 
 * Usage: node scripts/pre-populate-top-games.js
 */

require('dotenv').config();

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');
const https = require('https');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';
const BATCH_SIZE = 20; // BGG API supports up to 20 games per request
const MIN_DELAY_MS = 6000; // 6 seconds minimum (slightly more than BGG's 5 second recommendation)
const MAX_DELAY_MS = 8000; // 8 seconds maximum (adds randomization to look less automated)

// Spreading over hours: Process batches in groups with longer breaks between groups
const BATCHES_PER_GROUP = 10; // Process 10 batches (200 games) before taking a longer break
const MIN_BREAK_MS = 15 * 60 * 1000; // 15 minutes minimum break between groups
const MAX_BREAK_MS = 20 * 60 * 1000; // 20 minutes maximum break (adds randomization)
// This spreads 1000 games over ~2-3 hours total

/**
 * Top 1000 BGG Game IDs
 * 
 * To get the current top 1000 game IDs:
 * 1. Visit: https://boardgamegeek.com/browse/boardgame
 * 2. Navigate through pages (50 games per page, so pages 1-20 for top 1000)
 * 3. The game IDs are in the URL when you click on each game (e.g., /boardgame/174430)
 * 4. Or use a browser extension/script to extract them from the rankings page
 * 
 * Alternatively, you can manually curate a list of popular games you know are commonly owned.
 * 
 * Example of well-known top games (update with actual current rankings):
 * - Gloomhaven: 174430
 * - Pandemic Legacy: Season 1: 161936
 * - Brass: Birmingham: 224517
 * - Terraforming Mars: 167791
 * - Twilight Imperium: 233078
 * - etc.
 * 
 * Note: You can start with fewer games (e.g., top 200) and the script will work fine.
 * It will just take proportionally less time.
 */
const TOP_1000_GAME_IDS = [
  224517, 342942, 161936, 174430, 316554, 233078, 397598, 115746, 167791, 187645,
  162886, 291457, 220308, 12333, 84876, 182028, 193738, 295770, 246900, 418059,
  28720, 338960, 173346, 169786, 167355, 177736, 266507, 421006, 124361, 312484,
  341169, 205637, 373106, 237182, 120677, 192135, 164928, 266192, 251247, 96848,
  321608, 199792, 324856, 183394, 521, 366013, 284378, 285774, 247763, 175914,
  256960, 253344, 3076, 383179, 365717, 295947, 184267, 314040, 102794, 185343,
  170216, 31260, 414317, 251661, 390092, 231733, 182874, 161533, 255984, 221107,
  126163, 205059, 2651, 240980, 216132, 371942, 244521, 266810, 35677, 125153,
  124742, 164153, 200680, 380607, 276025, 209010, 55690, 284083, 322289, 332772,
  28143, 337627, 366161, 230802, 157354, 201808, 277659, 159675, 72125, 93,
  191189, 291453, 110327, 256916, 359871, 229853, 317985, 367966, 62219, 279537,
  25613, 68448, 121921, 364073, 225694, 171623, 163068, 12, 155821, 359609,
  217372, 37111, 310873, 271055, 310100, 236457, 410201, 42, 122515, 413246,
  40834, 170042, 264220, 146021, 18602, 203993, 73439, 227935, 4098, 269385,
  172386, 36218, 163412, 102680, 43015, 218417, 12493, 396790, 144733, 175640,
  205896, 196340, 254640, 325494, 175155, 391163, 198928, 233371, 178900, 180263,
  391137, 172287, 189932, 220877, 304783, 463, 132531, 30549, 266524, 118048,
  258779, 147020, 436217, 161970, 14996, 235802, 262712, 263918, 268864, 209418,
  271324, 249259, 274364, 77423, 34635, 308765, 281259, 328871, 148949, 294484,
  127023, 146652, 265188, 82222, 296151, 2511, 233398, 244522, 283948, 103885,
  54043, 271896, 358661, 364011, 329082, 350184, 233867, 283355, 339789, 316377,
  188920, 43111, 332686, 9609, 314491, 10630, 227224, 118, 199561, 429293,
  104162, 242302, 25021, 374173, 39463, 256680, 400602, 155426, 300531, 128882,
  188, 103343, 287954, 31627, 17133, 299659, 282524, 822, 70149, 148228,
  171131, 342070, 104006, 123260, 14105, 285967, 215, 420033, 269207, 150376,
  241451, 293014, 7854, 9209, 165722, 182631, 245638, 91, 385761, 306735,
  188834, 295486, 283155, 260605, 416851, 126042, 54998, 367220, 223040, 224037,
  195421, 21050, 146886, 221194, 232832, 329839, 129437, 158600, 3, 295895,
  356080, 318977, 232405, 156129, 192291, 176189, 199478, 274637, 176494, 19857,
  351913, 224783, 169426, 555, 300322, 286096, 311193, 150145, 156546, 228341,
  198994, 323612, 194655, 9216, 284189, 297562, 270633, 109276, 367150, 421,
  20551, 31481, 128621, 400314, 244271, 356123, 230253, 284653, 140620, 27708,
  127060, 760, 298047, 277085, 204583, 305096, 223321, 2655, 206718, 291572,
  329500, 246784, 331106, 144344, 27833, 239188, 370591, 318184, 139976, 146508,
  108745, 50, 349067, 92828, 302723, 350316, 46213, 160477, 262211, 257499,
  332800, 172, 19777, 295374, 111341, 155068, 176734, 5, 66589, 385529,
  24181, 350933, 400366, 342810, 319966, 129622, 97207, 333255, 345972, 38453,
  2653, 276182, 308119, 47, 22545, 54, 260180, 209685, 184921, 155873,
  234277, 143693, 136888, 63888, 227789, 245655, 154203, 163967, 54138, 379078,
  188866, 181279, 187617, 336986, 311988, 93260, 202426, 285192, 301880, 336382,
  48726, 40692, 203420, 59294, 318084, 172081, 21241, 25292, 345584, 304420,
  172818, 246192, 193037, 247367, 219513, 39856, 354934, 77130, 176920, 274638,
  59959, 297030, 140934, 128271, 372, 45315, 40354, 13122, 351040, 70919,
  155987, 199042, 181304, 8217, 146439, 271601, 245934, 246684, 368173, 119890,
  219650, 90137, 37046, 41114, 195539, 315767, 269210, 357563, 163745, 24480,
  244711, 25554, 319910, 171, 260428, 303057, 234487, 284742, 411567, 318182,
  192458, 222509, 177478, 39683, 250458, 322708, 9217, 234, 15987, 334590,
  290484, 206480, 334986, 101721, 92415, 70323, 552, 343905, 365258, 236191,
  194594, 258210, 335764, 385610, 31594, 198773, 298069, 397385, 215311, 21348,
  128671, 256226, 286751, 33160, 316412, 293141, 1, 34219, 315610, 292375,
  265736, 138161, 166669, 328565, 367498, 144592, 151347, 352515, 356033, 386368,
  384213, 71, 262543, 381297, 182134, 318243, 379629, 325635, 229220, 150,
  355093, 156858, 338834, 186751, 66188, 170771, 100901, 367041, 17392, 251658,
  54625, 27162, 18833, 220, 154809, 55670, 353288, 204305, 62222, 11,
  161614, 192153, 420087, 40765, 124708, 503, 12942, 144189, 264241, 158899,
  36932, 216600, 342900, 175095, 436126, 121, 63628, 243, 11170, 215341,
  96913, 368305, 205398, 66362, 269144, 239942, 256952, 359438, 290359, 176396,
  79828, 256730, 417197, 283393, 194607, 478, 43570, 270844, 307002, 15062,
  353545, 169427, 290236, 180974, 383607, 20437, 274960, 98778, 242705, 5404,
  233312, 293296, 226522, 295564, 137408, 25417, 136063, 193042, 162082, 157969,
  240196, 150658, 21790, 266830, 83330, 340466, 6249, 13, 17226, 191862,
  348450, 105134, 712, 318009, 245654, 232414, 156009, 197376, 117959, 284435,
  144797, 9674, 142379, 336794, 177639, 146791, 31999, 62227, 84419, 408180,
  252328, 218074, 196326, 97786, 128996, 153938, 280794, 245961, 91312, 28023,
  18, 262215, 31730, 181530, 133473, 17405, 171668, 125618, 119506, 170561,
  387866, 15985, 183251, 90419, 97842, 296237, 163968, 172308, 170624, 2346,
  248490, 221965, 127398, 206941, 147949, 264055, 346965, 27173, 432, 133848,
  65781, 102652, 4390, 284777, 307305, 404431, 22827, 15363, 328866, 475,
  265402, 95527, 213460, 105551, 34119, 256999, 151022, 362944, 304051, 232043,
  27746, 281655, 237179, 36553, 193949, 216734, 699, 133038, 341945, 371433,
  42215, 446497, 130960, 266121, 131357, 346501, 42052, 434654, 58421, 159508,
  46, 875, 128780, 347703, 269511, 244115, 337765, 5782, 111799, 291845,
  369880, 192836, 298383, 141572, 345868, 190082, 39351, 9625, 224710, 270673,
  363247, 23540, 329551, 422732, 244114, 153016, 123123, 140603, 354570, 30869,
  370913, 286063, 135779, 415776, 355483, 113924, 6472, 2398, 39938, 328479,
  37904, 160010, 13004, 135219, 10547, 143519, 155703, 258036, 42776, 306040,
  334065, 273330, 262941, 41, 107529, 24508, 171499, 3685, 1353, 169255,
  326494, 209778, 233247, 174785, 100423, 283864, 406652, 3201, 271518, 347305,
  300300, 306881, 361545, 205359, 204472, 212445, 180593, 218603, 21763, 298231,
  163839, 403441, 300905, 163166, 266164, 296912, 121408, 202670, 338957, 132018,
  270239, 346703, 368061, 279613, 69789, 316624, 283863, 193558, 381248, 1513,
  284760, 2955, 242639, 113294, 301255, 88, 198953, 249381, 254708, 180511,
  231581, 220517, 183840, 148729, 119432, 123540, 58281, 30380, 331787, 71721,
  167400, 50750, 399941, 318560, 183562, 156336, 7717, 29603, 213893, 257501,
  168584, 214880, 70512, 270970, 126792, 20100, 238799, 203416, 280480, 241590,
  244608, 154825, 146278, 281442, 45, 143741, 363307, 165401, 256788, 380619,
  483, 121288, 1465, 299684, 134726, 232219, 20963, 158435, 299169, 267609,
  316546, 11825, 143515, 73761, 255692, 242574, 168435, 2453, 223770, 162007,
  87890, 15512, 40628, 65532, 226320, 241724, 72321, 218333, 150997, 244331,
  21882, 155624, 181521, 244228, 264052, 276498, 51, 382843, 173064, 351817,
  16747, 15364, 253499, 160495, 300877, 73171, 314503, 22345, 9823, 169654,
  214887, 68425, 8125, 214029, 181687, 204516, 251678, 220520, 31563, 256382,
  313889, 372559, 116998, 47185, 299047, 200147, 3307, 394106, 198740, 358320,
  256570, 294612, 218121, 201825, 254386, 156943, 161417, 393672, 198830, 239472,
  249277, 231218, 203417, 179172, 43528, 285984, 171273, 194879, 338760, 55600,
  387780, 359970, 2163, 393325, 277700, 173442, 272739, 162286, 217780, 234477,
  367518, 175117, 170416, 303731, 131287, 227460, 30645, 352418, 342444, 56692,
  332290, 160499, 176165, 192457, 271319, 275467, 218479, 267319, 122298, 131260,
  281549, 270314, 407297, 329845, 12002, 197443, 1035, 179275, 297129, 317457,
  219215, 137988, 230244, 91872, 196526, 2093, 228867, 36235, 284818
];

/**
 * Get BGG Bearer token from environment
 */
function getBGGToken() {
  return process.env.BGGbearerToken || 
         process.env.EXPO_PUBLIC_BGGbearerToken ||
         process.env.EXPO_PUBLIC_BGG_API_TOKEN ||
         process.env.REACT_APP_BGG_API_TOKEN ||
         null;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get random delay between MIN and MAX (for batch delays)
 */
function getRandomDelay() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

/**
 * Get random break delay between MIN_BREAK and MAX_BREAK (for group breaks)
 */
function getRandomBreakDelay() {
  return MIN_BREAK_MS + Math.floor(Math.random() * (MAX_BREAK_MS - MIN_BREAK_MS));
}

/**
 * Fetch game details from BGG API (batch)
 */
async function fetchBGGGameDetailsBatch(gameIds) {
  return new Promise((resolve, reject) => {
    const token = getBGGToken();
    const gameIdsStr = gameIds.join(',');
    const url = `${BGG_API_BASE}/thing?id=${gameIdsStr}&stats=1`;
    
    const options = {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    };
    
    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 429) {
          // Rate limited - return error so caller can retry
          reject(new Error('RATE_LIMITED'));
          return;
        }
        
        if (res.statusCode !== 200) {
          // Try without auth if 401
          if (res.statusCode === 401 && token) {
            https.get(`${url}&token=${token}`, (res2) => {
              let data2 = '';
              res2.on('data', (chunk) => data2 += chunk);
              res2.on('end', () => {
                if (res2.statusCode === 200) {
                  resolve(parseBGGXMLBatch(data2));
                } else {
                  // Try without auth
                  https.get(url, (res3) => {
                    let data3 = '';
                    res3.on('data', (chunk) => data3 += chunk);
                    res3.on('end', () => {
                      resolve(res3.statusCode === 200 ? parseBGGXMLBatch(data3) : []);
                    });
                  }).on('error', reject);
                }
              });
            }).on('error', reject);
            return;
          }
          reject(new Error(`BGG API returned status ${res.statusCode}`));
          return;
        }
        
        try {
          const gameData = parseBGGXMLBatch(data);
          resolve(gameData);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse BGG XML response for batch of games
 */
function parseBGGXMLBatch(xmlText) {
  const games = [];
  
  // Match all <item> tags
  const itemRegex = /<item[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
  let itemMatch;
  
  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const gameXml = itemMatch[2];
    const gameId = parseInt(itemMatch[1], 10);
    
    const game = parseGameXML(gameXml, gameId);
    if (game) {
      games.push(game);
    }
  }
  
  return games;
}

/**
 * Parse a single game's XML data
 */
function parseGameXML(xmlText, gameId) {
  try {
    // Extract name (primary name preferred)
    const primaryNameMatch = xmlText.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
    const nameMatch = xmlText.match(/<name[^>]*value="([^"]+)"/);
    const name = primaryNameMatch ? primaryNameMatch[1] : (nameMatch ? nameMatch[1] : null);
    
    if (!name) return null;
    
    // Extract thumbnail and image
    const thumbnailMatch = xmlText.match(/<thumbnail>([^<]+)<\/thumbnail>/);
    const thumbnail = thumbnailMatch ? thumbnailMatch[1].trim() : null;
    
    const imageMatch = xmlText.match(/<image>([^<]+)<\/image>/);
    const image = imageMatch ? imageMatch[1].trim() : null;
    
    // Extract year published
    const yearMatch = xmlText.match(/<yearpublished[^>]*value="(\d+)"/);
    const yearPublished = yearMatch ? parseInt(yearMatch[1], 10) : null;
    
    // Extract description
    const descMatch = xmlText.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? descMatch[1].trim().replace(/<[^>]*>/g, '') : null;
    
    // Extract statistics
    const averageMatch = xmlText.match(/<average[^>]*value="([^"]+)"/);
    const average = averageMatch ? parseFloat(averageMatch[1]) : null;
    
    const bayesAverageMatch = xmlText.match(/<bayesaverage[^>]*value="([^"]+)"/);
    const bayesAverage = bayesAverageMatch ? parseFloat(bayesAverageMatch[1]) : null;
    
    const usersRatedMatch = xmlText.match(/<usersrated[^>]*value="(\d+)"/);
    const usersRated = usersRatedMatch ? parseInt(usersRatedMatch[1], 10) : null;
    
    // Extract rank
    const rankMatch = xmlText.match(/<rank[^>]*type="subtype"[^>]*id="1"[^>]*value="(\d+)"/);
    const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;
    
    // Extract category ranks
    const strategyRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="1"[^>]*value="(\d+)"/);
    const strategyGamesRank = strategyRankMatch ? strategyRankMatch[1] : '';
    
    const familyRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="2"[^>]*value="(\d+)"/);
    const familyGamesRank = familyRankMatch ? familyRankMatch[1] : '';
    
    const partyRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="3"[^>]*value="(\d+)"/);
    const partyGamesRank = partyRankMatch ? partyRankMatch[1] : '';
    
    const abstractRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="4"[^>]*value="(\d+)"/);
    const abstractsRank = abstractRankMatch ? abstractRankMatch[1] : '';
    
    const thematicRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="5"[^>]*value="(\d+)"/);
    const thematicRank = thematicRankMatch ? thematicRankMatch[1] : '';
    
    const wargamesRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="6"[^>]*value="(\d+)"/);
    const wargamesRank = wargamesRankMatch ? wargamesRankMatch[1] : '';
    
    const childrensRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="7"[^>]*value="(\d+)"/);
    const childrensGamesRank = childrensRankMatch ? childrensRankMatch[1] : '';
    
    const cgsRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="8"[^>]*value="(\d+)"/);
    const cgsRank = cgsRankMatch ? cgsRankMatch[1] : '';
    
    // Extract min/max players
    const minPlayersMatch = xmlText.match(/<minplayers[^>]*value="(\d+)"/);
    const minPlayers = minPlayersMatch ? parseInt(minPlayersMatch[1], 10) : null;
    
    const maxPlayersMatch = xmlText.match(/<maxplayers[^>]*value="(\d+)"/);
    const maxPlayers = maxPlayersMatch ? parseInt(maxPlayersMatch[1], 10) : null;
    
    // Extract playing time
    const playingTimeMatch = xmlText.match(/<playingtime[^>]*value="(\d+)"/);
    const playingTime = playingTimeMatch ? parseInt(playingTimeMatch[1], 10) : null;
    
    const minPlayTimeMatch = xmlText.match(/<minplaytime[^>]*value="(\d+)"/);
    const minPlayTime = minPlayTimeMatch ? parseInt(minPlayTimeMatch[1], 10) : null;
    
    const maxPlayTimeMatch = xmlText.match(/<maxplaytime[^>]*value="(\d+)"/);
    const maxPlayTime = maxPlayTimeMatch ? parseInt(maxPlayTimeMatch[1], 10) : null;
    
    // Extract min age
    const minAgeMatch = xmlText.match(/<minage[^>]*value="(\d+)"/);
    const minAge = minAgeMatch ? parseInt(minAgeMatch[1], 10) : null;
    
    // Extract mechanics
    const mechanics = [];
    const mechanicRegex = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]+)"/g;
    let mechanicMatch;
    while ((mechanicMatch = mechanicRegex.exec(xmlText)) !== null) {
      mechanics.push(mechanicMatch[1]);
    }
    
    // Extract categories
    const categories = [];
    const categoryRegex = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]+)"/g;
    let categoryMatch;
    while ((categoryMatch = categoryRegex.exec(xmlText)) !== null) {
      categories.push(categoryMatch[1]);
    }
    
    // Extract designers
    const designers = [];
    const designerRegex = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]+)"/g;
    let designerMatch;
    while ((designerMatch = designerRegex.exec(xmlText)) !== null) {
      designers.push(designerMatch[1]);
    }
    
    // Extract publishers
    const publishers = [];
    const publisherRegex = /<link[^>]*type="boardgamepublisher"[^>]*value="([^"]+)"/g;
    let publisherMatch;
    while ((publisherMatch = publisherRegex.exec(xmlText)) !== null) {
      publishers.push(publisherMatch[1]);
    }
    
    // Extract artists
    const artists = [];
    const artistRegex = /<link[^>]*type="boardgameartist"[^>]*value="([^"]+)"/g;
    let artistMatch;
    while ((artistMatch = artistRegex.exec(xmlText)) !== null) {
      artists.push(artistMatch[1]);
    }
    
    // Extract complexity/weight
    const complexityMatch = xmlText.match(/<averageweight[^>]*value="([^"]+)"/);
    const complexity = complexityMatch ? parseFloat(complexityMatch[1]) : null;
    
    // Extract owned count
    const ownedMatch = xmlText.match(/<owned[^>]*value="(\d+)"/);
    const ownedCount = ownedMatch ? parseInt(ownedMatch[1], 10) : null;
    
    return {
      id: gameId.toString(),
      name,
      yearPublished,
      thumbnail,
      image,
      description,
      average,
      bayesAverage,
      usersRated,
      rank,
      minPlayers,
      maxPlayers,
      playingTime,
      minPlayTime,
      maxPlayTime,
      minAge,
      strategyGamesRank,
      familyGamesRank,
      partyGamesRank,
      abstractsRank,
      thematicRank,
      wargamesRank,
      childrensGamesRank,
      cgsRank,
      mechanics: mechanics.length > 0 ? mechanics : null,
      categories: categories.length > 0 ? categories : null,
      designers: designers.length > 0 ? designers : null,
      publishers: publishers.length > 0 ? publishers : null,
      artists: artists.length > 0 ? artists : null,
      complexity,
      averageWeight: complexity,
      ownedCount,
    };
  } catch (error) {
    console.error(`[Parse Error] Error parsing game ${gameId}:`, error);
    return null;
  }
}

/**
 * Check if game exists in Firestore
 */
async function gameExistsInFirestore(gameId) {
  try {
    const gameRef = db.collection('games').doc(gameId.toString());
    const doc = await gameRef.get();
    return doc.exists;
  } catch (error) {
    console.error(`[Firestore] Error checking game ${gameId}:`, error);
    return false;
  }
}

/**
 * Save game to Firestore
 */
async function saveGameToFirestore(gameData) {
  try {
    const gameRef = db.collection('games').doc(gameData.id);
    const doc = await gameRef.get();
    
    const gameDocument = {
      ...gameData,
      nameLower: (gameData.name || '').toLowerCase(),
      publisher: gameData.publisher || (Array.isArray(gameData.publishers) && gameData.publishers.length > 0 ? gameData.publishers[0] : null),
      averageWeight: gameData.averageWeight || gameData.complexity || null,
      bggDataCached: true,
      bggDataCachedAt: admin.firestore.Timestamp.now(),
      prePopulated: true, // Mark as pre-populated
      prePopulatedAt: admin.firestore.Timestamp.now(),
    };
    
    if (!doc.exists) {
      await gameRef.set(gameDocument);
      return true;
    } else {
      // Update existing document
      await gameRef.update(gameDocument);
      return true;
    }
  } catch (error) {
    console.error(`[Firestore] Error saving game ${gameData.id}:`, error);
    return false;
  }
}

/**
 * Get top 1000 game IDs
 * For now, uses the static TOP_1000_GAME_IDS array
 * In the future, could fetch from BGG's API or a ranking service
 */
async function getTop1000GameIds() {
  // Return the static list - user should populate it
  return TOP_1000_GAME_IDS;
}

/**
 * Main function to pre-populate top games
 */
async function prePopulateTopGames() {
  console.log('\n🎲 Starting Pre-population of Top 1000 Games...\n');
  console.log('⏰ This will be spread over several hours to be respectful to BGG API\n');
  
  try {
    // Get list of top 1000 game IDs
    let gameIds = TOP_1000_GAME_IDS;
    
    // If list is empty or placeholder, try to get from function
    if (!gameIds || gameIds.length === 0) {
      gameIds = await getTop1000GameIds();
    }
    
    if (!gameIds || gameIds.length === 0) {
      console.log('❌ No game IDs provided. Please update TOP_1000_GAME_IDS in the script.');
      console.log('');
      console.log('📝 How to get top 1000 BGG game IDs:');
      console.log('   1. Visit: https://boardgamegeek.com/browse/boardgame');
      console.log('   2. Navigate through pages 1-20 (50 games per page = 1000 games)');
      console.log('   3. The game ID is in each game\'s URL (e.g., /boardgame/174430 → ID is 174430)');
      console.log('   4. Copy the IDs for the top 1000 games into the TOP_1000_GAME_IDS array');
      console.log('   5. Or manually curate a list of popular games you know users commonly own');
      console.log('');
      console.log('💡 Tip: You can start with fewer games (e.g., top 200) and add more later.');
      console.log('   The script will work with any number of games.');
      process.exit(1);
    }
    
    // Use all provided games (up to 1000, but can handle more)
    const targetGameIds = gameIds.slice(0, 1000);
    console.log(`📋 Target: ${targetGameIds.length} games\n`);
    
    // Check which games already exist in Firestore
    console.log('🔍 Checking Firestore for existing games...\n');
    const existingGames = new Set();
    let checkCount = 0;
    
    for (const gameId of targetGameIds) {
      checkCount++;
      if (checkCount % 50 === 0) {
        console.log(`   Checked ${checkCount}/${targetGameIds.length} games...`);
      }
      
      const exists = await gameExistsInFirestore(gameId.toString());
      if (exists) {
        existingGames.add(gameId.toString());
      }
    }
    
    const gamesToFetch = targetGameIds.filter(id => !existingGames.has(id.toString()));
    
    console.log(`✅ Found ${existingGames.size} games already in Firestore`);
    console.log(`📥 Need to fetch ${gamesToFetch.length} games from BGG API\n`);
    
    if (gamesToFetch.length === 0) {
      console.log('🎉 All games are already in Firestore! No fetching needed.\n');
      return;
    }
    
    // Calculate batches and estimated time
    const totalBatches = Math.ceil(gamesToFetch.length / BATCH_SIZE);
    const totalGroups = Math.ceil(totalBatches / BATCHES_PER_GROUP);
    const avgDelay = (MIN_DELAY_MS + MAX_DELAY_MS) / 2;
    const avgBreakDelay = (MIN_BREAK_MS + MAX_BREAK_MS) / 2;
    
    // Time per group: (BATCHES_PER_GROUP batches × avg delay) + break time
    const timePerGroup = (BATCHES_PER_GROUP * avgDelay) + avgBreakDelay;
    const estimatedHours = (timePerGroup * totalGroups) / (1000 * 60 * 60);
    
    console.log(`📊 Processing Plan:`);
    console.log(`   Total batches: ${totalBatches}`);
    console.log(`   Batch groups: ${totalGroups} (${BATCHES_PER_GROUP} batches per group)`);
    console.log(`   Games per group: ${BATCHES_PER_GROUP * BATCH_SIZE}`);
    console.log(`   Break between groups: ${(MIN_BREAK_MS / 60000).toFixed(0)}-${(MAX_BREAK_MS / 60000).toFixed(0)} minutes`);
    console.log(`⏱️  Estimated total time: ~${estimatedHours.toFixed(1)} hours`);
    console.log(`   (Spread over time to be respectful to BGG API)\n`);
    console.log(`🚀 Starting batch fetching...\n`);
    
    // Process in batches with group breaks
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < gamesToFetch.length; i += BATCH_SIZE) {
      const batch = gamesToFetch.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const groupNumber = Math.ceil(batchNumber / BATCHES_PER_GROUP);
      const progress = `[Batch ${batchNumber}/${totalBatches}] (Group ${groupNumber}/${totalGroups})`;
      
      console.log(`${progress} Fetching ${batch.length} games...`);
      console.log(`   Game IDs: ${batch.join(', ')}`);
      
      try {
        // Rate limit: wait before each batch (except the first one)
        if (i > 0) {
          const delay = getRandomDelay();
          console.log(`   ⏸️  Waiting ${(delay / 1000).toFixed(1)}s (rate limit)...`);
          await sleep(delay);
        }
        
        // Fetch batch from BGG API
        let bggGames = null;
        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries && !bggGames) {
          try {
            bggGames = await fetchBGGGameDetailsBatch(batch);
            break;
          } catch (error) {
            if (error.message === 'RATE_LIMITED') {
              retries++;
              if (retries < maxRetries) {
                const backoffDelay = 10000 * Math.pow(2, retries - 1); // 10s, 20s, 40s
                console.log(`   ⚠️  Rate limited! Waiting ${(backoffDelay / 1000).toFixed(0)}s before retry ${retries}/${maxRetries}...`);
                await sleep(backoffDelay);
              } else {
                console.log(`   ❌ Rate limited after ${maxRetries} retries, skipping batch`);
                failCount += batch.length;
                break;
              }
            } else {
              throw error;
            }
          }
        }
        
        if (!bggGames || bggGames.length === 0) {
          console.log(`   ❌ No games returned from BGG API`);
          failCount += batch.length;
          continue;
        }
        
        console.log(`   ✅ Fetched ${bggGames.length} games from BGG API`);
        
        // Save each game to Firestore
        for (const gameData of bggGames) {
          if (!gameData || !gameData.id) {
            skipCount++;
            continue;
          }
          
          const saved = await saveGameToFirestore(gameData);
          if (saved) {
            successCount++;
            console.log(`   ✅ Saved: ${gameData.name} (ID: ${gameData.id})`);
          } else {
            failCount++;
            console.log(`   ❌ Failed to save: ${gameData.name || gameData.id}`);
          }
        }
        
        console.log('');
        
        // Take a longer break after completing a group (except after the last batch)
        if (batchNumber % BATCHES_PER_GROUP === 0 && i + BATCH_SIZE < gamesToFetch.length) {
          const breakDelay = getRandomBreakDelay();
          const breakMinutes = (breakDelay / 60000).toFixed(1);
          console.log(`\n⏸️  Completed group ${groupNumber}/${totalGroups} (${BATCHES_PER_GROUP * BATCH_SIZE} games)`);
          console.log(`   Taking a ${breakMinutes}-minute break before next group...`);
          console.log(`   (This spreads the work over hours to be respectful to BGG API)\n`);
          await sleep(breakDelay);
          console.log(`✅ Resuming with group ${groupNumber + 1}...\n`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error processing batch: ${error.message}`);
        failCount += batch.length;
        console.log('');
      }
    }
    
    // Summary
    console.log('\n📊 Pre-population Summary:');
    console.log(`   ✅ Successfully saved: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📦 Total processed: ${gamesToFetch.length}`);
    console.log(`   💾 Already in Firestore: ${existingGames.size}\n`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
prePopulateTopGames()
  .then(() => {
    console.log('✨ Pre-population complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

