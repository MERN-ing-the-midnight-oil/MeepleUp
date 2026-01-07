#!/bin/bash

# Script to set up EAS environment variables from .env file
cd "$(dirname "$0")"

# Source the .env file
set -a
source .env
set +a

# List of environment variables to set
vars=(
  "EXPO_PUBLIC_FIREBASE_API_KEY"
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID"
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  "EXPO_PUBLIC_FIREBASE_APP_ID"
  "EXPO_PUBLIC_BGG_API_TOKEN"
  "EXPO_PUBLIC_ANTHROPIC_API_KEY"
  "EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID"
)

echo "Setting up environment variables in EAS for preview environment..."
echo ""

for var in "${vars[@]}"; do
  value="${!var}"
  if [ -z "$value" ]; then
    echo "⚠️  Skipping $var (not set in .env)"
    continue
  fi
  
  echo "Setting $var..."
  eas env:create --scope project --name "$var" --value "$value" --type string --environment preview --visibility plaintext --non-interactive
  
  if [ $? -eq 0 ]; then
    echo "✅ $var set successfully"
  else
    echo "❌ Failed to set $var (may already exist)"
  fi
  echo ""
done

echo "Done! Environment variables are set for preview builds."

