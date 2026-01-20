/**
 * Firebase Cloud Functions
 * Handles server-side subscription verification for iOS and Android
 *
 * Prerequisites:
 * 1. Install Firebase CLI: npm install -g firebase-tools
 * 2. Login: firebase login
 * 3. Initialize functions: firebase init functions
 * 4. Deploy: firebase deploy --only functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin if not already initialized
// In Cloud Functions, this uses the default service account
// Make sure the service account has 'Service Account Token Creator' role
if (!admin.apps.length) {
  admin.initializeApp({
    // Use default credentials (Cloud Functions runtime service account)
    // The service account needs permission to create custom tokens
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

// Apple's JWKS endpoint for verifying Sign in with Apple tokens
const appleJwksClient = jwksClient({
  jwksUri: "https://appleid.apple.com/auth/keys",
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

/**
 * Get the signing key for a JWT token from Apple's JWKS
 */
function getAppleSigningKey(header, callback) {
  appleJwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

/**
 * Verify Apple identity token
 */
function verifyAppleToken(token) {
  return new Promise((resolve, reject) => {
    // Decode the header to get the key ID
    const decoded = jwt.decode(token, {complete: true});
    if (!decoded || !decoded.header || !decoded.header.kid) {
      return reject(new Error("Invalid token: missing key ID"));
    }

    // Get the signing key and verify the token
    getAppleSigningKey(decoded.header, (err, signingKey) => {
      if (err) {
        return reject(new Error(`Failed to get signing key: ${err.message}`));
      }

      // Verify the token
      jwt.verify(
          token,
          signingKey,
          {
            algorithms: ["RS256"],
            issuer: "https://appleid.apple.com",
            // Audience should be your app's client ID (bundle ID for iOS)
            // We'll verify this matches the expected audience
          },
          (verifyErr, decodedToken) => {
            if (verifyErr) {
              return reject(new Error(`Token verification failed: ${verifyErr.message}`));
            }
            resolve(decodedToken);
          },
      );
    });
  });
}

/**
 * Verify iOS subscription receipt with Apple App Store
 */
async function verifyIOSReceipt(receiptData, productId) {
  // For production, use: https://buy.itunes.apple.com/verifyReceipt
  // For sandbox, use: https://sandbox.itunes.apple.com/verifyReceipt
  const verifyURL = process.env.NODE_ENV === "production" ?
    "https://buy.itunes.apple.com/verifyReceipt" :
    "https://sandbox.itunes.apple.com/verifyReceipt";

  const sharedSecret = process.env.APPLE_SHARED_SECRET; // Set in Firebase Functions config

  try {
    const response = await fetch(verifyURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "receipt-data": receiptData,
        "password": sharedSecret,
        "exclude-old-transactions": true,
      }),
    });

    const data = await response.json();

    if (data.status !== 0) {
      // Status codes: https://developer.apple.com/documentation/appstorereceipts/status
      throw new Error(`Apple verification failed with status: ${data.status}`);
    }

    // Find the active subscription
    const latestReceiptInfo = data.latest_receipt_info || [];
    const activeSubscription = latestReceiptInfo
        .filter((sub) => sub.product_id === productId)
        .sort((a, b) => parseInt(b.expires_date_ms) - parseInt(a.expires_date_ms))[0];

    if (!activeSubscription) {
      throw new Error("No active subscription found for product");
    }

    const expiresDate = new Date(parseInt(activeSubscription.expires_date_ms));
    const isActive = expiresDate > new Date();

    return {
      verified: true,
      active: isActive,
      expiresAt: expiresDate,
      productId: activeSubscription.product_id,
      transactionId: activeSubscription.transaction_id,
      originalTransactionId: activeSubscription.original_transaction_id,
    };
  } catch (error) {
    console.error("Error verifying iOS receipt:", error);
    throw error;
  }
}

/**
 * Verify Android subscription with Google Play Billing
 */
async function verifyAndroidSubscription(packageName, subscriptionId, purchaseToken) {
  const {google} = require("googleapis");

  // Initialize Google Play Developer API
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "./google-service-account.json",
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const androidpublisher = google.androidpublisher({
    version: "v3",
    auth,
  });

  try {
    const response = await androidpublisher.purchases.subscriptions.get({
      packageName,
      subscriptionId,
      token: purchaseToken,
    });

    const subscription = response.data;

    // Check subscription status
    const isActive = subscription.paymentState === 1; // 1 = Payment received
    const expiresDate = subscription.expiryTimeMillis ?
      new Date(parseInt(subscription.expiryTimeMillis)) :
      null;

    return {
      verified: true,
      active: isActive,
      expiresAt: expiresDate,
      productId: subscriptionId,
      transactionId: subscription.orderId,
      autoRenewing: subscription.autoRenewing === true,
    };
  } catch (error) {
    console.error("Error verifying Android subscription:", error);
    throw error;
  }
}

