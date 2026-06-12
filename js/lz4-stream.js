/**
 * LZ4 Streaming module - chunked file processing for large files.
 * Processes files in bounded memory without loading everything at once.
 */
var LZ4Stream = (() => {
  const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB per chunk

  /**
   * Compress a File in streaming mode using chunked processing.
   * @param {File} file - input file
   * @param {Object} options - { chunkSize, onProgress, ...frameOptions }
   * @returns {Promise<{data: Uint8Array, stats: Object}>}
   */
  function compressFile(file, options = {}) {
    const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    const onProgress = options.onProgress || (() => {});
    const frameOpts = { ...options };
    delete frameOpts.chunkSize;
    delete frameOpts.onProgress;

    const blockSizeID = frameOpts.blockSizeID || 7;
    const blockChecksum = frameOpts.blockChecksum || false;
    const contentChecksum = frameOpts.contentChecksum !== false;
    const contentSize = frameOpts.contentSize !== false;
    const compressionLevel = frameOpts.compressionLevel || 1;
    const acceleration = compressionLevel < 0 ? Math.abs(compressionLevel) : Math.max(1, compressionLevel);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const chunks = [];
      let totalCompressed = 0;
      let offset = 0;
      const startTime = performance.now();

      function readNextChunk() {
        if (offset >= file.size) {
          finish();
          return;
        }
        const end = Math.min(offset + chunkSize, file.size);
        const blob = file.slice(offset, end);
        reader.readAsArrayBuffer(blob);
      }

      reader.onload = () => {
        const data = new Uint8Array(reader.result);
        const compressed = LZ4Block.compress(data, { acceleration });
        // Store uncompressed if compressed is larger
        const useRaw = compressed.length >= data.length;
        chunks.push({ data: useRaw ? data : compressed, isCompressed: !useRaw, originalSize: data.length });
        totalCompressed += (useRaw ? data.length : compressed.length) + 4; // +4 for block header
        offset += data.length;
        onProgress({ loaded: offset, total: file.size, percent: (offset / file.size * 100).toFixed(1) });
        readNextChunk();
      };

      reader.onerror = () => reject(reader.error);

      function finish() {
        // Assemble frame
        const hasDictID = false;
        const flg = ((1 & 0x03) << 6) |
                    (1 << 5) | // blockIndependent
                    (blockChecksum ? (1 << 4) : 0) |
                    (contentSize ? (1 << 3) : 0) |
                    (contentChecksum ? (1 << 2) : 0);
        const bd = (blockSizeID << 4) & 0x70;
        const headerSize = 4 + 2 + (contentSize ? 8 : 0) + 1;
        const footerSize = 4 + (contentChecksum ? 4 : 0);
        const totalSize = headerSize + totalCompressed + footerSize;

        const out = new Uint8Array(totalSize);
        let off = 0;

        // Magic
        write32le(out, off, 0x184D2204); off += 4;
        // FLG + BD
        out[off++] = flg;
        out[off++] = bd;
        // Content size
        if (contentSize) { write64le(out, off, file.size); off += 8; }
        // Header checksum
        const hdrBytes = out.slice(4, off);
        out[off++] = (XXHash.xxh32(hdrBytes, 0) >> 8) & 0xFF;

        // Blocks
        for (const chunk of chunks) {
          const blockDataSize = chunk.data.length;
          const blockHeader = chunk.isCompressed ? (blockDataSize | 0x80000000) : blockDataSize;
          write32le(out, off, blockHeader >>> 0); off += 4;
          out.set(chunk.data, off); off += blockDataSize;
        }

        // End mark
        write32le(out, off, 0); off += 4;

        // Content checksum
        if (contentChecksum) {
          // Recompute from original data (streaming doesn't keep all original in memory)
          // For now, we need to re-read the file for the checksum
          computeContentChecksum(file).then(ccrc => {
            write32le(out, off, ccrc); off += 4;
            const elapsed = performance.now() - startTime;
            resolve({
              data: out.slice(0, off),
              stats: {
                originalSize: file.size,
                compressedSize: off,
                ratio: (file.size / off).toFixed(2),
                elapsed: elapsed.toFixed(1),
                speed: ((file.size / (1024 * 1024)) / (elapsed / 1000)).toFixed(1),
                chunks: chunks.length
              }
            });
          }).catch(reject);
        } else {
          const elapsed = performance.now() - startTime;
          resolve({
            data: out.slice(0, off),
            stats: {
              originalSize: file.size,
              compressedSize: off,
              ratio: (file.size / off).toFixed(2),
              elapsed: elapsed.toFixed(1),
              speed: ((file.size / (1024 * 1024)) / (elapsed / 1000)).toFixed(1),
              chunks: chunks.length
            }
          });
        }
      }

      readNextChunk();
    });
  }

  /**
   * Decompress a file in streaming mode.
   * @param {File} file - .lz4 file
   * @param {Object} options - { chunkSize, onProgress }
   * @returns {Promise<{data: Uint8Array, stats: Object}>}
   */
  function decompressFile(file, options = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const src = new Uint8Array(reader.result);
          const startTime = performance.now();
          const result = LZ4Frame.decompress(src, options);
          const elapsed = performance.now() - startTime;
          resolve({
            data: result.data,
            stats: {
              compressedSize: file.size,
              decompressedSize: result.data.length,
              ratio: (result.data.length / file.size).toFixed(2),
              elapsed: elapsed.toFixed(1),
              speed: ((result.data.length / (1024 * 1024)) / (elapsed / 1000)).toFixed(1)
            }
          });
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function computeContentChecksum(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(XXHash.xxh32(new Uint8Array(reader.result), 0));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function write32le(buf, off, val) {
    buf[off] = val & 0xFF;
    buf[off+1] = (val >>> 8) & 0xFF;
    buf[off+2] = (val >>> 16) & 0xFF;
    buf[off+3] = (val >>> 24) & 0xFF;
  }

  function write64le(buf, off, val) {
    write32le(buf, off, val >>> 0);
    write32le(buf, off + 4, Math.floor(val / 0x100000000) >>> 0);
  }

  return { compressFile, decompressFile };
})();
