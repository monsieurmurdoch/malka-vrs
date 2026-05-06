# Mobile Parity PR Checklist

Use this template when reviewing PRs that add or modify web features.
The reviewer should confirm each item is addressed before merging.

---

## Feature: `<brief description>`

### Mobile Impact Assessment

- [ ] Does this PR change any shared code (Redux actions, middleware, API client, types)?
  - If yes, does it compile on both `tsc:web` and `tsc:native`?
- [ ] Does this PR introduce new browser-only APIs (`window.*`, `document.*`, `localStorage`)?
  - If yes, are they guarded with `typeof` checks or behind `.web.ts` files?
- [ ] Does this PR add new REST/WebSocket message types?
  - If yes, are the types shared or duplicated between web and mobile?

### Screens

- [ ] Does this PR add new navigation routes?
  - If yes, are they registered in `routes.ts` and `RootNavigationContainer.tsx`?
- [ ] Does this PR add new UI components?
  - If yes, is there a mobile equivalent or an intentional web-only decision documented?

### Storage

- [ ] Does this PR use `localStorage`/`sessionStorage` directly?
  - If yes, switch to `getPersistentItem`/`setPersistentItem` from `vrs-auth/storage`
- [ ] Does this PR store sensitive tokens?
  - If yes, use `getSecureItem`/`setSecureItem` from `vrs-auth/secureStorage`

### Queue / WebSocket

- [ ] Does this PR change queue service message types or handlers?
  - If yes, does the mobile queue service handle the same events?

### Config / Whitelabel

- [ ] Does this PR add new whitelabel config fields?
  - If yes, are they added to all three tenant configs (malka, malkavri, maple)?
- [ ] Does this PR add new feature flags?
  - If yes, are they checked on mobile screens where applicable?

### Documentation

- [ ] ROADMAP.md updated with one of:
  - `[x]` Implemented on mobile (with date)
  - `Intentionally web-only` (with reason)
  - `Mobile follow-up: #<issue>` (ticket reference)
