# Android Permission Descriptions Verification

## Current Configuration

### Permissions Declared in AndroidManifest.xml:
1. ✅ `CAMERA` - For taking photos of board games
2. ✅ `INTERNET` - For network access (standard, no user prompt)
3. ✅ `MODIFY_AUDIO_SETTINGS` - For audio recording (standard, no user prompt)
4. ✅ `RECORD_AUDIO` - For audio narration when taking photos
5. ✅ `SYSTEM_ALERT_WINDOW` - For development overlays (standard, no user prompt)
6. ✅ `VIBRATE` - For notifications (standard, no user prompt)

### Permissions Configured in app.json:

**expo-camera plugin** (line 45):
```json
"cameraPermission": "MeepleUp needs access to your camera to take photos of board games for AI-powered identification. For example, you can take a photo of a board game box and the app will use AI to identify the game and add it to your collection automatically."
```
✅ **This is excellent!** Clear, specific, and explains the use case.

**Android permissions array** (lines 36-39):
```json
"permissions": [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO"
]
```
⚠️ **Missing:** No description for `RECORD_AUDIO` permission

---

## What Needs to Be Added

### 1. Add RECORD_AUDIO Permission Description

Android requires a description for the `RECORD_AUDIO` permission. This should be added to your `app.json` under the `android` section.

**Recommended addition:**
```json
"android": {
  "versionCode": 32,
  "adaptiveIcon": {
    "foregroundImage": "./assets/images/app-icon.png",
    "backgroundColor": "#ffffff"
  },
  "package": "com.meepleup.app",
  "permissions": [
    "android.permission.CAMERA",
    "android.permission.RECORD_AUDIO"
  ],
  "permissionDescriptions": {
    "android.permission.RECORD_AUDIO": "MeepleUp needs access to your microphone to record audio narration when taking photos of board games. For example, you can record a voice note describing a game while taking its photo."
  }
}
```

**Note:** Expo may handle this differently. Let me check if there's an expo-av plugin configuration needed instead.

---

## Google Play Console Requirements

When you submit to Google Play, you'll need to provide permission justifications in the **Data Safety** section. Here's what you should document:

### Permission Justifications for Play Console:

1. **CAMERA**
   - **Why needed:** To take photos of board games for AI-powered identification
   - **How used:** Users can take photos of board game boxes, and the app uses AI to identify the game and automatically add it to their collection
   - **Data collected:** Photos are processed for game identification and uploaded to Firebase Storage for profile pictures and event photos

2. **RECORD_AUDIO**
   - **Why needed:** To record audio narration when taking photos of board games
   - **How used:** Optional feature allowing users to record voice notes while taking photos
   - **Data collected:** Audio recordings are processed and stored if the user chooses to use this feature

3. **INTERNET**
   - **Why needed:** Standard permission for network access
   - **How used:** Required for all app functionality (Firebase, API calls, etc.)
   - **Data collected:** Standard network communication

4. **MODIFY_AUDIO_SETTINGS**
   - **Why needed:** To adjust audio settings during recording
   - **How used:** Ensures proper audio recording quality
   - **Data collected:** None (system-level setting)

5. **VIBRATE**
   - **Why needed:** For notification alerts
   - **How used:** Device vibration for push notifications
   - **Data collected:** None

6. **SYSTEM_ALERT_WINDOW**
   - **Why needed:** For development and debugging overlays
   - **How used:** Development tools only
   - **Data collected:** None

---

## Verification Checklist

### In Your Codebase:
- [x] Camera permission description exists in expo-camera plugin config
- [ ] RECORD_AUDIO permission description needs to be added
- [x] All declared permissions are actually used
- [x] No unused permissions remain

### In Google Play Console (When Submitting):
- [ ] Complete Data Safety form
- [ ] Justify CAMERA permission with clear explanation
- [ ] Justify RECORD_AUDIO permission with clear explanation
- [ ] Declare data collection practices (photos, audio if used)
- [ ] Specify data sharing (Firebase Storage)
- [ ] Explain data security practices

---

## Recommended Next Steps

1. **Add RECORD_AUDIO description to app.json** (if Expo supports it)
2. **Verify expo-av plugin configuration** for audio permissions
3. **Prepare Data Safety form answers** using the justifications above
4. **Test permission prompts** on a physical Android device to ensure descriptions appear correctly

---

## Notes

- **Expo SDK 54** should automatically handle most permission descriptions
- The `expo-camera` plugin configuration is already excellent
- You may need to check if `expo-av` (for audio) has a similar plugin configuration
- Some permissions (INTERNET, VIBRATE, etc.) don't require user prompts and won't need descriptions

