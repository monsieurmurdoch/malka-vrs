import { isVriApp } from '../../base/whitelabel/functions';
import { removeSecureItem } from '../../vrs-auth/secureStorage';
import { clearPersistentItems, getPersistentItem, getPersistentJson, hydratePersistentItems } from '../../vrs-auth/storage';

import { screen, type RootRouteName } from './routes';

export const AUTH_STORAGE_KEYS = [
    'vrs_client_auth',
    'vrs_interpreter_auth',
    'vrs_auth_token',
    'vrs_user_info',
    'vrs_user_role',
    'vrs_tenant_config'
];

/**
 * Returns the correct branded mobile root route instead of the upstream Jitsi
 * welcome page.
 */
export function getMobileRootRoute(): RootRouteName {
    const isAuthed = getPersistentItem('vrs_client_auth') === 'true'
        || getPersistentItem('vrs_auth_token');

    if (isAuthed) {
        const userInfo = getPersistentJson<{ expiresAt?: number }>('vrs_user_info');
        const expiresAt = userInfo?.expiresAt;

        if (expiresAt && Date.now() > expiresAt) {
            clearPersistentItems([ 'vrs_client_auth', 'vrs_auth_token', 'vrs_user_info' ]);
            removeSecureItem('vrs_auth_token');

            return screen.auth.login;
        }

        const role = getPersistentItem('vrs_user_role');

        if (role === 'interpreter') {
            clearPersistentItems(AUTH_STORAGE_KEYS);
            removeSecureItem('vrs_auth_token');

            return screen.auth.login;
        }

        return isVriApp() ? screen.vri.console : screen.vrs.home;
    }

    return screen.auth.login;
}

/**
 * Hydrates native storage before selecting the first branded mobile route.
 */
export async function getHydratedMobileRootRoute(): Promise<RootRouteName> {
    await hydratePersistentItems(AUTH_STORAGE_KEYS);

    return getMobileRootRoute();
}
