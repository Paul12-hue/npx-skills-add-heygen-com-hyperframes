"""Turns the two 640x480 map layers into a 90s-style pixel map.

- the art layer is reduced to a fixed 32-colour "Twilight Retro" palette with 4x4 ordered (Bayer) dithering
- the text layer is hard-thresholded (no anti-aliasing) and gets a 1px light outline
- the result is upscaled 2x with nearest-neighbour to 1280x960

Usage: python3 retro_compose.py <layerDir> <out.png>
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

PALETTE_HEX = [
    # parchment & land
    "f2e6c8", "e6d3a8", "d9c095", "c8aa78", "b08f5e", "8e6e45", "6a4e30", "4a3220",
    "2a160b", "120a05",
    # greys of the Hush
    "b9b5bd", "9a96a0", "7c7883", "5f5b66", "403d47",
    # sea
    "a9bab3", "86a09b", "65807d", "45605f",
    # forest
    "7f8c4a", "5d6b3a", "3f4a27", "27301a",
    # snow / bone
    "fbf7ec",
    # lights & accents
    "f5c060", "e0902c", "a8541c", "8a2c18", "5a2a14",
    # Lethe-Wyn violet
    "a596c4", "7d6aa3", "4f4170",
]
PAL = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in PALETTE_HEX], dtype=np.float32)

BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32) / 16 - 0.5
DITHER_STRENGTH = 26.0


def dither(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, _ = a.shape
    t = np.tile(BAYER4, (h // 4 + 1, w // 4 + 1))[:h, :w, None]
    a = a + t * DITHER_STRENGTH
    d = ((a[:, :, None, :] - PAL[None, None, :, :]) ** 2).sum(-1)
    return Image.fromarray(PAL[d.argmin(-1)].astype(np.uint8), "RGB")


def main():
    layer_dir, out = sys.argv[1], sys.argv[2]
    art = dither(Image.open(f"{layer_dir}/art.png"))

    labels = Image.open(f"{layer_dir}/labels.png").convert("RGBA")
    alpha = np.asarray(labels)[:, :, 3]
    mask = Image.fromarray(((alpha > 110) * 255).astype(np.uint8), "L")
    outline = mask.filter(ImageFilter.MaxFilter(3))

    rgb = np.asarray(labels)[:, :, :3]
    text = Image.fromarray(rgb, "RGB")
    art.paste((242, 230, 200), mask=outline)
    art.paste(dither(text), mask=mask)

    art.resize((art.width * 2, art.height * 2), Image.NEAREST).save(out)
    print("wrote", out, art.width * 2, "x", art.height * 2)


if __name__ == "__main__":
    main()
