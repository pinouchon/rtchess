# RTChess (real-time prototype)

Real-time chess prototype (lichess-style board) where both sides are controlled by one player.

## Run locally (serve over HTTP)

Because the script is an ES module, loading it from `file://` will trigger browser CORS protections. Serve the folder instead of opening the file directly:

- Quick server: `python3 -m http.server 8000` then visit `http://localhost:8000`.
- Or use any static server (e.g., `npx serve .`).

## Notes

- Real-time variant (single player controls both sides):
  - Pieces start with a 3s cooldown; after each move the moved piece gets a 10s cooldown.
  - A shrinking ring around a piece shows remaining cooldown (clockwise, starts at 12 o’clock).
  - You can move any off-cooldown piece at any time; check is purely a visual indicator. Game ends on king capture.
- Choose your color/difficulty selectors are disabled in this mode (free play).
- No AI: move any ready piece at any time.
- The board colors mimic the lichess brown theme; pieces use the lichess “cburnett” SVG set (see `assets/pieces`).
- Entry point is `index.js` (ES modules): served directly via the `<script type="module" src="index.js">` tag in `index.html`.
