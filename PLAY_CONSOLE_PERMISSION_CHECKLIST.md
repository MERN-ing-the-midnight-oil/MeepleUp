# Google Play Console Permission Descriptions Checklist

## ✅ Current Configuration Status

### In Your Code (app.json):

**Camera Permission** - ✅ **EXCELLENT**
- **Location:** `app.json` → `plugins` → `expo-camera`
- **Description:** "MeepleUp needs access to your camera to take photos of board games for AI-powered identification. For example, you can take a photo of a board game box and the app will use AI to identify the game and add it to your collection automatically."
- **Status:** ✅ Clear, specific, user-friendly

**Audio Permission** - ⚠️ **NEEDS ATTENTION**
- **Location:** `app.json` → `android` → `permissions` (declared but no description)
- **Current:** Only listed in permissions array
- **Status:** ⚠️ No description configured (Expo may handle this automatically, but verify)

### In AndroidManifest.xml:
- ✅ All permissions are justified and used
- ✅ No unused permissions
- ✅ Clean manifest

---

## 📋 What to Verify in Google Play Console

When you submit your app, you'll need to complete the **Data Safety** section. Here's what to prepare:

### 1. Data Safety Form - Permissions Section

**CAMERA Permission:**
- **Why does your app need this permission?**
  - "To take photos of board games for AI-powered identification. Users can photograph board game boxes, and the app uses AI to identify the game and automatically add it to their collection."
  
- **What data does this permission access?**
  - "Camera images are used to identify board games. Photos may be uploaded to Firebase Storage for profile pictures and event photos."

- **How is this data used?**
  - "Photos are processed using AI to identify board games. Selected photos are uploaded to Firebase Storage for user profile pictures and event photos shared within private gaming groups."

**RECORD_AUDIO Permission:**
- **Why does your app need this permission?**
  - "To allow users to record optional audio narration when taking photos of board games. This is an optional feature that helps users add voice notes to their game photos."
  
- **What data does this permission access?**
  - "Microphone audio recordings (only if user chooses to use this feature)."
  
- **How is this data used?**
  - "Audio recordings are processed and stored only if the user actively chooses to record narration while taking photos. This data is stored in Firebase Storage."

### 2. Data Collection Declaration

**What data do you collect?**
- ✅ Photos (for game identification and profile pictures)
- ✅ Audio recordings (optional, if user enables)
- ✅ User account information (name, email)
- ✅ Game collection data
- ✅ Event/group data

**How is data shared?**
- ✅ Firebase (backend services)
- ✅ AI services (for image recognition - if using third-party)

**Data security practices:**
- ✅ Data encrypted in transit
- ✅ Data encrypted at rest (Firebase)
- ✅ Private groups with invitation-only access

### 3. Permission Justification Quality Check

Your descriptions should be:
- ✅ **Clear and specific** - Users understand why you need it
- ✅ **User-focused** - Explains benefit to user, not technical details
- ✅ **Honest** - Accurately describes what you do with the data
- ✅ **Concise** - Not too long, but complete

**Your camera description is excellent!** ✅
- Clear use case
- Specific example
- User benefit explained

**Audio permission needs similar treatment** - Use the template above when filling out Play Console.

---

## 🔍 How to Verify in Play Console

### Step 1: Upload Your App
1. Build with EAS: `eas build --platform android --profile production`
2. Upload to Play Console (Internal Testing track first)

### Step 2: Complete Data Safety Form
1. Go to **Play Console** → **Your App** → **Policy** → **App content** → **Data safety**
2. Answer all questions about:
   - Data collection
   - Data sharing
   - Security practices
   - Permission justifications

### Step 3: Verify Permission Prompts
1. Install your app on a physical Android device
2. Test camera permission prompt - verify description appears
3. Test audio permission prompt - verify description appears (if triggered)
4. Ensure descriptions match what you declared

---

## ✅ Pre-Submission Checklist

### Code Configuration:
- [x] Camera permission description in expo-camera plugin ✅
- [ ] Audio permission description (verify if Expo handles automatically)
- [x] All permissions justified and used ✅
- [x] No unused permissions ✅

### Play Console Preparation:
- [ ] Camera permission justification prepared
- [ ] Audio permission justification prepared
- [ ] Data collection practices documented
- [ ] Data sharing practices documented
- [ ] Security practices documented
- [ ] Privacy policy URL ready (you have this: https://meepleup.com/privacy-policy.html)
- [ ] Terms of service URL ready (you have this: https://meepleup.com/terms-of-service.html)

---

## 📝 Recommended Audio Permission Description

If you want to add an explicit description (though Expo may handle this), you could add to `app.json`:

**Note:** Expo SDK 54 may automatically generate permission descriptions from plugin configs. However, if you want to be explicit, you could check if `expo-av` supports a plugin configuration similar to `expo-camera`.

For now, the most important thing is to have clear justifications ready for the Play Console Data Safety form.

---

## 🎯 Summary

**What's Good:**
- ✅ Camera permission description is excellent
- ✅ All permissions are justified
- ✅ Privacy policy and terms links exist

**What to Do:**
1. ✅ Prepare audio permission justification (use template above)
2. ✅ Complete Data Safety form in Play Console when submitting
3. ✅ Test permission prompts on a real device
4. ✅ Verify descriptions appear correctly

**Your app is in good shape!** The main work is preparing the Play Console forms, which you'll do when you actually submit.

