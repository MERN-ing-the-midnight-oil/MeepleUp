#!/bin/bash
# Firebase EAS Secrets Setup Script
# Run these commands to set your Firebase environment variables for production builds

echo "Setting Firebase EAS secrets..."

# API Key
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY --type string --value "AIzaSyCRFcOxaLQGYPlXCC9kij_BETlpTLkYimk"

# Auth Domain
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --type string --value "meepleup-951a1.firebaseapp.com"

# Project ID
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --type string --value "meepleup-951a1"

# Storage Bucket
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --type string --value "meepleup-951a1.firebasestorage.app"

# Messaging Sender ID
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --type string --value "177622732549"

# App ID (using iOS app ID)
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_APP_ID --type string --value "1:177622732549:ios:8f4e2f8d53a6060e42716c"

echo ""
echo "📝 Note: If you use the Claude/Anthropic import feature, also set:"
echo "   eas secret:create --scope project --name EXPO_PUBLIC_ANTHROPIC_API_KEY --type string --value \"your-api-key\""
echo ""
echo "✅ Firebase secrets set! Verify with: eas secret:list"