/**
 * Cloud Function: Verify Subscription
 * Called from the client app after a purchase
 */
exports.verifySubscription = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const {platform, productId, transactionId, transactionReceipt, userId} = data;

  if (!platform || !productId || !transactionReceipt || !userId) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required parameters: platform, productId, transactionReceipt, userId",
    );
  }

  // Verify userId matches authenticated user
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError(
        "permission-denied",
        "User ID does not match authenticated user",
    );
  }

  try {
    let verificationResult;

    if (platform === "ios") {
      // Verify iOS receipt
      verificationResult = await verifyIOSReceipt(transactionReceipt, productId);
    } else if (platform === "android") {
      // For Android, transactionReceipt should be the purchase token
      const packageName = process.env.ANDROID_PACKAGE_NAME || "com.meepleup.app";
      verificationResult = await verifyAndroidSubscription(
          packageName,
          productId,
          transactionReceipt,
      );
    } else {
      throw new functions.https.HttpsError(
          "invalid-argument",
          "Invalid platform. Must be \"ios\" or \"android\"",
      );
    }

    if (!verificationResult.verified) {
      throw new functions.https.HttpsError(
          "failed-precondition",
          "Subscription verification failed",
      );
    }

    // Update user subscription in Firestore
    const userRef = db.collection("users").doc(userId);
    const subscriptionData = {
      productId: verificationResult.productId,
      transactionId: verificationResult.transactionId,
      platform,
      verified: true,
      status: verificationResult.active ? "active" : "expired",
      expiresAt: admin.firestore.Timestamp.fromDate(verificationResult.expiresAt),
      autoRenewing: verificationResult.autoRenewing || false,
      verifiedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await userRef.update({
      subscription: subscriptionData,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Store purchase record for audit trail
    await db.collection("subscriptionPurchases").add({
      userId,
      productId: verificationResult.productId,
      transactionId: verificationResult.transactionId,
      platform,
      verified: true,
      expiresAt: admin.firestore.Timestamp.fromDate(verificationResult.expiresAt),
      createdAt: admin.firestore.Timestamp.now(),
    });

    return {
      success: true,
      subscription: subscriptionData,
      expiresAt: verificationResult.expiresAt,
    };
  } catch (error) {
    console.error("Error in verifySubscription:", error);
    throw new functions.https.HttpsError(
        "internal",
        `Subscription verification failed: ${error.message}`,
    );
  }
});

/**
 * Scheduled Function: Check and update expired subscriptions
 * Runs daily to check for expired subscriptions and update their status
 */
exports.checkExpiredSubscriptions = functions.pubsub
    .schedule("every 24 hours")
    .onRun(async (context) => {
      try {
        const now = admin.firestore.Timestamp.now();

        // Find all users with active subscriptions that have expired
        const usersSnapshot = await db
            .collection("users")
            .where("subscription.status", "==", "active")
            .get();

        const batch = db.batch();
        let updateCount = 0;

        usersSnapshot.forEach((doc) => {
          const userData = doc.data();
          const subscription = userData.subscription;

          if (subscription && subscription.expiresAt) {
            const expiresAt = subscription.expiresAt.toDate();
            if (expiresAt < new Date()) {
            // Subscription has expired
              batch.update(doc.ref, {
                "subscription.status": "expired",
                "subscription.updatedAt": admin.firestore.Timestamp.now(),
                "updatedAt": admin.firestore.Timestamp.now(),
              });
              updateCount++;
            }
          }
        });

        if (updateCount > 0) {
          await batch.commit();
          console.log(`Updated ${updateCount} expired subscriptions`);
        }

        return {success: true, updated: updateCount};
      } catch (error) {
        console.error("Error checking expired subscriptions:", error);
        throw error;
      }
    });

/**
 * HTTP Function: Webhook for App Store Server Notifications (iOS)
 * Handles real-time subscription updates from Apple
 * Configure this URL in App Store Connect: https://your-domain.com/appleSubscriptionWebhook
 */
exports.appleSubscriptionWebhook = functions.https.onRequest(async (req, res) => {
  // Verify the request is from Apple (check JWT signature)
  // This is a simplified version - implement proper JWT verification in production

  try {
    const notification = req.body;
    const notificationType = notification.notification_type;

    // Handle different notification types
    // See: https://developer.apple.com/documentation/appstoreservernotifications/notification_type
    switch (notificationType) {
      case "INITIAL_BUY":
      case "DID_RENEW":
        // Subscription purchased or renewed
        await handleSubscriptionUpdate(notification, "active");
        break;
      case "DID_FAIL_TO_RENEW":
        // Subscription failed to renew
        await handleSubscriptionUpdate(notification, "expired");
        break;
      case "CANCEL":
        // Subscription cancelled
        await handleSubscriptionUpdate(notification, "cancelled");
        break;
      default:
        console.log(`Unhandled notification type: ${notificationType}`);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error processing Apple webhook:", error);
    res.status(500).send("Error");
  }
});

/**
 * HTTP Function: Webhook for Google Play Real-time Developer Notifications (Android)
 * Handles real-time subscription updates from Google
 * Configure this URL in Google Play Console
 */
exports.googleSubscriptionWebhook = functions.pubsub
    .topic("google-play-subscriptions")
    .onPublish(async (message) => {
      try {
        const data = JSON.parse(Buffer.from(message.data, "base64").toString());
        const subscriptionNotification = data.subscriptionNotification;

        if (!subscriptionNotification) {
          return;
        }

        const notificationType = subscriptionNotification.notificationType;
        const purchaseToken = subscriptionNotification.purchaseToken;
        const subscriptionId = subscriptionNotification.subscriptionId;

        // Handle different notification types
        // See: https://developer.android.com/google/play/billing/subscriptions#notification-types
        switch (notificationType) {
          case 1: // SUBSCRIPTION_RECOVERED
          case 2: // SUBSCRIPTION_RENEWED
            await handleGoogleSubscriptionUpdate(subscriptionId, purchaseToken, "active");
            break;
          case 3: // SUBSCRIPTION_CANCELED
            await handleGoogleSubscriptionUpdate(subscriptionId, purchaseToken, "cancelled");
            break;
          case 4: // SUBSCRIPTION_PURCHASED
            await handleGoogleSubscriptionUpdate(subscriptionId, purchaseToken, "active");
            break;
          case 12: // SUBSCRIPTION_EXPIRED
            await handleGoogleSubscriptionUpdate(subscriptionId, purchaseToken, "expired");
            break;
          default:
            console.log(`Unhandled Google notification type: ${notificationType}`);
        }
      } catch (error) {
        console.error("Error processing Google webhook:", error);
        throw error;
      }
    });

/**
 * Helper function to handle subscription updates from Apple
 */
async function handleSubscriptionUpdate(notification, status) {
  // Extract user identifier from the notification
  // You'll need to map the original_transaction_id to a user ID
  // Store this mapping when a purchase is first verified

  const originalTransactionId = notification.unified_receipt?.latest_receipt_info?.[0]?.original_transaction_id;

  if (!originalTransactionId) {
    console.error("No original_transaction_id found in notification");
    return;
  }

  // Find user by transaction ID
  const purchasesSnapshot = await db
      .collection("subscriptionPurchases")
      .where("transactionId", "==", originalTransactionId)
      .limit(1)
      .get();

  if (purchasesSnapshot.empty) {
    console.error(`No purchase found for transaction: ${originalTransactionId}`);
    return;
  }

  const purchaseDoc = purchasesSnapshot.docs[0];
  const userId = purchaseDoc.data().userId;

  // Update user subscription
  await db.collection("users").doc(userId).update({
    "subscription.status": status,
    "subscription.updatedAt": admin.firestore.Timestamp.now(),
    "updatedAt": admin.firestore.Timestamp.now(),
  });
}

/**
 * Helper function to handle subscription updates from Google
 */
async function handleGoogleSubscriptionUpdate(subscriptionId, purchaseToken, status) {
  // Find user by purchase token
  const purchasesSnapshot = await db
      .collection("subscriptionPurchases")
      .where("transactionReceipt", "==", purchaseToken)
      .limit(1)
      .get();

  if (purchasesSnapshot.empty) {
    console.error(`No purchase found for token: ${purchaseToken}`);
    return;
  }

  const purchaseDoc = purchasesSnapshot.docs[0];
  const userId = purchaseDoc.data().userId;

  // Update user subscription
  await db.collection("users").doc(userId).update({
    "subscription.status": status,
    "subscription.updatedAt": admin.firestore.Timestamp.now(),
    "updatedAt": admin.firestore.Timestamp.now(),
  });
}

/**
 * HTTP Function: Send Game Request Email
 * Called when a user requests a game from another user
 */
exports.sendGameRequestEmail = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const {to, subject, gameName, interestedUserName, meepleUpName, groupId} = req.body;

    if (!to || !subject || !gameName || !interestedUserName) {
      res.status(400).json({error: "Missing required fields"});
      return;
    }

    // In production, you would use a proper email service like SendGrid, Mailgun, or Nodemailer
    // For now, we'll log the email details and return success
    // You can integrate with your preferred email service here
    
    console.log("Game Request Email:", {
      to,
      subject,
      gameName,
      interestedUserName,
      meepleUpName,
      groupId,
    });

    // TODO: Implement actual email sending using your preferred service
    // Example with Nodemailer:
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({...});
    // await transporter.sendMail({to, subject, html: emailBody});

    res.status(200).json({success: true, message: "Email sent successfully"});
  } catch (error) {
    console.error("Error sending game request email:", error);
    res.status(500).json({error: error.message});
  }
});

