# Firebase Setup Guide for MeepleUp

## Quick Checklist

- [ ] Enable Authentication (Email/Password)
- [ ] Create Firestore Database (test mode)
- [ ] Add Web App and get configuration
- [ ] Create `.env` file with Firebase config
- [ ] Run `npm install` to install Firebase SDK
- [ ] Test Firebase connection

## Step 1: Firebase Console Setup

### 1.1 Enable Authentication
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **meepleup-951a1**
3. In the left sidebar, click **Authentication**
4. Click **Get Started** (if first time)
5. Click on **Sign-in method** tab
6. Click **Email/Password**
7. Toggle **Enable** to ON
8. Click **Save**

### 1.2 Create Firestore Database
1. In Firebase Console, click **Firestore Database** in left sidebar
2. Click **Create Database**
3. Select **Start in test mode** (we'll add security rules later)
   - This allows read/write for 30 days, then we'll add proper rules
4. Choose a **location** for your database
   - Pick the region closest to your users (e.g., `us-central1`, `europe-west1`)
5. Click **Enable**

**Note**: Test mode allows all reads/writes. We'll add proper security rules after testing.

### 1.3 Add Web App and Get Configuration
1. Click the **gear icon** (⚙️) next to "Project Overview" → **Project settings**
2. Scroll down to **Your apps** section
3. Click the **Web** icon (`</>`) to add a web app
4. Register your app:
   - App nickname: `MeepleUp Web`
   - (Optional) Check "Also set up Firebase Hosting"
5. Click **Register app**
6. **Copy the `firebaseConfig` object** - you'll need this!

The config will look like:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC...",
  authDomain: "meepleup-951a1.firebaseapp.com",
  projectId: "meepleup-951a1",
  storageBucket: "meepleup-951a1.appspot.com",
  messagingSenderId: "177622732549",
  appId: "1:177622732549:web:abc123..."
};
```

### 1.4 (Optional) Enable Storage
If you want to use Firebase Storage for images (alternative to Imgur):
1. Click **Storage** in left sidebar
2. Click **Get Started**
3. Start in **test mode**
4. Choose a **location** (same as Firestore is recommended)
5. Click **Done**

## Step 2: Install Firebase SDK

In your project directory, run:
```bash
npm install
```

This will install Firebase (already added to package.json).

## Step 3: Create Environment Variables File

1. In your project root, create a file named `.env`
2. Add your Firebase configuration values:

```env
REACT_APP_FIREBASE_API_KEY=your_api_key_from_console
REACT_APP_FIREBASE_AUTH_DOMAIN=meepleup-951a1.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=meepleup-951a1
REACT_APP_FIREBASE_STORAGE_BUCKET=meepleup-951a1.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=177622732549
REACT_APP_FIREBASE_APP_ID=your_app_id_from_console
```

**Important**: 
- Replace the placeholder values with your actual config from Step 1.3
- The `.env` file is already in `.gitignore` so it won't be committed
- Restart your dev server after creating/updating `.env`

## Step 4: Verify Setup

1. The Firebase config file is already created at `src/config/firebase.js`
2. It will automatically use your `.env` variables
3. If `.env` is missing, it will use placeholder values (you'll see errors)

## Step 5: Test Connection (After Code Setup)

Once we've created the Firebase service layer, you can test by:
1. Starting the app: `npm start`
2. Check browser console for any Firebase errors
3. Try creating a user account

## Security Rules Setup (After Testing)

We'll set up proper Firestore security rules later. For now, test mode is fine for development.

## Next Steps

After completing the console setup:
1. ✅ You've enabled Authentication
2. ✅ You've created Firestore Database
3. ✅ You've added the Web app and have your config
4. ✅ You've created `.env` file

Then we'll:
- Create Firebase service functions
- Replace localStorage with Firestore
- Set up Firebase Auth integration
- Create helper functions for all database operations

