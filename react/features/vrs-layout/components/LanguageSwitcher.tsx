/**
 * VRS Language Switcher Component
 *
 * A compact language toggle for switching between English and Arabic.
 * Designed to blend seamlessly with the Jitsi toolbar.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { translate } from '../../base/i18n/functions';
import i18next from '../../base/i18n/i18next';
import { IReduxState } from '../../app/types';

interface IProps {
    _language: string;
    t: Function;
}

type SupportedLanguage = 'en' | 'ar';

const LANGUAGES: Record<SupportedLanguage, { name: string; flag: string; dir: 'ltr' | 'rtl' }> = {
    en: { name: 'English', flag: '🇺🇸', dir: 'ltr' },
    ar: { name: 'العربية', flag: '🇸🇦', dir: 'rtl' }
};

const useStyles = makeStyles()(theme => ({
    container: {
        position: 'relative',
        display: 'inline-block'
    },

    // Compact button style that blends with Jitsi toolbar
    button: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '6px',
        color: 'white',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        '&:hover': {
            backgroundColor: 'rgba(255, 107, 53, 0.25)',
            borderColor: 'rgba(255, 107, 53, 0.4)'
        },
        '&:active': {
            backgroundColor: 'rgba(255, 107, 53, 0.35)',
        }
    },

    buttonDark: {
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        '&:hover': {
            backgroundColor: 'rgba(255, 107, 53, 0.25)',
            borderColor: 'rgba(255, 107, 53, 0.4)'
        }
    },

    flag: {
        fontSize: '14px'
    },

    languageCode: {
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        opacity: 0.9,
        minWidth: '24px',
        textAlign: 'center' as const
    },

    // Dropdown menu
    menu: {
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        backgroundColor: '#1a1a1a',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '8px',
        padding: '6px',
        minWidth: '150px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        zIndex: 10000
    },

    menuItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        color: 'white',
        cursor: 'pointer',
        transition: 'background 0.15s',
        borderRadius: '6px',
        '&:hover': {
            backgroundColor: 'rgba(255, 107, 53, 0.2)'
        }
    },

    menuItemSelected: {
        backgroundColor: 'rgba(255, 107, 53, 0.15) !important',
    },

    languageName: {
        flex: 1,
        fontSize: '14px'
    },

    checkmark: {
        color: '#28a745',
        fontSize: '14px'
    },

    // RTL support
    rtl: {
        direction: 'rtl' as const
    }
}));

/**
 * Language switcher component for toggling between English and Arabic.
 * Compact design that blends with the Jitsi toolbar.
 */
const LanguageSwitcher = ({ _language, t }: IProps) => {
    const { classes, cx } = useStyles();
    const [isOpen, setIsOpen] = useState(false);
    const [currentLang, setCurrentLang] = useState<SupportedLanguage>(_language as SupportedLanguage || 'en');
    const [useDarkStyle, setUseDarkStyle] = useState(true);

    // Detect if we're in a toolbar (check parent elements)
    useEffect(() => {
        const checkToolbarParent = () => {
            const toolbar = document.querySelector('.toolbox-content-wrapped, .toolbox, [data-testid="toolbar"]');
            setUseDarkStyle(!toolbar); // Use dark style if not in toolbar (default)
        };

        checkToolbarParent();

        // Listen for DOM changes
        const observer = new MutationObserver(checkToolbarParent);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, []);

    // Sync with Redux language changes
    useEffect(() => {
        const lang = (_language || 'en').substring(0, 2) as SupportedLanguage;
        if (lang === 'en' || lang === 'ar') {
            setCurrentLang(lang);
        }
    }, [_language]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: any) => {
            const target = e.target as Element;
            if (!target.closest?.('.vrs-language-switcher')) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('click', handleClickOutside, { capture: true });
            return () => document.removeEventListener('click', handleClickOutside, { capture: true });
        }
    }, [isOpen]);

    // Handle keyboard (ESC to close)
    useEffect(() => {
        const handleKeyDown = (e: any) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const handleLanguageChange = useCallback((langCode: SupportedLanguage) => {
        setCurrentLang(langCode);
        setIsOpen(false);

        // Change i18n language
        void i18next.changeLanguage(langCode);

        // Update document direction for RTL support
        document.documentElement.dir = LANGUAGES[langCode].dir;
        document.documentElement.lang = langCode;

        // Store preference
        try {
            localStorage.setItem('vrs_preferred_language', langCode);
        } catch (e) {
            console.warn('Could not save language preference');
        }

        // Reload page to apply translations properly
        window.location.reload();
    }, []);

    const currentConfig = LANGUAGES[currentLang];
    const otherLang: SupportedLanguage = currentLang === 'en' ? 'ar' : 'en';

    return (
        <div className={cx('vrs-language-switcher', classes.container)}>
            <button
                className={cx(classes.button, useDarkStyle && classes.buttonDark)}
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                type="button"
                aria-label="Switch language"
                title={`Switch to ${LANGUAGES[otherLang].name}`}
            >
                <span className={classes.flag}>{currentConfig.flag}</span>
                <span className={classes.languageCode}>{currentLang.toUpperCase()}</span>
            </button>

            {isOpen && (
                <div className={classes.menu} onClick={(e) => e.stopPropagation()}>
                    {(Object.entries(LANGUAGES) as [SupportedLanguage, typeof LANGUAGES[SupportedLanguage]][]).map(
                        ([code, config]) => (
                            <div
                                key={code}
                                className={cx(
                                    classes.menuItem,
                                    currentLang === code && classes.menuItemSelected
                                )}
                                onClick={() => handleLanguageChange(code)}
                                role="button"
                                tabIndex={0}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleLanguageChange(code);
                                    }
                                }}
                            >
                                <span className={classes.flag}>{config.flag}</span>
                                <span className={classes.languageName}>{config.name}</span>
                                {currentLang === code && (
                                    <span className={classes.checkmark}>✓</span>
                                )}
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
};

function _mapStateToProps(state: IReduxState) {
    return {
        _language: (state as any)['features/base/i18n']?.currentLanguage || i18next.language || 'en'
    };
}

export default translate(connect(_mapStateToProps)(LanguageSwitcher));
