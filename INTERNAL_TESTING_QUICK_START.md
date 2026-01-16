# Internal Testing Quick Start Checklist

Follow these steps to set up Android Internal Testing:

## ✅ Step 1: Build Your App Bundle

```bash
eas build --platform android --profile production
```

**Verify:**
- [ ] Build completes successfully
- [ ] Version code is 25 (check `app.json`)
- [ ] Download the AAB file

## ✅ Step 2: Set Up Internal Testing in Play Console

1. Go to [Google Play Console](https://play.google.com/console/)
2. Select **MeepleUp** app
3. Navigate to **Testing** → **Internal testing**
4. Click **Create new release** (or **Create release**)

## ✅ Step 3: Upload Your AAB

1. Click **Upload** in "App bundles and APKs" section
2. Select your AAB file (from Step 1)
3. Wait for upload to complete
4. Verify version code shows **25**

## ✅ Step 4: Add Release Notes

1. Scroll to **Release notes**
2. Add: "Initial beta release" (or your notes)
3. Click **Save**

## ✅ Step 5: Roll Out the Release

1. Click **Review release**
2. Review the summary
3. Click **Start rollout to Internal testing**
4. Wait for confirmation

## ✅ Step 6: Get Your Opt-In URL

1. Still in **Testing** → **Internal testing**
2. Scroll to **Testers** section
3. Find **Opt-in URL**
4. Click **Copy link**
5. URL format: `https://play.google.com/apps/internaltest/XXXXXXXX`

## ✅ Step 7: Update Landing Page

1. Open `docs/index.html`
2. Find this line:
   ```html
   href="https://play.google.com/apps/internaltest/YOUR_OPT_IN_CODE"
   ```
3. Replace `YOUR_OPT_IN_CODE` with your actual code from Step 6
4. Save and deploy

## ✅ Step 8: Test the Flow

1. Visit your landing page
2. Click "🚀 Join Android Beta Testing"
3. Sign in with Google account
4. Accept beta invitation
5. Verify redirect to Play Store
6. Install app

## ✅ Step 9: Verify in Play Console

1. Go to **Testing** → **Internal testing** → **Testers**
2. You should see yourself listed as a tester
3. Check that release shows as "Active"

## 🎉 Done!

Your Internal Testing is now set up. Testers can:
- Click the link on your landing page
- Join automatically
- Get updates via Play Store

## Next Release Checklist

When you need to update:

1. [ ] Increment `versionCode` in `app.json` (e.g., 25 → 26)
2. [ ] Build new AAB: `eas build --platform android --profile production`
3. [ ] Create new release in Internal Testing
4. [ ] Upload new AAB
5. [ ] Add release notes
6. [ ] Roll out release
7. [ ] Testers get automatic updates!

## Troubleshooting

**Error: "doesn't allow any existing users to upgrade"**
- → Increment version code and rebuild

**Error: "doesn't add or remove any app bundles"**
- → Make sure you uploaded a new AAB with higher version code

**Opt-in URL not working**
- → Check release is active (not draft)
- → Verify URL is correct
- → Make sure you're signed in with Google account

---

**Need help?** See `ANDROID_INTERNAL_TESTING_SETUP.md` for detailed instructions.

