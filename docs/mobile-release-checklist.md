# Mobile Release Checklist

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
