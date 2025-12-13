# Finding Your BGG API Token

Since you had it working recently, here's how to find or regenerate it:

## Option 1: Check Your BGG Account (Easiest)

1. **Go to BoardGameGeek Applications:**
   - Visit: https://boardgamegeek.com/applications
   - Log in with your BGG account

2. **Find Your Application:**
   - Look for "MeepleUp" (or whatever you named it)
   - If you don't see it, you might need to create a new application

3. **View or Regenerate Token:**
   - Click on your application
   - Go to the "Tokens" section
   - If you see an existing token, you can view it (or it might show as masked)
   - If not, click "Generate New Token"
   - **Copy the token immediately** - you'll only see it once!

4. **Add to .env:**
   - Open `.env` file
   - Find: `# EXPO_PUBLIC_BGG_API_TOKEN=your_token_here`
   - Change to: `EXPO_PUBLIC_BGG_API_TOKEN=your_actual_token_here`
   - Save and restart Expo

## Option 2: Check Your Password Manager

If you use a password manager (1Password, LastPass, etc.), search for:
- "BGG"
- "BoardGameGeek"
- "MeepleUp"
- "EXPO_PUBLIC_BGG"

## Option 3: Check Other Config Files

The token might be in:
- Another `.env` file (`.env.local`, `.env.development`, etc.)
- A notes file or document
- Email from when you first set it up

## Option 4: Create a New Application (If Needed)

If you can't find your old application:

1. Go to: https://boardgamegeek.com/applications
2. Click "Create Application"
3. Fill in:
   - **Name**: MeepleUp
   - **Description**: Mobile app for board game collections and events
   - **Type**: Non-commercial
4. Submit and wait for approval (usually a few days)
5. Once approved, generate a token

## Quick Test After Adding Token

1. Add token to `.env`
2. Restart Expo: `npm start` (or stop/restart current server)
3. Check console for: `[BGG API] Token found, length: XX`
4. Try the AI scanner - thumbnails should appear!