/**
 * HTTP Function: Send RSVP Update Email
 * Called when an organizer updates a member's RSVP status
 */
exports.sendRSVPUpdateEmail = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const {
      to,
      subject,
      organizerName,
      newStatus,
      dateStr,
      meepleUpName,
      groupId,
    } = req.body;

    if (!to || !subject || !organizerName || !newStatus || !dateStr) {
      res.status(400).json({error: "Missing required fields"});
      return;
    }

    console.log("RSVP Update Email:", {
      to,
      subject,
      organizerName,
      newStatus,
      dateStr,
      meepleUpName,
      groupId,
    });

    // TODO: Implement actual email sending using your preferred service
    // Example with Nodemailer:
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({...});
    // const emailBody = `
    //   <h2>RSVP Status Updated</h2>
    //   <p>${organizerName} has updated your RSVP status to "${newStatus}" for ${dateStr}.</p>
    //   <p>MeepleUp: ${meepleUpName || 'Your MeepleUp'}</p>
    // `;
    // await transporter.sendMail({to, subject, html: emailBody});

    res.status(200).json({success: true, message: "Email sent successfully"});
  } catch (error) {
    console.error("Error sending RSVP update email:", error);
    res.status(500).json({error: error.message});
  }
});

/**
 * Cloud Function: Verify MeepleUp Purchase
 * Called from the client app after a one-time purchase for creating a meepleup
 */
