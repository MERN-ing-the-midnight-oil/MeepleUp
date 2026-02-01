# Response to App Store Review

**Submission ID:** 383ebc96-b019-4f39-a532-65eb72490483  
**Date:** January 24, 2026

---

Thank you for reviewing MeepleUp and providing feedback. I've addressed both issues you identified:

## Guideline 2.1 - Information Needed (Barcode/QR Code Demo)

I wanted to clarify that **barcode and QR code scanning functionality is no longer part of this app**. That feature was removed in a previous update and has been replaced with AI-powered photo identification.

The camera permission is now used exclusively for taking photos of board game boxes, which are then analyzed using AI (Claude Vision API) to identify the game and automatically add it to the user's collection. There is no barcode or QR code scanning functionality in version 1.0.2.

I've updated the camera permission string in the app to accurately reflect this photo-based game identification feature. The new permission string states: "MeepleUp needs access to your camera to take photos of board games for AI-powered identification. For example, you can take a photo of a board game box and the app will use AI to identify the game and add it to your collection automatically."

## Guideline 5.1.1 - Privacy - Data Collection and Storage

I've updated the photo library purpose strings to be more specific and include clear examples:

**NSPhotoLibraryUsageDescription:** Now clearly explains that photos are used for:
- Selecting photos for profile pictures
- Sharing photos in private group discussions

**NSPhotoLibraryAddUsageDescription:** Now explains that photos can be saved to the library when users choose to save photos shared in group discussions.

Both strings now include specific examples of how the data will be used, as requested.

## Updated Build

I've submitted a new build (version 1.0.2, build 26) with these updated permission strings. The permission descriptions now accurately reflect the app's current functionality.

Thank you for your patience, and please let me know if you need any additional information.

---

**Developer:** Rhys Smoker  
**App:** MeepleUp  
**Version:** 1.0.2 (Build 26)

