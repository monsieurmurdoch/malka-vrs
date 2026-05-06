/* eslint-disable */

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */

const {
    resolver: {
        sourceExts,
        assetExts
    }
} = getDefaultConfig();

const config = {
    transformer: {
        babelTransformerPath: require.resolve('react-native-svg-transformer')
    },
    resolver: {
        assetExts: assetExts.filter(ext => ext !== 'svg'),
        blockList: exclusionList([
            /jitsi-development\/jitsi-meet\/react-native-sdk\/.*/
        ]),
        sourceExts: [ ...sourceExts, 'svg' ]
    }
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
