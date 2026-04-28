import React from 'react';
import { connect } from 'react-redux';

import { translate } from '../../base/i18n/functions';
import SettingsButton from '../../settings/components/web/SettingsButton';
import { SETTINGS_TABS } from '../../settings/constants';

import { AbstractWelcomePage, IProps, _mapStateToProps } from './AbstractWelcomePage';
import { consumePendingRoomRedirect, setPersistentItem } from '../../vrs-auth/storage';
import {
    getAppName,
    getLogoUrl,
    getLogoWhiteUrl,
    getWhitelabelConfig,
    isFeatureEnabled
} from '../../base/whitelabel/functions';

declare var config: any;

function getInitialSelectedTab(): 'client' | 'interpreter' | 'captioner' {
    if (hasClientAccess()) {
        return 'client';
    }

    if (hasInterpreterAccess()) {
        return 'interpreter';
    }

    return 'captioner';
}

function hasClientAccess(): boolean {
    return isFeatureEnabled('vrs') || isFeatureEnabled('vri');
}

function hasInterpreterAccess(): boolean {
    return isFeatureEnabled('vrs') || isFeatureEnabled('vri');
}

function getServiceBadgeLabel(): string {
    const hasVrs = isFeatureEnabled('vrs');
    const hasVri = isFeatureEnabled('vri');

    if (hasVrs && hasVri) {
        return 'VRS/VRI';
    }

    return hasVri ? 'VRI' : 'VRS';
}

/**
 * The Web container rendering the welcome page — a single centered auth box
 * with Client / Interpreter / Captioner tabs that shift the entire
 * background.
 */
class WelcomePage extends AbstractWelcomePage<IProps> {
    _additionalContentRef: HTMLDivElement | null;
    _additionalToolbarContentRef: HTMLDivElement | null;
    _additionalCardRef: HTMLDivElement | null;
    _roomInputRef: HTMLInputElement | null;
    _additionalCardTemplate: HTMLTemplateElement | null;
    _additionalContentTemplate: HTMLTemplateElement | null;
    _additionalToolbarContentTemplate: HTMLTemplateElement | null;
    _titleHasNotAllowCharacter: boolean;
    _emailRef: HTMLInputElement | null;
    _passwordRef: HTMLInputElement | null;

    static defaultProps = {
        _room: ''
    };

    constructor(props: IProps) {
        super(props);

        this.state = {
            ...this.state,
            generateRoomNames:
                interfaceConfig.GENERATE_ROOMNAMES_ON_WELCOME_PAGE,
            recentMeetingsCollapsed: true,
            selectedTab: getInitialSelectedTab(),
            email: '',
            password: '',
            name: '',
            isLogin: true,
            isSubmitting: false,
            error: ''
        } as any;

        this._titleHasNotAllowCharacter = false;
        this._additionalContentRef = null;
        this._roomInputRef = null;
        this._additionalToolbarContentRef = null;
        this._additionalCardRef = null;
        this._emailRef = null;
        this._passwordRef = null;

        this._additionalCardTemplate = document.getElementById(
            'welcome-page-additional-card-template') as HTMLTemplateElement;
        this._additionalContentTemplate = document.getElementById(
            'welcome-page-additional-content-template') as HTMLTemplateElement;
        this._additionalToolbarContentTemplate = document.getElementById(
            'settings-toolbar-additional-content-template'
        ) as HTMLTemplateElement;

        this._onFormSubmit = this._onFormSubmit.bind(this);
        this._onRoomChange = this._onRoomChange.bind(this);
        this._setAdditionalCardRef = this._setAdditionalCardRef.bind(this);
        this._setAdditionalContentRef = this._setAdditionalContentRef.bind(this);
        this._setRoomInputRef = this._setRoomInputRef.bind(this);
        this._setAdditionalToolbarContentRef = this._setAdditionalToolbarContentRef.bind(this);
        this._renderFooter = this._renderFooter.bind(this);

        this._handleTabSwitch = this._handleTabSwitch.bind(this);
        this._handleAuthSubmit = this._handleAuthSubmit.bind(this);
        this._handleEmailChange = this._handleEmailChange.bind(this);
        this._handlePasswordChange = this._handlePasswordChange.bind(this);
        this._handleNameChange = this._handleNameChange.bind(this);
        this._toggleAuthMode = this._toggleAuthMode.bind(this);
    }