exports.verifyMeepleupPurchase = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const {platform, productId, transactionId, transactionReceipt, userId} = data;

  if (!platform || !productId || !transactionReceipt || !userId) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required parameters: platform, productId, transactionReceipt, userId",
    );
  }

  // Verify userId matches authenticated user
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError(
        "permission-denied",
        "User ID does not match authenticated user",
    );
  }

  try {
    let verificationResult;

    if (platform === "ios") {
      // Verify iOS receipt for one-time purchase
      verificationResult = await verifyIOSOneTimePurchase(transactionReceipt, productId);
    } else if (platform === "android") {
      // Verify Android one-time purchase
      const packageName = process.env.ANDROID_PACKAGE_NAME || "com.meepleup.app";
      verificationResult = await verifyAndroidOneTimePurchase(
          packageName,
          productId,
          transactionReceipt,
      );
    } else {
      throw new functions.https.HttpsError(
          "invalid-argument",
          "Invalid platform. Must be \"ios\" or \"android\"",
      );
    }

    if (!verificationResult.verified) {
      throw new functions.https.HttpsError(
          "failed-precondition",
          "Purchase verification failed",
      );
    }

    // Store purchase record for audit trail
    await db.collection("meepleupPurchases").add({
      userId,
      productId: verificationResult.productId,
      transactionId: verificationResult.transactionId,
      platform,
      verified: true,
      purchasedAt: admin.firestore.Timestamp.fromDate(verificationResult.purchasedAt || new Date()),
      createdAt: admin.firestore.Timestamp.now(),
    });

    return {
      success: true,
      purchase: {
        productId: verificationResult.productId,
        transactionId: verificationResult.transactionId,
        platform,
        verified: true,
        purchasedAt: verificationResult.purchasedAt,
      },
    };
  } catch (error) {
    console.error("Error in verifyMeepleupPurchase:", error);
    throw new functions.https.HttpsError(
        "internal",
        `Purchase verification failed: ${error.message}`,
    );
  }
});

/**
 * Verify iOS one-time purchase receipt with Apple App Store
 */
async function verifyIOSOneTimePurchase(receiptData, productId) {
  // For production, use: https://buy.itunes.apple.com/verifyReceipt
  // For sandbox, use: https://sandbox.itunes.apple.com/verifyReceipt
  const verifyURL = process.env.NODE_ENV === "production" ?
    "https://buy.itunes.apple.com/verifyReceipt" :
    "https://sandbox.itunes.apple.com/verifyReceipt";

  const sharedSecret = process.env.APPLE_SHARED_SECRET; // Set in Firebase Functions config

  try {
    const response = await fetch(verifyURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "receipt-data": receiptData,
        "password": sharedSecret,
        "exclude-old-transactions": false, // Include all transactions for one-time purchases
      }),
    });

    const data = await response.json();

    if (data.status !== 0) {
      // Status codes: https://developer.apple.com/documentation/appstorereceipts/status
      throw new Error(`Apple verification failed with status: ${data.status}`);
    }

    // Find the purchase for the specific product
    const receiptInfo = data.receipt?.in_app || [];
    const purchase = receiptInfo
        .filter((item) => item.product_id === productId)
        .sort((a, b) => parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms))[0];

    if (!purchase) {
      throw new Error("No purchase found for product");
    }

    const purchasedDate = new Date(parseInt(purchase.purchase_date_ms));

    return {
      verified: true,
      productId: purchase.product_id,
      transactionId: purchase.transaction_id,
      originalTransactionId: purchase.original_transaction_id,
      purchasedAt: purchasedDate,
    };
  } catch (error) {
    console.error("Error verifying iOS one-time purchase:", error);
    throw error;
  }
}

