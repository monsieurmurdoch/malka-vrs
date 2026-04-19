import React from 'react';

import GlobalStyles from '../../base/ui/components/GlobalStyles.web';
import JitsiThemeProvider from '../../base/ui/components/JitsiThemeProvider.web';
import DialogContainer from '../../base/ui/components/web/DialogContainer';
import ChromeExtensionBanner from '../../chrome-extension-banner/components/ChromeExtensionBanner.web';
import OverlayContainer from '../../overlay/components/web/OverlayContainer';
import VoicemailFab from '../../voicemail/components/web/VoicemailFab';
import VoicemailInbox from '../../voicemail/components/web/VoicemailInbox';
import VoicemailPrompt from '../../voicemail/components/web/VoicemailPrompt';
import VoicemailRecording from '../../voicemail/components/web/VoicemailRecording';
import VoicemailPlayer from '../../voicemail/components/web/VoicemailPlayer';

import { AbstractApp } from './AbstractApp';

// Register middlewares and reducers.
import '../middlewares';
import '../reducers';


/**
 * Root app {@code Component} on Web/React.
 *
 * @augments AbstractApp
 */
export class App extends AbstractApp {

    /**
     * Creates an extra {@link ReactElement}s to be added (unconditionally)
     * alongside the main element.
     *
     * @abstract
     * @protected
     * @returns {ReactElement}
     */
    _createExtraElement() {
        return (
            <JitsiThemeProvider>
                <OverlayContainer />
                <VoicemailFab />
                <VoicemailInbox />
                <VoicemailPrompt />
                <VoicemailRecording />
                <VoicemailPlayer />
            </JitsiThemeProvider>
        );
    }

    /**
     * Overrides the parent method to inject {@link AtlasKitThemeProvider} as
     * the top most component.
     *
     * @override
     */
    _createMainElement(component: React.ComponentType, props?: Object) {
        return (
            <JitsiThemeProvider>
                <GlobalStyles />
                <ChromeExtensionBanner />
                { super._createMainElement(component, props) }
            </JitsiThemeProvider>
        );
    }

    /**
     * Renders the platform specific dialog container.
     *
     * @returns {React$Element}
     */
    _renderDialogContainer() {
        return (
            <JitsiThemeProvider>
                <DialogContainer />
            </JitsiThemeProvider>
        );
    }
}