    componentDidMount() {
        super.componentDidMount();

        document.body.classList.add('welcome-page');
        document.title = interfaceConfig.APP_NAME;

        if (this.state.generateRoomNames) {
            this._updateRoomName();
        }

        if (this._shouldShowAdditionalContent()) {
            this._additionalContentRef?.appendChild(
                this._additionalContentTemplate?.content.cloneNode(true) as Node);
        }

        if (this._shouldShowAdditionalToolbarContent()) {
            this._additionalToolbarContentRef?.appendChild(
                this._additionalToolbarContentTemplate?.content.cloneNode(true) as Node
            );
        }

        if (this._shouldShowAdditionalCard()) {
            this._additionalCardRef?.appendChild(
                this._additionalCardTemplate?.content.cloneNode(true) as Node
            );
        }

        this._applyTheme();
    }

    componentDidUpdate(prevProps: IProps, prevState: any) {
        if (prevState.selectedTab !== (this.state as any).selectedTab) {
            this._applyTheme();
        }
    }

    componentWillUnmount() {
        super.componentWillUnmount();
        document.body.classList.remove('welcome-page');
        document.body.style.removeProperty('--vrs-bg');
        document.body.style.removeProperty('--vrs-accent');
    }

    /**
     * Apply background and accent theme based on selected tab.
     */
    _applyTheme() {
        const tab = (this.state as any).selectedTab;
        if (tab === 'client') {
            document.body.style.setProperty('--vrs-bg',
                'linear-gradient(135deg, #1a4d6e 0%, #2d5a3d 50%, #4a3b2a 100%)');
            document.body.style.setProperty('--vrs-accent', '#4caf50');
        } else if (tab === 'interpreter') {
            document.body.style.setProperty('--vrs-bg',
                'linear-gradient(135deg, #0f1724 0%, #1a2332 50%, #252f3f 100%)');
            document.body.style.setProperty('--vrs-accent', '#7eb8da');
        } else {
            document.body.style.setProperty('--vrs-bg',
                'linear-gradient(135deg, #2b1b0f 0%, #5a2f14 48%, #9a631c 100%)');
            document.body.style.setProperty('--vrs-accent', '#f2b94b');
        }
    }

    /**
     * Switch between role tabs.
     */
    _handleTabSwitch(tab: 'client' | 'interpreter' | 'captioner') {
        this.setState({
            selectedTab: tab,
            error: '',
            isLogin: true
        } as any);
    }

