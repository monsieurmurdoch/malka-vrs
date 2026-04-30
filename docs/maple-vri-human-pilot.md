# Maple VRI Human Pilot Script

Use this as the live smoke script for the Maple VRI pilot. Keep browser devtools open on at least the client side.

## Preconditions

- Maple client, interpreter, and admin seed accounts can log in.
- The interpreter account has `vri` permission and ASL enabled.
- The admin account can open the admin queue view for tenant `maple`.
- Use two separate browser profiles or devices for client and interpreter.

## Script

1. Open `https://vri.maplecomm.ca/` as the Maple VRI client.
2. Confirm no visible Maple client copy says “video relay.”
3. Confirm the client profile shows the camera self-view, Request Interpreter, and Session Invites.
4. Prepare a guest invite from the client profile.
5. Open the prepared guest invite in another browser profile.
6. Confirm the guest invite says the room opens only after interpreter confirmation.
7. Open the Maple interpreter profile in a separate browser profile.
8. Click Join Queue / Go Available.
9. From the client profile, click Request Interpreter.
10. In the admin portal, confirm the live queue item appears with tenant `maple`, service mode `vri`, and language `ASL`.
11. Accept the request as the interpreter.
12. Confirm the client enters the room automatically with camera off and mic muted.
13. Confirm the interpreter enters the same room.
14. Refresh the guest invite page and confirm it now exposes Join Session.
15. Use the in-room Invite button from the client room and confirm it copies a scoped VRI invite link.
16. End the call normally.
17. Confirm the admin active-call view clears.
18. Confirm the call record/CDR has `call_type = vri`.
19. Confirm the original and in-room guest invite links no longer become newly active after the call is ended.

## Pass Criteria

- VRI clients cannot create a live room before an interpreter accepts.
- Prepared guest links wait outside the room until the match is live.
- Guest links are scoped to the session and expire after cancellation/end.
- Maple VRI copy does not say “video relay” on client-only VRI paths.
- Call end writes a VRI call record/CDR without mutating `calls.call_type`.
