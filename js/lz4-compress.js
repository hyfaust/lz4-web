/**
 * LZ4 Compression/Decompression tool module.
 * Handles file and text compression/decompression with UI integration.
 */
var LZ4Compress = (() => {
  /**
   * Compress a Uint8Array using LZ4 frame format.
   */
  function compressData(data, options = {}) {
    return LZ4Frame.compress(data, options);
  }

  /**
   * Decompress an LZ4 frame Uint8Array.
   */
  function decompressData(data) {
    return LZ4Frame.decompress(data);
  }

  /**
   * Compress text string.
   */
  function compressText(text, options = {}) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    return {
      compressed: LZ4Frame.compress(data, options),
      originalSize: data.length
    };
  }

  /**
   * Decompress to text string.
   */
  function decompressText(data) {
    const result = LZ4Frame.decompress(data);
    const decoder = new TextDecoder();
    return {
      text: decoder.decode(result.data),
      compressedSize: data.length,
      decompressedSize: result.data.length,
      frameInfo: result.frameInfo
    };
  }

  /**
   * Handle file upload for compression.
   */
  function handleFileCompress(file, options = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = new Uint8Array(reader.result);
          const startTime = performance.now();
          const compressed = LZ4Frame.compress(data, options);
          const elapsed = performance.now() - startTime;
          resolve({
            data: compressed,
            originalSize: data.length,
            compressedSize: compressed.length,
            ratio: (data.length / compressed.length).toFixed(2),
            elapsed: elapsed.toFixed(1),
            speed: ((data.length / (1024 * 1024)) / (elapsed / 1000)).toFixed(1)
          });
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Handle file upload for decompression.
   */
  function handleFileDecompress(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = new Uint8Array(reader.result);
          const startTime = performance.now();
          const result = LZ4Frame.decompress(data);
          const elapsed = performance.now() - startTime;
          resolve({
            data: result.data,
            compressedSize: data.length,
            decompressedSize: result.data.length,
            ratio: (result.data.length / data.length).toFixed(2),
            elapsed: elapsed.toFixed(1),
            speed: ((result.data.length / (1024 * 1024)) / (elapsed / 1000)).toFixed(1),
            frameInfo: result.frameInfo
          });
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Trigger file download.
   */
  function downloadFile(data, filename) {
    const blob = new Blob([data instanceof Uint8Array ? data.buffer : data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { compressData, decompressData, compressText, decompressText, handleFileCompress, handleFileDecompress, downloadFile };
})();
