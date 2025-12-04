# Email Notification Setup

To enable email notifications for game requests, you need to deploy a Cloud Function that handles email sending.

## Option 1: Firebase Cloud Function (Recommended)

### Step 1: Install Firebase Functions CLI

```bash
npm install -g firebase-tools
firebase login
firebase init functions
```

### Step 2: Create the Email Function

Create `functions/index.js`:

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// You'll need to install an email service package
// Option A: Using nodemailer with Gmail/SMTP
// npm install nodemailer
const nodemailer = require('nodemailer');

// Option B: Using SendGrid
// npm install @sendgrid/mail
// const sgMail = require('@sendgrid/mail');
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.sendGameRequestEmail = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { to, subject, gameName, interestedUserName, meepleUpName, groupId } = req.body;

    if (!to || !gameName || !interestedUserName) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Option A: Using nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail', // or your SMTP service
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      html: `
        <h2>Game Request</h2>
        <p>${interestedUserName} has requested that you bring <strong>${gameName}</strong> to ${meepleUpName}.</p>
        <p>You can view this request in the MeepleUp app.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    // Option B: Using SendGrid (alternative)
    // const msg = {
    //   to: to,
    //   from: process.env.SENDGRID_FROM_EMAIL,
    //   subject: subject,
    //   html: `...`,
    // };
    // await sgMail.send(msg);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});
```

### Step 3: Set Environment Variables

In Firebase Console or using CLI:

```bash
firebase functions:config:set email.user="your-email@gmail.com" email.password="your-app-password"
```

### Step 4: Deploy

```bash
firebase deploy --only functions
```

## Option 2: Use Firebase Extensions

Firebase has an "Email Trigger" extension that can send emails when documents are created:
1. Go to Firebase Console → Extensions
2. Install "Trigger Email" extension
3. Configure it to trigger on `users/{userId}/notifications/{notificationId}` where `type === 'game_interest'`

## Option 3: Third-Party Email Service API

You can also use services like:
- SendGrid
- Mailgun
- AWS SES
- Postmark

These typically require setting up API keys and calling their REST APIs from a Cloud Function.

## Testing

After deploying, test by:
1. Enabling email notifications in user preferences
2. Having someone request a game from your collection
3. Check your email inbox

## Current Implementation

The code in `src/utils/notifications.js` will attempt to call the Cloud Function at:
`https://us-central1-{projectId}.cloudfunctions.net/sendGameRequestEmail`

If the function doesn't exist, it will log a warning but still create the in-app notification.

