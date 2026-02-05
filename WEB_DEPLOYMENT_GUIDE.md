# Web Deployment Guide for meepleup.com

This guide walks you through deploying MeepleUp to the web at meepleup.com using Firebase Hosting.

## Prerequisites

1. **Firebase CLI installed**
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebase Hosting already configured** ✅
   - You already have Firebase Hosting set up with default domains:
     - `meepleup-951a1.web.app`
     - `meepleup-951a1.firebaseapp.com`
   - Make sure you're logged in: `firebase login`

3. **Domain configured**
   - The `CNAME` file in the root points to `meepleup.com`
   - You'll need to add the custom domain to your existing hosting setup (see Step 4)

## Step-by-Step Deployment Process

### Step 1: Build the Web App

Build the production web bundle:

```bash
npm run build:web
```

This command:
- Runs `expo export` to create a static web build in the `dist/` folder
- Copies `email-verified.html` and `CNAME` to the `dist/` folder

**Verify the build:**
- Check that `dist/index.html` exists
- Check that `dist/_expo/static/js/web/` contains JavaScript bundles
- Check that `dist/assets/` contains images and other assets

### Step 2: Test Locally (Optional)

Test the build locally before deploying:

```bash
firebase serve --only hosting
```

Visit `http://localhost:5000` to verify everything works.

### Step 3: Deploy to Firebase Hosting

Deploy the web app:

```bash
firebase deploy --only hosting
```

This will:
- Upload the `dist/` folder contents to Firebase Hosting
- Make your app available at your existing Firebase Hosting URLs:
  - `https://meepleup-951a1.web.app`
  - `https://meepleup-951a1.firebaseapp.com`

**Note:** Since you already have hosting configured, this should deploy directly without additional setup.

### Step 4: Add Custom Domain (meepleup.com) to Existing Hosting

Since you already have Firebase Hosting configured, you just need to add your custom domain:

1. **In Firebase Console:**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Navigate to **Hosting** in the left sidebar
   - You should see your existing domains: `meepleup-951a1.web.app` and `meepleup-951a1.firebaseapp.com`
   - Click **Add custom domain** button
   - Enter `meepleup.com` (and optionally `www.meepleup.com` as a separate domain)

2. **DNS Configuration:**
   - Firebase will provide DNS records you need to add
   - Go to your domain registrar (where you bought meepleup.com)
   - Add the DNS records Firebase provides:
     - Usually **A records** pointing to Firebase IP addresses (Firebase will show you the exact IPs)
     - Or sometimes **CNAME** records pointing to `meepleup-951a1.web.app`
   - **Important:** Firebase will tell you exactly which records to add - follow those instructions

3. **SSL Certificate:**
   - Firebase automatically provisions SSL certificates via Let's Encrypt
   - This usually takes a few minutes to a few hours after DNS is configured
   - You'll see a status indicator in Firebase Console showing "Provisioning" → "Active"
   - The domain will show as "Connected" when ready

4. **Verify Domain:**
   - Firebase may verify domain ownership (depends on your setup)
   - Follow any additional instructions shown in the Firebase Console

### Step 5: Verify Deployment

1. **Check Firebase Hosting URLs:**
   - Visit `https://meepleup-951a1.web.app`
   - Visit `https://meepleup-951a1.firebaseapp.com`
   - Verify the app loads correctly on both

2. **Check Custom Domain:**
   - Once DNS propagates (can take up to 48 hours, usually much faster)
   - Visit `https://meepleup.com`
   - Verify SSL certificate is active (green lock icon)

3. **Test Key Features:**
   - Authentication (sign up, sign in)
   - Navigation between pages
   - API calls to Firebase
   - Image loading

## Updating the Deployment

When you make changes and want to redeploy:

```bash
# 1. Build the updated app
npm run build:web

# 2. Deploy to Firebase
firebase deploy --only hosting
```

The deployment typically takes 1-2 minutes.

## Firebase Hosting Configuration

The hosting configuration is in `firebase.json`:

- **Public directory:** `dist` (where the built files are)
- **Rewrites:** All routes redirect to `index.html` (for React Router)
- **Caching:**
  - Static assets (JS, CSS, images): 1 year cache
  - HTML/JSON: No cache (always fresh)

## Troubleshooting

### Build Issues

**Problem:** `expo export` fails
- **Solution:** Make sure all dependencies are installed: `npm install`
- Check for TypeScript errors: `npm run type-check`

**Problem:** Missing files in `dist/`
- **Solution:** Clean and rebuild: `rm -rf dist && npm run build:web`

### Deployment Issues

**Problem:** `firebase deploy` fails with authentication error
- **Solution:** Re-login: `firebase login`

**Problem:** Domain not resolving
- **Solution:** 
  - Check DNS records are correct in your domain registrar
  - Wait for DNS propagation (can take up to 48 hours)
  - Use `dig meepleup.com` or `nslookup meepleup.com` to check DNS

**Problem:** SSL certificate not provisioning
- **Solution:**
  - Ensure DNS records are correct
  - Wait a few hours for Let's Encrypt to provision
  - Check Firebase Console for error messages

### Runtime Issues

**Problem:** App loads but shows blank page
- **Solution:**
  - Check browser console for JavaScript errors
  - Verify Firebase config environment variables are set
  - Check that `dist/index.html` has correct script paths

**Problem:** API calls failing
- **Solution:**
  - Verify Firebase project ID matches
  - Check Firestore security rules allow public reads (if needed)
  - Verify CORS settings if using external APIs

## Environment Variables

Make sure your Firebase configuration environment variables are set for production:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

These should be set in your build environment or CI/CD pipeline.

## Continuous Deployment (Optional)

You can set up automatic deployments using GitHub Actions or similar:

1. **GitHub Actions Example:**
   ```yaml
   name: Deploy to Firebase Hosting
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v2
         - uses: actions/setup-node@v2
         - run: npm install
         - run: npm run build:web
         - uses: FirebaseExtended/action-hosting-deploy@v0
           with:
             repoToken: '${{ secrets.GITHUB_TOKEN }}'
             firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
             channelId: live
             projectId: your-project-id
   ```

## Additional Resources

- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [Expo Web Export Documentation](https://docs.expo.dev/distribution/publishing-websites/)
- [Custom Domain Setup](https://firebase.google.com/docs/hosting/custom-domain)

## Quick Reference

```bash
# Build for web
npm run build:web

# Test locally
firebase serve --only hosting

# Deploy to Firebase
firebase deploy --only hosting

# Deploy everything (hosting + functions + rules)
firebase deploy
```

