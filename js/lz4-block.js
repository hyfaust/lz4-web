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
   * @param {Object} options - { acceleration: number } (1=best ratio, higher=faster)
   * @returns {Uint8Array} compressed data
   */
  function compress(src, options = {}) {
    if (src.length === 0) return new Uint8Array(0);
    const acceleration = Math.max(1, options.acceleration || 1);

    // Output buffer: worst case = src.length + src.length/255 + 16
    const maxDst = src.length + Math.floor(src.length / 255) + 16;
    const dst = new Uint8Array(maxDst);
    const hashTable = new Int32Array(HASH_SIZE).fill(-1);

    let srcOff = 0;
    let dstOff = 0;
    let literalStart = 0;

    // Main compression loop
    while (srcOff < src.length) {
      // Find match
      let bestMatchOff = -1;
      let bestMatchLen = 0;

      if (srcOff + MIN_MATCH <= src.length - MIN_MATCH) {
        const v = read32le(src, srcOff);
        const h = hash4(v);
        const candidate = hashTable[h];
        hashTable[h] = srcOff;

        if (candidate >= 0 && candidate < srcOff && (srcOff - candidate) <= MAX_DISTANCE) {
          // Verify match (don't extend into last MIN_MATCH bytes - spec requirement)
          const maxMatchEnd = src.length - MIN_MATCH;
          let matchLen = 0;
          while (srcOff + matchLen < maxMatchEnd &&
                 src[candidate + matchLen] === src[srcOff + matchLen]) {
            matchLen++;
          }
          if (matchLen >= MIN_MATCH) {
            bestMatchOff = srcOff - candidate;
            bestMatchLen = matchLen;
          }
        }
      }

      if (bestMatchLen >= MIN_MATCH) {
        // Write sequence: token + literal length bytes + literals + offset + match length bytes
        const literalLength = srcOff - literalStart;

        // Token
        const tokenLitLen = Math.min(literalLength, 15);
        const tokenMatchLen = Math.min(bestMatchLen - MIN_MATCH, 15);
        const token = ((tokenLitLen << 4) | tokenMatchLen) & 0xFF;
        dst[dstOff++] = token;

        // Literal length extra bytes
        if (literalLength >= 15) {
          dstOff = writeVarLength(dst, dstOff, literalLength - 15);
        }

        // Literals
        for (let i = 0; i < literalLength; i++) {
          dst[dstOff++] = src[literalStart + i];
        }

        // Offset (little-endian)
        dst[dstOff++] = bestMatchOff & 0xFF;
        dst[dstOff++] = (bestMatchOff >> 8) & 0xFF;

        // Match length extra bytes
        if (bestMatchLen - MIN_MATCH >= 15) {
          dstOff = writeVarLength(dst, dstOff, bestMatchLen - MIN_MATCH - 15);
        }

        // Update positions
        srcOff += bestMatchLen;
        literalStart = srcOff;

        // Also hash intermediate positions for better matches
        if (bestMatchLen > SKIP_TRIGGER) {
          const advance = bestMatchLen - SKIP_TRIGGER;
          for (let i = 1; i < advance; i++) {
            if (srcOff - bestMatchLen + i + MIN_MATCH <= src.length) {
              const vv = read32le(src, srcOff - bestMatchLen + i);
              hashTable[hash4(vv)] = srcOff - bestMatchLen + i;
            }
          }
        }
      } else {
        // No match found: skip positions based on acceleration
        srcOff += acceleration;
      }

      // Safety: if output is getting too large, bail
      if (dstOff > maxDst - 18) break;
    }

    // Write last literals (must be at least the last 5 bytes)
    const literalLength = src.length - literalStart;
    const tokenLitLen = Math.min(literalLength, 15);
    const token = (tokenLitLen << 4) & 0xF0;
    dst[dstOff++] = token;

    if (literalLength >= 15) {
      dstOff = writeVarLength(dst, dstOff, literalLength - 15);
    }

    for (let i = 0; i < literalLength; i++) {
      dst[dstOff++] = src[literalStart + i];
    }

    return dst.slice(0, dstOff);
  }

  /**
   * Decompress LZ4 block format data.
   * @param {Uint8Array} src - compressed data
   * @param {number} uncompressedSize - expected uncompressed size (upper bound)
   * @returns {Uint8Array} decompressed data
   */
  function decompress(src, uncompressedSize) {
    const dst = new Uint8Array(uncompressedSize);
    let srcOff = 0;
    let dstOff = 0;

    while (srcOff < src.length) {
      // Read token
      const token = src[srcOff++];
      let literalLength = (token >> 4) & 0x0F;
      let matchLength = token & 0x0F;

      // Read extra literal length bytes
      if (literalLength === 15) {
        const result = readVarLength(src, srcOff);
        literalLength += result.value;
        srcOff = result.bytesRead;
      }

      // Copy literals
      for (let i = 0; i < literalLength; i++) {
        if (dstOff >= uncompressedSize) return dst;
        if (srcOff >= src.length) return dst.slice(0, dstOff);
        dst[dstOff++] = src[srcOff++];
      }

      // Check if we've reached the end of the block
      if (srcOff >= src.length) break;

      // Read offset (2 bytes, little-endian)
      if (srcOff + 2 > src.length) break;
      const offset = src[srcOff] | (src[srcOff + 1] << 8);
      srcOff += 2;

      // Offset 0 is invalid
      if (offset === 0) {
        throw new Error('Invalid LZ4 block: offset is 0');
      }

      // Read extra match length bytes
      matchLength += MIN_MATCH;
      if ((token & 0x0F) === 15) {
        const result = readVarLength(src, srcOff);
        matchLength += result.value;
        srcOff = result.bytesRead;
      }

      // Copy match (handle overlap for RLE-like patterns)
      let matchPos = dstOff - offset;
      if (matchPos < 0) {
        throw new Error('Invalid LZ4 block: match position before start of output');
      }

      for (let i = 0; i < matchLength; i++) {
        if (dstOff >= uncompressedSize) return dst;
        dst[dstOff++] = dst[matchPos++];
      }
    }

    return dst.slice(0, dstOff);
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