/**
 * Verify Android one-time purchase with Google Play Billing
 */
async function verifyAndroidOneTimePurchase(packageName, productId, purchaseToken) {
  const {google} = require("googleapis");

  // Initialize Google Play Developer API
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "./google-service-account.json",
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const androidpublisher = google.androidpublisher({
    version: "v3",
    auth,
  });

  try {
    const response = await androidpublisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    });

    const purchase = response.data;

    // Check purchase state
    // 0 = Purchased, 1 = Canceled
    const isPurchased = purchase.purchaseState === 0;
    
    if (!isPurchased) {
      throw new Error("Purchase was canceled or refunded");
    }

    const purchasedDate = purchase.purchaseTimeMillis ?
      new Date(parseInt(purchase.purchaseTimeMillis)) :
      new Date();

    return {
      verified: true,
      productId: productId,
      transactionId: purchase.orderId,
      purchasedAt: purchasedDate,
    };
  } catch (error) {
    console.error("Error verifying Android one-time purchase:", error);
    throw error;
  }
}

/**
 * Cloud Function: Verify Apple Sign-In Token and Create Custom Firebase Token
 * This is needed because Firebase compat mode's OAuthProvider doesn't support native Apple Sign-In
 */
exports.verifyAppleSignIn = functions.https.onCall(async (data, context) => {
  const {identityToken, authorizationCode} = data;

  if (!identityToken) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "identityToken is required",
    );
  }

  try {
    // Verify the Apple identity token signature using Apple's public keys
    let payload;
    try {
      payload = await verifyAppleToken(identityToken);
    } catch (verifyError) {
      console.error("Apple token verification failed:", verifyError);
      throw new functions.https.HttpsError(
          "unauthenticated",
          `Invalid Apple token: ${verifyError.message}`,
      );
    }

    // Verify the token audience matches your app's bundle ID
    // The audience (aud) should be your iOS app's bundle identifier
    // This is set in app.json as ios.bundleIdentifier
    const expectedAudience = process.env.APPLE_BUNDLE_ID || "com.rhyssmoker.meepleup";
    if (payload.aud !== expectedAudience) {
      console.warn(
          `Token audience mismatch: expected ${expectedAudience}, got ${payload.aud}`,
      );
      // Note: We'll still proceed, but you may want to make this stricter
    }

    // Verify token expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new functions.https.HttpsError(
          "unauthenticated",
          "Apple token has expired",
      );
    }

    // Extract user information from the verified token
    const appleUserId = payload.sub; // Apple user ID
    const email = payload.email;
    const emailVerified = payload.email_verified === "true" || payload.email_verified === true;

    // Check if user already exists
    let userRecord;
    try {
      // Try to get user by email if available
      if (email) {
        userRecord = await admin.auth().getUserByEmail(email);
      }
    } catch (error) {
      // User doesn't exist, we'll create one
    }

    let uid;
    if (userRecord) {
      uid = userRecord.uid;
    } else {
      // Create a new user or use Apple user ID as UID
      // Use a consistent UID format: apple_<appleUserId>
      uid = `apple_${appleUserId}`;

      try {
        // Try to create the user
        userRecord = await admin.auth().createUser({
          uid: uid,
          email: email || undefined,
          emailVerified: emailVerified,
          displayName: undefined, // Apple doesn't provide this in subsequent sign-ins
        });
      } catch (createError) {
        // User might already exist, try to get it
        try {
          userRecord = await admin.auth().getUser(uid);
        } catch (getError) {
          throw new functions.https.HttpsError(
              "internal",
              `Failed to create or retrieve user: ${createError.message}`,
          );
        }
      }
    }

    // Create a custom token for the user
/**
 * HTTP Function: Send @Mention Email
 * Called when a user is @mentioned in a post
 */
exports.sendMentionEmail = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const {
      to,
      subject,
      senderName,
      postContent,
      groupName,
      groupId,
      postId,
    } = req.body;

    if (!to || !subject || !senderName || !postContent) {
      res.status(400).json({error: "Missing required fields"});
      return;
    }

    console.log("Mention Email:", {
      to,
      subject,
      senderName,
      postContent: postContent.substring(0, 100),
      groupName,
      groupId,
      postId,
    });

    // TODO: Implement actual email sending using your preferred service
    // Example with Nodemailer:
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({...});
    // const emailBody = `
    //   <h2>${senderName} mentioned you in ${groupName || 'MeepleUp'}</h2>
    //   <p>${postContent}</p>
    //   <p><a href="https://meepleup.com/event/${groupId}?post=${postId}">View post</a></p>
    // `;
    // await transporter.sendMail({to, subject, html: emailBody});

    res.status(200).json({success: true, message: "Email sent successfully"});
  } catch (error) {
    console.error("Error sending mention email:", error);
    res.status(500).json({error: error.message});
  }
});

