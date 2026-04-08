/**
 * VRS Layout Components
 *
 * The VRS layout provides a specialized 3-part video layout for Video Relay Service:
 * - Caller (deaf/hard-of-hearing client)
 * - Interpreter (sign language interpreter)
 * - Called Party (hearing person being called)
 *
 * Components:
 * - VRSLayout: Main 3-way video layout component (placeholder)
 * - LanguageSwitcher: Language toggle (EN/AR) for VRS interface
 * - ClientLogin: Client waiting room with video preview and queue status
 * - InterpreterLogin: Interpreter waiting room with availability toggle and queue
 * - InterpreterDashboard: Dashboard for interpreters to view active calls and queue
 */

export { default as VRSLayout } from './VRSLayout';
export { default as LanguageSwitcher } from './LanguageSwitcher';
export { default as ClientLogin } from './ClientLogin.web';
export { default as InterpreterLogin } from './InterpreterLogin.web';
export { default as InterpreterDashboard } from './InterpreterDashboard.web';
