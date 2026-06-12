/**
 * LZ4 Parallel compression using Web Workers.
 * Splits data into blocks, compresses them in parallel, assembles LZ4 frame.
 */
var LZ4Parallel = (() => {
  const DEFAULT_WORKERS = Math.max(1, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) - 1);
  const DEFAULT_BLOCK_SIZE = 1024 * 1024; // 1MB blocks

  /**
   * Compress data using multiple Web Workers in parallel.
   * @param {Uint8Array} src - source data
   * @param {Object} options - { workers, blockSize, acceleration, onProgress }
   * @returns {Promise<Uint8Array>} LZ4 frame data
   */
  function compress(src, options = {}) {
    const numWorkers = Math.min(options.workers || DEFAULT_WORKERS, 8);
    const blockSize = options.blockSize || DEFAULT_BLOCK_SIZE;
    const acceleration = options.acceleration || 1;
    const onProgress = options.onProgress || (() => {});

    return new Promise(async (resolve, reject) => {
      // Split data into blocks
      const blocks = [];
      let off = 0;
      while (off < src.length) {
        const size = Math.min(blockSize, src.length - off);
        blocks.push(src.slice(off, off + size));
        off += size;
      }

      if (blocks.length === 0) {
        resolve(new Uint8Array(0));
        return;
      }

      // Create worker pool
      let workers, workerUrl;
      try {
        const pool = await createWorkers(numWorkers);
        workers = pool.workers;
        workerUrl = pool.url;
      } catch (e) {
        reject(e);
        return;
      }

      const results = new Array(blocks.length);
      let completed = 0;
      let nextBlock = 0;
      let hasError = false;

      function dispatch(worker, workerIdx) {
        if (nextBlock >= blocks.length) {
          // All dispatched, check if done
          if (completed >= blocks.length) {
            finish();
          }
          return;
        }
        const blockIdx = nextBlock++;
        const block = blocks[blockIdx];
        // Transfer the block data (zero-copy)
        worker.postMessage({ id: blockIdx, data: block.buffer, acceleration }, [block.buffer]);
      }

      function finish() {
        // Terminate workers
        for (const w of workers) w.terminate();
        URL.revokeObjectURL(workerUrl);

        // Assemble LZ4 frame
        const frame = assembleFrame(src, results, options);
        resolve(frame);
      }

      // Set up message handlers
      for (let i = 0; i < workers.length; i++) {
        const worker = workers[i];
        worker.onmessage = function(e) {
          if (hasError) return;
          const { id, compressed, compressedSize, originalSize, error } = e.data;
          if (error) {
            hasError = true;
            for (const w of workers) w.terminate();
            reject(new Error('Worker error: ' + error));
            return;
          }
          results[id] = { data: new Uint8Array(compressed), originalSize, compressedSize };
          completed++;
          onProgress({ completed, total: blocks.length, percent: (completed / blocks.length * 100).toFixed(1) });

          if (completed >= blocks.length) {
            finish();
          } else {
            dispatch(worker, i);
          }
        };
        worker.onerror = function(e) {
          if (!hasError) {
            hasError = true;
            for (const w of workers) w.terminate();
            reject(new Error('Worker error: ' + e.message));
          }
        };
      }

      // Start dispatching
      for (let i = 0; i < workers.length; i++) {
        dispatch(workers[i], i);
      }
    });
  }

  /**
   * Assemble compressed blocks into a valid LZ4 frame.
   */
  function assembleFrame(src, results, options) {
    const contentChecksum = options.contentChecksum !== false;
    const contentSize = options.contentSize !== false;
    const blockSizeID = 6; // 1MB blocks

    // Calculate total size
    let frameSize = 4 + 2 + 1; // magic + FLG + BD + header CRC
    if (contentSize) frameSize += 8;
    for (const r of results) {
      frameSize += 4 + r.data.length; // block header + data
    }
    frameSize += 4; // end mark
    if (contentChecksum) frameSize += 4;

    const out = new Uint8Array(frameSize);
    let off = 0;

    // Magic
    write32le(out, off, 0x184D2204); off += 4;

    // FLG: version=01, blockIndependent=1, contentChecksum, contentSize
    const flg = ((1 & 0x03) << 6) | (1 << 5) | (contentChecksum ? (1 << 2) : 0) | (contentSize ? (1 << 3) : 0);
    const bd = (blockSizeID << 4) & 0x70;
    out[off++] = flg;
    out[off++] = bd;

    // Content size
    if (contentSize) {
      write64le(out, off, src.length);
      off += 8;
    }

    // Header checksum
    const hdrBytes = out.slice(4, off);
    out[off++] = (XXHash.xxh32(hdrBytes, 0) >> 8) & 0xFF;

    // Blocks
    for (const r of results) {
      const isCompressed = r.data.length < r.originalSize;
      const blockHeader = isCompressed ? r.data.length : (r.data.length | 0x80000000);
      write32le(out, off, blockHeader >>> 0); off += 4;
      out.set(r.data, off); off += r.data.length;
    }

    // End mark
    write32le(out, off, 0); off += 4;

    // Content checksum
    if (contentChecksum) {
      write32le(out, off, XXHash.xxh32(src, 0)); off += 4;
    }

    return out.slice(0, off);
  }

  function write32le(buf, off, val) {
    buf[off] = val & 0xFF; buf[off+1] = (val >>> 8) & 0xFF; buf[off+2] = (val >>> 16) & 0xFF; buf[off+3] = (val >>> 24) & 0xFF;
  }
  function write64le(buf, off, val) {
    write32le(buf, off, val >>> 0); write32le(buf, off + 4, Math.floor(val / 0x100000000) >>> 0);
  }

  /**
   * Get the worker code as a string.
   * Loads lz4-worker.js from the same directory, falls back to inline code.
   */
  async function getWorkerCode() {
    try {
      const resp = await fetch('js/lz4-worker.js');
      return await resp.text();
    } catch (e) {
      throw new Error('Failed to load lz4-worker.js: ' + e.message);
    }
  }

  /**
   * Create workers dynamically from lz4-worker.js file.
   */
  async function createWorkers(num) {
    const code = await getWorkerCode();
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const workers = [];
    for (let i = 0; i < num; i++) {
      workers.push(new Worker(url));
    }
    return { workers, url };
  }

  return { compress, createWorkers };
})();