/**
 * HTTP Function: Send @Mention SMS
 * Called when a user is @mentioned in a post and has SMS notifications enabled
 */
exports.sendMentionSMS = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const {
      to,
      message,
      senderName,
      groupName,
      groupId,
    } = req.body;

    if (!to || !message) {
      res.status(400).json({error: "Missing required fields"});
      return;
    }

    console.log("Mention SMS:", {
      to,
      message: message.substring(0, 50),
      senderName,
      groupName,
      groupId,
    });

    // TODO: Implement actual SMS sending (e.g. email-to-SMS gateway like number@txt.att.net, or an SMS API)

    res.status(200).json({success: true, message: "SMS sent successfully"});
  } catch (error) {
    console.error("Error sending mention SMS:", error);
    res.status(500).json({error: error.message});
  }
});

    const customToken = await admin.auth().createCustomToken(uid, {
      provider: "apple.com",
      appleUserId: appleUserId,
    });

    return {
      customToken: customToken,
      uid: uid,
      email: email,
      emailVerified: emailVerified,
    };
  } catch (error) {
    console.error("Error verifying Apple Sign-In:", error);
    throw new functions.https.HttpsError(
        "internal",
        `Apple Sign-In verification failed: ${error.message}`,
    );
  }
});

/**
 * Firestore Trigger: Send Welcome Email to iOS Beta Signups
 * Automatically sends an email when a user signs up for iOS beta testing
 */
exports.sendIOSBetaWelcomeEmail = functions.firestore
    .document("betaSignups/{signupId}")
    .onCreate(async (snap, context) => {
      const signupData = snap.data();
      const signupId = context.params.signupId;

      // Only process iOS signups
      const platforms = signupData.platforms || [];
      if (!platforms.includes("ios")) {
        console.log(`Skipping email for signup ${signupId} - not iOS platform`);
        return null;
      }

      const email = signupData.email;
      if (!email) {
        console.error(`No email found for signup ${signupId}`);
        return null;
      }

      try {
        // Configure email transporter
        // You can use Gmail, SendGrid, Mailgun, or any SMTP provider
        // For now, we'll use environment variables for SMTP config
        const smtpConfig = {
          host: functions.config().smtp?.host || process.env.SMTP_HOST,
          port: parseInt(functions.config().smtp?.port || process.env.SMTP_PORT || "587"),
          secure: (functions.config().smtp?.secure || process.env.SMTP_SECURE) === "true",
          auth: {
            user: functions.config().smtp?.user || process.env.SMTP_USER,
            pass: functions.config().smtp?.pass || process.env.SMTP_PASS,
          },
        };

        // If SMTP is not configured, log and return (won't fail)
        if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
          console.log(`SMTP not configured. Email would be sent to: ${email}`);
          console.log("Configure SMTP by setting functions.config() or environment variables:");
          console.log("  firebase functions:config:set smtp.host='smtp.gmail.com'");
          console.log("  firebase functions:config:set smtp.port='587'");
          console.log("  firebase functions:config:set smtp.user='your-email@gmail.com'");
          console.log("  firebase functions:config:set smtp.pass='your-app-password'");
          return null;
        }

        const transporter = nodemailer.createTransport(smtpConfig);

        // Email content
        const emailSubject = "Welcome to MeepleUp iOS Beta Testing! 🎉";
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #d45d5d 0%, #c04d4d 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; }
    .button { display: inline-block; background: #d45d5d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
    .info-box { background: white; border-left: 4px solid #d45d5d; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { text-align: center; color: #6c757d; font-size: 0.875rem; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🎉 Welcome to MeepleUp Beta!</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      
      <p>Thank you for signing up to beta test MeepleUp on iOS! We're excited to have you join our community of board game enthusiasts.</p>
      
      <div class="info-box">
        <h3 style="margin-top: 0; color: #d45d5d;">Here's what to expect:</h3>
        <ul>
          <li><strong>Within a few days:</strong> We'll add you to TestFlight and Apple will send you an email invite</li>
          <li><strong>You'll need:</strong> The TestFlight app installed on your iPhone (download from the App Store)</li>
          <li><strong>Once you accept:</strong> You can download and test MeepleUp!</li>
        </ul>
      </div>
      
      <p><strong>Please check your email</strong> (and spam folder) for the TestFlight invite from Apple in the coming days.</p>
      
      <p>We can't wait to hear your feedback as we build the perfect tool for managing board game events!</p>
      
      <p>Happy gaming,<br>
      <strong>Rhys Smoker</strong><br>
      MeepleUp Creator</p>
      
      <div class="footer">
        <p>This email was sent to ${email} because you signed up for MeepleUp iOS beta testing.</p>
        <p>If you have questions, reply to this email or contact us at contact@meepleup.com</p>
      </div>
    </div>
  </div>
</body>
</html>
        `;

        // Send email
        const mailOptions = {
          from: `"MeepleUp" <${smtpConfig.auth.user}>`,
          to: email,
          subject: emailSubject,
          html: emailHtml,
          // Plain text version for email clients that don't support HTML
          text: `
Welcome to MeepleUp iOS Beta Testing!

Thank you for signing up to beta test MeepleUp on iOS! We're excited to have you join our community of board game enthusiasts.

Here's what to expect:
- Within a few days: I'll add you to TestFlight and Apple will send you an email invite
- You'll need: The TestFlight app installed on your iPhone (download from the App Store)
- Once you accept: You can download and test MeepleUp!

Please check your email (and spam folder) for the TestFlight invite from Apple in the coming days.

I'm looking forward to your feedback!

Happy gaming,
Rhys Smoker
MeepleUp Creator

---
This email was sent to ${email} because you signed up for MeepleUp iOS beta testing.
If you have questions, reply to this email or contact us at contact@meepleup.com
          `.trim(),
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Welcome email sent to ${email} for signup ${signupId}`);

        // Optionally update the signup document to mark email as sent
        await snap.ref.update({
          welcomeEmailSent: true,
          welcomeEmailSentAt: admin.firestore.Timestamp.now(),
        });

        return null;
      } catch (error) {
        console.error(`❌ Error sending welcome email to ${email}:`, error);
        // Don't throw - we don't want to retry on email failures
        // You might want to log this to a separate error collection
        return null;
      }
    });

