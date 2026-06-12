/**
 * LZ4 Benchmark module - in-browser performance testing.
 */
var LZ4Bench = (() => {
  /**
   * Generate pseudo-random test data of given size.
   */
  function generateTestData(size) {
    const data = new Uint8Array(size);
    // Use a simple PRNG for reproducible results
    let seed = 12345;
    for (let i = 0; i < size; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
      data[i] = seed & 0xFF;
    }
    // Add some repeated patterns to make it somewhat compressible
    const pattern = 'Hello World! This is LZ4 benchmark data. ';
    const patternBytes = new TextEncoder().encode(pattern);
    for (let i = 0; i < Math.min(size, 4096); i++) {
      data[i] = patternBytes[i % patternBytes.length];
    }
    return data;
  }

  /**
   * Run a single benchmark: compress and decompress, return metrics.
   */
  function runSingle(data, options = {}) {
    const iterations = options.iterations || 3;
    const warmup = options.warmup || 1;

    // Warmup
    for (let i = 0; i < warmup; i++) {
      LZ4Frame.compress(data, { contentChecksum: true });
    }

    // Benchmark compression
    let compressTotal = 0;
    let compressedSize = 0;
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const compressed = LZ4Frame.compress(data, { contentChecksum: true });
      compressTotal += performance.now() - start;
      compressedSize = compressed.length;
    }

    const compressed = LZ4Frame.compress(data, { contentChecksum: true });

    // Benchmark decompression
    let decompressTotal = 0;
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      LZ4Frame.decompress(compressed);
      decompressTotal += performance.now() - start;
    }

    const compressTime = compressTotal / iterations;
    const decompressTime = decompressTotal / iterations;
    const sizeMB = data.length / (1024 * 1024);

    return {
      inputSize: data.length,
      compressedSize,
      ratio: (data.length / compressedSize).toFixed(2),
      compressSpeed: (sizeMB / (compressTime / 1000)).toFixed(1),
      decompressSpeed: (sizeMB / (decompressTime / 1000)).toFixed(1),
      compressTime: compressTime.toFixed(1),
      decompressTime: decompressTime.toFixed(1)
    };
  }

  /**
   * Run full benchmark suite with multiple data sizes and compression levels.
   */
  async function runFullBenchmark(options = {}) {
    const sizes = options.sizes || [1024, 4096, 16384, 65536, 262144, 1048576];
    const results = [];
    const onProgress = options.onProgress || (() => {});

    for (let i = 0; i < sizes.length; i++) {
      onProgress({ current: i + 1, total: sizes.length, size: sizes[i] });
      const data = generateTestData(sizes[i]);
      const result = runSingle(data, { iterations: 3, warmup: 1 });
      results.push(result);
      // Yield to UI
      await new Promise(r => setTimeout(r, 10));
    }

    return results;
  }

  /**
   * Run benchmark with user-provided data.
   */
  function runWithData(data) {
    return runSingle(data, { iterations: 5, warmup: 2 });
  }

  return { generateTestData, runSingle, runFullBenchmark, runWithData };
})();
