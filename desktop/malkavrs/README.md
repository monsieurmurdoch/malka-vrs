# MalkaVRS Desktop

Lightweight Electron wrapper for the MalkaVRS web app.

The first target is the interpreter queue experience: when the web app receives
an incoming interpreter request, the desktop wrapper flashes the app window and
opens a large always-on-top alert. The existing web page remains responsible for
authentication, accept/decline, queue state, and room entry.

## Run Locally

```sh
npm --prefix desktop/malkavrs install
npm --prefix desktop/malkavrs start
```

Defaults:

- URL: `https://vrs.malkacomm.com/interpreter-profile.html?desktop=1`
- App name: `MalkaVRS`
- Icon: `desktop/malkavrs/assets/icon.png`

Optional overrides:

```sh
MALKA_DESKTOP_URL=http://localhost:8080/interpreter-profile.html?desktop=1 \
npm --prefix desktop/malkavrs start
```

## Current Scope

- MalkaVRS only.
- Interpreter incoming-request alert only.
- No separate desktop auth or queue implementation.
- No packaged installer yet.

## Client Account Download Link

MalkaVRS client accounts link to `/downloads/malkavrs-desktop.html`. Once
signed installers are produced, place them at:

- `/downloads/MalkaVRS-Desktop.dmg`
- `/downloads/MalkaVRS-Desktop.exe`

The account UI can stay stable while the downloadable artifacts change behind
that page.

## Verification

1. Start the desktop app.
2. Log in as a MalkaVRS interpreter.
3. Join the queue.
4. Request an interpreter from a MalkaVRS client account.
5. Confirm the desktop window flashes/focuses and the large incoming-request
   alert appears.
6. Click **Open Request**, then accept or decline in the web app.
