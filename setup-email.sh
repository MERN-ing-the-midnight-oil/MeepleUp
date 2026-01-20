#!/bin/bash

# Email Setup Script for MeepleUp Beta Welcome Emails
# Usage: ./setup-email.sh

echo "🎮 MeepleUp Email Setup for Beta Welcome Emails"
echo ""
echo "This script will help you configure email sending for iOS beta signups."
echo ""
echo "You'll need:"
echo "  1. A Gmail account"
echo "  2. An App Password (get it at: https://myaccount.google.com/apppasswords)"
echo ""
read -p "Press Enter to continue..."
echo ""

read -p "Enter your Gmail address: " GMAIL_USER
read -sp "Enter your Gmail App Password (16 characters): " GMAIL_PASS
echo ""

echo ""
echo "Configuring Firebase Functions..."
firebase functions:config:set smtp.host="smtp.gmail.com"
firebase functions:config:set smtp.port="587"
firebase functions:config:set smtp.secure="false"
firebase functions:config:set smtp.user="$GMAIL_USER"
firebase functions:config:set smtp.pass="$GMAIL_PASS"

echo ""
echo "✅ Configuration saved!"
echo ""
echo "Next step: Deploy the function"
echo "  cd functions"
echo "  firebase deploy --only functions:sendIOSBetaWelcomeEmail"
echo ""


