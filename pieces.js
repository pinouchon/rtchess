export const PIECE_IMAGES = {
  wP: "assets/pieces/wP.svg",
  wR: "assets/pieces/wR.svg",
  wN: "assets/pieces/wN.svg",
  wB: "assets/pieces/wB.svg",
  wQ: "assets/pieces/wQ.svg",
  wK: "assets/pieces/wK.svg",
  bP: "assets/pieces/bP.svg",
  bR: "assets/pieces/bR.svg",
  bN: "assets/pieces/bN.svg",
  bB: "assets/pieces/bB.svg",
  bQ: "assets/pieces/bQ.svg",
  bK: "assets/pieces/bK.svg",
};

export function pieceSrc(piece) {
  if (!piece) return "";
  const color = piece === piece.toUpperCase() ? "w" : "b";
  const type = piece.toUpperCase();
  return PIECE_IMAGES[`${color}${type}`];
}
