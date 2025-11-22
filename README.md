# RTChess (classic mode)

Static prototype of a lichess-style board to play classic chess against a built-in engine.

## Run locally (serve over HTTP)

Because the script is an ES module, loading it from `file://` will trigger browser CORS protections. Serve the folder instead of opening the file directly:

- Quick server: `python3 -m http.server 8000` then visit `http://localhost:8000`.
- Or use any static server (e.g., `npx serve .`).

## Notes

- Choose your color and difficulty from the sidebar, then start a new game.
- Playing as Black lets the AI make the opening move automatically.
- The board colors mimic the lichess brown theme; pieces use the lichess “cburnett” SVG set (see `assets/pieces`).
- The chess rules include castling, promotion, en passant, stalemate, checkmate, and the 50-move rule.
