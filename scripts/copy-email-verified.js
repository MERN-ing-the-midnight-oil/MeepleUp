#!/usr/bin/env node
// Simple script to copy email-verified.html and CNAME to dist/ after web export
const fs = require('fs');
const path = require('path');

const destDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy email-verified.html
const emailVerifiedSource = path.join(__dirname, '..', 'web', 'email-verified.html');
const emailVerifiedDest = path.join(destDir, 'email-verified.html');

if (fs.existsSync(emailVerifiedSource)) {
  fs.copyFileSync(emailVerifiedSource, emailVerifiedDest);
  console.log('✅ Copied email-verified.html to dist/');
} else {
  console.warn('⚠️  email-verified.html not found, skipping');
}

// Copy CNAME file for custom domain
const cnameSource = path.join(__dirname, '..', 'CNAME');
const cnameDest = path.join(destDir, 'CNAME');

if (fs.existsSync(cnameSource)) {
  fs.copyFileSync(cnameSource, cnameDest);
  console.log('✅ Copied CNAME to dist/');
} else {
  console.warn('⚠️  CNAME not found, skipping');
}

