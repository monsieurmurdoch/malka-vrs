/**
 * BleAdapter — Web variant.
 *
 * On web we rely on the Web Bluetooth API (navigator.bluetooth) which is
 * built into the browser.  There is no native BLE manager to load, so
 * createBleManager() simply returns null.
 *
 * This file exists so that the react-native-ble-plx import in
 * BleAdapter.native.ts is never pulled into the webpack web bundle
 * (which would fail because the library contains Flow syntax).
 */

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function createBleManager(): any {
    // Web Bluetooth is accessed directly via navigator.bluetooth;
    // no external BLE manager is needed on the web platform.
    return null;
}
