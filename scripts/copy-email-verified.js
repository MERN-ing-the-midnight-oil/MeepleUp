#!/usr/bin/env node
// Simple script to copy email-verified.html to dist/ after web export
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'web', 'email-verified.html');
const destDir = path.join(__dirname, '..', 'dist');
const dest = path.join(destDir, 'email-verified.html');

if (!fs.existsSync(source)) {
  console.error('Source file not found:', source);
  process.exit(1);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(source, dest);
console.log('✅ Copied email-verified.html to dist/');

