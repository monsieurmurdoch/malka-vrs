# Mobile QA Matrix

Test matrix for MalkaVRS mobile apps across devices, OS versions, and feature areas.

> Last updated: April 30, 2026

## Device Matrix

| Device | OS | Form Factor | Priority |
|--------|-----|------------|----------|
| iPhone 15 | iOS 17+ | Phone | P0 |
| iPhone SE (3rd gen) | iOS 17+ | Phone (small) | P0 |
| iPhone 14 Pro | iOS 17+ | Phone (notch) | P1 |
| iPad (10th gen) | iPadOS 17+ | Tablet | P1 |
| Samsung Galaxy S24 | Android 14 | Phone | P0 |
| Google Pixel 8 | Android 14 | Phone | P0 |
| Samsung Galaxy A54 | Android 13 | Phone (mid-range) | P1 |
| Samsung Galaxy Tab S9 | Android 14 | Tablet | P2 |

## Test Areas

### Authentication & Onboarding

| Test Case | iOS | Android | Notes |
|-----------|-----|---------|-------|
| Email/password login | [ ] | [ ] | Malka and Maple accounts |
| Role selector (Client/Interpreter) | [ ] | [ ] | Should persist on relaunch |
| Auth persistence across app restart | [ ] | [ ] | Should skip login if authed |
| Logout clears session state | [ ] | [ ] | Navigates to login screen |
| Invalid credentials error feedback | [ ] | [ ] | Should show error message |
| Token expiry handling | [ ] | [ ] | Should redirect to login |

### Client VRS Flow

| Test Case | iOS | Android | Notes |
|-----------|-----|---------|-------|
| VRS Home loads with tenant branding | [ ] | [ ] | Check theme colors |
| Request Interpreter button works | [ ] | [ ] | Enters queue |
| Queue status updates in real-time | [ ] | [ ] | WebSocket event |
| Cancel pending request | [ ] | [ ] | Returns to home |
| Auto-enter matched room | [ ] | [ ] | Camera on, mic muted |
| Leave call returns to home | [ ] | [ ] | No sign-out |
| Call history populated after call | [ ] | [ ] | Local storage entry |
| Dial Pad shows number entry | [ ] | [ ] | Numeric keyboard |
| Contacts list loads | [ ] | [ ] | With search |
| Contact detail with notes | [ ] | [ ] | Edit and save |
| Voicemail inbox with unread badge | [ ] | [ ] | Mark read, delete |
| Language selector persists | [ ] | [ ] | ASL, LSQ, English, French |
| Captions toggle persists | [ ] | [ ] | CC button on home |

### Client VRI Flow

| Test Case | iOS | Android | Notes |
|-----------|-----|---------|-------|
| VRI Console loads with self-view | [ ] | [ ] | Placeholder/self-view |
| Request Interpreter from VRI | [ ] | [ ] | VRI-specific queue |
| VRI Settings persist media defaults | [ ] | [ ] | Camera, mic, auto-join |
| VRI Usage shows day/week/month | [ ] | [ ] | Call history data |
| Network status bar shows state | [ ] | [ ] | Disconnected banner |

### Interpreter Flow

| Test Case | iOS | Android | Notes |
|-----------|-----|---------|-------|
| Interpreter login routes to interpreter home | [ ] | [ ] | Not client home |
| Availability toggle (Available/Offline) | [ ] | [ ] | Green/gray state |
| Incoming request notification (vibration) | [ ] | [ ] | Foreground alert |
| Accept request auto-joins room | [ ] | [ ] | With client context |
| Decline request returns to waiting | [ ] | [ ] | Removes from pending |
| End call returns to interpreter home | [ ] | [ ] | No sign-out |
| Settings save profile changes | [ ] | [ ] | Name, modes, languages |
| Earnings shows payable minutes | [ ] | [ ] | Day/week/month breakdown |

### Media & Permissions

| Test Case | iOS | Android | Notes |
|-----------|-----|---------|-------|
| Camera permission prompt | [ ] | [ ] | First launch |
| Microphone permission prompt | [ ] | [ ] | First launch |
| Camera on/off in call | [ ] | [ ] | Toggle works |
| Mic on/off in call | [ ] | [ ] | Toggle works |
| Speaker / Bluetooth switching | [ ] | [ ] | Audio route picker |
| Camera flip (front/back) | [ ] | [ ] | In-call toggle |
| Low network quality indicator | [ ] | [ ] | NetworkStatusBar |

### Orientation & Layout

| Test Case | iOS | Android | Notes |
|-----------|-----|---------|-------|
| Portrait mode all screens | [ ] | [ ] | Default orientation |
| Landscape mode in call | [ ] | [ ] | Video layout adapts |
| Tablet layout not stretched | [ ] | [ ] | Should use space well |
| Small screen (iPhone SE) usable | [ ] | [ ] | No cut-off content |
| Safe area / notch handling | [ ] | [ ] | No overlap |

### Background & Lifecycle

| Test Case | iOS | Android | Notes |
|-----------|-----|---------|-------|
| App background during call | [ ] | [ ] | Audio continues |
| App kill during call | [ ] | [ ] | Rejoin or graceful end |
| Network switch (WiFi ↔ cellular) | [ ] | [ ] | Reconnect behavior |
| Screen lock during call | [ ] | [ ] | Audio continues |
| App relaunch preserves auth | [ ] | [ ] | Skip login |

### Tenant Branding

| Test Case | Tenant | iOS | Android | Notes |
|-----------|--------|-----|---------|-------|
| MalkaVRS theme colors | malka | [ ] | [ ] | Blue/navy primary |
| MalkaVRI theme colors | malkavri | [ ] | [ ] | Same blue, VRI flow |
| MapleVRI theme colors | maple | [ ] | [ ] | Red primary |
| App icon per tenant | all | [ ] | [ ] | Tenant-specific icon |
| Display name per tenant | all | [ ] | [ ] | MalkaVRS / MalkaVRI / MapleVRI |

### Accessibility

| Test Case | iOS | Android | Notes |
|-----------|-----|---------|-------|
| VoiceOver/TalkBack navigation | [ ] | [ ] | All screens |
| Dynamic Type / font scaling | [ ] | [ ] | No clipping |
| Color contrast (WCAG AA) | [ ] | [ ] | All text readable |
| Touch target sizes (44pt min) | [ ] | [ ] | All buttons |
| Accessibility labels on controls | [ ] | [ ] | Meaningful labels |

### Store Readiness

| Test Case | iOS | Android | Notes |
|-----------|-----|---------|-------|
| Privacy manifest present | [ ] | [ ] | PrivacyInfo.xcprivacy |
| Permission usage strings | [ ] | [ ] | Camera, mic descriptions |
| No hardcoded secrets | [ ] | [ ] | No API keys in bundle |
| App Store screenshots | [ ] | [ ] | 6.5" and 5.5" sizes |
| Store listing copy | [ ] | [ ] | Description, keywords |
| Crash on launch | [ ] | [ ] | Must not crash |
