# RTChess (classic mode)

Static prototype of a lichess-style board to play classic chess against a built-in engine.

## Run locally (serve over HTTP)

Because the script is an ES module, loading it from `file://` will trigger browser CORS protections. Serve the folder instead of opening the file directly:

- Quick server: `python3 -m http.server 8000` then visit `http://localhost:8000`.
- Or use any static server (e.g., `npx serve .`).

## Notes

- Real-time variant: both colors are user-controlled; pieces have a cooldown (3s at start, 10s after each move) before they can move again.
- Choose your color/difficulty selectors are disabled in this mode (free play).
- No AI: move any ready piece at any time.
- The board colors mimic the lichess brown theme; pieces use the lichess “cburnett” SVG set (see `assets/pieces`).
- Entry point is `index.js` (ES modules): served directly via the `<script type="module" src="index.js">` tag in `index.html`.
- The chess rules include castling, promotion, en passant, stalemate, checkmate, and the 50-move rule.
