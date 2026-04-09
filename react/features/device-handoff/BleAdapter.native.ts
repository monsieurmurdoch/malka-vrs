/**
 * BleAdapter — React Native variant.
 *
 * On mobile we use react-native-ble-plx for Bluetooth Low Energy scanning
 * and GATT operations.  This file is ONLY bundled by Metro (the React Native
 * bundler); webpack picks up BleAdapter.web.ts instead, so the Flow-syntax
 * library never enters the web build.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BleManager } = require('react-native-ble-plx');

export function createBleManager(): any {
    try {
        return new BleManager();
    } catch (error) {
        console.warn('[BleAdapter] Failed to create BleManager:', error);

        return null;
    }
}
