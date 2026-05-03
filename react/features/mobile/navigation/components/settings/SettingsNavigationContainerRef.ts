import { NavigationContainerRef, ParamListBase } from '@react-navigation/native';
import React from 'react';

export const settingsNavigationContainerRef = React.createRef<NavigationContainerRef<ParamListBase>>();

/**
 * User defined navigation action included inside the reference to the container.
 *
 * @param {string} name - Destination name of the route that has been defined somewhere.
 * @param {Object} params - Params to pass to the destination route.
 * @returns {Function}
 */
export function navigate(name: string, params?: Record<string, unknown>) {
    const navigation = settingsNavigationContainerRef.current as unknown as {
        navigate: (routeName: string, routeParams?: Record<string, unknown>) => void;
    } | null;

    return navigation?.navigate(name, params);
}

/**
 * User defined navigation action included inside the reference to the container.
 *
 * @returns {Function}
 */
export function goBack() {
    return settingsNavigationContainerRef.current?.goBack();
}