    _handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.setState({ email: e.target.value, error: '' } as any);
    }

    _handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.setState({ password: e.target.value, error: '' } as any);
    }

    _handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.setState({ name: e.target.value, error: '' } as any);
    }

    _toggleAuthMode() {
        this.setState((prev: any) => ({
            isLogin: !prev.isLogin,
            error: ''
        }) as any);
    }

    /**
     * Handle sign-in or registration form submission.
     */
    async _handleAuthSubmit(e: React.FormEvent) {
        e.preventDefault();

        const { selectedTab, email, password, isLogin, name } = this.state as any;

        if (!email || !password) {
            this.setState({ error: 'Email and password are required.' } as any);
            return;
        }

        if (!isLogin && !name) {
            this.setState({ error: 'Name is required to create an account.' } as any);
            return;
        }

        this.setState({ isSubmitting: true, error: '' } as any);

        const role = selectedTab;
        const apiBase = this._getApiBase();

        try {
            let res: Response;

            if (isLogin) {
                res = await fetch(`${apiBase}/api/auth/${role}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
            } else {
                if (role === 'interpreter') {
                    this.setState({
                        error: 'Interpreter accounts are created by administrators.',
                        isSubmitting: false
                    } as any);
                    return;
                }

                res = await fetch(`${apiBase}/api/auth/client/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
            }

            const data = await res.json();

            if (!res.ok) {
                this.setState({
                    error: data.error || 'Authentication failed.',
                    isSubmitting: false
                } as any);
                return;
            }

            // Store auth info
            setPersistentItem('vrs_auth_token', JSON.stringify({
                token: data.token,
                userId: data.user?.id,
                name: data.user?.name
            }));
            setPersistentItem('vrs_user_info', JSON.stringify(data.user));
            setPersistentItem('vrs_user_role', role);
            if (role === 'client') {
                setPersistentItem('vrs_client_auth', 'true');
            }

            const pendingRoomRedirect = consumePendingRoomRedirect();

            if (pendingRoomRedirect) {
                window.location.href = pendingRoomRedirect;
            } else if (role === 'client') {
                window.location.href = '/client-profile.html';
            } else if (role === 'captioner') {
                window.location.href = '/captioner-profile.html';
            } else {
                window.location.href = '/interpreter-profile.html';
            }
        } catch (err) {
            this.setState({
                error: 'Network error. Please check your connection.',
                isSubmitting: false
            } as any);
        }
    }

    _getApiBase(): string {
        if (typeof config !== 'undefined' && config.vrs?.queueServiceUrl) {
            const wsUrl = config.vrs.queueServiceUrl as string;
            return wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
        }

        if (typeof window !== 'undefined') {
            return window.location.origin;
        }

        return 'http://localhost:3001';
    }

    render() {
        const { t } = this.props;
        const { DEFAULT_WELCOME_PAGE_LOGO_URL, DISPLAY_WELCOME_FOOTER } = interfaceConfig;
        const showAdditionalCard = this._shouldShowAdditionalCard();
        const showAdditionalContent = this._shouldShowAdditionalContent();
        const showAdditionalToolbarContent = this._shouldShowAdditionalToolbarContent();
        const contentClassName = showAdditionalContent ? 'with-content' : 'without-content';
        const footerClassName = DISPLAY_WELCOME_FOOTER ? 'with-footer' : 'without-footer';

        const {
            selectedTab,
            email,
            password,
            name,
            isLogin,
            isSubmitting,
            error
        } = this.state as any;

        const isClient = selectedTab === 'client';
        const isInterpreter = selectedTab === 'interpreter';
        const isCaptioner = selectedTab === 'captioner';
        const showClientTab = hasClientAccess();
        const showInterpreterTab = hasInterpreterAccess();
        const canSelfRegister = isClient;
        const themeClass = isClient ? 'earth' : isInterpreter ? 'moon' : 'sun';
        const tenantId = getWhitelabelConfig()?.tenantId || 'malka';
        const tenantClass = `tenant-${tenantId}`;
        const logoUrl = tenantId === 'maple' ? 'images/maple-icon-white.png' : isInterpreter ? getLogoWhiteUrl() : getLogoUrl();
        const tabIndicatorClass = isClient ? 'left' : isInterpreter ? 'center' : 'right';
        const clientLoginSubtitle = tenantId === 'maple'
            ? 'Sign in to join video remote interpreting sessions'
            : 'Sign in to make video relay calls';
        const subtitle = isLogin
            ? (isClient
                ? clientLoginSubtitle
                : isInterpreter
                    ? 'Sign in to join the interpreter queue'
                    : 'Sign in to join live calls as a captioner')
            : (isClient
                ? 'Create your account to get started'
                : 'Captioner and interpreter accounts are created by administrators');

        return (
            <div
                className = { `welcome vrs-auth-page ${contentClassName} ${footerClassName}` }
                id = 'welcome_page'>
                <div className = { `vrs-auth-fullscreen ${themeClass} ${tenantClass}` }>
                    <div
                        aria-hidden = 'true'
                        className = 'vrs-celestial-background'>
                        <div className = 'vrs-starfield vrs-starfield--near' />
                        <div className = 'vrs-starfield vrs-starfield--far' />
                        <div className = 'vrs-orbit-ring vrs-orbit-ring--wide' />
                        <div className = 'vrs-orbit-ring vrs-orbit-ring--tight' />
                        <div className = 'vrs-auth-planet vrs-auth-planet--earth'>
                            <span className = 'vrs-auth-planet-shade' />
                        </div>
                        <div className = 'vrs-auth-planet vrs-auth-planet--moon'>
                            <span className = 'vrs-auth-crater vrs-auth-crater--one' />
                            <span className = 'vrs-auth-crater vrs-auth-crater--two' />
                            <span className = 'vrs-auth-crater vrs-auth-crater--three' />
                        </div>
                        <div className = 'vrs-auth-planet vrs-auth-planet--sun' />
                    </div>

                    {/* Settings corner */}
                    <div className = 'welcome-page-settings'>
                        <SettingsButton
                            defaultTab = { SETTINGS_TABS.CALENDAR }
                            isDisplayedOnWelcomePage = { true } />
                        {showAdditionalToolbarContent
                            ? <div
                                className = 'settings-toolbar-content'
                                ref = { this._setAdditionalToolbarContentRef } />
                            : null
                        }
                    </div>

                    {/* Auth card */}
                    <div className = 'vrs-auth-card'>
                        {/* Logo */}
                        <div className = 'vrs-auth-logo'>
                            <img
                                alt = { getAppName() }
                                className = 'vrs-auth-logo-img'
                                src = { logoUrl } />
                            <span className = { `vrs-auth-logo-text ${themeClass}` }>
                                {getServiceBadgeLabel()}
                            </span>
                        </div>

                        {/* Tab toggle */}
                        <div className = 'vrs-auth-tabs'>
                            <div className = { `vrs-auth-tab-indicator ${tabIndicatorClass}` } />
                            {showClientTab && (
                                <button
                                    className = { `vrs-auth-tab ${isClient ? 'active' : ''}` }
                                    onClick = { () => this._handleTabSwitch('client') }
                                    type = 'button'>
                                    Client
                                </button>
                            )}
                            {showInterpreterTab && (
                                <button
                                    className = { `vrs-auth-tab ${isInterpreter ? 'active' : ''}` }
                                    onClick = { () => this._handleTabSwitch('interpreter') }
                                    type = 'button'>
                                    Interpreter
                                </button>
                            )}
                            <button
                                className = { `vrs-auth-tab ${isCaptioner ? 'active' : ''}` }
                                onClick = { () => this._handleTabSwitch('captioner') }
                                type = 'button'>
                                Captioner
                            </button>
                        </div>

                        {/* Subtitle */}
                        <p className = 'vrs-auth-subtitle'>
                            {subtitle}
                        </p>

                        {/* Error */}
                        {error && (
                            <div className = 'vrs-auth-error'>{error}</div>
                        )}

                        {/* Form */}
                        <form
                            className = 'vrs-auth-form'
                            onSubmit = { this._handleAuthSubmit }>
                            {!isLogin && isClient && (
                                <div className = 'vrs-auth-field'>
                                    <label htmlFor = 'vrs-name'>Full Name</label>
                                    <input
                                        autoCapitalize = 'words'
                                        autoComplete = 'name'
                                        disabled = { isSubmitting }
                                        id = 'vrs-name'
                                        onChange = { this._handleNameChange }
                                        placeholder = 'Jane Doe'
                                        type = 'text'
                                        value = { name } />
                                </div>
                            )}

                            <div className = 'vrs-auth-field'>
                                <label htmlFor = 'vrs-email'>Email</label>
                                <input
                                    autoComplete = 'email'
                                    disabled = { isSubmitting }
                                    id = 'vrs-email'
                                    onChange = { this._handleEmailChange }
                                    placeholder = 'you@example.com'
                                    required = { true }
                                    type = 'email'
                                    value = { email } />
                            </div>

                            <div className = 'vrs-auth-field'>
                                <label htmlFor = 'vrs-password'>Password</label>
                                <input
                                    autoComplete = 'current-password'
                                    disabled = { isSubmitting }
                                    id = 'vrs-password'
                                    onChange = { this._handlePasswordChange }
                                    placeholder = '••••••••'
                                    required = { true }
                                    type = 'password'
                                    value = { password } />
                            </div>

                            <button
                                className = { `vrs-auth-submit ${themeClass}` }
                                disabled = { isSubmitting }
                                type = 'submit'>
                                {isSubmitting
                                    ? 'Signing in...'
                                    : (isLogin ? 'Sign In' : 'Create Account')}
                            </button>
                        </form>

                        {/* Toggle login/register */}
                        <div className = 'vrs-auth-switch'>
                            {canSelfRegister && isLogin ? (
                                <>
                                    <span>Don't have an account?</span>
                                    <button
                                        onClick = { this._toggleAuthMode }
                                        type = 'button'>
                                        Create one
                                    </button>
                                </>
                            ) : canSelfRegister ? (
                                <>
                                    <span>Already have an account?</span>
                                    <button
                                        onClick = { this._toggleAuthMode }
                                        type = 'button'>
                                        Sign in
                                    </button>
                                </>
                            ) : (
                                <span>Need access? Ask an administrator to create your account.</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Hidden containers for legacy template injection */}
                <div style = {{ display: 'none' }}>
                    <div
                        className = 'welcome-page-content'
                        ref = { this._setAdditionalContentRef } />
                    <div
                        className = 'welcome-card welcome-card--dark'
                        ref = { this._setAdditionalCardRef } />
                </div>

                {DISPLAY_WELCOME_FOOTER && this._renderFooter()}
            </div>
        );
    }

    /**
     * Prevents submission of the form and delegates join logic.
     */
    _onFormSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!this._roomInputRef || this._roomInputRef.reportValidity()) {
            this._onJoin();
        }
    }

    // @ts-ignore
    _onRoomChange(event: React.ChangeEvent<HTMLInputElement>) {
        const specialCharacters = [ '?', '&', ':', '\'', '"', '%', '#', '.' ];
        this._titleHasNotAllowCharacter = specialCharacters.some(char => event.target.value.includes(char));
        super._onRoomChange(event.target.value);
    }

    _renderFooter() {
        const { t } = this.props;

        return (<footer className = 'welcome-footer'>
            <div className = 'welcome-footer-centered'>
                <div className = 'welcome-footer-padded'>
                    <div className = 'welcome-footer-row-block welcome-footer--row-1'>
                        <div className = 'welcome-footer-row-1-text'>
                            {t('welcomepage.jitsiOnMobile')}
                        </div>
                        <a
                            className = 'welcome-badge'
                            href = '#'
                            onClick = { e => e.preventDefault() }>
                            <img
                                alt = { t('welcomepage.mobileDownLoadLinkIos') }
                                src = './images/app-store-badge.png' />
                        </a>
                        <a
                            className = 'welcome-badge'
                            href = '#'
                            onClick = { e => e.preventDefault() }>
                            <img
                                alt = { t('welcomepage.mobileDownLoadLinkAndroid') }
                                src = './images/google-play-badge.png' />
                        </a>
                    </div>
                </div>
            </div>
        </footer>);
    }

    _setAdditionalCardRef(el: HTMLDivElement) {
        this._additionalCardRef = el;
    }

    _setAdditionalContentRef(el: HTMLDivElement) {
        this._additionalContentRef = el;
    }

    _setAdditionalToolbarContentRef(el: HTMLDivElement) {
        this._additionalToolbarContentRef = el;
    }

    _setRoomInputRef(el: HTMLInputElement) {
        this._roomInputRef = el;
    }

    _shouldShowAdditionalCard() {
        return interfaceConfig.DISPLAY_WELCOME_PAGE_ADDITIONAL_CARD
            && this._additionalCardTemplate
            && this._additionalCardTemplate.content
            && this._additionalCardTemplate.innerHTML.trim();
    }

    _shouldShowAdditionalContent() {
        return interfaceConfig.DISPLAY_WELCOME_PAGE_CONTENT
            && this._additionalContentTemplate
            && this._additionalContentTemplate.content
            && this._additionalContentTemplate.innerHTML.trim();
    }

    _shouldShowAdditionalToolbarContent() {
        return interfaceConfig.DISPLAY_WELCOME_PAGE_TOOLBAR_ADDITIONAL_CONTENT
            && this._additionalToolbarContentTemplate
            && this._additionalToolbarContentTemplate.content
            && this._additionalToolbarContentTemplate.innerHTML.trim();
    }
}

export default translate(connect(_mapStateToProps)(WelcomePage));
