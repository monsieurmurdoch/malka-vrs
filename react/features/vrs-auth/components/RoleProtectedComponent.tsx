/**
 * Role Protected Component
 *
 * Higher-order component that restricts access based on user role.
 * Shows fallback content or redirects if user doesn't have required role.
 */

import React, { ReactNode, useEffect, useState } from 'react';
import { makeStyles } from 'tss-react/mui';
import { VRSRole } from '../types';
import vrsAuthService from '../VRSSAuthService';
import { ROLE_DISPLAY_NAMES } from '../constants';

interface IProps {
    allowedRoles: VRSRole | VRSRole[];
    children: ReactNode;
    fallback?: ReactNode;
    showAccessDenied?: boolean;
    onAccessDenied?: () => void;
}

const useStyles = makeStyles()(theme => ({
    accessDenied: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '40px',
        textAlign: 'center',
        color: theme.palette.text01
    },

    icon: {
        fontSize: '64px',
        marginBottom: '24px',
        opacity: 0.5
    },

    title: {
        fontSize: '24px',
        fontWeight: 'bold',
        marginBottom: '16px'
    },

    message: {
        fontSize: '16px',
        opacity: 0.8,
        maxWidth: '400px'
    },

    currentRole: {
        marginTop: '16px',
        padding: '8px 16px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        fontSize: '14px'
    }
}));

/**
 * Component that protects its children based on user role
 */
const RoleProtectedComponent: React.FC<IProps> = ({
    allowedRoles,
    children,
    fallback = null,
    showAccessDenied = true,
    onAccessDenied
}) => {
    const { classes } = useStyles();
    const [hasAccess, setHasAccess] = useState(false);
    const [currentRole, setCurrentRole] = useState<VRSRole>('none');

    useEffect(() => {
        const checkAccess = () => {
            const role = vrsAuthService.getRole();
            setCurrentRole(role);

            const allowed = vrsAuthService.hasRole(allowedRoles);
            setHasAccess(allowed);

            if (!allowed && onAccessDenied) {
                onAccessDenied();
            }
        };

        checkAccess();
    }, [allowedRoles, onAccessDenied]);

    if (hasAccess) {
        return <>{children}</>;
    }

    if (!showAccessDenied) {
        return <>{fallback}</>;
    }

    // Show access denied message
    return (
        <div className={classes.accessDenied}>
            <div className={classes.icon}>🔒</div>
            <div className={classes.title}>Access Denied</div>
            <div className={classes.message}>
                You need to be signed in as{' '}
                <strong>
                    {Array.isArray(allowedRoles)
                        ? allowedRoles.map(r => ROLE_DISPLAY_NAMES[r]).join(', ')
                        : ROLE_DISPLAY_NAMES[allowedRoles]}
                </strong>{' '}
                to access this area.
            </div>
            {currentRole !== 'none' && (
                <div className={classes.currentRole}>
                    Currently signed in as: <strong>{ROLE_DISPLAY_NAMES[currentRole]}</strong>
                </div>
            )}
        </div>
    );
};

export default RoleProtectedComponent;
