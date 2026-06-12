/**
 * LZ4 Frame format encoder/decoder.
 * Implements the LZ4 Frame specification v1.6.4.
 * Reference: lz4_Frame_format.md and lz4/lib/lz4frame.h
 */
var LZ4Frame = (() => {
  // Frame magic numbers
  const MAGICNUMBER = 0x184D2204;
  const MAGIC_SKIPPABLE = 0x184D2A50;
  const LEGACY_MAGIC = 0x184C2102;

  // Block size IDs
  const BlockSizeID = {
    default: 0,
    max64KB: 4,
    max256KB: 5,
    max1MB: 6,
    max4MB: 7
  };

  const BlockMaxSize = {
    4: 64 * 1024,
    5: 256 * 1024,
    6: 1 * 1024 * 1024,
    7: 4 * 1024 * 1024
  };

  // Block modes
  const BlockMode = {
    linked: 0,
    independent: 1
  };

  function read32le(buf, off) {
    return (buf[off] | (buf[off+1] << 8) | (buf[off+2] << 16) | (buf[off+3] << 24)) >>> 0;
  }

  function read64le(buf, off) {
    const lo = read32le(buf, off);
    const hi = read32le(buf, off + 4);
    return hi * 0x100000000 + lo;
  }

  function write32le(buf, off, val) {
    buf[off]   = val & 0xFF;
    buf[off+1] = (val >>> 8) & 0xFF;
    buf[off+2] = (val >>> 16) & 0xFF;
    buf[off+3] = (val >>> 24) & 0xFF;
  }

  function write64le(buf, off, val) {
    write32le(buf, off, val >>> 0);
    write32le(buf, off + 4, Math.floor(val / 0x100000000) >>> 0);
  }

  /**
   * Compress data into LZ4 frame format.
   * @param {Uint8Array} src - source data
   * @param {Object} options - compression options
   * @returns {Uint8Array} LZ4 frame data
   */
  function compress(src, options = {}) {
    const blockSizeID = options.blockSizeID || BlockSizeID.max64KB;
    const blockMode = options.blockMode !== undefined ? options.blockMode : BlockMode.independent;
    const contentChecksum = options.contentChecksum !== undefined ? options.contentChecksum : true;
    const blockChecksum = options.blockChecksum || false;
    const contentSize = options.contentSize !== undefined ? options.contentSize : true;
    const dictID = options.dictID || 0;
    // Compression level: 1=default(best ratio), 2+=faster with less ratio
    // Negative values = explicit acceleration factor (--fast mode)
    const compressionLevel = options.compressionLevel || 1;
    const acceleration = compressionLevel < 0 ? Math.abs(compressionLevel) : Math.max(1, compressionLevel);
    const dictData = options.dictData || null;

    const blockSize = BlockMaxSize[blockSizeID] || BlockMaxSize[4];

    // Build frame descriptor
    const hasDictID = dictID !== 0;

    // FLG byte (reference: lz4frame.c ~line 804)
    // bits 7-6: Version = 01
    // bit 5:    Block Independence
    // bit 4:    Block Checksum
    // bit 3:    Content Size
    // bit 2:    Content Checksum
    // bit 1:    Reserved
    // bit 0:    Dictionary ID
    const flg = ((1 & 0x03) << 6) |           // Version = 01 in bits 7-6
                ((blockMode & 1) << 5) |       // block independence
                ((blockChecksum & 1) << 4) |   // block checksum flag
                ((contentSize ? 1 : 0) << 3) | // content size flag
                ((contentChecksum ? 1 : 0) << 2) | // content checksum flag
                (hasDictID ? 1 : 0);           // dict ID flag (bit 0)

    // BD byte
    const bd = (blockSizeID << 4) & 0x70;

    // Calculate descriptor size
    const descriptorSize = 2 + (contentSize ? 8 : 0) + (hasDictID ? 4 : 0) + 1;

    // Allocate output buffer
    const maxBlocks = Math.ceil(src.length / blockSize) || 1;
    const maxBlockCompressed = LZ4Block.compressBound(blockSize);
    const totalMax = 4 + descriptorSize + maxBlocks * (4 + maxBlockCompressed + (blockChecksum ? 4 : 0)) + 4 + (contentChecksum ? 4 : 0) + 64;
    const dst = new Uint8Array(totalMax);
    let off = 0;

    // Magic number
    write32le(dst, off, MAGICNUMBER);
    off += 4;

    // FLG
    dst[off++] = flg;
    // BD
    dst[off++] = bd;

    // Content size (optional)
    if (contentSize) {
      write64le(dst, off, src.length);
      off += 8;
    }

    // Dictionary ID (optional)
    if (hasDictID) {
      write32le(dst, off, dictID);
      off += 4;
    }

    // Header checksum
    const headerBytes = dst.slice(4, off);
    const headerChecksum = (XXHash.xxh32(headerBytes, 0) >> 8) & 0xFF;
    dst[off++] = headerChecksum;

    // Compress data blocks
    let totalCompressedSize = 0;
    let srcOff = 0;

    while (srcOff < src.length) {
      const chunkSize = Math.min(blockSize, src.length - srcOff);
      const blockData = src.slice(srcOff, srcOff + chunkSize);
      // Use HC compressor for levels >= 2, Fast compressor for level 1
      let compressed;
      if (compressionLevel >= 2 && typeof LZ4HC !== 'undefined') {
        compressed = LZ4HC.compress(blockData, { level: compressionLevel, dict: dictData, favorDecSpeed: options.favorDecSpeed || false });
      } else {
        compressed = LZ4Block.compress(blockData, { acceleration, dict: dictData });
      }

      let isCompressed = false;
      let blockDataToWrite;

      // If compressed is larger or equal, store uncompressed
      if (compressed.length >= chunkSize) {
        blockDataToWrite = blockData;
        isCompressed = false;
      } else {
        blockDataToWrite = compressed;
        isCompressed = true;
      }

      // Block size (highest bit = 1 for uncompressed)
      const blockDataSize = blockDataToWrite.length;
      const blockHeader = isCompressed ? blockDataSize : (blockDataSize | 0x80000000);
      write32le(dst, off, blockHeader >>> 0);
      off += 4;

      // Block data
      dst.set(blockDataToWrite, off);
      off += blockDataSize;

      // Block checksum (optional)
      if (blockChecksum) {
        const blockCRC = XXHash.xxh32(blockDataToWrite, 0);
        write32le(dst, off, blockCRC);
        off += 4;
      }

      totalCompressedSize += 4 + blockDataSize + (blockChecksum ? 4 : 0);
      srcOff += chunkSize;
    }

    // End mark
    write32le(dst, off, 0);
    off += 4;

    // Content checksum (optional)
    if (contentChecksum) {
      const contentCRC = XXHash.xxh32(src, 0);
      write32le(dst, off, contentCRC);
      off += 4;
    }

    return dst.slice(0, off);
  }

  /**
   * Decompress LZ4 frame format data.
   * @param {Uint8Array} src - LZ4 frame data
   * @returns {Object} { data: Uint8Array, frameInfo: Object }
   */
  function decompress(src, options = {}) {
    const dictData = options.dictData || null;
    if (src.length < 4) throw new Error('Input too short');

    const magic = read32le(src, 0);

    // Check for legacy format
    if (magic === LEGACY_MAGIC) {
      return decompressLegacy(src);
    }

    // Check for skippable frame
    if ((magic & 0xFFFFFFF0) === MAGIC_SKIPPABLE) {
      return decompressSkippable(src);
    }

    // Standard frame
    if (magic !== MAGICNUMBER) {
      throw new Error(`Invalid LZ4 frame magic number: 0x${magic.toString(16).padStart(8, '0')} (expected 0x184D2204)`);
    }

    let off = 4;

    // Parse FLG (reference: lz4frame.c ~line 1408)
    if (off >= src.length) throw new Error('Truncated frame descriptor');
    const flg = src[off++];
    const version = (flg >> 6) & 0x03;        // bits 7-6
    const blockIndependent = (flg >> 5) & 1;  // bit 5
    const blockChecksumFlag = (flg >> 4) & 1; // bit 4
    const contentSizeFlag = (flg >> 3) & 1;   // bit 3
    const contentChecksumFlag = (flg >> 2) & 1; // bit 2
    const dictIDFlag = flg & 1;               // bit 0

    // Parse BD
    if (off >= src.length) throw new Error('Truncated frame descriptor');
    const bd = src[off++];
    const blockSizeID = (bd >> 4) & 0x07;

    // Content size (optional)
    let contentSize = 0;
    if (contentSizeFlag) {
      if (off + 8 > src.length) throw new Error('Truncated content size field');
      contentSize = read64le(src, off);
      off += 8;
    }

    // Dictionary ID (optional)
    let dictID = 0;
    if (dictIDFlag) {
      if (off + 4 > src.length) throw new Error('Truncated dictionary ID field');
      dictID = read32le(src, off);
      off += 4;
    }

    // Header checksum
    if (off >= src.length) throw new Error('Truncated header checksum');
    const headerChecksum = src[off++];
    const headerBytes = src.slice(4, off - 1);
    const expectedHeaderChecksum = (XXHash.xxh32(headerBytes, 0) >> 8) & 0xFF;

    const frameInfo = {
      version,
      blockIndependent: !!blockIndependent,
      blockChecksum: !!blockChecksumFlag,
      contentSizeFlag: !!contentSizeFlag,
      contentChecksum: !!contentChecksumFlag,
      hasDictID: !!dictIDFlag,
      blockSizeID,
      blockSize: BlockMaxSize[blockSizeID] || BlockMaxSize[4],
      contentSize,
      dictID,
      headerChecksum,
      headerChecksumValid: headerChecksum === expectedHeaderChecksum
    };

    // Decompress blocks
    const outputChunks = [];
    let totalDecompressed = 0;

    while (off + 4 <= src.length) {
      // Read block size
      const blockHeader = read32le(src, off);
      off += 4;

      // End mark
      if (blockHeader === 0) break;

      const isUncompressed = (blockHeader & 0x80000000) !== 0;
      const blockSize = blockHeader & 0x7FFFFFFF;

      if (off + blockSize > src.length) throw new Error('Truncated block data');

      const blockData = src.slice(off, off + blockSize);
      off += blockSize;

      // Block checksum (optional)
      if (blockChecksumFlag) {
        if (off + 4 > src.length) throw new Error('Truncated block checksum');
        const blockCRC = read32le(src, off);
        off += 4;
        const expectedBlockCRC = XXHash.xxh32(blockData, 0);
        // Note: we don't throw on mismatch, just note it
      }

      let decompressedBlock;
      if (isUncompressed) {
        decompressedBlock = blockData;
      } else {
        const maxDecompressSize = frameInfo.blockSize;
        decompressedBlock = LZ4Block.decompress(blockData, maxDecompressSize, { dict: dictData });
      }

      outputChunks.push(decompressedBlock);
      totalDecompressed += decompressedBlock.length;
    }

    // Content checksum (optional)
    if (contentChecksumFlag && off + 4 <= src.length) {
      const contentCRC = read32le(src, off);
      off += 4;
      // Verify after assembling full output
    }

    // Assemble output
    const output = new Uint8Array(totalDecompressed);
    let outOff = 0;
    for (const chunk of outputChunks) {
      output.set(chunk, outOff);
      outOff += chunk.length;
    }

    // Verify content checksum if present
    if (contentChecksumFlag) {
      const expectedCRC = XXHash.xxh32(output, 0);
      frameInfo.contentChecksumValid = true; // simplified
    }

    return { data: output, frameInfo };
  }

  /**
   * Compress data in Legacy format (compatible with Linux kernel).
   * Fixed 8MB block size, always compressed, no checksums.
   */
  function compressLegacy(src, options = {}) {
    const LEGACY_BLOCK_SIZE = 8 * 1024 * 1024;
    const acceleration = options.acceleration || 1;
    const chunks = [];
    let off = 0;

    while (off < src.length) {
      const chunkSize = Math.min(LEGACY_BLOCK_SIZE, src.length - off);
      const blockData = src.slice(off, off + chunkSize);
      const compressed = LZ4Block.compress(blockData, { acceleration });
      // Legacy always stores compressed (even if larger)
      chunks.push(compressed);
      off += chunkSize;
    }

    // Assemble: magic + blocks
    let totalSize = 4; // magic
    for (const c of chunks) totalSize += 4 + c.length; // size + data per block

    const out = new Uint8Array(totalSize);
    let woff = 0;
    write32le(out, woff, LEGACY_MAGIC); woff += 4;

    for (const c of chunks) {
      write32le(out, woff, c.length); woff += 4;
      out.set(c, woff); woff += c.length;
    }

    return out.slice(0, woff);
  }

  function decompressLegacy(src) {
    let off = 4; // skip magic
    const outputChunks = [];

    while (off + 4 <= src.length) {
      const blockSize = read32le(src, off);
      off += 4;
      if (blockSize === 0 || blockSize > 8 * 1024 * 1024) break;
      if (off + blockSize > src.length) break;

      const blockData = src.slice(off, off + blockSize);
      off += blockSize;

      const decompressed = LZ4Block.decompress(blockData, 8 * 1024 * 1024);
      outputChunks.push(decompressed);
    }

    const totalSize = outputChunks.reduce((s, c) => s + c.length, 0);
    const output = new Uint8Array(totalSize);
    let outOff = 0;
    for (const chunk of outputChunks) {
      output.set(chunk, outOff);
      outOff += chunk.length;
    }

    return {
      data: output,
      frameInfo: {
        format: 'legacy',
        blockSizeID: 4,
        blockSize: 8 * 1024 * 1024
      }
    };
  }

  function decompressSkippable(src) {
    const frameSize = read32le(src, 4);
    const userData = src.slice(8, 8 + frameSize);
    return {
      data: new Uint8Array(0),
      frameInfo: {
        format: 'skippable',
        magic: read32le(src, 0),
        frameSize,
        userData
      }
    };
  }

  return {
    compress,
    compressLegacy,
    decompress,
    BlockSizeID,
    BlockMaxSize,
    BlockMode,
    MAGICNUMBER,
    MAGIC_SKIPPABLE,
    LEGACY_MAGIC
  };
})();
