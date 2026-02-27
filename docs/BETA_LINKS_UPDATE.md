# Updating Beta Links on Landing Page

This guide shows where to get your actual beta testing links and how to update them in `docs/index.html`.

## iOS TestFlight Link

### Getting Your TestFlight Link:

1. Go to https://appstoreconnect.apple.com/
2. Select your app → **TestFlight** tab
3. Choose **External Testing** or **Internal Testing**
4. Click on your testing group
5. Under **Public Link** section, click **Enable Public Link** (if not already enabled)
6. Copy the **Public Link URL** - it looks like:
   ```
   https://testflight.apple.com/join/XXXXXXXX
   ```

### Updating in index.html:

Find this line in `docs/index.html`:
```html
<a href="https://testflight.apple.com/join/YOUR_TESTFLIGHT_CODE" ...>
```

Replace `YOUR_TESTFLIGHT_CODE` with your actual TestFlight code (or replace the entire URL).

**Note**: The link must be a public TestFlight link. Internal TestFlight links require users to be manually added first.

## Android Google Play Beta Link

### Getting Your Google Play Internal Testing Link:

1. Go to https://play.google.com/console/
2. Select your app
3. Navigate to **Testing** → **Internal testing** (or Beta/Alpha)
4. Scroll down to **Testers** section
5. Under **How testers join your test**, you'll see:
   - **Email addresses**: Copy emails manually (for adding via API)
   - **Opt-in URL**: Copy this URL - it looks like:
     ```
     https://play.google.com/apps/internaltest/XXXXXXXXXXXXXXXX
     ```

### Updating in index.html:

Find this line in `docs/index.html`:
```html
<a href="https://play.google.com/apps/internaltest/YOUR_GOOGLE_PLAY_CODE" ...>
```

Replace `YOUR_GOOGLE_PLAY_CODE` with your actual Google Play testing code (or replace the entire URL).

## Alternative: Manual Email Addition

If you prefer to add testers manually instead of using public links:

1. Remove or comment out the beta button links
2. Keep only the email contact method:
   ```html
   <p class="beta-note">
     <strong>Want to join?</strong> Email us at 
     <a href="mailto:beta@meepleup.com" class="beta-email-link">beta@meepleup.com</a> 
     and we'll add you to the beta program.
   </p>
   ```
3. Use the automation scripts in `scripts/add-beta-testers.js` or Fastlane to add testers from emails

## Quick Update Script

You can quickly update the links using a simple find-and-replace:

```bash
# Update iOS TestFlight link
sed -i '' 's|https://testflight.apple.com/join/YOUR_TESTFLIGHT_CODE|https://testflight.apple.com/join/ACTUAL_CODE|g' docs/index.html

# Update Android Google Play link
sed -i '' 's|https://play.google.com/apps/internaltest/YOUR_GOOGLE_PLAY_CODE|https://play.google.com/apps/internaltest/ACTUAL_CODE|g' docs/index.html
```

Replace `ACTUAL_CODE` with your actual codes.




