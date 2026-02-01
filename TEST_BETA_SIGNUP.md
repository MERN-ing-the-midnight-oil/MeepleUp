# Testing Beta Signup Flow

## Quick Test Checklist

### 1. Test Form Submission (Frontend)
- [ ] Open landing page at `http://localhost:8081/index.html`
- [ ] Open browser DevTools (F12) → Console tab
- [ ] Enter test email in iOS form
- [ ] Click "Beta Test on iOS App Store"
- [ ] Verify: Success message appears
- [ ] Verify: No errors in browser console

### 2. Verify Firestore Entry
- [ ] Go to [Firebase Console](https://console.firebase.google.com/project/meepleup-951a1/firestore)
- [ ] Navigate to `betaSignups` collection
- [ ] Find your test email document
- [ ] Verify fields:
  - `email`: Your test email
  - `platforms`: `['ios']`
  - `status`: `'pending'`
  - `source`: `'cascade_con_2026'`
  - `signupDate`: Recent timestamp

### 3. Test Processing Script
```bash
# List pending signups
node scripts/process-beta-signups.js

# Expected output: Shows your test email with status 'pending'
```

### 4. Test Export
```bash
# Export to file
node scripts/process-beta-signups.js --export

# Expected: Creates testers-ios.txt file with email addresses
```

### 5. Test Adding to TestFlight (Optional - requires Fastlane)
```bash
# Set environment variables
export APP_STORE_CONNECT_KEY_ID="4H83DR5N6N"
export APP_STORE_CONNECT_ISSUER_ID="bd6fdb18-f6ac-4296-b842-28ba1a1a5ce7"
export APP_STORE_CONNECT_PRIVATE_KEY_PATH="/Users/rhyssmoker/bootcamp/MeepleUp/fastlane/AuthKey.p8"

# Add testers
node scripts/process-beta-signups.js --add-ios

# Expected: Adds tester to TestFlight group "Good Meeples Beta Testers"
# Status changes from 'pending' to 'invited'
```

## Common Issues

### Form doesn't submit
- Check browser console for Firebase errors
- Verify Firebase config in `index.html` is correct
- Check Firestore rules allow creating `betaSignups`

### Script can't find signups
- Verify Firebase service account JSON exists at project root
- Check Firestore collection name matches: `betaSignups`
- Verify status field is exactly `'pending'` (case-sensitive)

### Fastlane fails
- Verify `AuthKey.p8` exists in `fastlane/` directory
- Check environment variables are set correctly
- Verify App Store Connect API key has correct permissions
- Check bundle ID matches: `com.rhyssmoker.meepleup`

## Status Flow

1. **pending** → User submits form
2. **invited** → After running `--add-ios` script
3. **added** → (Future) After user accepts TestFlight invite









