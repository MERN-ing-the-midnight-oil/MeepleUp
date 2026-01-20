# Fix: Switching from Internal Testing to Closed Testing

## The Problem

You're currently using **Internal Testing**, which has a 100 tester limit and requires explicit invitations. Even though you have an opt-in URL, Google Play may still check if users are in the tester list, causing the error:

> "App not available - your account hasn't yet been invited to participate in this app's internal testing program"

## Review Requirements Comparison

### Internal Testing ⭐ (No Review)
- ✅ **NO Google Play review required**
- ✅ Instant releases (available immediately)
- ❌ 100 tester limit
- ❌ Requires explicit invitations (even with opt-in URL)
- ❌ Users must be manually added or invited

### Closed Testing ⚠️ (Light Review)
- ✅ Unlimited testers
- ✅ Public opt-in URLs work for anyone
- ⚠️ **Policy compliance checks** (automated, not manual review like production)
- ⚠️ May require 12+ testers for 14+ days for **new developer accounts** (to qualify for production later)
- ⚠️ Automated checks for permissions, data safety, crashes
- ℹ️ **NOT full manual review** like production - mainly policy/quality checks

### Open Testing ⛔ (Full Review)
- ❌ Full review like production
- ❌ Can take days/weeks
- ❌ Publicly discoverable in Play Store

## The Solution Options

### Option A: Fix Internal Testing Opt-In URL (No Review) ⭐ RECOMMENDED

**You can stay with Internal Testing (no review) if you configure it correctly!**

The issue is that Internal Testing opt-in URLs require users to be in a **tester list**. Here's how to fix it:

1. Go to **Testing** → **Internal testing** → **Testers**
2. You should see two options:
   - **Email addresses** (lists)
   - **Opt-in URL**
3. **The opt-in URL should work WITHOUT email lists** - but you need to ensure:
   - The release is **active** (not draft)
   - You're using the **correct opt-in URL** from the Testers section
   - The URL is the one that shows when you click "Copy link" under "Opt-in URL"

**If the opt-in URL still doesn't work:**
- Internal Testing may require users to be in an email list even with opt-in URL
- Try creating a **Google Group** and adding it as a tester list (with unlimited members)
- Or use Option B (Closed Testing)

**Pros of Internal Testing:**
- ✅ NO review at all
- ✅ Instant releases
- ✅ Already set up

**Cons of Internal Testing:**
- ❌ 100 tester limit (hard limit)
- ❌ Opt-in URLs may require email list membership

### Option B: Switch to Closed Testing (Light Review)

If you want unlimited testers and guaranteed public opt-in URLs, Closed Testing has automated policy checks but NOT full manual review.

**Pros of Closed Testing:**
- ✅ Unlimited testers
- ✅ Public opt-in URLs work for anyone (guaranteed)
- ⚠️ Automated policy checks (NOT manual review like production)
- ⚠️ First release typically instant, subsequent releases usually quick

**Cons of Closed Testing:**
- ⚠️ Automated policy compliance checks (permissions, data safety, crashes)
- ⚠️ For new developer accounts: may need 12+ testers for 14+ days to qualify for production

## Recommendation

**If you want to avoid ALL review and you're under 100 testers:**
- Try fixing Internal Testing first (see Option A above)
- Make sure the opt-in URL is properly configured
- If Internal Testing opt-in still requires email lists, you're stuck with the 100 limit

**If you want unlimited testers:**
- **Closed Testing** is your only option
- The "review" is mostly automated policy/compliance checks, not manual review
- First release is typically instant (no delay)
- Subsequent releases are usually quick (automated checks, not manual review)

## Step-by-Step Migration

### Step 1: Set Up Closed Testing Track

