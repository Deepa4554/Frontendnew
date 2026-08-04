# Production Deployment Guide

## Prerequisites
- Node.js 22.x
- Xcode 15+ (for iOS)
- Android Studio & JDK 17 (for Android)

## Android Deployment (Google Play Store)
1. Bump the `versionCode` and `versionName` in `android/app/build.gradle`.
2. Generate a release Keystore if one doesn't exist.
3. Update `gradle.properties` with the Keystore credentials.
4. Run the build command:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
5. Upload the resulting `.aab` file from `android/app/build/outputs/bundle/release/` to the Google Play Console.

## iOS Deployment (Apple App Store)
1. Bump the Version and Build numbers in Xcode.
2. Ensure you have valid Distribution Certificates and Provisioning Profiles.
3. Archive the app:
   - Open `ios/CafePOS.xcworkspace` in Xcode.
   - Select Product > Archive.
4. Distribute to App Store Connect via the Xcode Organizer.

## Over-The-Air (OTA) Updates
For minor JS bundle updates (bypassing app store review), we use CodePush.
```bash
appcenter codepush release-react -a <owner>/CafePOS-Android -d Production
appcenter codepush release-react -a <owner>/CafePOS-iOS -d Production
```
