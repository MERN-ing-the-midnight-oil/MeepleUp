/**
 * Script to filter the boardgames CSV to only include top N ranked games
 * 
 * Usage: node scripts/filter-csv-by-rank.js [N]
 * 
 * Examples:
 *   node scripts/filter-csv-by-rank.js 5000   # Top 5,000 games
 *   node scripts/filter-csv-by-rank.js 10000  # Top 10,000 games
 *   node scripts/filter-csv-by-rank.js 1000   # Top 1,000 games
 * 
 * Default: 5,000 games (good balance of coverage and size)
 */

const fs = require('fs');
const path = require('path');

// Get the number of games to keep from command line argument
const topN = parseInt(process.argv[2]) || 5000;

const inputPath = path.join(__dirname, '../src/assets/data/boardgames_ranks.csv');
const outputPath = path.join(__dirname, '../src/assets/data/boardgames_ranks_filtered.csv');

if (!fs.existsSync(inputPath)) {
  console.error(`❌ Error: Input file not found at ${inputPath}`);
  process.exit(1);
}

console.log(`📖 Reading CSV file...`);
const csvContent = fs.readFileSync(inputPath, 'utf-8');
const lines = csvContent.split('\n').filter(line => line.trim());

if (lines.length < 2) {
  console.error('❌ Error: CSV file appears to be empty or invalid');
  process.exit(1);
}

const header = lines[0];
const dataLines = lines.slice(1);

console.log(`📊 Total games in file: ${dataLines.length}`);
console.log(`✂️  Filtering to top ${topN} games...\n`);

// Keep header + top N games
// Note: The CSV is already sorted by rank, so we just take the first N lines
const filteredLines = [header, ...dataLines.slice(0, topN)];

// Write filtered CSV
fs.writeFileSync(outputPath, filteredLines.join('\n'), 'utf-8');

const fileSize = fs.statSync(outputPath).size;
const originalSize = fs.statSync(inputPath).size;
const sizeReduction = ((1 - fileSize / originalSize) * 100).toFixed(1);

console.log(`✅ Filtered CSV created: ${outputPath}`);
console.log(`📦 File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB (was ${(originalSize / 1024 / 1024).toFixed(2)} MB)`);
console.log(`📉 Size reduction: ${sizeReduction}%`);
console.log(`\n💡 Next step: Update the upload script to use the filtered file, or rename it:`);
console.log(`   mv ${outputPath} ${inputPath.replace('_filtered', '')}`);

