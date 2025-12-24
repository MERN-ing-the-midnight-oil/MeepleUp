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


