# Email Setup for Beta Welcome Emails

## Quick Setup with Gmail

### Step 1: Enable Gmail App Password
1. Go to your Google Account: https://myaccount.google.com/
2. Click **Security** → **2-Step Verification** (enable if not already)
3. Go to **App passwords**: https://myaccount.google.com/apppasswords
4. Select **Mail** and **Other (Custom name)**: "MeepleUp Cloud Functions"
5. Click **Generate**
6. **Copy the 16-character password** (you'll need this)

### Step 2: Configure Firebase Functions
Replace `your-email@gmail.com` with your Gmail address and `your-app-password` with the 16-character app password:

```bash
cd /Users/rhyssmoker/bootcamp/MeepleUp

firebase functions:config:set smtp.host="smtp.gmail.com"
firebase functions:config:set smtp.port="587"
firebase functions:config:set smtp.secure="false"
firebase functions:config:set smtp.user="your-email@gmail.com"
firebase functions:config:set smtp.pass="your-app-password"
```

### Step 3: Deploy the Function
```bash
cd functions
firebase deploy --only functions:sendIOSBetaWelcomeEmail
```

## Test It

1. Submit a test signup on the landing page with your email
2. Check your inbox (and spam folder) for the welcome email
3. Check Firebase Functions logs: `firebase functions:log`

## Alternative: SendGrid (Production)

For production, consider SendGrid (free tier: 100 emails/day):

1. Sign up at https://sendgrid.com
2. Create an API key
3. Use SendGrid SMTP:
   ```bash
   firebase functions:config:set smtp.host="smtp.sendgrid.net"
   firebase functions:config:set smtp.port="587"
   firebase functions:config:set smtp.user="apikey"
   firebase functions:config:set smtp.pass="your-sendgrid-api-key"
   ```

## Verify Configuration

Check your config:
```bash
firebase functions:config:get
```

## Troubleshooting

- **Emails not sending?** Check Firebase Functions logs: `firebase functions:log`
- **Gmail blocking?** Make sure you're using an App Password, not your regular password
- **Function not triggered?** Verify the document is being created in `betaSignups` collection with `platforms: ['ios']`





