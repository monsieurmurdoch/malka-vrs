import { ColorPalette } from '../styles/components/styles/ColorPalette';
import { getRGBAFormat } from '../styles/functions.any';

/**
 * The default color scheme of the application with Malka branding.
 */
export default {
    '_defaultTheme': {
        // Generic app theme colors that are used across the entire app.
        // All scheme definitions below inherit these values.
        background: 'rgb(255, 255, 255)',
        errorText: ColorPalette.red,
        icon: 'rgb(28, 32, 37)',
        text: 'rgb(28, 32, 37)'
    },
    'Dialog': {},
    'Header': {
        background: '#0D1A38', // Malka royal purple
        icon: ColorPalette.white,
        statusBar: '#16164C', // Malka light purple
        statusBarContent: ColorPalette.white,
        text: ColorPalette.white
    },
    'Toolbox': {
        button: 'rgb(255, 255, 255)',
        buttonToggled: '#16164C', // Malka light purple
        buttonToggledBorder: getRGBAFormat('#848395', 0.6), // Malka light purple variant
        hangup: '#CE0F13' // Malka red light
    }
};
