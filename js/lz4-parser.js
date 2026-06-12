/**
 * LZ4 Frame format parser - visualizes the internal structure of .lz4 files.
 */
var LZ4Parser = (() => {
  function read32le(buf, off) {
    return (buf[off] | (buf[off+1] << 8) | (buf[off+2] << 16) | (buf[off+3] << 24)) >>> 0;
  }
  function read64le(buf, off) {
    const lo = read32le(buf, off);
    const hi = read32le(buf, off + 4);
    return hi * 0x100000000 + lo;
  }

  const MAGICNUMBER = 0x184D2204;
  const MAGIC_SKIPPABLE = 0x184D2A50;
  const LEGACY_MAGIC = 0x184C2102;

  const BlockSizeNames = { 0: 'Default(64KB)', 4: '64 KB', 5: '256 KB', 6: '1 MB', 7: '4 MB' };

  /**
   * Parse an LZ4 file and return detailed structure information.
   */
  function parse(data) {
    const result = { frames: [], totalSize: data.length, format: 'unknown' };
    let off = 0;

    while (off + 4 <= data.length) {
      const magic = read32le(data, off);

      if (magic === MAGICNUMBER) {
        const frame = parseFrame(data, off);
        result.frames.push(frame);
        off += frame.totalBytes;
        result.format = 'standard';
      } else if (magic === LEGACY_MAGIC) {
        const frame = parseLegacyFrame(data, off);
        result.frames.push(frame);
        off += frame.totalBytes;
        result.format = 'legacy';
      } else if ((magic & 0xFFFFFFF0) === MAGIC_SKIPPABLE) {
        const frame = parseSkippableFrame(data, off);
        result.frames.push(frame);
        off += frame.totalBytes;
        result.format = 'skippable';
      } else {
        result.frames.push({
          type: 'unknown',
          offset: off,
          magic: magic,
          totalBytes: data.length - off,
          error: `Unknown magic: 0x${magic.toString(16).padStart(8, '0')}`
        });
        break;
      }
    }

    // Compute stats
    let totalOriginal = 0, totalCompressed = 0, totalBlocks = 0;
    for (const f of result.frames) {
      if (f.blocks) {
        for (const b of f.blocks) {
          totalOriginal += b.originalSize;
          totalCompressed += b.compressedSize;
          totalBlocks++;
        }
      }
    }
    result.stats = {
      frameCount: result.frames.length,
      blockCount: totalBlocks,
      originalSize: totalOriginal,
      compressedSize: totalCompressed,
      ratio: totalOriginal > 0 ? (totalOriginal / totalCompressed).toFixed(2) : 'N/A'
    };

    return result;
  }

  function parseFrame(data, start) {
    const frame = {
      type: 'frame',
      offset: start,
      fields: [],
      blocks: [],
      totalBytes: 0
    };

    let off = start;

    // Magic Number
    const magic = read32le(data, off);
    frame.fields.push({
      name: 'Magic Number',
      offset: off,
      size: 4,
      value: magic,
      hex: hexBytes(data, off, 4),
      description: '0x184D2204 - LZ4 Frame identifier'
    });
    off += 4;

    // FLG (reference: lz4frame.c bit layout)
    const flg = data[off];
    const version = (flg >> 6) & 0x03;        // bits 7-6
    const blockIndependent = (flg >> 5) & 1;  // bit 5
    const blockChecksumFlag = (flg >> 4) & 1; // bit 4
    const contentSizeFlag = (flg >> 3) & 1;   // bit 3
    const contentChecksumFlag = (flg >> 2) & 1; // bit 2
    const dictIDFlag = flg & 1;               // bit 0

    frame.fields.push({
      name: 'FLG (Flags)',
      offset: off,
      size: 1,
      value: flg,
      hex: hexByte(flg),
      description: `Version:${version} BlockIndep:${blockIndependent} BlockCRC:${blockChecksumFlag} ContentSize:${contentSizeFlag} ContentCRC:${contentChecksumFlag}`,
      bits: [
        { name: 'Version', bits: '7-6', value: version },
        { name: 'Block Independence', bit: 5, value: blockIndependent ? 'Yes (independent)' : 'No (linked)' },
        { name: 'Block Checksum', bit: 4, value: blockChecksumFlag ? 'Enabled' : 'Disabled' },
        { name: 'Content Size', bit: 3, value: contentSizeFlag ? 'Present' : 'Absent' },
        { name: 'Content Checksum', bit: 2, value: contentChecksumFlag ? 'Enabled' : 'Disabled' },
        { name: 'Reserved', bit: 1, value: (flg >> 1) & 1 },
        { name: 'Dictionary ID', bit: 0, value: dictIDFlag ? 'Present' : 'Absent' }
      ]
    });
    off++;

    // BD
    const bd = data[off];
    const blockSizeID = (bd >> 4) & 0x07;

    frame.fields.push({
      name: 'BD (Block Descriptor)',
      offset: off,
      size: 1,
      value: bd,
      hex: hexByte(bd),
      description: `Block Max Size: ${BlockSizeNames[blockSizeID] || 'Unknown'} (ID: ${blockSizeID})`,
      bits: [
        { name: 'Reserved', bits: '0-3', value: bd & 0x0F },
        { name: 'Block Max Size', bits: '4-6', value: `${BlockSizeNames[blockSizeID] || blockSizeID}` },
        { name: 'Reserved', bit: 7, value: (bd >> 7) & 1 }
      ]
    });
    off++;

    // Content Size (optional)
    let contentSize = 0;
    if (contentSizeFlag) {
      contentSize = read64le(data, off);
      frame.fields.push({
        name: 'Content Size',
        offset: off,
        size: 8,
        value: contentSize,
        hex: hexBytes(data, off, 8),
        description: `${formatSize(contentSize)} bytes`
      });
      off += 8;
    }

    // Dictionary ID (optional)
    if (dictIDFlag) {
      const dictID = read32le(data, off);
      frame.fields.push({
        name: 'Dictionary ID',
        offset: off,
        size: 4,
        value: dictID,
        hex: hexBytes(data, off, 4),
        description: `Dict ID: ${dictID}`
      });
      off += 4;
    }

    // Header Checksum
    const headerChecksum = data[off];
    const headerBytes = data.slice(start + 4, off);
    const expectedChecksum = (XXHash.xxh32(headerBytes, 0) >> 8) & 0xFF;
    frame.fields.push({
      name: 'Header Checksum',
      offset: off,
      size: 1,
      value: headerChecksum,
      hex: hexByte(headerChecksum),
      description: `xxh32>>8 & 0xFF = 0x${headerChecksum.toString(16).padStart(2, '0')} (${headerChecksum === expectedChecksum ? 'VALID' : 'INVALID'})`
    });
    off++;

    // Store parsed flags for frame info
    frame.info = {
      version, blockIndependent, blockChecksumFlag,
      contentSizeFlag, contentChecksumFlag, dictIDFlag,
      blockSizeID, blockSizeName: BlockSizeNames[blockSizeID],
      contentSize, headerChecksumValid: headerChecksum === expectedChecksum
    };

    // Data blocks
    let blockIndex = 0;
    while (off + 4 <= data.length) {
      const blockHeader = read32le(data, off);

      // End mark
      if (blockHeader === 0) {
        frame.fields.push({
          name: 'End Mark',
          offset: off,
          size: 4,
          value: 0,
          hex: '00 00 00 00',
          description: 'End of frame marker'
        });
        off += 4;
        break;
      }

      const isUncompressed = (blockHeader & 0x80000000) !== 0;
      const blockSize = blockHeader & 0x7FFFFFFF;

      const blockInfo = {
        index: blockIndex,
        offset: off,
        headerSize: 4,
        compressedSize: blockSize,
        isUncompressed,
        originalSize: blockSize // for uncompressed blocks
      };

      const blockField = {
        name: `Block #${blockIndex}`,
        offset: off,
        size: 4 + blockSize + (blockChecksumFlag ? 4 : 0),
        value: blockHeader,
        hex: hexBytes(data, off, 4),
        description: `${isUncompressed ? 'UNCOMPRESSED' : 'Compressed'} | Size: ${formatSize(blockSize)} bytes`
      };

      off += 4 + blockSize;

      // Block checksum
      if (blockChecksumFlag && off + 4 <= data.length) {
        const blockCRC = read32le(data, off);
        off += 4;
        blockInfo.blockChecksum = blockCRC;
        blockField.description += ` | Block CRC: 0x${blockCRC.toString(16).padStart(8, '0')}`;
      }

      frame.blocks.push(blockInfo);
      frame.fields.push(blockField);
      blockIndex++;
    }

    // Content Checksum (optional)
    if (contentChecksumFlag && off + 4 <= data.length) {
      const contentCRC = read32le(data, off);
      frame.fields.push({
        name: 'Content Checksum',
        offset: off,
        size: 4,
        value: contentCRC,
        hex: hexBytes(data, off, 4),
        description: `xxh32 of decompressed content = 0x${contentCRC.toString(16).padStart(8, '0')}`
      });
      off += 4;
    }

    frame.totalBytes = off - start;
    return frame;
  }

  function parseLegacyFrame(data, start) {
    let off = start + 4; // skip magic
    const blocks = [];
    let blockIndex = 0;

    while (off + 4 <= data.length) {
      const blockSize = read32le(data, off);
      if (blockSize === 0 || blockSize > 8 * 1024 * 1024) break;
      if (off + 4 + blockSize > data.length) break;
      blocks.push({ index: blockIndex++, offset: off, compressedSize: blockSize });
      off += 4 + blockSize;
    }

    return {
      type: 'legacy',
      offset: start,
      totalBytes: off - start,
      info: { format: 'Legacy (Linux kernel compatible)', blockCount: blocks.length },
      fields: [
        { name: 'Legacy Magic', offset: start, size: 4, value: LEGACY_MAGIC, hex: hexBytes(data, start, 4), description: '0x184C2102 - Legacy LZ4 format' }
      ],
      blocks
    };
  }

  function parseSkippableFrame(data, start) {
    const frameSize = read32le(data, start + 4);
    return {
      type: 'skippable',
      offset: start,
      totalBytes: 8 + frameSize,
      info: { format: 'Skippable', frameSize },
      fields: [
        { name: 'Skippable Magic', offset: start, size: 4, value: read32le(data, start), hex: hexBytes(data, start, 4), description: '0x184D2A50-0x184D2A5F' },
        { name: 'Frame Size', offset: start + 4, size: 4, value: frameSize, hex: hexBytes(data, start + 4, 4), description: `${frameSize} bytes of user data` }
      ],
      blocks: []
    };
  }

  // Utility functions
  function hexByte(b) { return b.toString(16).padStart(2, '0'); }
  function hexBytes(buf, off, len) {
    const parts = [];
    for (let i = 0; i < len; i++) parts.push(hexByte(buf[off + i]));
    return parts.join(' ');
  }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes;
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'M';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'G';
  }

  return { parse };
})();
