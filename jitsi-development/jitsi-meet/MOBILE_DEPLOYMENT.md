# MalkaVRI Mobile App Deployment Guide

## Overview
Your MalkaVRI app is now configured for deployment to both iOS TestFlight and Android Play Console.

## App Configuration
- **App Name**: MalkaVRI
- **iOS Bundle ID**: com.malka.vrs.meet
- **Android Package**: com.malka.vrs.meet

## Prerequisites

### iOS TestFlight Deployment
1. **Apple Developer Account**: Ensure you have a valid Apple Developer account
2. **App Store Connect Access**: Create an app record in App Store Connect
3. **API Key**: Generate an App Store Connect API Key
4. **Xcode**: Ensure Xcode is installed on your Mac

### Android Play Store Deployment
1. **Google Play Console Account**: Set up a developer account
2. **Service Account**: Create a Google Cloud service account for API access
3. **Keystore**: Create or use existing keystore for app signing
4. **App Registration**: Create app listing in Play Console

## Setup Instructions

### 1. Environment Variables
Copy `.env.mobile` and update with your credentials:

```bash
cp .env.mobile .env
# Edit .env with your actual values
```

Required variables:
- `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT` for iOS
- `JITSI_JSON_KEY_FILE` for Android
- `JITSI_KEYSTORE`, `JITSI_KEYSTORE_PASSWORD`, etc. for Android signing

### 2. iOS TestFlight Deployment

Navigate to iOS directory and run:
```bash
cd jitsi-development/jitsi-meet/ios
bundle exec fastlane deploy
```

### 3. Android Play Store Deployment

Navigate to Android directory and run:
```bash
cd jitsi-development/jitsi-meet/android
bundle exec fastlane deploy
```

## Deployment Commands Summary

**iOS TestFlight:**
```bash
cd ios && fastlane deploy
```

**Android Play Store:**
```bash
cd android && fastlane deploy
```

## Troubleshooting

### Common iOS Issues
- Ensure Xcode command line tools are installed
- Check code signing certificates in Apple Developer portal
- Verify app identifier matches in App Store Connect

### Common Android Issues
- Ensure keystore file path is correct
- Check service account permissions in Google Cloud Console
- Verify package name matches in Play Console

## Next Steps
1. Set up your environment variables
2. Test builds locally before deployment
3. Configure app store listings and metadata
4. Set up automated CI/CD if needed

## App Store Listings
Remember to prepare:
- App screenshots
- App descriptions
- Privacy policy
- App icons (already configured)