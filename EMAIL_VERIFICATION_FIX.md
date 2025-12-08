# Email Verification Fix

## Problem
Email verification links were expiring immediately or showing "link has already been used" errors when clicked.

## Root Cause
The `sendEmailVerification()` method was being called without `actionCodeSettings`, which Firebase requires to generate valid verification links with proper redirect URLs.

## Solution Implemented

### 1. Added Action Code Settings
Updated both `sendEmailVerification()` calls in `src/context/AuthContext.jsx` to include `actionCodeSettings`:

- **In `signup()` function**: Added action code settings with the current origin URL
- **In `resendVerificationEmail()` function**: Added action code settings with the current origin URL

The settings specify:
- `url`: The URL where users will be redirected after clicking the verification link
  - For web: Uses `window.location.origin` (e.g., `http://localhost:3000` or your production URL)
  - For React Native: Falls back to the configured `authDomain`
- `handleCodeInApp`: Set to `false` to use email links directly (not in-app handling)

### 2. Added Email Verification Callback Handler
Added a `useEffect` hook that automatically processes email verification when users click the link:

- Checks for `mode=verifyEmail` and `oobCode` parameters in the URL
- Calls `auth.applyActionCode()` to verify the email
- Reloads the user's auth state to update `emailVerified` status
- Cleans up the URL by removing query parameters

## Additional Steps Required

### 1. Configure Authorized Domains in Firebase Console
Firebase needs to know which domains are allowed to handle email verification links:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Make sure your domain is listed:
   - For local development: `localhost` should already be there
   - For production: Add your production domain (e.g., `meepleup.com`)
   - Firebase domains (`*.firebaseapp.com`, `*.web.app`) are added by default

### 2. Test the Fix

1. **Create a new test account** or use an existing unverified account
2. **Request a verification email** (signup or resend)
3. **Click the verification link** in the email
4. **Verify the behavior**:
   - The link should work without expiring
   - The user should be redirected to your app
   - The email should be marked as verified
   - The user should see their verified status updated

### 3. Production Deployment

When deploying to production:

1. **Update the authorized domains** in Firebase Console with your production domain
2. **Verify the `actionCodeSettings.url`** points to your production URL
3. **Test email verification** in the production environment

## How It Works Now

1. **User signs up** → `signup()` is called with `actionCodeSettings`
2. **Firebase generates verification link** with the correct redirect URL
3. **User clicks link in email** → Redirected to your app with `?mode=verifyEmail&oobCode=...`
4. **App processes callback** → `useEffect` handler calls `applyActionCode()`
5. **Email is verified** → User's `emailVerified` status is updated
6. **User can access app** → Verification status is reflected immediately

## Troubleshooting

If verification links still don't work:

1. **Check browser console** for any errors when clicking the link
2. **Verify authorized domains** in Firebase Console include your domain
3. **Check the email link URL** - it should point to your app's domain
4. **Verify `actionCodeSettings.url`** matches your actual app URL
5. **Check Firebase project settings** - ensure email verification is enabled
6. **Try in incognito/private window** to rule out caching issues

## Code Changes Summary

- ✅ Added `getVerificationUrl()` helper function
- ✅ Updated `signup()` to include `actionCodeSettings`
- ✅ Updated `resendVerificationEmail()` to include `actionCodeSettings`
- ✅ Added email verification callback handler in `useEffect`

All changes are in `src/context/AuthContext.jsx`.

