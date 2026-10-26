/**
 * Width and height of a WebP file, read from its header, so the seed photo loader needs no image
 * library. Handles the three WebP flavors: lossy (`VP8 `), lossless (`VP8L`) and extended
 * (`VP8X`, used for alpha, animation and metadata). Returns null for anything that is not a WebP
 * or is cut short.
 */
export function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  const at = (i: number) => bytes[i] ?? 0;
  const tag = (i: number) => String.fromCharCode(at(i), at(i + 1), at(i + 2), at(i + 3));
  if (bytes.length < 30 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;
  let size: { width: number; height: number } | null = null;
  const chunk = tag(12);
  if (chunk === 'VP8 ') {
    // A 3 byte frame tag, the start code 9d 01 2a, then 14 bit width and height (2 scale bits each).
    if (at(23) === 0x9d && at(24) === 0x01 && at(25) === 0x2a) {
      size = {
        width: (at(26) | (at(27) << 8)) & 0x3fff,
        height: (at(28) | (at(29) << 8)) & 0x3fff,
      };
    }
  } else if (chunk === 'VP8L') {
    // The signature byte 2f, then width minus one and height minus one, 14 bits each.
    if (at(20) === 0x2f) {
      const bits = (at(21) | (at(22) << 8) | (at(23) << 16) | (at(24) << 24)) >>> 0;
      size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  } else if (chunk === 'VP8X') {
    // Flags and reserved bytes, then the canvas width minus one and height minus one, 24 bits each.
    size = {
      width: (at(24) | (at(25) << 8) | (at(26) << 16)) + 1,
      height: (at(27) | (at(28) << 8) | (at(29) << 16)) + 1,
    };
  }
  return size && size.width > 0 && size.height > 0 ? size : null;
}
