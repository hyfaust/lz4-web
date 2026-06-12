# lz4-web

[English](README.md) | [简体中文](README_zh.md)

---

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![LZ4 Version](https://img.shields.io/badge/LZ4-v1.10.0-green.svg)](https://github.com/lz4/lz4)
[![Pure Browser](https://img.shields.io/badge/Platform-Browser-orange.svg)]()
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg)]()

> A pure browser-based LZ4 compression toolkit — compress, decompress, parse, and benchmark without any server or backend. Powered by a JavaScript implementation of the LZ4 v1.10.0 algorithm.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Compress / Decompress](#compress--decompress)
  - [Frame Parser](#frame-parser)
  - [Documentation](#documentation)
  - [Benchmark](#benchmark)
- [Compression Options](#compression-options)
- [Dictionary Compression](#dictionary-compression)
- [Tar Archive Support](#tar-archive-support)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [CLI Compatibility](#cli-compatibility)
- [Testing](#testing)
- [License](#license)

## Features

- **Pure Browser** — No server, no backend, no build step. Just open `index.html`.
- **Zero Dependencies** — Pure JavaScript implementation, no external libraries.
- **Full LZ4 v1.10.0 Support** — Block format, Frame format, HC mode (levels 2–12), dictionary compression.
- **Bilingual UI** — Chinese / English with one-click switching.
- **Compression Levels 1–12** — Fast mode (1) and HC mode (2–12) with configurable acceleration.
- **Dictionary Compression** — Train a dictionary on your data patterns for dramatically better small-data compression (50–60% savings).
- **Frame Format Parser** — Upload any `.lz4` file and visualize its complete internal structure: magic number, flags, blocks, checksums.
- **Tar + LZ4 Archiving** — Pack entire folders into a single `.tar.lz4` file; extract with standard `tar` tools.
- **Streaming Processing** — Files >4 MB are automatically processed in chunks to avoid memory issues.
- **Web Worker Parallelism** — Multi-threaded compression using Web Workers for large files.
- **Skippable Frames** — Create and parse LZ4 skippable frames for embedding custom metadata.
- **Legacy Format** — Compress in Legacy format compatible with Linux kernel.
- **In-Browser Benchmark** — Test compression/decompression performance with generated or custom data.
- **160+ Automated Tests** — Comprehensive test suite with CLI cross-verification.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/hyfaust/lz4-web.git
cd lz4-web/site

# Open directly in browser
# Windows
start index.html

# macOS
open index.html

# Linux
xdg-open index.html

# Or start a local server
python -m http.server 8080
# Then visit http://localhost:8080
```

No `npm install`, no build step, no compilation. Just open and use.

## Usage

### Compress / Decompress

**File Mode:**
1. Click the drop zone or drag files onto it (supports multi-file and folder selection)
2. Configure options: compression level, block size, block mode, checksums
3. Click **▶ Process** to compress or decompress
4. Download the result

**Text Mode:**
1. Switch to Text Mode
2. Enter text in the input area
3. Click **Compress →** to compress, or **← Decompress** to decompress
4. View the hex output and statistics

**Folder Packing:**
1. Click **📁 Select Folder** to select an entire directory
2. Click **📦 Pack as .tar.lz4** to create a single archive
3. The resulting `.tar.lz4` can be extracted with standard tools:
   ```bash
   lz4 -d archive.tar.lz4 | tar xf -
   ```

### Frame Parser

1. Switch to the **🔍 Frame Parser** tab
2. Upload any `.lz4` file
3. View the complete frame structure:
   - Magic number, FLG/BD flags, content size, dictionary ID
   - Header checksum validation
   - Block list with sizes and compression status
   - Hex dump of the first 256 bytes

### Documentation

The **📖 Documentation** tab contains interactive explanations of:
- LZ4 algorithm overview and comparison with other algorithms
- Frame format specification with visual diagrams
- Block format specification with encoding examples
- Compression levels guide
- Dictionary compression guide
- CLI quick reference
- Use cases and best practices

### Benchmark

1. Switch to the **📊 Benchmark** tab
2. Select maximum test data size (64 KB – 16 MB)
3. Click **▶ Run Benchmark** for generated data, or **📁 Test with File** for custom data
4. View compression speed, decompression speed, and compression ratio in a table

## Compression Options

| Option | Values | Description |
|--------|--------|-------------|
| **Level** | 1–12, --fast=1/2/5/10 | 1 = Fast (default), 2–12 = HC mode with increasing ratio |
| **Block Size** | 64 KB, 256 KB, 1 MB, 4 MB | Maximum block size (default: 4 MB) |
| **Block Mode** | Linked, Independent | Independent = random access; Linked = better ratio |
| **Content CRC** | on/off | xxHash-32 checksum of entire decompressed content |
| **Block CRC** | on/off | xxHash-32 checksum per compressed block |
| **Content Size** | on/off | Store original file size in frame header |
| **No Frame CRC** | on/off | Disable content checksum |
| **Dictionary** | file | Pre-trained dictionary file for small data compression |

## Dictionary Compression

Dictionary compression is highly effective for compressing many small, structurally similar records (e.g., JSON logs, HTTP requests, database rows).

```bash
# Build a dictionary from sample data (using Zstandard's builder)
zstd --train samples/*.json -o dict.bin

# Use with lz4-web: upload dict.bin as the dictionary file
# Compression savings of 50–60% are typical for JSON records
```

The dictionary is stored in the LZ4 frame's Dictionary ID field and must be provided for decompression.

## Tar Archive Support

**Pack a folder:**
```
Select Folder → Pack as .tar.lz4 → Download
```

**Extract (CLI):**
```bash
lz4 -d archive.tar.lz4 | tar xf -
```

**Extract (browser):**
Upload a `.tar.lz4` file → Decompress → Click **📂 Extract Files**

## Project Structure

```
site/
├── index.html           # Main page (SPA with tab navigation)
├── css/
│   └── style.css        # Global styles (dark theme)
├── js/
│   ├── xxhash.js        # xxHash-32 implementation
│   ├── lz4-block.js     # LZ4 Block format encoder/decoder
│   ├── lz4hc.js         # LZ4 HC (High Compression) mode
│   ├── lz4-frame.js     # LZ4 Frame format encoder/decoder
│   ├── lz4-parser.js    # Frame format visual parser
│   ├── lz4-compress.js  # Compression tool module
│   ├── lz4-bench.js     # Benchmark module
│   ├── lz4-stream.js    # Streaming chunked processing
│   ├── lz4-worker.js    # Web Worker for parallel compression
│   ├── lz4-parallel.js  # Parallel compression orchestrator
│   ├── tar.js           # UStar tar format reader/writer
│   ├── i18n.js          # Bilingual (EN/ZH) translation module
│   ├── app.js           # Main application logic
│   └── test-verify.js   # 160+ automated tests
├── LICENSE              # GPL v3
└── README.md
```

## API Reference

The JavaScript modules expose the following key APIs:

### LZ4Block

```js
// Compress a block (Fast mode)
LZ4Block.compress(data, { acceleration: 1, dict: null })  // → Uint8Array

// Decompress a block
LZ4Block.decompress(compressed, maxSize, { dict: null })  // → Uint8Array

// Max compressed size
LZ4Block.compressBound(inputSize)  // → number
```

### LZ4HC

```js
// HC compression (levels 2–12)
LZ4HC.compress(data, { level: 9, dict: null, favorDecSpeed: false })
```

### LZ4Frame

```js
// Frame compress/decompress
LZ4Frame.compress(data, { compressionLevel, blockSizeID, contentChecksum, contentSize, dictData })
LZ4Frame.decompress(data, { dictData })  // → { data, frameInfo }

// Legacy format
LZ4Frame.compressLegacy(data, { acceleration })

// Skippable frames
LZ4Frame.createSkippableFrame(userData, magicVariant)
LZ4Frame.concatFrames([frame1, frame2, ...])
LZ4Frame.parseFrameStream(concatenatedData)
```

### LZ4Parser

```js
// Parse an LZ4 file and visualize structure
LZ4Parser.parse(data)  // → { frames, stats }
```

### TarUtil

```js
// Pack files into tar
TarUtil.pack([{ name: 'path/file.txt', data: Uint8Array }])  // → Uint8Array

// Unpack tar
TarUtil.unpack(tarData)  // → [{ name, data, type, size }]
```

## CLI Compatibility

lz4-web produces output **fully compatible** with the official `lz4` CLI tool:

```bash
# JS compress → CLI decompress ✅
lz4 -d js_output.lz4 original.txt

# CLI compress → JS decompress ✅
lz4 -9 file.txt && lz4 -d file.txt.lz4  # (in browser)

# JS tar.lz4 → CLI extract ✅
lz4 -d archive.tar.lz4 | tar xf -

# CLI tar.lz4 → JS extract ✅
# Upload archive.tar.lz4 in browser → Extract Files
```

Verified compression levels: 1, 2, 3, 5, 6, 7, 9, 10, 12.

## Testing

The project includes a comprehensive test suite (`js/test-verify.js`) with **160+ tests** across 18 categories:

```bash
# Run all tests
node js/test-verify.js
```

| Category | Tests | Description |
|----------|-------|-------------|
| xxHash-32 | 3 | Known value verification |
| Block roundtrip | 6 | Various data patterns |
| Acceleration levels | 6 | Speed/ratio tradeoff |
| Frame levels | 7 | Levels 1–12 + --fast |
| Frame options | 5 | ContentSize, CRC, BlockCRC |
| Parser accuracy | 15 | Multi-option combinations |
| Large data | 2 | 64 KB + 256 KB |
| Dictionary | 9 | 56–62% compression savings |
| HC mode | 14 | Levels 2–12 + CLI cross-verify |
| --favor-decSpeed | 3 | Levels 10–12 |
| Legacy format | 5 | CLI -l cross-verify |
| Skippable Frame | 24 | All 16 magic variants + CLI |
| Tar pack/unpack | 16 | Pack, unpack, CLI cross-verify |
| Parallel | 3 | Worker code + block roundtrip |
| CLI cross-verify | 5 | JS ↔ CLI bidirectional |

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

The LZ4 algorithm and library are by [Yann Collet](https://github.com/Cyan4973) and licensed under BSD 2-Clause and GPL-2.0-or-later. See [github.com/lz4/lz4](https://github.com/lz4/lz4).

## Acknowledgments

- [LZ4](https://github.com/lz4/lz4) by Yann Collet — the original LZ4 compression library
- [xxHash](https://github.com/Cyan4973/xxHash) by Yann Collet — fast hash algorithm used for checksums