1. Go to [Google Play Console](https://play.google.com/console/)
2. Select **MeepleUp**
3. In the left sidebar, click **Testing** → **Closed testing**
4. Click **Create new track** (or **Create**)
5. Give it a name, e.g., "Beta Testing" or "Public Beta"
6. Click **Create**

### Step 2: Create a Release in Closed Testing

1. Click on your newly created track (e.g., "Beta Testing")
2. Click **Create new release** (or **Create release**)
3. **Upload your AAB file** (same one you used for Internal Testing):
   - Click **Upload** in "App bundles and APKs"
   - Select your AAB file
   - Wait for upload to complete

4. **Add release notes**:
   - Scroll to **Release notes**
   - Add notes for testers (e.g., "Beta testing release")

5. **Review and rollout**:
   - Click **Review release**
   - Review the summary
   - Click **Start rollout to Closed testing**

### Step 3: Get Your Closed Testing Opt-In URL

1. Still in **Testing** → **Closed testing** → **[Your Track Name]**
2. Scroll to **Testers** section
3. Under **How testers join your test**, you'll see:
   - **Email addresses** (optional)
   - **Opt-in URL** ← **This is what you need!**
4. Click **Copy link** or copy the URL manually

The URL will look like:
```
https://play.google.com/apps/internaltest/XXXXXXXXXXXXXXXX
```

**Note:** Even though it says "internaltest" in the URL, this is actually the Closed Testing opt-in URL - it's just Google's URL format.

### Step 4: Test the New URL

1. Open the URL in an incognito/private browser
2. Sign in with a Google account (preferably one NOT already in your Internal Testing)
3. You should see "Join the beta" and be able to accept without errors
4. You should be redirected to Play Store to install

### Step 5: Update Your Landing Page

Update `docs/index.html` with the new Closed Testing opt-in URL:

1. Open `docs/index.html`
2. Find this line (around line 101):
   ```html
   <a href="https://play.google.com/apps/internaltest/4701636314391153737" ...>
   ```
3. Replace with your new Closed Testing URL:
   ```html
   <a href="YOUR_NEW_CLOSED_TESTING_URL" ...>
   ```

Also update the QR code URL in the same section (around line 103).

### Step 6: Deactivate Internal Testing (Optional)

Once Closed Testing is working and people can join:

1. Go to **Testing** → **Internal testing**
2. Find your active release
3. You can either:
   - Leave it active (harmless, but may confuse people)
   - Or create an empty release to disable it

**Note:** Testers already in Internal Testing will stay there. New testers will join via Closed Testing.

## Verification Checklist

- [ ] Closed Testing track created
- [ ] Release uploaded and rolled out
- [ ] Opt-in URL copied
- [ ] Tested the URL in incognito mode (works!)
- [ ] Landing page updated with new URL
- [ ] QR code updated with new URL
- [ ] Tested end-to-end: Click link → Join → Install

## Why This Fixes the Issue

**Internal Testing:**
- ❌ 100 tester limit
- ❌ Requires explicit invitations (even with opt-in URL)
- ❌ May check tester list before allowing access

**Closed Testing:**
- ✅ Unlimited testers
- ✅ Public opt-in URL works for anyone
- ✅ No invitation required - just the link!

## Future Releases

When you need to update the app:

1. Increment `versionCode` in `app.json`
2. Build new AAB: `eas build --platform android --profile production`
3. Create new release in **Closed Testing** (not Internal Testing)
4. Upload new AAB
5. Roll out release
6. Testers get automatic updates via Play Store

## Troubleshooting

**"Still getting the same error"**
- Make sure you're using the Closed Testing opt-in URL, not Internal Testing
- Verify the release is active (not in draft)
- Clear browser cache and try again
- Make sure you copied the URL from Closed Testing → Testers, not Internal Testing

**"Can't find Closed Testing"**
- Make sure you're in Google Play Console, not App Store Connect
- Look in left sidebar: Testing → Closed testing
- If you don't see it, make sure you have the right permissions

**"Testers still in Internal Testing"**
- That's fine! They can stay there
- New testers will join via Closed Testing
- Both tracks can run simultaneously

---

**Need help?** The key is making sure you're using the opt-in URL from **Closed Testing**, not Internal Testing!

