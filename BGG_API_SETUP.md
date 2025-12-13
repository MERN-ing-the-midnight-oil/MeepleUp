# BGG API Token Setup Guide

## Why You Need This
The BoardGameGeek (BGG) API requires authentication to fetch game thumbnails and images. Without a valid token, you'll see 401 errors and thumbnails won't display in the AI scanner.

## How to Get Your BGG API Token

### Step 1: Register Your Application
1. Go to [BoardGameGeek Applications Page](https://boardgamegeek.com/applications)
2. Log in with your BGG account
3. Click "Create Application"
4. Fill in the application details:
   - **Application Name**: MeepleUp (or your app name)
   - **Description**: Mobile app for managing board game collections and events
   - **Type**: Select "Non-commercial" (unless you're selling the app)
5. Submit and wait for approval (usually takes a few days to a week)

### Step 2: Get Your Token
1. Once approved, return to the [Applications page](https://boardgamegeek.com/applications)
2. Find your application in the list
3. Click on the "Tokens" link
4. Generate a new token
5. Copy the token (you'll only see it once!)

### Step 3: Add Token to Your .env File
1. Open the `.env` file in the project root
2. Find the line: `# EXPO_PUBLIC_BGG_API_TOKEN=your_token_here`
3. Uncomment it (remove the `#`) and replace `your_token_here` with your actual token:
   ```
   EXPO_PUBLIC_BGG_API_TOKEN=your_actual_token_here
   ```
4. Save the file
5. **Restart your Expo development server** for the changes to take effect:
   ```bash
   # Stop the current server (Ctrl+C)
   # Then restart:
   npm start
   ```

## Verification
After adding the token and restarting, check the console logs. You should see:
- `[BGG API] Token found, length: XX` instead of `[BGG API] No token found`
- No more 401 errors when fetching game details
- Thumbnails should start appearing in the AI scanner

## Troubleshooting

### Token Not Working?
- Make sure there are no extra spaces around the `=` sign
- Make sure the token is on a single line (no line breaks)
- Verify the token hasn't expired or been revoked
- Check that you restarted the Expo server after adding the token

### Still Getting 401 Errors?
- Double-check the token is correct (no typos)
- Make sure you're using `EXPO_PUBLIC_BGG_API_TOKEN` (not `BGGbearerToken` or other variants)
- Try regenerating the token on BGG and updating it in `.env`

### Application Not Approved Yet?
While waiting for approval, the app will still work but:
- Thumbnails won't display (you'll see placeholder text)
- Some API requests may be rate-limited
- The app will function but with limited BGG data

## Security Notes
- **Never commit your `.env` file** to version control (it's already in `.gitignore`)
- Don't share your token publicly
- If your token is exposed, regenerate it immediately on BGG