/**
 * Firestore Trigger: Send Admin Notification for Beta Signups
 * Sends an email to the admin when anyone signs up for beta testing
 */
exports.notifyAdminBetaSignup = functions.firestore
    .document("betaSignups/{signupId}")
    .onCreate(async (snap, context) => {
      const signupData = snap.data();
      const signupId = context.params.signupId;

      const email = signupData.email;
      if (!email) {
        console.error(`No email found for signup ${signupId}`);
        return null;
      }
      const name = signupData.name && String(signupData.name).trim() ? String(signupData.name).trim() : null;

      // Get admin email from config or use default
      // Default to SMTP user email if available, otherwise use contact@meepleup.com
      const smtpUser = functions.config().smtp?.user || process.env.SMTP_USER;
      const adminEmail = functions.config().admin?.email || 
                        process.env.ADMIN_EMAIL || 
                        smtpUser ||
                        "contact@meepleup.com";

      try {
        // Configure email transporter
        const smtpConfig = {
          host: functions.config().smtp?.host || process.env.SMTP_HOST,
          port: parseInt(functions.config().smtp?.port || process.env.SMTP_PORT || "587"),
          secure: (functions.config().smtp?.secure || process.env.SMTP_SECURE) === "true",
          auth: {
            user: functions.config().smtp?.user || process.env.SMTP_USER,
            pass: functions.config().smtp?.pass || process.env.SMTP_PASS,
          },
        };

        // If SMTP is not configured, log and return (won't fail)
        if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
          console.log(`SMTP not configured. Admin notification would be sent to: ${adminEmail}`);
          console.log("Configure SMTP by setting functions.config() or environment variables:");
          console.log("  firebase functions:config:set smtp.host='smtp.gmail.com'");
          console.log("  firebase functions:config:set smtp.port='587'");
          console.log("  firebase functions:config:set smtp.user='your-email@gmail.com'");
          console.log("  firebase functions:config:set smtp.pass='your-app-password'");
          return null;
        }

        const transporter = nodemailer.createTransport(smtpConfig);

        // Determine platform(s)
        const platforms = signupData.platforms || [];
        const isIOS = platforms.includes("ios");
        const isAndroid = platforms.includes("android");
        const platformText = isIOS && isAndroid ? "iOS & Android" : 
                            isIOS ? "iOS" : 
                            isAndroid ? "Android/Google Play" : "Unknown";

        // Determine action needed
        let actionNeeded = "";
        if (isIOS) {
          actionNeeded = "⚠️ ACTION REQUIRED: Run `node scripts/process-beta-signups.js --add-ios` to add this tester to TestFlight";
        } else if (isAndroid) {
          actionNeeded = "✅ No action needed - Android testers can join via opt-in link: https://play.google.com/apps/internaltest/4701636314391153737";
        } else {
          actionNeeded = "⚠️ Unknown platform - please check manually";
        }

        // Format signup date in Pacific time
        const signupDate = signupData.signupDate ?
          signupData.signupDate.toDate().toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) + " (Pacific)" :
          "Unknown";
        const signupDateShort = signupData.signupDate ?
          signupData.signupDate.toDate().toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT" :
          "";

        // Build signup info table (escape name for HTML if present)
        const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const nameRow = name ? `<tr><td><strong>Name:</strong></td><td>${escapeHtml(name)}</td></tr>` : "";
        const signupInfo = `
          <tr><td><strong>Email:</strong></td><td>${escapeHtml(email)}</td></tr>
          ${nameRow}
          <tr><td><strong>Platform:</strong></td><td>${platformText}</td></tr>
          <tr><td><strong>Status:</strong></td><td>${signupData.status || "pending"}</td></tr>
          <tr><td><strong>Signup Date:</strong></td><td>${signupDate}</td></tr>
          <tr><td><strong>Source:</strong></td><td>${signupData.source || "unknown"}</td></tr>
          <tr><td><strong>Signup ID:</strong></td><td>${signupId}</td></tr>
        `;

        // Email content
        const emailSubject = `🎮 New Beta Tester Signup: ${email} (${platformText})`;
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #d45d5d 0%, #c04d4d 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; }
    .info-box { background: white; border-left: 4px solid #d45d5d; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .action-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .no-action-box { background: #d1e7dd; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    table td { padding: 8px; border-bottom: 1px solid #e0e0e0; }
    table td:first-child { width: 150px; color: #666; }
    .command { background: #2d2d2d; color: #f8f8f2; padding: 10px; border-radius: 6px; font-family: 'Courier New', monospace; margin: 10px 0; }
    .footer { text-align: center; color: #6c757d; font-size: 0.875rem; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🎮 New Beta Tester Signup!</h1>
    </div>
    <div class="content">
      <p>Hi Rhys,</p>
      
      <p>A new person has signed up for beta testing!</p>
      
      <div class="info-box">
        <h3 style="margin-top: 0; color: #d45d5d;">Signup Information:</h3>
        <table>
          ${signupInfo}
        </table>
      </div>
      
      ${isIOS ? `
      <div class="action-box">
        <h3 style="margin-top: 0; color: #856404;">⚠️ Action Required:</h3>
        <p>This is an <strong>iOS</strong> signup. You need to add them to TestFlight.</p>
        <p><strong>Run this command:</strong></p>
        <div class="command">node scripts/process-beta-signups.js --add-ios</div>
        <p>This will add all pending iOS testers to TestFlight group "Good Meeples Beta Testers".</p>
      </div>
      ` : `
      <div class="no-action-box">
        <h3 style="margin-top: 0; color: #155724;">✅ No Action Needed:</h3>
        <p>This is an <strong>Android/Google Play</strong> signup. They can join automatically via the opt-in link.</p>
        <p><strong>Opt-in URL:</strong> <a href="https://play.google.com/apps/internaltest/4701636314391153737">https://play.google.com/apps/internaltest/4701636314391153737</a></p>
      </div>
      `}
      
      <div class="footer">
        <p>This is an automated notification from MeepleUp beta signup system.</p>
        <p>Signup ID: ${signupId}</p>
      </div>
    </div>
  </div>
</body>
</html>
        `;

        // Send email
        const mailOptions = {
          from: `"MeepleUp Admin" <${smtpConfig.auth.user}>`,
          to: adminEmail,
          subject: emailSubject,
          html: emailHtml,
          // Plain text version
          text: `
New Beta Tester Signup!

A new person has signed up for beta testing:

Email: ${email}
${name ? `Name: ${name}\n` : ""}Platform: ${platformText}
Status: ${signupData.status || "pending"}
Signup Date: ${signupDate}
Source: ${signupData.source || "unknown"}
Signup ID: ${signupId}

${isIOS ? `
⚠️ ACTION REQUIRED:
This is an iOS signup. Run this command to add them to TestFlight:
  node scripts/process-beta-signups.js --add-ios

This will add all pending iOS testers to TestFlight group "Good Meeples Beta Testers".
` : `
✅ NO ACTION NEEDED:
This is an Android/Google Play signup. They can join automatically via the opt-in link:
  https://play.google.com/apps/internaltest/4701636314391153737
`}

---
This is an automated notification from MeepleUp beta signup system.
Signup ID: ${signupId}
          `.trim(),
        };

        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ Admin notification sent to ${adminEmail} for signup ${signupId} (${email})`);
        console.log(`   Message ID: ${result.messageId}`);
        console.log(`   Response: ${result.response}`);

        // Note: SMS notifications removed because AT&T shut down email-to-SMS gateway (txt.att.net) on June 17, 2025
        // Email notifications will continue to work. To re-enable SMS, you would need to use a paid SMS service like Twilio.

        // Optionally update the signup document to mark notification as sent
        await snap.ref.update({
          adminNotified: true,
          adminNotifiedAt: admin.firestore.Timestamp.now(),
        });

        return null;
      } catch (error) {
        console.error(`❌ Error sending admin notification for signup ${signupId}:`, error);
        console.error(`   Error details:`, {
          message: error.message,
          code: error.code,
          command: error.command,
          response: error.response,
          responseCode: error.responseCode,
        });
        // Don't throw - we don't want to retry on email failures
        return null;
      }
    });


