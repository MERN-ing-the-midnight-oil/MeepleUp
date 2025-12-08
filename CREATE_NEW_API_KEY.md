# Create New API Key in Google Cloud Console

Since your old API key was compromised, let's create a fresh one in Google Cloud Console and configure it properly.

## Step 1: Create New API Key in Google Cloud Console

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Make sure you're in project: **meepleup-951a1**

2. **Navigate to Credentials**
   - Go to **APIs & Services** → **Credentials**
   - Click **+ CREATE CREDENTIALS** at the top
   - Select **API key**

3. **Copy the New API Key**
   - A new API key will be created and displayed
   - **Copy it immediately** - you'll need it for your `.env` file
   - The key will look like: `AIzaSy...` (starts with AIzaSy)

4. **Don't close the dialog yet** - we need to configure it first!

## Step 2: Configure the New API Key

1. **Click "RESTRICT KEY"** in the dialog (or click on the key name in the credentials list)

2. **Set API Restrictions** (Important!)
   - Under **API restrictions**, select **"Restrict key"**
   - Click **"Select APIs"**
   - Search for and select:
     - ✅ **Identity Toolkit API** (required for Firebase Auth)
     - ✅ **Firebase Installations API** (if available)
     - ✅ **Firebase Remote Config API** (if available)
   - Click **OK**
   - **OR** for development, you can select **"Don't restrict key"** (less secure but easier)

3. **Set Application Restrictions** (Optional but Recommended)
   - Under **Application restrictions**, you can:
     - **For development**: Select **"None"** (allows from anywhere)
     - **For production**: Select **"HTTP referrers"** and add your domain(s)
       - Example: `localhost:*` for local development
       - Example: `yourdomain.com/*` for production

4. **Click "SAVE"**

## Step 3: Enable Identity Toolkit API

Make sure the Identity Toolkit API is enabled for your project:

1. **Go to APIs & Services → Library**
2. **Search for "Identity Toolkit API"**
3. **Click on it**
4. **Make sure it shows "Enabled"** (if not, click **Enable**)

## Step 4: Update Your .env File

Update your `.env` file with the new API key:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_new_api_key_from_step_1
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=meepleup-951a1.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=meepleup-951a1
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=meepleup-951a1.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=177622732549
EXPO_PUBLIC_FIREBASE_APP_ID=1:177622732549:web:734792a7d3d5b0a942716c
```

**Replace** `your_new_api_key_from_step_1` with the actual key you copied in Step 1.

## Step 5: Restart Your Development Server

**IMPORTANT**: Environment variables only load when the server starts!

1. **Stop your current server** (Ctrl+C or Cmd+C)
2. **Clear cache and restart**:
   ```bash
   expo start --clear
   ```

## Step 6: Verify It Works

1. **Check the console output** - you should see:
   ```
   🔍 Environment Variable Check:
     EXPO_PUBLIC_FIREBASE_API_KEY: AIzaSy... ✅
   ✅ Firebase API Key loaded: AIzaSy...
   ```

2. **Try to sign in or create an account** - the error should be gone!

## About the Firebase Console Key

The API key you got from Firebase Console (`AIzaSyCRFcOxaLQGYPlXCC9kij_BETlpTLkYimk`) might:
- Be a reference to a key that hasn't been created in Google Cloud Console yet
- Be managed differently by Firebase
- Take time to propagate

**The solution**: Create a new key directly in Google Cloud Console (as described above). Any valid API key from your Google Cloud project will work with your Firebase web apps, as long as:
- It has access to Identity Toolkit API
- Identity Toolkit API is enabled for your project

## Security Best Practices

1. **Restrict the API key** to only the APIs you need (Identity Toolkit API)
2. **Set application restrictions** for production (HTTP referrers)
3. **Don't commit your .env file** to version control (it's already in .gitignore)
4. **Rotate keys regularly** if they're exposed

## Troubleshooting

### Still Getting "API key expired" Error?

1. **Double-check** the API key in your `.env` file (no extra spaces)
2. **Verify** Identity Toolkit API is enabled (APIs & Services → Library)
3. **Check** the API key restrictions include Identity Toolkit API
4. **Restart** your server (environment variables only load on startup)
5. **Clear cache**: `expo start --clear`

### Key Not Working?

- Make sure you **saved** the API key restrictions in Google Cloud Console
- Verify the key has **Identity Toolkit API** in its allowed APIs list
- Check that **Identity Toolkit API** is enabled for your project

