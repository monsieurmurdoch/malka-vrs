#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"
BUILD_DIR="$IOS_DIR/build"
BUNDLE_DIR="$BUILD_DIR/jsbundle"
BUNDLE_FILE="$BUNDLE_DIR/main.jsbundle"
ASSETS_DIR="$BUNDLE_DIR/assets"
CONFIGURATION="${CONFIGURATION:-Debug}"
SDK="${SDK:-iphonesimulator}"
SIMULATOR_UDID="${1:-${SIMULATOR_UDID:-}}"
NODE_RUNNER="${NODE_RUNNER:-mise exec node@20 --}"
APPICON_NAME="AppIconDebug"
if [[ "$CONFIGURATION" == "Release" ]]; then
  APPICON_NAME="AppIconRelease"
fi
APPICON_DIR="$IOS_DIR/app/src/Images.xcassets/$APPICON_NAME.appiconset"
APPICON_BACKUP="$(mktemp -d)"

restore_appicon() {
  if [[ -d "$APPICON_BACKUP/appiconset" ]]; then
    rm -rf "$APPICON_DIR"
    cp -R "$APPICON_BACKUP/appiconset" "$APPICON_DIR"
  fi
  rm -rf "$APPICON_BACKUP"
}

trap restore_appicon EXIT

ulimit -n 65536 2>/dev/null || true

if [[ -z "$SIMULATOR_UDID" ]]; then
  SIMULATOR_UDID="$(xcrun simctl list devices booted -j \
    | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const data=JSON.parse(s);for (const devices of Object.values(data.devices)) { const d=devices.find(x=>x.state==='Booted'&&x.isAvailable); if (d) { console.log(d.udid); return; } } process.exit(1);})")"
fi

if [[ -z "$SIMULATOR_UDID" ]]; then
  echo "No booted simulator found. Boot an iPhone simulator or pass its UDID." >&2
  exit 1
fi

cp -R "$APPICON_DIR" "$APPICON_BACKUP/appiconset"

echo "Bundling React Native JS for iOS..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$ASSETS_DIR"
(cd "$ROOT_DIR" && CI=true $NODE_RUNNER npx react-native bundle \
  --entry-file index.ios.js \
  --platform ios \
  --dev false \
  --minify false \
  --max-workers 1 \
  --bundle-output "$BUNDLE_FILE" \
  --assets-dest "$ASSETS_DIR")

echo "Building JitsiMeetSDK..."
xcodebuild \
  -project "$IOS_DIR/sdk/sdk.xcodeproj" \
  -target JitsiMeetSDK \
  -configuration "$CONFIGURATION" \
  -sdk "$SDK" \
  CODE_SIGNING_ALLOWED=NO \
  ONLY_ACTIVE_ARCH=YES \
  ARCHS=arm64 \
  BUILD_DIR="$BUILD_DIR" \
  CONFIGURATION_BUILD_DIR="$BUILD_DIR/$CONFIGURATION-$SDK" \
  build

apps=(
  "MalkaVRS|malka|com.malkacomm.vrs|group.com.malkacomm.vrs.appgroup|malkavrs"
  "MalkaVRI|malkavri|com.malkacomm.vri|group.com.malkacomm.vri.appgroup|malkavri"
  "MapleVRI|maple|com.maplecomm.vri|group.com.maplecomm.vri.appgroup|maplevri"
)

for app in "${apps[@]}"; do
  IFS="|" read -r display_name tenant bundle_id app_group url_scheme <<< "$app"
  app_path="$BUILD_DIR/$CONFIGURATION-$SDK/$display_name.app"

  echo "Building $display_name ($bundle_id)..."
  $NODE_RUNNER node "$ROOT_DIR/scripts/mobile/generate-ios-appicon.js" "$tenant" "$APPICON_DIR"
  xcodebuild \
    -project "$IOS_DIR/app/app.xcodeproj" \
    -target JitsiMeet \
    -configuration "$CONFIGURATION" \
    -sdk "$SDK" \
    CODE_SIGNING_ALLOWED=NO \
    ONLY_ACTIVE_ARCH=YES \
    ARCHS=arm64 \
    BUILD_DIR="$BUILD_DIR" \
    CONFIGURATION_BUILD_DIR="$BUILD_DIR/$CONFIGURATION-$SDK" \
    TENANT="$tenant" \
    VRS_TENANT="$tenant" \
    EXPO_PUBLIC_TENANT="$tenant" \
    MOBILE_APP_DISPLAY_NAME="$display_name" \
    MOBILE_BUNDLE_IDENTIFIER="$bundle_id" \
    MOBILE_APP_GROUP_IDENTIFIER="$app_group" \
    MOBILE_URL_SCHEME="$url_scheme" \
    build

  cp "$BUNDLE_FILE" "$app_path/main.jsbundle"
  if compgen -G "$ASSETS_DIR/*" > /dev/null; then
    cp -R "$ASSETS_DIR/"* "$app_path/"
  fi

  echo "Installing $display_name on simulator $SIMULATOR_UDID..."
  xcrun simctl install "$SIMULATOR_UDID" "$app_path"
done

echo "Installed MalkaVRS, MalkaVRI, and MapleVRI on simulator $SIMULATOR_UDID."
