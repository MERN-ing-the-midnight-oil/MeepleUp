# Firebase API Key Restrictions - Recommended List

## ✅ Essential APIs (Client-Side - INCLUDE THESE):

1. **Firebase Installations API** ✓
   - Always required for Firebase SDK initialization
   - Manages app installations and FID tokens

2. **Cloud Firestore API** ✓
   - Your app uses Firestore for data storage
   - Required for all Firestore operations

3. **Cloud Storage for Firebase API** ✓
   - Your app uses Firebase Storage
   - Required for file uploads/downloads

4. **Identity Toolkit API** ✓
   - Required for Firebase Authentication
   - Handles user sign-in, sign-up, token management

5. **Token Service API** ✓
   - Required for authentication token operations
   - Works with Identity Toolkit API

## ⚠️ Optional APIs (Only if you actually use these features):

6. **FCM Registration API** (if you use push notifications)
   - Only needed if you send push notifications via Firebase Cloud Messaging

7. **Firebase Remote Config API** (if you use Remote Config)
   - Only needed if you use Firebase Remote Config feature

8. **Firebase App Check API** (if you use App Check)
   - Only needed if you've enabled App Check protection

## ❌ DO NOT INCLUDE (Admin/Management APIs):

These should **NEVER** be in a client-side API key. They're for server-side/admin operations only:

- ❌ Firebase Realtime Database Management API
- ❌ Firebase Hosting API
- ❌ Firebase Rules API
- ❌ Cloud SQL Admin API
- ❌ Cloud Datastore API
- ❌ Firebase Management API
- ❌ Firebase App Distribution API
- ❌ Firebase App Hosting API
- ❌ Firebase App Testers API
- ❌ Firebase Data Connect API
- ❌ Firebase In-App Messaging API
- ❌ Firebase ML API (unless you specifically use it)
- ❌ Firebase Remote Config Realtime API (redundant with Remote Config API)
- ❌ Cloud Logging API (server-side only)
- ❌ Firebase AI Logic API (if not used)
- ❌ ML Kit API (only if you use ML Kit features)

## Summary - Recommended Minimum List:

**Start with these 5 essential APIs:**
1. Firebase Installations API
2. Cloud Firestore API
3. Cloud Storage for Firebase API
4. Identity Toolkit API
5. Token Service API

**Add these ONLY if you use the features:**
- FCM Registration API (push notifications)
- Firebase Remote Config API (remote config)
- Firebase App Check API (app check)

## Security Best Practice:

**The principle of least privilege** - Only enable APIs you actually use. This limits damage if the key is ever exposed.

