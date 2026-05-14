# Diagram Playground ↔ Video Editor over BroadcastChannel

ADR 0004 specified a `window.opener`-based `postMessage` protocol between the Video Editor and the Diagram Playground popup. In practice that opener relationship is fragile: closing the parent window, refreshing it, or opening the playground standalone via URL all break the handle and there is no recovery path — the parent has no way to re-acquire a reference to an already-open popup.

Decision: replace the parent↔popup transport with a same-origin `BroadcastChannel` (`"cvm-diagrams"`). Both windows subscribe to the channel independently; either can post; both receive. The channel is the stable rendezvous point, so the editor and the playground can come and go in any order and reconnect automatically on mount.

`window.open(url, WINDOW_NAME, …)` is retained for the _focus-existing-popup_ behaviour — that's a separate browser API concern from messaging and `BroadcastChannel` does not replace it. The cached `childHandle` module-scope state in `diagram-window.ts` is removed; the parent no longer needs to track the popup's Window reference for messaging purposes.

## Considered options

- **`postMessage` via `window.opener` (status quo, ADR 0004).** Rejected: cannot survive parent close/reopen, parent refresh loses the cached `childHandle`, popups opened standalone have no opener, and there is no protocol-level path to re-pair an orphaned popup.
- **WebSocket, reusing the Stream Deck forwarder.** Rejected: topology mismatch (the forwarder is broadcast fan-out from hardware; this is paired browser-to-browser), introduces a required server process for a workflow unrelated to recording, and adds server-side pairing/lifecycle logic to solve a problem (two same-origin windows finding each other) that the browser already solves natively. WebSocket would be the right tool if editor and playground could live on different machines or if the server itself needed to push diagram events — neither is true today.
- **`BroadcastChannel` (chosen).** Same-origin pub/sub built into the browser. Zero server involvement, no pairing map, no opener dependency. Matches the constraint exactly: both endpoints are same-origin windows of the same app.
