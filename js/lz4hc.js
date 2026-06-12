/**
 * LZ4 HC (High Compression) mode.
 * Uses chain-based match finding for better compression ratio.
 * Levels 2-9: chain search with increasing depth.
 * Levels 10-12: deeper search (approximation of optimal parser).
 */
var LZ4HC = (() => {
  const MIN_MATCH = 4;
  const MAX_DISTANCE = 65535;
  const HASH_LOG = 16;
  const HASH_SIZE = 1 << HASH_LOG;
  const HASH_MASK = HASH_SIZE - 1;
  const CHAIN_SIZE = 1 << 16; // 64K entries (matches MAX_DISTANCE)
  const LAST_LITERALS = 5;
  const MFLIMIT = 12;

  // Level parameters: [strategy, nbSearches, targetLength]
  const LEVEL_PARAMS = [
    null, // 0 unused
    null, // 1 unused (use Fast)
    { searches: 2,   targetLen: 16 },   // 2
    { searches: 4,   targetLen: 16 },   // 3
    { searches: 8,   targetLen: 16 },   // 4
    { searches: 16,  targetLen: 16 },   // 5
    { searches: 32,  targetLen: 16 },   // 6
    { searches: 64,  targetLen: 16 },   // 7
    { searches: 128, targetLen: 16 },   // 8
    { searches: 256, targetLen: 16 },   // 9
    { searches: 96,  targetLen: 64 },   // 10
    { searches: 512, targetLen: 128 },  // 11
    { searches: 16384, targetLen: 4096 }, // 12
  ];

  function hash4(v) {
    return ((v * 2654435761) >>> (32 - HASH_LOG)) & HASH_MASK;
  }

  function read32le(buf, off) {
    return (buf[off] | (buf[off+1] << 8) | (buf[off+2] << 16) | (buf[off+3] << 24)) >>> 0;
  }

  function writeVarLength(dst, offset, length) {
    let remaining = length;
    while (remaining >= 255) { dst[offset++] = 255; remaining -= 255; }
    dst[offset++] = remaining;
    return offset;
  }

  /**
   * Count matching bytes between two positions.
   */
  function countMatch(src, p1, p2, limit) {
    let count = 0;
    while (count < limit && src[p1 + count] === src[p2 + count]) count++;
    return count;
  }

  /**
   * Compress data using LZ4 HC algorithm.
   * @param {Uint8Array} src - source data
   * @param {Object} options - { level: 2-12, dict: Uint8Array }
   * @returns {Uint8Array} compressed data
   */
  function compress(src, options = {}) {
    if (src.length === 0) return new Uint8Array(0);
    const level = Math.max(2, Math.min(12, options.level || 9));
    const params = LEVEL_PARAMS[level];
    const dict = options.dict || null;

    const maxDst = src.length + Math.floor(src.length / 255) + 16;
    const dst = new Uint8Array(maxDst);

    // Hash table: maps hash → most recent position
    const hashTable = new Int32Array(HASH_SIZE).fill(-1);
    // Chain table: indexed by position, stores previous position with same hash
    // Use a Map for sparse storage (positions can be up to src.length)
    const chainTable = new Map();

    let dstOff = 0;
    let srcOff = 0;
    let anchor = 0;

    const searchLimit = src.length - LAST_LITERALS;
    const matchLimit = src.length - LAST_LITERALS - MIN_MATCH;

    // Insert a position into the hash+chain tables
    function insert(pos) {
      if (pos + MIN_MATCH > src.length) return;
      const v = read32le(src, pos);
      const h = hash4(v);
      const prev = hashTable[h];
      if (prev >= 0 && prev < pos) {
        chainTable.set(pos, prev);
      }
      hashTable[h] = pos;
    }

    // Find the best match at position `pos` by following the chain
    function findBestMatch(pos) {
      if (pos + MIN_MATCH > matchLimit) return null;
      const v = read32le(src, pos);
      const h = hash4(v);
      let candidate = hashTable[h];
      let bestLen = 0;
      let bestOff = 0;
      let nbSearched = 0;

      while (candidate >= 0 && nbSearched < params.searches) {
        const dist = pos - candidate;
        const nextCandidate = chainTable.get(candidate);
        if (dist <= 0 || dist > MAX_DISTANCE) {
          candidate = (nextCandidate !== undefined && nextCandidate < candidate) ? nextCandidate : -1;
          continue;
        }

        let ml = countMatch(src, pos, candidate, searchLimit - pos);
        if (ml >= MIN_MATCH && ml > bestLen) {
          bestLen = ml;
          bestOff = dist;
          if (ml >= params.targetLen) break;
        }

        nbSearched++;
        if (nextCandidate === undefined || nextCandidate >= candidate) break;
        candidate = nextCandidate;
      }

      return bestLen >= MIN_MATCH ? { length: bestLen, offset: bestOff } : null;
    }

    // Pre-insert all positions into the hash+chain tables
    for (let i = 0; i + MIN_MATCH <= src.length; i++) {
      insert(i);
    }

    // Main compression loop
    while (srcOff < searchLimit) {
      const match = findBestMatch(srcOff);

      if (!match) {
        srcOff++;
        continue;
      }

      // Check if the match is worth encoding
      const litLen = srcOff - anchor;
      const matchLen = match.length;
      const offset = match.offset;

      // Verify match doesn't extend past end
      const maxML = Math.min(matchLen, searchLimit - srcOff);

      // Encode sequence
      const tokenLitLen = Math.min(litLen, 15);
      const tokenMatchLen = Math.min(maxML - MIN_MATCH, 15);
      dst[dstOff++] = ((tokenLitLen << 4) | tokenMatchLen) & 0xFF;

      if (litLen >= 15) dstOff = writeVarLength(dst, dstOff, litLen - 15);
      for (let i = 0; i < litLen; i++) dst[dstOff++] = src[anchor + i];

      dst[dstOff++] = offset & 0xFF;
      dst[dstOff++] = (offset >> 8) & 0xFF;

      if (maxML - MIN_MATCH >= 15) dstOff = writeVarLength(dst, dstOff, maxML - MIN_MATCH - 15);

      srcOff += maxML;
      anchor = srcOff;
    }

    // Write last literals
    const litLen = src.length - anchor;
    dst[dstOff++] = (Math.min(litLen, 15) << 4) & 0xF0;
    if (litLen >= 15) dstOff = writeVarLength(dst, dstOff, litLen - 15);
    for (let i = 0; i < litLen; i++) dst[dstOff++] = src[anchor + i];

    return dst.slice(0, dstOff);
  }

  return { compress };
})();
