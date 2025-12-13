# Quick BGG API Token Setup

## If You Already Have a Token
1. Open `.env` file
2. Find the line: `EXPO_PUBLIC_BGG_API_TOKEN=YOUR_TOKEN_HERE`
3. Replace `YOUR_TOKEN_HERE` with your actual token
4. Save the file
5. Restart Expo: `npm start` (or stop and restart your current server)

## If You Need a New Token

### Quick Steps:
1. Go to: https://boardgamegeek.com/applications
2. Log in with your BGG account
3. Click "Create Application" (or find your existing one)
4. Fill in details and submit
5. Wait for approval (usually a few days)
6. Once approved, go to "Tokens" and generate a new token
7. Copy the token and add it to `.env` as shown above

### Check if It's Working:
After adding the token and restarting, look for this in your console:
- ✅ `[BGG API] Token found, length: XX` 
- ❌ `[BGG API] No token found` (means token not set correctly)

See `BGG_API_SETUP.md` for detailed instructions.

