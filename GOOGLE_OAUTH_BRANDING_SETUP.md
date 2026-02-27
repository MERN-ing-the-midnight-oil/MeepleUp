# Google OAuth Branding & Security Setup

## Problems
1. When users click "Sign in with Google", they see: "You're signing back in to project- 177622732549" instead of "MeepleUp"
2. Security warning: "Your app is not configured to use secure OAuth flows and may be vulnerable to impersonation"

## Solution
Both issues are controlled by the OAuth consent screen configuration in Google Cloud Console, not in your code. You need to configure the app branding and security settings there.

## Steps to Fix

### 1. Go to Google Cloud Console
   - Navigate to: https://console.cloud.google.com/
   - Select your Firebase project (project-177622732549)

### 2. Open OAuth Consent Screen
   - Go to: **APIs & Services** → **OAuth consent screen**
   - Or direct link: https://console.cloud.google.com/apis/credentials/consent

### 3. Configure App Information (Fixes Branding Issue)
   - **App name**: Set to "MeepleUp"
   - **User support email**: Your support email (required)
   - **App logo**: Upload your app logo (optional but recommended)
   - **App domain**: Your app's domain (if applicable)
   - **Developer contact information**: Your email address (required)

### 4. Configure Scopes (Fixes Security Warning)
   - Click on **"Scopes"** tab or section
   - Make sure you only have the scopes you actually need:
     - `email` - User's email address
     - `profile` - User's basic profile information
   - Remove any unnecessary scopes
   - **Important**: Only request scopes that your app actually uses

### 5. Configure Authorized Domains (Fixes Security Warning)
   - In the OAuth consent screen, scroll to **"Authorized domains"**
   - Add your production domain (e.g., `meepleup.com` or your actual domain)
   - For Firebase projects, you can also add your Firebase auth domain
   - **Do NOT** add `localhost` or development domains here (only production)

### 6. Configure OAuth Client IDs (Fixes Security Warning)
   - Go to: **APIs & Services** → **Credentials**
   - Find your OAuth 2.0 Client IDs (you should have one for Web, iOS, and Android)
   - For **Web Client ID**:
     - Make sure **Authorized JavaScript origins** includes your production domain with HTTPS
     - Make sure **Authorized redirect URIs** includes your Firebase auth domain
     - Example: `https://your-project.firebaseapp.com/__/auth/handler`
   - For **iOS Client ID**:
     - Should be configured automatically via `GoogleService-Info.plist`
   - For **Android Client ID**:
     - Should be configured automatically via `google-services.json`

### 7. Important Notes
   - The custom app name will only display if your app has been **verified by Google**
   - For unverified apps, Google may still show the project ID
   - The security warning will disappear once:
     - All required fields are filled in
     - Scopes are properly configured
     - Authorized domains are set
     - OAuth client IDs have proper redirect URIs

### 8. For Firebase Projects
   - If you're using Firebase Authentication, the OAuth consent screen is automatically created
   - You still need to configure the branding and security settings in Google Cloud Console
   - Firebase uses secure OAuth flows by default (Authorization Code flow with PKCE)
   - The warning appears because the consent screen isn't fully configured, not because Firebase is insecure

## Verification Process (Optional but Recommended)

If you want the "MeepleUp" name to always show (even for unverified apps), you may need to:
1. Complete the OAuth consent screen configuration
2. Submit your app for verification (if using sensitive scopes)
3. Wait for Google's approval

For most apps, configuring the app name in the OAuth consent screen should be sufficient, even without full verification.

## Testing

After making changes:
1. Wait a few minutes for changes to propagate (can take up to 10 minutes)
2. Test the Google sign-in flow again
3. You should see "MeepleUp" instead of the project ID
4. The security warning should disappear from the OAuth consent screen

## Troubleshooting

### Security Warning Still Appears
- Make sure all required fields are filled (marked with *)
- Check that you've added authorized domains
- Verify that OAuth client IDs have proper redirect URIs configured
- Ensure you're not requesting unnecessary scopes

### App Name Still Shows Project ID
- The app name may take time to propagate
- For unverified apps, Google may still show the project ID in some contexts
- Consider submitting your app for verification if you need the name to always display

## Additional Resources

- [Google Cloud OAuth Consent Screen Documentation](https://support.google.com/cloud/answer/10311615)
- [OAuth App Branding Guide](https://support.google.com/cloud/answer/15549049)
- [OAuth 2.0 Security Best Practices](https://cloud.google.com/identity-platform/docs/oauth2-security-best-practices)


