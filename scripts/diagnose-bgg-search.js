/**
 * Comprehensive BGG API Search Diagnostics
 * Tests authentication, query variants, and identifies why searches fail
 * Usage: node scripts/diagnose-bgg-search.js "Game Name"
 */

require('dotenv').config();

const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';

// Get token from environment (same as app uses)
function getBGGToken() {
  return process.env.EXPO_PUBLIC_BGG_API_TOKEN || 
         process.env.REACT_APP_BGG_API_TOKEN ||
         process.env.BGGbearerToken ||
         null;
}

// Generate query variants
function generateQueryVariants(query) {
  const variants = [];
  const normalized = query.trim();
  
  // Variant 1: Original
  variants.push({ name: 'Original', query: normalized });
  
  // Variant 2: Lowercase
  if (normalized.toLowerCase() !== normalized) {
    variants.push({ name: 'Lowercase', query: normalized.toLowerCase() });
  }
  
  // Variant 3: Remove punctuation
  const noPunctuation = normalized.replace(/[.,;:!?()[\]{}'"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noPunctuation !== normalized && noPunctuation.length >= 3) {
    variants.push({ name: 'No Punctuation', query: noPunctuation });
  }
  
  // Variant 4: Remove special characters
  const noSpecial = normalized.replace(/[&]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noSpecial !== normalized && noSpecial.length >= 3) {
    variants.push({ name: 'No Special Chars', query: noSpecial });
  }
  
  // Variant 5: Remove leading articles
  const noArticles = normalized.replace(/^(the|a|an)\s+/i, '').trim();
  if (noArticles !== normalized && noArticles.length >= 3) {
    variants.push({ name: 'No Articles', query: noArticles });
  }
  
  // Variant 6: First word only
  const firstWord = normalized.split(/\s+/)[0];
  if (firstWord !== normalized && firstWord.length >= 3) {
    variants.push({ name: 'First Word Only', query: firstWord });
  }
  
  // Variant 7: First 2 words
  const words = normalized.split(/\s+/);
  if (words.length > 2) {
    const firstTwo = words.slice(0, 2).join(' ');
    if (firstTwo !== normalized && firstTwo.length >= 3) {
      variants.push({ name: 'First 2 Words', query: firstTwo });
    }
  }
  
  return variants;
}

// Parse BGG search XML
function parseBGGSearchXML(xmlText) {
  const results = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    const idMatch = match[0].match(/id="(\d+)"/);
    const id = idMatch ? idMatch[1] : null;
    
    const primaryNameMatch = itemXml.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
    const nameMatch = itemXml.match(/<name[^>]*value="([^"]+)"/);
    const name = primaryNameMatch ? primaryNameMatch[1] : (nameMatch ? nameMatch[1] : null);
    
    const yearMatch = itemXml.match(/<yearpublished[^>]*value="(\d+)"/);
    const yearPublished = yearMatch ? yearMatch[1] : null;
    
    if (id && name) {
      results.push({ id, name, yearPublished: yearPublished || '' });
    }
  }
  
  return results;
}

