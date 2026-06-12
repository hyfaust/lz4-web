/**
 * xxHash-32 simplified implementation for LZ4 frame checksums.
 * Based on the xxHash specification: https://github.com/Cyan4973/xxHash
 */
var XXHash = (() => {
  const PRIME32_1 = 0x9E3779B1;
  const PRIME32_2 = 0x85EBCA77;
  const PRIME32_3 = 0xC2B2AE3D;
  const PRIME32_4 = 0x27D4EB2F;
  const PRIME32_5 = 0x165667B1;

  function rotl32(x, r) {
    return ((x << r) | (x >>> (32 - r))) >>> 0;
  }

  // 32-bit multiplication: returns (a * b) & 0xFFFFFFFF correctly
  // Uses BigInt to avoid JS double-precision loss on large intermediates
  function mul32(a, b) {
    return Number((BigInt(a >>> 0) * BigInt(b >>> 0)) & 0xFFFFFFFFn);
  }

  function read32(buf, offset) {
    return (buf[offset] | (buf[offset+1] << 8) | (buf[offset+2] << 16) | (buf[offset+3] << 24)) >>> 0;
  }

  /**
   * Compute xxHash-32 of data with given seed.
   * @param {Uint8Array} data
   * @param {number} seed - default 0
   * @returns {number} 32-bit unsigned hash
   */
  function xxh32(data, seed = 0) {
    let h32;
    let offset = 0;
    const len = data.length;

    if (len >= 16) {
      let v1 = (seed + PRIME32_1 + PRIME32_2) >>> 0;
      let v2 = (seed + PRIME32_2) >>> 0;
      let v3 = (seed + 0) >>> 0;
      let v4 = (seed - PRIME32_1) >>> 0;

      const limit = len - 16;
      while (offset <= limit) {
        v1 = mul32(rotl32((v1 + mul32(read32(data, offset), PRIME32_2)) >>> 0, 13), PRIME32_1);
        offset += 4;
        v2 = mul32(rotl32((v2 + mul32(read32(data, offset), PRIME32_2)) >>> 0, 13), PRIME32_1);
        offset += 4;
        v3 = mul32(rotl32((v3 + mul32(read32(data, offset), PRIME32_2)) >>> 0, 13), PRIME32_1);
        offset += 4;
        v4 = mul32(rotl32((v4 + mul32(read32(data, offset), PRIME32_2)) >>> 0, 13), PRIME32_1);
        offset += 4;
      }

      h32 = (rotl32(v1, 1) + rotl32(v2, 7) + rotl32(v3, 12) + rotl32(v4, 18)) >>> 0;
    } else {
      h32 = (seed + PRIME32_5) >>> 0;
    }

    h32 = (h32 + len) >>> 0;

    while (offset + 4 <= len) {
      h32 = mul32(rotl32((h32 + mul32(read32(data, offset), PRIME32_3)) >>> 0, 17), PRIME32_4);
      offset += 4;
    }

    while (offset < len) {
      h32 = mul32(rotl32((h32 + mul32(data[offset], PRIME32_5)) >>> 0, 11), PRIME32_1);
      offset++;
    }

    h32 ^= h32 >>> 15;
    h32 = mul32(h32, PRIME32_2);
    h32 ^= h32 >>> 13;
    h32 = mul32(h32, PRIME32_3);
    h32 ^= h32 >>> 16;

    return h32 >>> 0;
  }

  return { xxh32 };
})();
