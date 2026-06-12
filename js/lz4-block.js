/**
 * LZ4 Block format encoder/decoder.
 * Implements the LZ4 block compression algorithm based on the official specification.
 * Reference: lz4_Block_format.md and lz4/lib/lz4.c
 */
var LZ4Block = (() => {
  const MIN_MATCH = 4;
  const MAX_DISTANCE = 65535;
  // Hash table size: 2^14 = 16384 entries (LZ4_MEMORY_USAGE=14)
  const HASH_LOG = 14;
  const HASH_SIZE = 1 << HASH_LOG;
  const HASH_MASK = HASH_SIZE - 1;
  const SKIP_TRIGGER = 6; // acceleration factor

  function hash4(v) {
    // LZ4 hash function: multiply by 2654435761 (golden ratio prime), take top bits
    // Uses BigInt to avoid precision loss on large 32-bit multiplications
    return Number((BigInt(v >>> 0) * 2654435761n) >> 32n) & HASH_MASK;
  }

  function read32le(buf, off) {
    return (buf[off] | (buf[off+1] << 8) | (buf[off+2] << 16) | (buf[off+3] << 24)) >>> 0;
  }

  /**
   * Write a variable-length integer (for literal/match lengths > 15).
   * Returns number of bytes written to dst at offset.
   */
  function writeVarLength(dst, offset, length) {
    let remaining = length;
    while (remaining >= 255) {
      dst[offset++] = 255;
      remaining -= 255;
    }
    dst[offset++] = remaining;
    return offset;
  }

  /**
   * Read a variable-length integer from src at offset.
   * Returns { value, bytesRead }.
   */
  function readVarLength(src, offset) {
    let length = 0;
    let b;
    do {
      if (offset >= src.length) return { value: length, bytesRead: offset };
      b = src[offset++];
      length += b;
    } while (b === 255);
    return { value: length, bytesRead: offset };
  }

  /**
   * Compress data using LZ4 block format.
   * @param {Uint8Array} src - source data
   * @param {Object} options - { acceleration, dict }
   *   acceleration: number (1=best ratio, higher=faster)
   *   dict: Uint8Array (dictionary, last 64KB used for matching)
   * @returns {Uint8Array} compressed data
   */
  function compress(src, options = {}) {
    if (src.length === 0) return new Uint8Array(0);
    const acceleration = Math.max(1, options.acceleration || 1);
    const dict = options.dict || null;

    // Output buffer: worst case = src.length + src.length/255 + 16
    const maxDst = src.length + Math.floor(src.length / 255) + 16;
    const dst = new Uint8Array(maxDst);
    const hashTable = new Int32Array(HASH_SIZE).fill(-1);
    // Separate hash table for dictionary entries to avoid overwriting source entries
    const dictHashTable = dict ? new Int32Array(HASH_SIZE).fill(-1) : null;

    // Dictionary support: pre-fill hash table with dict content.
    // Dict positions use negative indices (dictStart = -dictUsedLen).
    // During matching, we read from dict[] for negative candidates.
    let dictUsed = null;
    let dictStart = 0; // logical start position of dict in the stream
    if (dict && dict.length > 0) {
      const dictOffset = Math.max(0, dict.length - MAX_DISTANCE);
      dictUsed = dict.slice(dictOffset);
      dictStart = -dictUsed.length;
      // Fill dict hash table (separate from source hash table)
      for (let i = 0; i + MIN_MATCH <= dictUsed.length; i++) {
        const v = read32le(dictUsed, i);
        dictHashTable[hash4(v)] = dictStart + i;
      }
    }

    // Helper to read a byte at a logical position (negative = dict, non-negative = src)
    function readAt(pos) {
      if (pos >= 0) return src[pos];
      return dictUsed ? dictUsed[dictUsed.length + pos] : 0;
    }

    let srcOff = 0;
    let dstOff = 0;
    let literalStart = 0;

    // Main compression loop
    while (srcOff < src.length) {
      let bestMatchOff = -1;
      let bestMatchLen = 0;

      if (srcOff + MIN_MATCH <= src.length - MIN_MATCH) {
        const v = read32le(src, srcOff);
        const h = hash4(v);
        const srcCandidate = hashTable[h];
        hashTable[h] = srcOff;

        // Check both source and dictionary candidates, pick the best
        const candidates = [];
        if (srcCandidate >= 0 && srcCandidate < srcOff && (srcOff - srcCandidate) <= MAX_DISTANCE) {
          candidates.push(srcCandidate);
        }
        if (dictHashTable) {
          const dictCandidate = dictHashTable[h];
          if (dictCandidate < 0 && (srcOff - dictCandidate) <= MAX_DISTANCE) {
            candidates.push(dictCandidate);
          }
        }

        for (const candidate of candidates) {
          const maxMatchEnd = src.length - MIN_MATCH;
          let matchLen = 0;
          while (srcOff + matchLen < maxMatchEnd) {
            const cp = candidate + matchLen;
            const sp = srcOff + matchLen;
            if (readAt(cp) !== src[sp]) break;
            matchLen++;
          }
          if (matchLen >= MIN_MATCH && matchLen > bestMatchLen) {
            bestMatchOff = srcOff - candidate;
            bestMatchLen = matchLen;
          }
        }
      }

      if (bestMatchLen >= MIN_MATCH) {
        const literalLength = srcOff - literalStart;
        const tokenLitLen = Math.min(literalLength, 15);
        const tokenMatchLen = Math.min(bestMatchLen - MIN_MATCH, 15);
        dst[dstOff++] = ((tokenLitLen << 4) | tokenMatchLen) & 0xFF;

        if (literalLength >= 15) dstOff = writeVarLength(dst, dstOff, literalLength - 15);
        for (let i = 0; i < literalLength; i++) dst[dstOff++] = src[literalStart + i];

        dst[dstOff++] = bestMatchOff & 0xFF;
        dst[dstOff++] = (bestMatchOff >> 8) & 0xFF;

        if (bestMatchLen - MIN_MATCH >= 15) dstOff = writeVarLength(dst, dstOff, bestMatchLen - MIN_MATCH - 15);

        srcOff += bestMatchLen;
        literalStart = srcOff;

        if (bestMatchLen > SKIP_TRIGGER) {
          for (let i = 1; i < bestMatchLen - SKIP_TRIGGER; i++) {
            if (srcOff - bestMatchLen + i + MIN_MATCH <= src.length) {
              hashTable[hash4(read32le(src, srcOff - bestMatchLen + i))] = srcOff - bestMatchLen + i;
            }
          }
        }
      } else {
        srcOff += acceleration;
      }

      if (dstOff > maxDst - 18) break;
    }

    // Write last literals
    const literalLength = src.length - literalStart;
    dst[dstOff++] = (Math.min(literalLength, 15) << 4) & 0xF0;
    if (literalLength >= 15) dstOff = writeVarLength(dst, dstOff, literalLength - 15);
    for (let i = 0; i < literalLength; i++) dst[dstOff++] = src[literalStart + i];

    return dst.slice(0, dstOff);
  }

  /**
   * Decompress LZ4 block format data.
   * @param {Uint8Array} src - compressed data
   * @param {number} uncompressedSize - expected uncompressed size (upper bound)
   * @param {Object} options - { dict: Uint8Array }
   * @returns {Uint8Array} decompressed data
   */
  function decompress(src, uncompressedSize, options = {}) {
    const dict = options.dict || null;
    // Prepend dict to output buffer so offsets can reference it
    const dictLen = dict ? Math.min(dict.length, MAX_DISTANCE) : 0;
    const dictSlice = dict ? dict.slice(dict.length - dictLen) : null;
    const totalSize = dictLen + uncompressedSize;
    const dst = new Uint8Array(totalSize);
    // Copy dict into buffer at the beginning
    if (dictSlice) dst.set(dictSlice, 0);

    let srcOff = 0;
    let dstOff = dictLen; // start writing after dict

    while (srcOff < src.length) {
      const token = src[srcOff++];
      let literalLength = (token >> 4) & 0x0F;
      let matchLength = token & 0x0F;

      if (literalLength === 15) {
        const result = readVarLength(src, srcOff);
        literalLength += result.value;
        srcOff = result.bytesRead;
      }

      for (let i = 0; i < literalLength; i++) {
        if (dstOff >= totalSize) return dst.slice(dictLen, dictLen + uncompressedSize);
        if (srcOff >= src.length) return dst.slice(dictLen, dstOff);
        dst[dstOff++] = src[srcOff++];
      }

      if (srcOff >= src.length) break;

      if (srcOff + 2 > src.length) break;
      const offset = src[srcOff] | (src[srcOff + 1] << 8);
      srcOff += 2;

      if (offset === 0) throw new Error('Invalid LZ4 block: offset is 0');

      matchLength += MIN_MATCH;
      if ((token & 0x0F) === 15) {
        const result = readVarLength(src, srcOff);
        matchLength += result.value;
        srcOff = result.bytesRead;
      }

      let matchPos = dstOff - offset;
      if (matchPos < 0) {
        throw new Error('Invalid LZ4 block: match position before dictionary start');
      }

      for (let i = 0; i < matchLength; i++) {
        if (dstOff >= totalSize) return dst.slice(dictLen, dictLen + uncompressedSize);
        dst[dstOff++] = dst[matchPos++];
      }
    }

    return dst.slice(dictLen, dstOff);
  }

  /**
   * Calculate maximum compressed size for given input size.
   */
  function compressBound(inputSize) {
    if (inputSize > 0x7E000000) return 0;
    return inputSize + Math.floor(inputSize / 255) + 16;
  }

  return { compress, decompress, compressBound };
})();
