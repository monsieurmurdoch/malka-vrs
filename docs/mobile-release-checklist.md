# Mobile Release Checklist

> Last updated: May 1, 2026

## Pre-Build

- [ ] Set `TENANT` env var: `malka`, `malkavri`, or `maple`
- [ ] Verify tenant config in `whitelabel/{tenant}.json`:
  - [ ] `brand.appName` matches store listing
  - [ ] `mobile.iosBundleId` is correct
  - [ ] `mobile.androidApplicationId` is correct
  - [ ] `mobile.displayName` matches store listing
- [ ] Verify backend base URL in app config points to production (not staging)
- [ ] Run `node scripts/whitelabel-prebuild.js` to generate tenant assets
- [ ] Verify both `tsc:web` and `tsc:native` pass with 0 errors
- [ ] `npm run lint` passes with no new warnings
- [ ] All storage keys in `AGENTS.md` registry are current
- [ ] `ROADMAP.md` mobile section is up to date
- [ ] `docs/mobile-parity.md` reflects current state

## iOS Build

- [ ] Open Xcode, verify bundle ID matches tenant config
- [ ] Verify provisioning profile is valid and not expired
- [ ] Increment build number
- [ ] Archive for release
- [ ] Verify archive builds without warnings

## Android Build

- [ ] Verify `applicationId` in `android/app/build.gradle` matches tenant
- [ ] Verify signing keystore is accessible (`MALKA_KEYSTORE`)
- [ ] Run `./gradlew assembleRelease`
- [ ] Verify APK builds without errors

## TestFlight / Play Internal

- [ ] Upload to TestFlight: `TENANT={tenant} cd ios && bundle exec fastlane deploy`
- [ ] Upload to Play Internal: `TENANT={tenant} cd android && bundle exec fastlane deploy`
- [ ] Add TestFlight internal testers (your Apple ID)
- [ ] Verify app launches on device
- [ ] Verify login flow works against production backend
- [ ] Verify interpreter request → match → call flow
- [ ] Verify call end routes back to home (not sign-out)
- [ ] Verify logout clears all auth state
- [ ] Verify settings persist across app restarts

## Privacy & Permissions

- [ ] Camera usage description present in Info.plist
- [ ] Microphone usage description present in Info.plist
- [ ] Privacy manifest (PrivacyInfo.xcprivacy) included
- [ ] No secrets in binary (run `strings` on the IPA/APK)

## Store Listing

- [ ] App name, subtitle, and description match tenant brand
- [ ] Screenshots captured for required device sizes
- [ ] App icon matches tenant config asset
- [ ] Privacy policy URL accessible
- [ ] Support URL accessible
- [ ] Age rating appropriate

## Rollback Plan

- [ ] Previous TestFlight build available for quick re-promotion
- [ ] Previous Play Internal build available
- [ ] Backend API version is backward-compatible with previous mobile build
- [ ] Document known issues in release notes

## Smoke Test Checklist

- [ ] Login (email + password with JWT)
- [ ] Confirm name-only/demo login is unavailable in release builds
- [ ] Request interpreter, wait for match, auto-enter room
- [ ] Interpreter: availability toggle, accept/decline, end call
- [ ] Call end routes back to correct home screen (not login)
- [ ] Camera and mic permissions requested and granted
- [ ] Settings, contacts, voicemail, call history navigation
- [ ] Tenant branding colors applied to primary actions
- [ ] Language selector persists across screens
- [ ] Add-to-contacts from call history
- [ ] Voicemail grouping (Today/Yesterday/Older)
- [ ] Call history direction filter (All/Missed/Outgoing/Incoming)
- [ ] Dial pad recent calls quick redial

## Device Testing Matrix

| Device | Login | Call | Permissions | Theme | Notes |
|--------|-------|------|-------------|-------|-------|
| iPhone 15 (iOS 17) | | | | | |
| iPhone SE 3 (iOS 17) | | | | | |
| iPad (iPadOS 17) | | | | | |
| Galaxy S24 (Android 14) | | | | | |
| Pixel 8 (Android 14) | | | | | |

## Post-Release

- [ ] Crash reporting configured (Sentry / Firebase Crashlytics)
- [ ] Structured mobile logs flushing to backend endpoint
- [ ] Monitor TestFlight/Play crash-free rate for 48 hours
- [ ] Collect internal tester feedback
- [ ] Update ROADMAP.md with release date and known issues
