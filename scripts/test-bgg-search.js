/**
 * Script to test BGG API search directly
 * Usage: node scripts/test-bgg-search.js "Game Name"
 */

require('dotenv').config();

const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';

async function testBGGSearch(gameName) {
  if (!gameName) {
    console.error('❌ Please provide a game name');
    console.log('Usage: node scripts/test-bgg-search.js "Game Name"');
    process.exit(1);
  }

  console.log(`🔍 Testing BGG API search for: "${gameName}"\n`);
  
  try {
    const encodedQuery = encodeURIComponent(gameName.trim());
    const url = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame`;
    
    console.log(`📡 Request URL: ${url}\n`);
    
    const response = await fetch(url);
    
    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📊 Response Headers:`, Object.fromEntries(response.headers.entries()));
    console.log('');
    
    if (!response.ok) {
      console.error(`❌ Request failed with status ${response.status}`);
      const errorText = await response.text();
      console.error(`Error response: ${errorText.substring(0, 500)}`);
      return;
    }
    
    const xmlText = await response.text();
    
    console.log(`📄 Response length: ${xmlText.length} characters`);
    console.log(`📄 Response preview (first 500 chars):\n${xmlText.substring(0, 500)}\n`);
    
    // Parse the XML to extract results
    const results = [];
    
    // Use regex to find all <item> tags
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemXml = match[1];
      
      // Extract ID
      const idMatch = match[0].match(/id="(\d+)"/);
      const id = idMatch ? idMatch[1] : null;
      
      // Extract name (primary name preferred)
      const primaryNameMatch = itemXml.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
      const nameMatch = itemXml.match(/<name[^>]*value="([^"]+)"/);
      const name = primaryNameMatch ? primaryNameMatch[1] : (nameMatch ? nameMatch[1] : null);
      
      // Extract year published
      const yearMatch = itemXml.match(/<yearpublished[^>]*value="(\d+)"/);
      const yearPublished = yearMatch ? yearMatch[1] : null;
      
      if (id && name) {
        results.push({
          id: id,
          name: name,
          yearPublished: yearPublished || '',
        });
      }
    }
    
    console.log(`\n✅ Found ${results.length} result(s):\n`);
    
    if (results.length === 0) {
      console.log('❌ No results found in BGG API');
      console.log('\n🔍 Full XML response:');
      console.log(xmlText);
    } else {
      results.forEach((game, index) => {
        console.log(`${index + 1}. ${game.name} (ID: ${game.id}, Year: ${game.yearPublished || 'N/A'})`);
      });
      
      // Check if "Islebound" appears in any result
      const isleboundMatches = results.filter(g => 
        g.name.toLowerCase().includes('islebound')
      );
      
      if (isleboundMatches.length > 0) {
        console.log(`\n✅ Found ${isleboundMatches.length} exact match(es) for "Islebound":`);
        isleboundMatches.forEach(game => {
          console.log(`   - ${game.name} (ID: ${game.id})`);
        });
      } else {
        console.log(`\n⚠️  No results contain "Islebound" in the name`);
        console.log(`   This suggests the game might not be in BGG, or the search term doesn't match`);
      }
    }
    
    // Also check the raw XML for any mentions
    if (xmlText.toLowerCase().includes('islebound')) {
      console.log(`\n✅ "Islebound" appears in the raw XML response`);
    } else {
      console.log(`\n❌ "Islebound" does NOT appear in the raw XML response`);
    }
    
  } catch (error) {
    console.error('❌ Error testing BGG search:', error);
    throw error;
  }
}

// Get game name from command line arguments
const gameName = process.argv[2] || 'Islebound';

// Run the test
testBGGSearch(gameName)
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