// Test BGG search with a specific query and auth method
async function testBGGSearch(query, authMethod = 'none') {
  const encodedQuery = encodeURIComponent(query);
  let url = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame`;
  const headers = {};
  const token = getBGGToken();
  
  // Apply authentication method
  if (authMethod === 'bearer' && token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (authMethod === 'query' && token) {
    url += `&token=${token}`;
  }
  // 'none' = no authentication
  
  try {
    const response = await fetch(url, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    
    const status = response.status;
    const xmlText = await response.text();
    const results = parseBGGSearchXML(xmlText);
    
    return {
      status,
      success: response.ok,
      resultsCount: results.length,
      results,
      authMethod,
      query,
      hasToken: !!token,
    };
  } catch (error) {
    return {
      status: 'ERROR',
      success: false,
      error: error.message,
      authMethod,
      query,
      hasToken: !!token,
    };
  }
}

// Main diagnostic function
async function diagnoseBGGSearch(gameName) {
  if (!gameName) {
    console.error('❌ Please provide a game name');
    console.log('Usage: node scripts/diagnose-bgg-search.js "Game Name"');
    process.exit(1);
  }

  console.log(`🔍 BGG API Search Diagnostics for: "${gameName}"\n`);
  console.log('=' .repeat(60));
  
  // Check token
  const token = getBGGToken();
  console.log(`\n📋 Configuration:`);
  console.log(`   Token Available: ${token ? '✅ Yes' : '❌ No'}`);
  if (token) {
    console.log(`   Token Length: ${token.length} characters`);
    console.log(`   Token Preview: ${token.substring(0, 10)}...`);
  } else {
    console.log(`   ⚠️  No token found. Checked:`);
    console.log(`      - EXPO_PUBLIC_BGG_API_TOKEN`);
    console.log(`      - REACT_APP_BGG_API_TOKEN`);
    console.log(`      - BGGbearerToken`);
  }
  
  // Generate query variants
  const variants = generateQueryVariants(gameName);
  console.log(`\n📝 Query Variants Generated: ${variants.length}`);
  variants.forEach((v, i) => {
    console.log(`   ${i + 1}. ${v.name}: "${v.query}"`);
  });
  
  console.log(`\n🧪 Testing Authentication Methods...\n`);
  
  // Test authentication methods with original query
  const authMethods = token ? ['bearer', 'query', 'none'] : ['none'];
  const authResults = {};
  
  for (const method of authMethods) {
    console.log(`   Testing ${method.toUpperCase()} authentication...`);
    const result = await testBGGSearch(gameName, method);
    authResults[method] = result;
    
    if (result.success) {
      console.log(`   ✅ ${method}: Status ${result.status}, Found ${result.resultsCount} results`);
    } else {
      console.log(`   ❌ ${method}: Status ${result.status}${result.error ? ` - ${result.error}` : ''}`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Find which auth method works
  const workingAuth = Object.keys(authResults).find(m => authResults[m].success);
  
  if (!workingAuth) {
    console.log(`\n❌ All authentication methods failed!`);
    console.log(`\n🔍 This explains why searches are failing.`);
    console.log(`   - If token is required but missing/invalid → 401 errors`);
    console.log(`   - If all methods fail → searches return empty results`);
    return;
  }
  
  console.log(`\n✅ Working authentication method: ${workingAuth.toUpperCase()}`);
  
  // Test all query variants with working auth method
  console.log(`\n🧪 Testing Query Variants with ${workingAuth.toUpperCase()} auth...\n`);
  
  const variantResults = [];
  for (const variant of variants) {
    console.log(`   Testing: "${variant.query}" (${variant.name})...`);
    const result = await testBGGSearch(variant.query, workingAuth);
    variantResults.push({ ...result, variantName: variant.name });
    
    if (result.resultsCount > 0) {
      console.log(`   ✅ Found ${result.resultsCount} result(s)`);
      // Show first few results
      result.results.slice(0, 3).forEach((game, i) => {
        const match = game.name.toLowerCase().includes(gameName.toLowerCase()) ? '🎯' : '  ';
        console.log(`      ${match} ${i + 1}. ${game.name} (ID: ${game.id}, Year: ${game.yearPublished || 'N/A'})`);
      });
    } else {
      console.log(`   ❌ No results`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`\n📊 Summary:\n`);
  
  const successfulVariants = variantResults.filter(r => r.resultsCount > 0);
  const exactMatches = variantResults.filter(r => 
    r.results.some(g => g.name.toLowerCase() === gameName.toLowerCase())
  );
  
  console.log(`   Working Auth Method: ${workingAuth.toUpperCase()}`);
  console.log(`   Successful Variants: ${successfulVariants.length}/${variants.length}`);
  console.log(`   Exact Matches: ${exactMatches.length}`);
  
  if (exactMatches.length > 0) {
    console.log(`\n✅ Game found! Working query variants:`);
    exactMatches.forEach(r => {
      console.log(`   - "${r.query}" (${r.variantName}) → Found "${r.results.find(g => g.name.toLowerCase() === gameName.toLowerCase()).name}"`);
    });
  } else if (successfulVariants.length > 0) {
    console.log(`\n⚠️  Found similar games but no exact match:`);
    successfulVariants.forEach(r => {
      console.log(`   - "${r.query}" (${r.variantName}) → ${r.resultsCount} results`);
    });
  } else {
    console.log(`\n❌ No results found with any query variant`);
    console.log(`   This suggests:`);
    console.log(`   - Game might not be in BGG database`);
    console.log(`   - Search query needs different approach`);
    console.log(`   - BGG API might have issues`);
  }
  
  // Recommendations
  console.log(`\n💡 Recommendations:\n`);
  
  if (!token) {
    console.log(`   1. ⚠️  Configure BGG API token:`);
    console.log(`      Set EXPO_PUBLIC_BGG_API_TOKEN in your .env file`);
    console.log(`      See BGG_API_SETUP.md for instructions`);
  }
  
  if (workingAuth !== 'none' && !token) {
    console.log(`   2. ✅ Authentication working without token (for now)`);
  } else if (workingAuth === 'none' && token) {
    console.log(`   2. ⚠️  Token configured but not required (or invalid)`);
  }
  
  if (exactMatches.length === 0 && successfulVariants.length > 0) {
    console.log(`   3. ✅ Implement query variant fallbacks`);
    console.log(`      Try these variants in order: ${successfulVariants.map(r => `"${r.query}"`).join(', ')}`);
  }
  
  if (successfulVariants.length === 0) {
    console.log(`   3. ❌ Game not found - verify it exists in BGG`);
    console.log(`      Visit: https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(gameName)}`);
  }
}

// Get game name from command line
const gameName = process.argv[2] || 'Islebound';

// Run diagnostics
diagnoseBGGSearch(gameName)
  .then(() => {
    console.log(`\n✅ Diagnostics completed\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Diagnostics failed:`, error);
    process.exit(1);
  });

