# Firebase Email Template Customization

## Problem
The default Firebase email verification subject line is "Verify your email for project-177622732549", which:
- Doesn't mention your app name (MeepleUp)
- Looks generic and can trigger spam filters
- Doesn't build brand recognition

## Solution: Customize Email Templates in Firebase Console

You can customize the email verification template (and other email templates) directly in the Firebase Console.

### Steps to Customize Email Verification Template

1. **Go to Firebase Console**
   - Navigate to [Firebase Console](https://console.firebase.google.com/)
   - Select your project: **meepleup-951a1** (or your project ID)

2. **Navigate to Authentication Settings**
   - In the left sidebar, click **Authentication**
   - Click on the **Templates** tab (or look for "Email templates" in the settings)

3. **Edit Email Verification Template**
   - Find the **Email address verification** template
   - Click **Edit** or the pencil icon

4. **Customize the Subject Line**
   - Change the subject from:
     ```
     Verify your email for {{PROJECT_ID}}
     ```
   - To something like:
     ```
     Verify your email for MeepleUp
     ```
   - Or even better:
     ```
     Welcome to MeepleUp - Verify Your Email
     ```

5. **Customize the Email Body (Optional but Recommended)**
   - You can also customize the email body to:
     - Include your app name prominently
     - Add branding
     - Make it more personal and less spam-like
     - Include a friendly message

   Example body customization:
   ```
   Welcome to MeepleUp! 

   Please verify your email address by clicking the link below:
   
   {{LINK}}
   
   If you didn't create a MeepleUp account, you can safely ignore this email.
   
   Thanks,
   The MeepleUp Team
   ```

6. **Save Changes**
   - Click **Save** or **Update**
   - Changes take effect immediately for all new verification emails

### Additional Email Templates to Customize

While you're there, consider customizing these other templates:

1. **Password Reset Email**
   - Subject: "Reset your MeepleUp password"
   - Helps users recognize legitimate password reset emails

2. **Email Change Verification**
   - Subject: "Verify your new email for MeepleUp"
   - For when users change their email address

3. **Email Change (Old Address)**
   - Subject: "Your MeepleUp email address was changed"
   - Security notification when email is changed

### Best Practices for Email Templates

1. **Include Your App Name**
   - Always mention "MeepleUp" in the subject line
   - Helps with brand recognition and reduces spam filtering

2. **Clear Call-to-Action**
   - Make it obvious what the user needs to do
   - Use clear button text like "Verify Email" or "Reset Password"

3. **Professional Tone**
   - Keep it friendly but professional
   - Match your app's brand voice

4. **Security Information**
   - Include a note about ignoring the email if they didn't request it
   - Helps users identify phishing attempts

5. **Test Your Changes**
   - After updating templates, test by:
     - Creating a new test account
     - Requesting a password reset
     - Verifying the emails look correct and don't go to spam

### Variables Available in Templates

Firebase provides these variables you can use in templates:
- `{{PROJECT_ID}}` - Your Firebase project ID
- `{{LINK}}` - The verification/reset link (required)
- `{{EMAIL}}` - The user's email address
- `{{DISPLAY_NAME}}` - The user's display name (if set)

### Note on Spam Prevention

To further reduce spam filtering:
1. **Set up SPF/DKIM records** (if using custom domain)
2. **Use a custom "from" address** (requires domain verification)
3. **Keep subject lines clear and professional**
4. **Avoid spam trigger words** (FREE, URGENT, etc.)
5. **Test with multiple email providers** (Gmail, Outlook, Yahoo, etc.)

### Current Implementation

Your code in `src/context/AuthContext.jsx` calls:
```javascript
await credential.user.sendEmailVerification();
```

This uses Firebase's email service, so the template customization in the console will automatically apply to all verification emails sent from your app.

