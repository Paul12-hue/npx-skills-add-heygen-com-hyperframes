/**
 * The "Twilight Retro" palette – 32 colours, shared with the world map
 * (tools/map/retro_compose.py). Every final pixel of the game is snapped to one
 * of these colours when the retro palette is enabled.
 */
export const PALETTE_HEX: readonly string[] = [
  // parchment & earth
  'f2e6c8', 'e6d3a8', 'd9c095', 'c8aa78', 'b08f5e', '8e6e45', '6a4e30', '4a3220',
  '2a160b', '120a05',
  // greys of the Hush
  'b9b5bd', '9a96a0', '7c7883', '5f5b66', '403d47',
  // water
  'a9bab3', '86a09b', '65807d', '45605f',
  // moss & forest
  '7f8c4a', '5d6b3a', '3f4a27', '27301a',
  // bone / snow
  'fbf7ec',
  // candle light & rust
  'f5c060', 'e0902c', 'a8541c', '8a2c18', '5a2a14',
  // Lethe violet / dusk
  'a596c4', '7d6aa3', '4f4170',
];

export const PALETTE_SIZE = PALETTE_HEX.length;

/** Palette as linear 0..1 RGB triplets (sRGB values, as stored in the shader). */
export function paletteRgb(): number[][] {
  return PALETTE_HEX.map((h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
}

/** Index of the palette colour closest to an sRGB colour (0..1). Used by tests and tools. */
export function nearestPaletteIndex(r: number, g: number, b: number): number {
  const pal = paletteRgb();
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const [pr, pg, pb] = pal[i];
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
