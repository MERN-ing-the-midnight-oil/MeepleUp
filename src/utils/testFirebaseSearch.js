/**
 * Debug utility to test Firebase search for a specific game
 * Usage: Import and call testGameSearch('Islebound')
 */

import { searchGamesByName } from '../services/gameDatabase';

export async function testGameSearch(gameTitle) {
  console.log(`\n🔍 Testing Firebase search for: "${gameTitle}"\n`);
  
  try {
    const results = await searchGamesByName(gameTitle, 10);
    
    console.log(`\n📊 Results: ${results.length} games found\n`);
    
    if (results.length > 0) {
      console.log('✅ Game FOUND in Firebase:');
      results.forEach((game, index) => {
        console.log(`\n${index + 1}. ${game.name}`);
        console.log(`   ID: ${game.id}`);
        console.log(`   Year: ${game.yearPublished || 'N/A'}`);
        console.log(`   Rank: ${game.rank || 'N/A'}`);
        console.log(`   Match Type: ${game.matchType || 'unknown'}`);
        console.log(`   Similarity: ${(game.similarity * 100).toFixed(1)}%`);
      });
      
      // Check if exact match
      const exactMatch = results.find(r => r.matchType === 'exact');
      if (exactMatch) {
        console.log(`\n✅ EXACT MATCH FOUND: "${exactMatch.name}" (ID: ${exactMatch.id})`);
      } else {
        console.log(`\n⚠️  No exact match - closest match: "${results[0].name}" (${results[0].matchType})`);
      }
    } else {
      console.log('❌ Game NOT FOUND in Firebase');
      console.log('   This means the search should fall back to BGG API');
    }
    
    return results;
  } catch (error) {
    console.error('❌ Error searching Firebase:', error);
    throw error;
  }
}

