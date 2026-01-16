# Android Internal Testing Setup Guide

This guide walks you through setting up Google Play Internal Testing for MeepleUp.

## Prerequisites

- ✅ Google Play Console account with app created
- ✅ App bundle (AAB) built with version code 25 or higher
- ✅ App signed with release keystore

## Step 1: Build Your App Bundle

Make sure you have a production AAB built:

```bash
eas build --platform android --profile production
```

This will create an AAB with:
- Version code: 25 (from `app.json`)
- Version name: 1.0.2
- Package: com.meepleup.app

## Step 2: Set Up Internal Testing in Google Play Console

### 2.1 Navigate to Internal Testing

1. Go to [Google Play Console](https://play.google.com/console/)
2. Select your app (MeepleUp)
3. In the left sidebar, click **Testing** → **Internal testing**

### 2.2 Create Your First Release

1. Click **Create new release** (or **Create release** if this is your first)
2. You'll see a form to upload your app bundle

### 2.3 Upload Your App Bundle

1. Click **Upload** in the "App bundles and APKs" section
2. Select your AAB file (the one built with `eas build`)
3. Wait for upload to complete
4. Google Play will show:
   - Version code: 25
   - Version name: 1.0.2
   - App size

### 2.4 Add Release Notes (Optional)

1. Scroll down to **Release notes**
2. Add notes for testers (e.g., "Initial beta release")
3. You can add notes in multiple languages

### 2.5 Review and Roll Out

1. Click **Review release** at the bottom
2. Review the summary:
   - App bundle version
   - Release notes
   - Any warnings
3. Click **Start rollout to Internal testing**
4. The release will be available immediately (no review needed for Internal Testing)

## Step 3: Get Your Opt-In URL

### 3.1 Navigate to Testers Section

1. Still in **Testing** → **Internal testing**
2. Scroll down to the **Testers** section
3. You'll see two options:
   - **Email addresses** (for manual addition)
   - **Opt-in URL** (for self-service)

### 3.2 Copy the Opt-In URL

1. Under **How testers join your test**, find **Opt-in URL**
2. Click **Copy link** or copy the URL manually
3. The URL looks like:
   ```
   https://play.google.com/apps/internaltest/XXXXXXXXXXXXXXXX
   ```

### 3.3 Test the URL

1. Open the URL in an incognito/private browser
2. You should see a page that says "Join the beta" or similar
3. Click to join (you'll need to be signed in with a Google account)

## Step 4: Update Your Landing Page

Update `docs/index.html` to include the opt-in URL. You have two options:

### Option A: Direct Link (Recommended)

Replace the email form with a direct link button:

```html
<a href="YOUR_OPT_IN_URL" class="web-app-button signup-button android-button" target="_blank">
  Join Android Beta Testing
</a>
```

### Option B: Keep Both (Email + Link)

Add the opt-in link as an alternative to the email form.

## Step 5: Test the Flow

1. Visit your landing page
2. Click the Android beta link
3. Sign in with a Google account
4. Accept the beta invitation
5. You should be redirected to Google Play Store
6. Install the app from Play Store

## Step 6: Managing Testers

### Add Testers Manually

1. Go to **Testing** → **Internal testing** → **Testers**
2. Click **Create email list** or use existing list
3. Add email addresses (up to 100 for Internal Testing)
4. Save

### View Testers

- Go to **Testers** section to see who has joined
- You can see join dates and status

## Step 7: Updating the App

When you need to release a new version:

1. **Increment version code** in `app.json`:
   ```json
   "android": {
     "versionCode": 26,  // Increment by 1
     ...
   }
   ```

2. **Build new AAB**:
   ```bash
   eas build --platform android --profile production
   ```

3. **Create new release** in Internal Testing:
   - Go to **Testing** → **Internal testing**
   - Click **Create new release**
   - Upload new AAB
   - Add release notes
   - **Review and rollout**

4. **Testers get automatic updates** via Play Store (no need to re-join)

## Troubleshooting

### "You can't rollout this release because it doesn't allow any existing users to upgrade"

- **Cause**: Version code is not higher than existing release
- **Fix**: Increment version code and rebuild

### "This release does not add or remove any app bundles"

- **Cause**: Trying to save without uploading a new bundle
- **Fix**: Make sure you've uploaded a new AAB with higher version code

### Opt-in URL not working

- **Check**: URL is correct and release is active
- **Check**: You're signed in with a Google account
- **Check**: Release has been rolled out (not just saved as draft)

### Testers can't see the app

- **Check**: They've clicked the opt-in URL and accepted
- **Check**: They're using the same Google account on their device
- **Check**: Release is active (not in draft)

## Best Practices

1. **Always increment version code** for each release
2. **Add release notes** so testers know what changed
3. **Test the opt-in URL** before sharing publicly
4. **Monitor crash reports** in Play Console
5. **Keep Internal Testing active** - testers get automatic updates

## Next Steps

- [ ] Build AAB with version code 25
- [ ] Upload to Internal Testing
- [ ] Get opt-in URL
- [ ] Update landing page with opt-in URL
- [ ] Test the flow end-to-end
- [ ] Share with beta testers

## Resources

- [Google Play Internal Testing Guide](https://support.google.com/googleplay/android-developer/answer/9845334)
- [App Bundle Format](https://developer.android.com/guide/app-bundle)
- [Version Codes](https://developer.android.com/studio/publish/versioning)

