# Fastlane Setup for iOS TestFlight Beta Testers

This guide walks you through setting up Fastlane to automatically add beta testers to iOS TestFlight.

## Prerequisites

1. **Fastlane installed**:
   ```bash
   # Check if Fastlane is installed
   fastlane --version
   
   # If not installed, install via Homebrew (macOS)
   brew install fastlane
   
   # Or via RubyGems
   sudo gem install fastlane
   ```

2. **App Store Connect account** with access to your app

3. **App Store Connect API Key** (recommended) OR Apple ID credentials (requires 2FA)

## Step 1: Create App Store Connect API Key (Recommended)

Using an API key is **highly recommended** because:
- ✅ No 2FA required
- ✅ More secure (can be revoked)
- ✅ Works in CI/CD environments
- ✅ No password storage needed

### Steps:

1. Go to https://appstoreconnect.apple.com/access/api
2. Click **"Generate API Key"** or **"+"** button
3. Give it a name (e.g., "Fastlane MeepleUp")
4. Select **"Admin"** or **"Developer"** role
5. Click **"Generate"**
6. **Important**: Download the `.p8` file immediately (you can only download it once!)
7. Note the **Key ID** and **Issuer ID** (shown on the page)

### Save Your Credentials:

```bash
# Create a directory for the API key (if it doesn't exist)
mkdir -p fastlane

# Move the downloaded .p8 file to fastlane directory
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 fastlane/AuthKey.p8

# Make sure it's in .gitignore (should already be)
echo "fastlane/AuthKey.p8" >> .gitignore
```

### Set Environment Variables:

Add these to your shell profile (`~/.zshrc` or `~/.bash_profile`):

```bash
# App Store Connect API Credentials
export APP_STORE_CONNECT_KEY_ID="YOUR_KEY_ID"
export APP_STORE_CONNECT_ISSUER_ID="YOUR_ISSUER_ID"
export APP_STORE_CONNECT_PRIVATE_KEY_PATH="./fastlane/AuthKey.p8"
```

Or create a `.env` file in your project root (make sure it's in `.gitignore`):

```bash
APP_STORE_CONNECT_KEY_ID=YOUR_KEY_ID
APP_STORE_CONNECT_ISSUER_ID=YOUR_ISSUER_ID
APP_STORE_CONNECT_PRIVATE_KEY_PATH=./fastlane/AuthKey.p8
```

Then load it:
```bash
source .env
```

## Step 2: Verify Fastlane Setup

```bash
# Navigate to project root
cd /path/to/MeepleUp

# Check Fastlane is working
fastlane --version

# Check if Fastfile is valid (it will show available lanes)
fastlane lanes
```

You should see lanes like:
- `add_ios_beta_tester`
- `add_ios_beta_testers`
- `list_beta_groups`
- `screenshots`
- `test`

## Step 3: Create TestFlight Beta Group (If Needed)

Before adding testers, make sure you have a beta group in TestFlight:

1. Go to https://appstoreconnect.apple.com/
2. Select your app → **TestFlight** tab
3. Click **"External Testing"** or **"Internal Testing"**
4. Click **"+ Group"** to create a new group (or use existing)
5. Name it (e.g., "External Testers" or "Beta Testers")
6. Add a build to the group (if you have one)

## Step 4: Add a Single Beta Tester

```bash
fastlane add_ios_beta_tester email:test@example.com
```

Or specify a different group:
```bash
fastlane add_ios_beta_tester email:test@example.com group_name:"Beta Testers"
```

## Step 5: Add Multiple Beta Testers from File

Create a file with email addresses (one per line):

```bash
# Create testers.txt
cat > testers.txt << EOF
test1@example.com
test2@example.com
test3@example.com
EOF
```

Then add them all:
```bash
fastlane add_ios_beta_testers file:testers.txt
```

Or with a specific group:
```bash
fastlane add_ios_beta_testers file:testers.txt group_name:"Beta Testers"
```

### CSV Format Support:

You can also use CSV format (Fastlane will use just the email):
```
test1@example.com,John,Doe
test2@example.com,Jane,Smith
test3@example.com
```

## Troubleshooting

### Error: "API key not found" or "Invalid API key"

- Check that `APP_STORE_CONNECT_KEY_ID` and `APP_STORE_CONNECT_ISSUER_ID` are set
- Verify the path to `AuthKey.p8` is correct
- Make sure the `.p8` file is readable: `ls -la fastlane/AuthKey.p8`

### Error: "App not found"

- Check your bundle ID in `fastlane/Appfile` matches your app exactly
- Verify your API key has access to the app

### Error: "Beta group not found"

- Make sure you've created a beta group in TestFlight first
- The group name must match exactly (case-sensitive)
- Check that the group has a build assigned to it

### Error: "Tester already exists"

- Fastlane will handle this gracefully (it's not an error)
- The tester will just be added to the group if they're not already in it

### Testing the API Key

You can test if your API key works:

```bash
# Try to list apps (requires additional implementation)
# Or just try adding a tester - if it works, your key is valid
fastlane add_ios_beta_tester email:your-email@example.com
```

## Alternative: Using Username/Password (Not Recommended)

If you must use username/password instead of API key:

1. Set environment variables:
   ```bash
   export APP_STORE_CONNECT_USERNAME="your-email@example.com"
   export APP_STORE_CONNECT_PASSWORD="your-app-specific-password"
   ```

2. You'll need an **app-specific password** (not your regular Apple ID password):
   - Go to https://appleid.apple.com/
   - Sign in → Security → App-Specific Passwords
   - Generate a new password for Fastlane

3. Update `Fastfile` to use username/password instead of API key

**Note**: This method requires 2FA and is less secure. API key is strongly recommended.

## Next Steps

Once Fastlane is set up, you can:

1. **Add testers from your landing page emails**: Create a script to extract emails from `beta@meepleup.com` and add them automatically
2. **Schedule automated additions**: Set up a cron job or webhook to add testers periodically
3. **Integrate with your backend**: Call Fastlane from your server when someone emails beta@meepleup.com

## Additional Resources

- [Fastlane Documentation](https://docs.fastlane.tools/)
- [App Store Connect API Documentation](https://developer.apple.com/app-store-connect/api/)
- [Fastlane TestFlight Actions](https://docs.fastlane.tools/actions/testflight/)

## Quick Reference

```bash
# Add single tester
fastlane add_ios_beta_tester email:test@example.com

# Add multiple testers from file
fastlane add_ios_beta_testers file:testers.txt

# List available lanes
fastlane lanes

# Get help for a specific lane
fastlane add_ios_beta_tester --help
```
