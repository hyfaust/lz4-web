/**
 * Minimal tar (UStar) format reader/writer for browser use.
 * Compatible with GNU tar, BSD tar, and other standard implementations.
 */
var TarUtil = (() => {
  const BLOCK_SIZE = 512;

  /**
   * Encode an octal string of given width (null-terminated).
   */
  function octal(val, width) {
    const s = val.toString(8).padStart(width - 1, '0') + '\0';
    return s.substring(0, width);
  }

  /**
   * Calculate tar checksum for a 512-byte header block.
   * The checksum field (bytes 148-155) is treated as spaces during calculation.
   */
  function calcChecksum(header) {
    let sum = 0;
    for (let i = 0; i < BLOCK_SIZE; i++) {
      sum += (i >= 148 && i < 156) ? 32 : header[i]; // 32 = space
    }
    return sum;
  }

  /**
   * Write a single tar header block.
   * @param {Object} entry - { name, size, type, mtime }
   * @returns {Uint8Array} 512-byte header
   */
  function writeHeader(entry) {
    const buf = new Uint8Array(BLOCK_SIZE);
    const name = entry.name || '';
    const size = entry.size || 0;
    const type = entry.type || '0'; // '0' = regular file, '5' = directory
    const mtime = entry.mtime || Math.floor(Date.now() / 1000);

    // Split long names into prefix (155) + name (100)
    let namePart = name;
    let prefixPart = '';
    if (name.length > 100) {
      // Try to split at a / boundary
      const lastSlash = name.lastIndexOf('/', 155);
      if (lastSlash > 0 && name.length - lastSlash - 1 <= 100) {
        prefixPart = name.substring(0, lastSlash);
        namePart = name.substring(lastSlash + 1);
      }
    }

    // Write fields
    function writeStr(off, str, len) {
      for (let i = 0; i < len && i < str.length; i++) buf[off + i] = str.charCodeAt(i);
    }

    writeStr(0, namePart, 100);          // name
    writeStr(100, octal(0o644, 8), 8);   // mode (rw-r--r--)
    writeStr(108, octal(0, 8), 8);       // uid
    writeStr(116, octal(0, 8), 8);       // gid
    writeStr(124, octal(size, 12), 12);  // size
    writeStr(136, octal(mtime, 12), 12); // mtime
    // checksum: 8 bytes, last two are NUL and space
    // We'll fill it after computing
    buf[156] = type.charCodeAt(0);       // typeflag
    // linkname (100 bytes) = empty
    writeStr(257, 'ustar', 6);           // magic
    writeStr(263, '00', 2);              // version
    // uname, gname = empty
    writeStr(329, octal(0, 8), 8);       // devmajor
    writeStr(337, octal(0, 8), 8);       // devminor
    writeStr(345, prefixPart, 155);      // prefix

    // Compute and write checksum
    const cksum = calcChecksum(buf);
    const cksumStr = octal(cksum, 7) + '\0 ';
    writeStr(148, cksumStr, 8);

    return buf;
  }

  /**
   * Pack files into a tar archive.
   * @param {Array} entries - [{ name: 'relative/path', data: Uint8Array }]
   *   name should be the path relative to the archive root.
   *   For directories, data should be null/undefined and name should end with '/'.
   * @returns {Uint8Array} tar archive
   */
  function pack(entries) {
    // Collect directory entries needed
    const dirs = new Set();
    for (const e of entries) {
      const parts = e.name.split('/');
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/') + '/');
      }
    }

    // Build file list: directories first, then files
    const allEntries = [];
    for (const d of [...dirs].sort()) {
      allEntries.push({ name: d, data: null, type: '5' });
    }
    for (const e of entries) {
      allEntries.push({ ...e, type: '0' });
    }

    // Calculate total size
    let totalSize = 0;
    for (const e of allEntries) {
      totalSize += BLOCK_SIZE; // header
      if (e.data) {
        totalSize += Math.ceil(e.data.length / BLOCK_SIZE) * BLOCK_SIZE;
      }
    }
    totalSize += BLOCK_SIZE * 2; // two zero blocks at end

    const out = new Uint8Array(totalSize);
    let off = 0;

    for (const e of allEntries) {
      const header = writeHeader({
        name: e.name,
        size: e.data ? e.data.length : 0,
        type: e.type,
        mtime: Math.floor(Date.now() / 1000)
      });
      out.set(header, off);
      off += BLOCK_SIZE;

      if (e.data && e.data.length > 0) {
        out.set(e.data, off);
        off += e.data.length;
        // Pad to 512-byte boundary
        const pad = (BLOCK_SIZE - (e.data.length % BLOCK_SIZE)) % BLOCK_SIZE;
        off += pad;
      }
    }

    // Two zero blocks at end (already zeroed by Uint8Array)
    return out.slice(0, off + BLOCK_SIZE * 2);
  }

  /**
   * Parse a tar archive and return entries.
   * @param {Uint8Array} data - tar archive
   * @returns {Array} [{ name, data, type, size, mtime }]
   */
  function unpack(data) {
    const entries = [];
    let off = 0;

    function readStr(base, start, len) {
      let s = '';
      for (let i = 0; i < len; i++) {
        const b = data[base + start + i];
        if (b === 0 || b === undefined) break;
        s += String.fromCharCode(b);
      }
      return s;
    }

    function readOctal(base, start, len) {
      const s = readStr(base, start, len).trim();
      return s ? parseInt(s, 8) : 0;
    }

    while (off + BLOCK_SIZE <= data.length) {
      // Check for end-of-archive (two zero blocks)
      let isZero = true;
      for (let i = 0; i < BLOCK_SIZE; i++) {
        if (data[off + i] !== 0) { isZero = false; break; }
      }
      if (isZero) break;

      // Parse header fields using absolute offsets
      const name = readStr(off, 0, 100);
      const size = readOctal(off, 124, 12);
      const mtime = readOctal(off, 136, 12);
      const typeflag = data[off + 156];
      const type = typeflag ? String.fromCharCode(typeflag) : '0';
      const prefix = readStr(off, 345, 155);

      // Reconstruct full path
      const fullName = prefix ? prefix + '/' + name : name;

      // Advance past header
      off += BLOCK_SIZE;

      // Read file data if present
      let fileData = null;
      if (size > 0 && (type === '0' || type === '\0')) {
        if (off + size <= data.length) {
          fileData = data.slice(off, off + size);
        }
        // Advance past data + padding to 512-byte boundary
        off += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
      }

      entries.push({
        name: fullName.replace(/\/+$/, ''),
        data: fileData,
        type,
        size,
        mtime
      });
    }

    return entries;
  }

  return { pack, unpack, BLOCK_SIZE };
})();
