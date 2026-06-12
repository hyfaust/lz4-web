/**
 * LZ4 Web Worker - receives block data, compresses, returns result.
 * This file is loaded as a Web Worker and contains embedded LZ4 code.
 */
(function() {
  // Embedded xxHash-32
  const PRIME32_1 = 0x9E3779B1, PRIME32_2 = 0x85EBCA77, PRIME32_3 = 0xC2B2AE3D, PRIME32_4 = 0x27D4EB2F, PRIME32_5 = 0x165667B1;
  function rotl32(x, r) { return ((x << r) | (x >>> (32 - r))) >>> 0; }
  function mul32(a, b) { return Number((BigInt(a >>> 0) * BigInt(b >>> 0)) & 0xFFFFFFFFn); }
  function read32le(buf, off) { return (buf[off] | (buf[off+1] << 8) | (buf[off+2] << 16) | (buf[off+3] << 24)) >>> 0; }

  function xxh32(data, seed) {
    let h32, offset = 0; const len = data.length; seed = seed || 0;
    if (len >= 16) {
      let v1 = (seed + PRIME32_1 + PRIME32_2) >>> 0, v2 = (seed + PRIME32_2) >>> 0, v3 = seed >>> 0, v4 = (seed - PRIME32_1) >>> 0;
      const limit = len - 16;
      while (offset <= limit) {
        v1 = mul32(rotl32((v1 + mul32(read32le(data, offset), PRIME32_2)) >>> 0, 13), PRIME32_1); offset += 4;
        v2 = mul32(rotl32((v2 + mul32(read32le(data, offset), PRIME32_2)) >>> 0, 13), PRIME32_1); offset += 4;
        v3 = mul32(rotl32((v3 + mul32(read32le(data, offset), PRIME32_2)) >>> 0, 13), PRIME32_1); offset += 4;
        v4 = mul32(rotl32((v4 + mul32(read32le(data, offset), PRIME32_2)) >>> 0, 13), PRIME32_1); offset += 4;
      }
      h32 = (rotl32(v1, 1) + rotl32(v2, 7) + rotl32(v3, 12) + rotl32(v4, 18)) >>> 0;
    } else { h32 = (seed + PRIME32_5) >>> 0; }
    h32 = (h32 + len) >>> 0;
    while (offset + 4 <= len) { h32 = mul32(rotl32((h32 + mul32(read32le(data, offset), PRIME32_3)) >>> 0, 17), PRIME32_4); offset += 4; }
    while (offset < len) { h32 = mul32(rotl32((h32 + mul32(data[offset], PRIME32_5)) >>> 0, 11), PRIME32_1); offset++; }
    h32 ^= h32 >>> 15; h32 = mul32(h32, PRIME32_2); h32 ^= h32 >>> 13; h32 = mul32(h32, PRIME32_3); h32 ^= h32 >>> 16;
    return h32 >>> 0;
  }

  // Embedded LZ4 Block compress (simplified Fast mode)
  const MIN_MATCH = 4, MAX_DISTANCE = 65535, HASH_LOG = 14, HASH_SIZE = 1 << HASH_LOG, HASH_MASK = HASH_SIZE - 1;
  function hash4(v) { return Number((BigInt(v >>> 0) * 2654435761n) >> 32n) & HASH_MASK; }
  function writeVarLength(dst, offset, length) { let r = length; while (r >= 255) { dst[offset++] = 255; r -= 255; } dst[offset++] = r; return offset; }

  function blockCompress(src, acceleration) {
    if (src.length === 0) return new Uint8Array(0);
    acceleration = Math.max(1, acceleration || 1);
    const maxDst = src.length + Math.floor(src.length / 255) + 16;
    const dst = new Uint8Array(maxDst);
    const hashTable = new Int32Array(HASH_SIZE).fill(-1);
    let srcOff = 0, dstOff = 0, literalStart = 0;
    const searchLimit = src.length - 5;

    while (srcOff < searchLimit) {
      let bestOff = -1, bestLen = 0;
      if (srcOff + MIN_MATCH <= src.length - MIN_MATCH) {
        const v = read32le(src, srcOff), h = hash4(v);
        const candidate = hashTable[h]; hashTable[h] = srcOff;
        if (candidate >= 0 && candidate < srcOff && (srcOff - candidate) <= MAX_DISTANCE) {
          const maxME = src.length - MIN_MATCH; let ml = 0;
          while (srcOff + ml < maxME && src[candidate + ml] === src[srcOff + ml]) ml++;
          if (ml >= MIN_MATCH) { bestOff = srcOff - candidate; bestLen = ml; }
        }
      }
      if (bestLen >= MIN_MATCH) {
        const ll = srcOff - literalStart;
        dst[dstOff++] = ((Math.min(ll, 15) << 4) | Math.min(bestLen - MIN_MATCH, 15)) & 0xFF;
        if (ll >= 15) dstOff = writeVarLength(dst, dstOff, ll - 15);
        for (let i = 0; i < ll; i++) dst[dstOff++] = src[literalStart + i];
        dst[dstOff++] = bestOff & 0xFF; dst[dstOff++] = (bestOff >> 8) & 0xFF;
        if (bestLen - MIN_MATCH >= 15) dstOff = writeVarLength(dst, dstOff, bestLen - MIN_MATCH - 15);
        srcOff += bestLen; literalStart = srcOff;
      } else { srcOff += acceleration; }
    }
    const ll = src.length - literalStart;
    dst[dstOff++] = (Math.min(ll, 15) << 4) & 0xF0;
    if (ll >= 15) dstOff = writeVarLength(dst, dstOff, ll - 15);
    for (let i = 0; i < ll; i++) dst[dstOff++] = src[literalStart + i];
    return dst.slice(0, dstOff);
  }

  // Message handler
  self.onmessage = function(e) {
    const { id, data, acceleration } = e.data;
    try {
      const src = new Uint8Array(data);
      const compressed = blockCompress(src, acceleration);
      // Transfer the compressed buffer back
      self.postMessage({ id, compressed: compressed.buffer, originalSize: src.length, compressedSize: compressed.length }, [compressed.buffer]);
    } catch (err) {
      self.postMessage({ id, error: err.message });
    }
  };
})();
