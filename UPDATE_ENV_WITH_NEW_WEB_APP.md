# Update .env File with New Web App Configuration

## New Firebase Configuration Values

Based on your new web app registration, update your `.env` file with these values:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=YOUR_NEW_API_KEY_HERE
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=meepleup-951a1.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=meepleup-951a1
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=meepleup-951a1.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=177622732549
EXPO_PUBLIC_FIREBASE_APP_ID=1:177622732549:web:734792a7d3d5b0a942716c
```

## Important Notes

1. **New API Key**: Copy the API key from your Firebase web app config (this is the one that will be used in email verification links)

2. **New App ID**: `1:177622732549:web:734792a7d3d5b0a942716c` (different from your old one)

3. **Storage Bucket Changed**: 
   - Old: `meepleup-951a1.appspot.com`
   - New: `meepleup-951a1.firebasestorage.app`
   - This is fine - Firebase updated their storage bucket naming convention

4. **Other values stayed the same**:
   - `authDomain`: `meepleup-951a1.firebaseapp.com`
   - `projectId`: `meepleup-951a1`
   - `messagingSenderId`: `177622732549`

5. **measurementId** (`G-63S2LBJL6S`) is for Firebase Analytics - you don't need it in your .env file unless you're using Analytics

## Steps to Update

1. **Open your `.env` file** in the project root

2. **Update these values**:
   - `EXPO_PUBLIC_FIREBASE_API_KEY` → New API key
   - `EXPO_PUBLIC_FIREBASE_APP_ID` → New app ID
   - `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` → New storage bucket (if it was different)

3. **Save the file**

4. **Restart your development server**:
   ```bash
   # Stop current server (Ctrl+C or Cmd+C)
   expo start --clear
   ```

5. **Test email verification**:
   - Create a new test account
   - Check the verification email link
   - It should now have the new API key from your Firebase web app config
   - The link should work without the "API key expired" error

## Verify It's Working

After restarting, check your browser/terminal console. You should see:
```
🔍 Environment Variable Check:
  EXPO_PUBLIC_FIREBASE_API_KEY: AIzaSyCRFc... ✅
✅ Firebase API Key loaded: AIzaSyCRFc...
```

If you see this, the new API key is loaded correctly!

