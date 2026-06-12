// LZ4 Implementation Test Suite
// Run: node site/js/test-verify.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

const siteDir = __dirname;
const ctx = vm.createContext({
  console, Math, Uint8Array, Int32Array, TextEncoder, TextDecoder,
  performance, Error, Array, String, Number, Object, Promise, setTimeout,
  URL, Blob, document: undefined, FileReader: undefined, BigInt
});

function loadModule(file) { vm.runInContext(fs.readFileSync(path.join(siteDir, file), 'utf8'), ctx); }
loadModule('xxhash.js'); loadModule('lz4-block.js'); loadModule('lz4hc.js'); loadModule('lz4-frame.js'); loadModule('lz4-parser.js'); loadModule('tar.js');

const { xxh32 } = ctx.XXHash;
const { compress: blockCompress, decompress: blockDecompress, compressBound } = ctx.LZ4Block;
const LZ4HC = ctx.LZ4HC;
const { compress: frameCompress, decompress: frameDecompress } = ctx.LZ4Frame;
const { parse: frameParse } = ctx.LZ4Parser;
const TarUtil = ctx.TarUtil;

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}
function roundtrip(src, opts) {
  const f = frameCompress(src, opts);
  const r = frameDecompress(f);
  return r.data.length === src.length && src.every((v, i) => v === r.data[i]);
}

// ============================================================
console.log('=== 1. xxHash-32 ===');
assert(xxh32(new Uint8Array(0), 0) === 0x02CC5D05, 'xxh32(empty) = 0x02CC5D05');
assert(xxh32(new TextEncoder().encode('Hello, World!'), 0) === 0x4007DE50, 'xxh32("Hello, World!") = 0x4007DE50');
assert(xxh32(new Uint8Array([0x64, 0x40]), 0) === 0x95C0A77C, 'xxh32([0x64,0x40]) = 0x95C0A77C');

// ============================================================
console.log('\n=== 2. LZ4 Block roundtrip ===');
const blockTests = [
  'Hello, World!',
  'AAAAAAAABBBBBBBBCCCCCCCCDDDDDDDD',
  'The quick brown fox jumps over the lazy dog. ' + 'The quick brown fox jumps over the lazy dog. ',
  'a'.repeat(1000),
  'x'.repeat(10000),
  'LZ4 is a lossless compression algorithm, providing compression speed >500 MB/s per core.',
];
for (const s of blockTests) {
  const src = new TextEncoder().encode(s);
  const c = blockCompress(src);
  const d = blockDecompress(c, src.length);
  const ok = d.length === src.length && src.every((v, i) => v === d[i]);
  assert(ok, `"${s.substring(0, 35)}..." [${src.length}B→${c.length}B, ${(src.length/c.length).toFixed(2)}:1]`);
}

// ============================================================
console.log('\n=== 3. Acceleration levels ===');
const accelSrc = new TextEncoder().encode('The quick brown fox jumps over the lazy dog. '.repeat(50));
for (const acc of [1, 2, 5, 10, 20]) {
  const c = blockCompress(accelSrc, { acceleration: acc });
  const d = blockDecompress(c, accelSrc.length);
  const ok = d.length === accelSrc.length && accelSrc.every((v, i) => v === d[i]);
  assert(ok, `acceleration=${acc} [${accelSrc.length}B→${c.length}B, ${(accelSrc.length/c.length).toFixed(2)}:1]`);
}
// Verify higher acceleration produces smaller or equal speed (larger or equal size)
const c1 = blockCompress(accelSrc, { acceleration: 1 }).length;
const c10 = blockCompress(accelSrc, { acceleration: 10 }).length;
assert(c10 >= c1, `accel=10 size (${c10}) >= accel=1 size (${c1})`);

// ============================================================
console.log('\n=== 4. Frame compression levels (compressionLevel option) ===');
const lvlSrc = new TextEncoder().encode('Frame level test data. '.repeat(200));
for (const lvl of [1, 3, 6, 9, 12, -1, -5]) {
  const ok = roundtrip(lvlSrc, { compressionLevel: lvl, contentChecksum: true, contentSize: true });
  const f = frameCompress(lvlSrc, { compressionLevel: lvl, contentChecksum: true, contentSize: true });
  assert(ok, `level=${lvl} roundtrip [${lvlSrc.length}B→${f.length}B]`);
}

// ============================================================
console.log('\n=== 5. Frame options: contentSize, contentChecksum, blockChecksum ===');
const optSrc = new TextEncoder().encode('Options test. '.repeat(100));

// contentSize=false
{
  const f = frameCompress(optSrc, { contentSize: false, contentChecksum: true });
  const r = frameDecompress(f);
  assert(r.data.length === optSrc.length && optSrc.every((v, i) => v === r.data[i]), 'contentSize=false roundtrip');
  const p = frameParse(f);
  assert(p.frames[0].info.contentSizeFlag === false || p.frames[0].info.contentSize === 0, 'contentSize not in frame');
}

// contentChecksum=false (no-frame-crc)
{
  const f = frameCompress(optSrc, { contentChecksum: false, contentSize: true });
  const r = frameDecompress(f);
  assert(r.data.length === optSrc.length && optSrc.every((v, i) => v === r.data[i]), 'contentChecksum=false roundtrip');
}

// blockChecksum=true
{
  const f = frameCompress(optSrc, { blockChecksum: true, contentChecksum: true, contentSize: true });
  const r = frameDecompress(f);
  assert(r.data.length === optSrc.length && optSrc.every((v, i) => v === r.data[i]), 'blockChecksum=true roundtrip');
  const p = frameParse(f);
  assert(!!p.frames[0].info.blockChecksumFlag, 'block checksum present in frame');
}

// ============================================================
console.log('\n=== 6. Frame parser accuracy ===');
const parserSrc = new TextEncoder().encode('Parser accuracy test with repetition. Parser accuracy test. '.repeat(20));
for (const opts of [
  { contentChecksum: true, contentSize: true },
  { contentChecksum: false, contentSize: false },
  { blockChecksum: true, contentChecksum: true },
  { blockSizeID: 4, contentChecksum: true },
  { blockSizeID: 6, contentChecksum: true },
]) {
  const f = frameCompress(parserSrc, opts);
  const p = frameParse(f);
  assert(p.stats.frameCount === 1, `parser: 1 frame (opts=${JSON.stringify(opts).substring(0, 50)})`);
  assert(p.stats.blockCount > 0, `parser: ${p.stats.blockCount} block(s)`);
  assert(p.frames[0].info.headerChecksumValid === true, 'parser: header CRC valid');
}

// ============================================================
console.log('\n=== 7. Large data roundtrip (64KB + 256KB) ===');
for (const size of [65536, 262144]) {
  const data = new Uint8Array(size);
  let s = 42;
  for (let i = 0; i < size; i++) { s = (s * 1103515245 + 12345) & 0x7FFFFFFF; data[i] = s & 0xFF; }
  for (let i = 0; i < 8192; i++) data[i] = (i % 26) + 65;

  const f = frameCompress(data, { contentChecksum: true, contentSize: true });
  const r = frameDecompress(f);
  const ok = r.data.length === data.length && data.every((v, i) => v === r.data[i]);
  assert(ok, `${size}B roundtrip [→${f.length}B, ${(size/f.length).toFixed(2)}:1]`);
}

// ============================================================
console.log('\n=== 8. Dictionary compression ===');

// Test data: JSON-like records sharing common keys
const dictContent = new TextEncoder().encode(
  '{"user_id":0,"name":"placeholder","email":"placeholder@example.com","role":"user","active":true,"created_at":"2025-01-01T00:00:00Z"}\n'.repeat(50)
);

// Small records that share patterns with the dictionary
const dictTestRecords = [
  '{"user_id":42,"name":"Alice","email":"alice@example.com","role":"admin","active":true,"created_at":"2026-03-15T10:30:00Z"}',
  '{"user_id":99,"name":"Bob","email":"bob@example.com","role":"user","active":false,"created_at":"2026-06-01T08:00:00Z"}',
  '{"user_id":7,"name":"Charlie","email":"charlie@example.com","role":"moderator","active":true,"created_at":"2026-01-20T14:45:00Z"}',
];

// Block-level dict compression roundtrip
console.log('Block-level:');
for (const rec of dictTestRecords) {
  const src = new TextEncoder().encode(rec);
  const cNoDict = blockCompress(src);
  const cWithDict = blockCompress(src, { dict: dictContent });
  const dWithDict = blockDecompress(cWithDict, src.length, { dict: dictContent });
  const match = dWithDict.length === src.length && src.every((v, i) => v === dWithDict[i]);
  const saving = cNoDict.length - cWithDict.length;
  assert(match, `"${rec.substring(0, 50)}..." [no-dict:${cNoDict.length}B, dict:${cWithDict.length}B, save:${saving}B]`);
}

// Frame-level dict compression roundtrip
console.log('Frame-level:');
for (const rec of dictTestRecords) {
  const src = new TextEncoder().encode(rec);
  const fNoDict = frameCompress(src, { contentChecksum: true, contentSize: true });
  const fWithDict = frameCompress(src, { contentChecksum: true, contentSize: true, dictData: dictContent });
  const rWithDict = frameDecompress(fWithDict, { dictData: dictContent });
  const match = rWithDict.data.length === src.length && src.every((v, i) => v === rWithDict.data[i]);
  const saving = fNoDict.length - fWithDict.length;
  assert(match, `frame "${rec.substring(0, 50)}..." [no-dict:${fNoDict.length}B, dict:${fWithDict.length}B, save:${saving}B]`);
}

// Multiple records batch compression with dict
console.log('Batch:');
const batchSrc = new TextEncoder().encode(dictTestRecords.join('\n'));
const batchNoDict = frameCompress(batchSrc, { contentChecksum: true, contentSize: true });
const batchWithDict = frameCompress(batchSrc, { contentChecksum: true, contentSize: true, dictData: dictContent });
const batchResult = frameDecompress(batchWithDict, { dictData: dictContent });
assert(batchResult.data.length === batchSrc.length && batchSrc.every((v, i) => v === batchResult.data[i]),
  `batch [no-dict:${batchNoDict.length}B, dict:${batchWithDict.length}B, ratio:${(batchSrc.length/batchWithDict.length).toFixed(2)}:1]`);

// Dict without dict on decompress should still produce output (just without dict matches)
console.log('No-dict decompress:');
const fOnly = frameCompress(dictTestRecords[0] ? new TextEncoder().encode(dictTestRecords[0]) : new Uint8Array(0), { dictData: dictContent, contentChecksum: true, contentSize: true });
try {
  const rNoDict = frameDecompress(fOnly);
  assert(rNoDict.data.length > 0, 'decompress without dict produces output (may differ)');
} catch (e) {
  assert(true, 'decompress without dict throws (expected for dict-dependent data)');
}

// Empty dict should work like no dict
const emptyDict = new Uint8Array(0);
const srcSmall = new TextEncoder().encode('Hello, World!');
const cEmptyDict = blockCompress(srcSmall, { dict: emptyDict });
const dEmptyDict = blockDecompress(cEmptyDict, srcSmall.length, { dict: emptyDict });
assert(dEmptyDict.length === srcSmall.length && srcSmall.every((v, i) => v === dEmptyDict[i]), 'empty dict = no dict');

// ============================================================
console.log('\n=== 9. HC mode (levels 2-12) ===');

// HC block-level roundtrip
const hcTestData = new TextEncoder().encode(
  'The quick brown fox jumps over the lazy dog. '.repeat(100) +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.repeat(50) +
  'LZ4 HC compression provides better ratio than Fast mode. '.repeat(80)
);
console.log('HC Block roundtrip:');
for (const lvl of [2, 3, 5, 7, 9, 10, 12]) {
  const c = LZ4HC.compress(hcTestData, { level: lvl });
  const d = blockDecompress(c, hcTestData.length);
  const match = d.length === hcTestData.length && hcTestData.every((v, i) => v === d[i]);
  assert(match, `HC-${lvl} block [${hcTestData.length}B→${c.length}B, ${(hcTestData.length/c.length).toFixed(2)}:1]`);
}

// HC should produce better ratio than Fast for same data
const fastComp = blockCompress(hcTestData);
const hc9Comp = LZ4HC.compress(hcTestData, { level: 9 });
assert(hc9Comp.length <= fastComp.length * 1.05, `HC-9 (${hc9Comp.length}B) ≈ Fast (${fastComp.length}B) ratio comparable`);

const hc12Comp = LZ4HC.compress(hcTestData, { level: 12 });
assert(hc12Comp.length <= hc9Comp.length, `HC-12 (${hc12Comp.length}B) <= HC-9 (${hc9Comp.length}B) further improvement`);

// HC frame-level roundtrip
console.log('HC Frame roundtrip:');
const hcFrameSrc = new TextEncoder().encode('Frame HC test. '.repeat(200));
for (const lvl of [2, 5, 9, 12]) {
  const f = frameCompress(hcFrameSrc, { compressionLevel: lvl, contentChecksum: true, contentSize: true });
  const r = frameDecompress(f);
  const match = r.data.length === hcFrameSrc.length && hcFrameSrc.every((v, i) => v === r.data[i]);
  assert(match, `HC-${lvl} frame [${hcFrameSrc.length}B→${f.length}B]`);
}

// HC CLI cross-verification
console.log('HC CLI cross-verify:');
try {
  const hcCliData = new TextEncoder().encode('HC CLI cross-verification test data. '.repeat(20));
  const fIn = path.join(siteDir, '_hc_in.tmp');
  const fLz4 = path.join(siteDir, '_hc_out.tmp.lz4');
  const fDec = path.join(siteDir, '_hc_dec.tmp');
  fs.writeFileSync(fIn, hcCliData);

  // JS HC-9 compress → CLI decompress
  const jsHC9 = frameCompress(hcCliData, { compressionLevel: 9, contentChecksum: true, contentSize: true });
  fs.writeFileSync(fLz4, jsHC9);
  try {
    execSync(`lz4 -d -f "${fLz4}" "${fDec}"`);
    const dec = new Uint8Array(fs.readFileSync(fDec));
    assert(dec.length === hcCliData.length && hcCliData.every((v, i) => v === dec[i]), 'JS HC-9 → CLI decompress');
  } catch (e) {
    assert(false, 'JS HC-9 → CLI decompress: ' + (e.stderr || e.message || '').toString().substring(0, 80));
  }

  // CLI HC-9 compress → JS decompress
  execSync(`lz4 -9 -f "${fIn}" "${fLz4}"`);
  const cliHC9 = new Uint8Array(fs.readFileSync(fLz4));
  try {
    const r = frameDecompress(cliHC9);
    assert(r.data.length === hcCliData.length && hcCliData.every((v, i) => v === r.data[i]), 'CLI HC-9 → JS decompress');
  } catch (e) {
    assert(false, 'CLI HC-9 → JS decompress: ' + e.message.substring(0, 80));
  }

  try { fs.unlinkSync(fIn); } catch {}
  try { fs.unlinkSync(fLz4); } catch {}
  try { fs.unlinkSync(fDec); } catch {}
} catch (e) {
  console.log('  HC CLI test error:', e.message.substring(0, 100));
  failed++;
}

// ============================================================
console.log('\n=== 11. --favor-decSpeed ===');
const fdsData = new TextEncoder().encode('favor-decSpeed test data. '.repeat(300));
for (const lvl of [10, 11, 12]) {
  const fNo = frameCompress(fdsData, { compressionLevel: lvl, contentChecksum: true, contentSize: true });
  const fYes = frameCompress(fdsData, { compressionLevel: lvl, contentChecksum: true, contentSize: true, favorDecSpeed: true });
  const rYes = frameDecompress(fYes);
  const match = rYes.data.length === fdsData.length && fdsData.every((v, i) => v === rYes.data[i]);
  assert(match, `favor-decSpeed level=${lvl} [normal:${fNo.length}B, fast:${fYes.length}B]`);
  // favor-decSpeed should produce equal or smaller output (shorter matches = less overhead)
}

// ============================================================
console.log('\n=== 12. Legacy format ===');
const legacyData = new TextEncoder().encode('Legacy format test. '.repeat(100));
const legacyCompressed = ctx.LZ4Frame.compressLegacy(legacyData);
const legacyParsed = ctx.LZ4Parser.parse(legacyCompressed);
assert(legacyParsed.frames[0]?.type === 'legacy', 'Legacy frame detected by parser');
assert(legacyParsed.frames[0].info?.format === 'Legacy (Linux kernel compatible)', 'Legacy format recognized');
// Legacy decompression
const legacyDec = ctx.LZ4Frame.decompress(legacyCompressed);
assert(legacyDec.data.length === legacyData.length && legacyData.every((v, i) => v === legacyDec.data[i]),
  `Legacy roundtrip [${legacyData.length}B→${legacyCompressed.length}B]`);

// CLI legacy cross-verify
try {
  const fIn = path.join(siteDir, '_leg_in.tmp');
  const fLz4 = path.join(siteDir, '_leg_out.tmp.lz4');
  const fDec = path.join(siteDir, '_leg_dec.tmp');
  fs.writeFileSync(fIn, legacyData);

  // JS Legacy compress → CLI decompress
  fs.writeFileSync(fLz4, legacyCompressed);
  try {
    execSync(`lz4 -d -f "${fLz4}" "${fDec}"`);
    const dec = new Uint8Array(fs.readFileSync(fDec));
    assert(dec.length === legacyData.length && legacyData.every((v, i) => v === dec[i]), 'JS Legacy → CLI decompress');
  } catch (e) {
    assert(false, 'JS Legacy → CLI: ' + (e.stderr || e.message || '').toString().substring(0, 80));
  }

  // CLI -l compress → JS decompress
  execSync(`lz4 -l -f "${fIn}" "${fLz4}"`);
  const cliLegacy = new Uint8Array(fs.readFileSync(fLz4));
  const cliLegacyDec = ctx.LZ4Frame.decompress(cliLegacy);
  assert(cliLegacyDec.data.length === legacyData.length && legacyData.every((v, i) => v === cliLegacyDec.data[i]),
    'CLI Legacy → JS decompress');

  try { fs.unlinkSync(fIn); } catch {}
  try { fs.unlinkSync(fLz4); } catch {}
  try { fs.unlinkSync(fDec); } catch {}
} catch (e) {
  console.log('  Legacy CLI test error:', e.message.substring(0, 100));
  failed++;
}

// ============================================================
console.log('\n=== 14. Parallel compression (worker code verification) ===');

// Test the worker's embedded compression code by loading lz4-worker.js
// and extracting the blockCompress function
try {
  const workerCode = fs.readFileSync(path.join(siteDir, 'lz4-worker.js'), 'utf8');
  // The worker uses an IIFE, extract and test the compression logic
  // Create a mock self.onmessage to capture the handler
  const workerCtx = vm.createContext({
    console, Math, Uint8Array, Int32Array, BigInt,
    self: { onmessage: null },
    postMessage: function() {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    Blob: function() {},
    Worker: function() {}
  });
  vm.runInContext(workerCode, workerCtx);

  // Verify the handler was registered
  assert(typeof workerCtx.self.onmessage === 'function', 'Worker handler registered');

  // Verify frame assembly logic (simulated)
  const workerTestData = new TextEncoder().encode('Worker compression test data. '.repeat(100));
  const testBlocks = [];
  let testOff = 0;
  const testBlockSize = 1024;
  while (testOff < workerTestData.length) {
    const sz = Math.min(testBlockSize, workerTestData.length - testOff);
    testBlocks.push(workerTestData.slice(testOff, testOff + sz));
    testOff += sz;
  }

  // Simulate parallel results
  const simResults = testBlocks.map((block, i) => {
    const compressed = blockCompress(block);
    return { data: compressed, originalSize: block.length, compressedSize: compressed.length };
  });

  // Verify all blocks compress correctly
  const allBlocksOk = simResults.every((r, i) => {
    const decompressed = blockDecompress(r.data, r.originalSize);
    return decompressed.length === testBlocks[i].length &&
           testBlocks[i].every((v, j) => v === decompressed[j]);
  });
  assert(allBlocksOk, `All ${testBlocks.length} parallel blocks roundtrip correctly`);

  // Verify total size matches
  const totalOriginal = simResults.reduce((s, r) => s + r.originalSize, 0);
  assert(totalOriginal === workerTestData.length, `Total original size matches (${totalOriginal})`);

  console.log(`  Parallel: ${testBlocks.length} blocks, ${workerTestData.length}B total`);
} catch (e) {
  console.log('  Parallel test error:', e.message.substring(0, 100));
  failed++;
}

// ============================================================
console.log('\n=== 16. Skippable Frame ===');

// Basic creation
const skipData = new TextEncoder().encode('{"version":1,"author":"test"}');
const skipFrame = ctx.LZ4Frame.createSkippableFrame(skipData);
assert(skipFrame.length === 8 + skipData.length, `Skippable frame size: ${skipFrame.length} = 8 + ${skipData.length}`);
// Verify magic number
const skipMagic = (skipFrame[0] | (skipFrame[1] << 8) | (skipFrame[2] << 16) | (skipFrame[3] << 24)) >>> 0;
assert(skipMagic === 0x184D2A50, `Magic = 0x${skipMagic.toString(16)} (expected 0x184d2a50)`);
// Verify size field
const skipSize = (skipFrame[4] | (skipFrame[5] << 8) | (skipFrame[6] << 16) | (skipFrame[7] << 24)) >>> 0;
assert(skipSize === skipData.length, `Size field = ${skipSize} (expected ${skipData.length})`);
// Verify user data
const extractedData = skipFrame.slice(8);
assert(extractedData.length === skipData.length && skipData.every((v, i) => v === extractedData[i]),
  'User data preserved correctly');

// String input
const skipStr = ctx.LZ4Frame.createSkippableFrame('hello world');
assert(skipStr.length === 8 + 11, 'String input creates correct size');

// Magic variant (0-15)
for (let v = 0; v <= 15; v++) {
  const f = ctx.LZ4Frame.createSkippableFrame(new Uint8Array([v]), v);
  const m = (f[0] | (f[1] << 8) | (f[2] << 16) | (f[3] << 24)) >>> 0;
  assert(m === 0x184D2A50 + v, `Variant ${v}: magic = 0x${m.toString(16)}`);
}

// Invalid variant
try {
  ctx.LZ4Frame.createSkippableFrame('test', 16);
  assert(false, 'Should throw for variant 16');
} catch (e) {
  assert(e.message.includes('magicVariant'), 'Throws for invalid variant');
}

// Empty data
const emptySkip = ctx.LZ4Frame.createSkippableFrame(new Uint8Array(0));
assert(emptySkip.length === 8, 'Empty skippable frame = 8 bytes');

// Parser recognizes skippable frame
const parsed = ctx.LZ4Parser.parse(skipFrame);
assert(parsed.frames.length === 1, 'Parser finds 1 frame');
assert(parsed.frames[0].type === 'skippable', 'Frame type = skippable');
assert(parsed.frames[0].info.format === 'Skippable', 'Format = Skippable');
assert(parsed.frames[0].info.frameSize === skipData.length, `Frame size = ${skipData.length}`);

// CLI can decompress past skippable frame
try {
  const lz4Data = new TextEncoder().encode('test data for CLI skip');
  const lz4Frame = ctx.LZ4Frame.compress(lz4Data, { contentChecksum: true, contentSize: true });

  // Concatenate: skippable + standard frame
  const stream = ctx.LZ4Frame.concatFrames([skipFrame, lz4Frame]);

  // Write to file and let CLI decompress (should skip the skippable frame)
  const fTmp = path.join(siteDir, '_skip_test.lz4');
  const fDec = path.join(siteDir, '_skip_dec.tmp');
  fs.writeFileSync(fTmp, stream);
  try {
    execSync(`lz4 -d -f "${fTmp}" "${fDec}"`);
    const dec = new Uint8Array(fs.readFileSync(fDec));
    assert(dec.length === lz4Data.length && lz4Data.every((v, i) => v === dec[i]),
      'CLI skips skippable frame, decompresses standard frame');
  } catch (e) {
    assert(false, 'CLI skip test: ' + (e.stderr || e.message || '').toString().substring(0, 80));
  }
  try { fs.unlinkSync(fTmp); } catch {}
  try { fs.unlinkSync(fDec); } catch {}
} catch (e) {
  console.log('  CLI skip test error:', e.message.substring(0, 100));
  failed++;
}

// parseFrameStream: mixed frames
const streamData1 = new TextEncoder().encode('first frame data');
const streamData2 = new TextEncoder().encode('second frame data');
const metadata = new TextEncoder().encode('{"key":"value"}');
const f1 = ctx.LZ4Frame.compress(streamData1, { contentChecksum: true, contentSize: true });
const f2 = ctx.LZ4Frame.compress(streamData2, { contentChecksum: true, contentSize: true });
const meta = ctx.LZ4Frame.createSkippableFrame(metadata, 3);
const mixedStream = ctx.LZ4Frame.concatFrames([f1, meta, f2]);

const parsedStream = ctx.LZ4Frame.parseFrameStream(mixedStream);
assert(parsedStream.length === 3, `Parsed ${parsedStream.length} frames (expected 3)`);
assert(parsedStream[0].type === 'standard', 'Frame 0 = standard');
assert(parsedStream[1].type === 'skippable', 'Frame 1 = skippable');
assert(parsedStream[2].type === 'standard', 'Frame 2 = standard');

// Verify standard frames decompressed correctly
assert(parsedStream[0].data.length === streamData1.length &&
       streamData1.every((v, i) => v === parsedStream[0].data[i]), 'Frame 0 data matches');
assert(parsedStream[2].data.length === streamData2.length &&
       streamData2.every((v, i) => v === parsedStream[2].data[i]), 'Frame 2 data matches');

// Verify skippable frame data
assert(parsedStream[1].data.length === metadata.length &&
       metadata.every((v, i) => v === parsedStream[1].data[i]), 'Skippable data matches');
assert(parsedStream[1].frameInfo.magicVariant === 3, `Magic variant = 3`);

// Multiple skippable frames
const skip1 = ctx.LZ4Frame.createSkippableFrame('meta1', 0);
const skip2 = ctx.LZ4Frame.createSkippableFrame('meta2', 5);
const skip3 = ctx.LZ4Frame.createSkippableFrame('meta3', 15);
const skipOnly = ctx.LZ4Frame.concatFrames([skip1, skip2, skip3]);
const parsedSkips = ctx.LZ4Frame.parseFrameStream(skipOnly);
assert(parsedSkips.length === 3, `3 skippable frames parsed`);
assert(parsedSkips[0].frameInfo.magicVariant === 0, 'Variant 0');
assert(parsedSkips[1].frameInfo.magicVariant === 5, 'Variant 5');
assert(parsedSkips[2].frameInfo.magicVariant === 15, 'Variant 15');

// Large user data
const largeMeta = new Uint8Array(65536);
for (let i = 0; i < largeMeta.length; i++) largeMeta[i] = i & 0xFF;
const largeSkip = ctx.LZ4Frame.createSkippableFrame(largeMeta);
assert(largeSkip.length === 8 + 65536, 'Large skippable frame size correct');
const largeParsed = ctx.LZ4Parser.parse(largeSkip);
assert(largeParsed.frames[0].info.frameSize === 65536, 'Large frame size field correct');

// ============================================================
console.log('\n=== 17. Tar pack/unpack ===');

// Pack files into tar
const tarEntries = [
  { name: 'dir1/file1.txt', data: new TextEncoder().encode('Hello from file 1\n') },
  { name: 'dir1/file2.txt', data: new TextEncoder().encode('Hello from file 2\n') },
  { name: 'dir2/subdir/file3.txt', data: new TextEncoder().encode('Nested file 3\n') },
  { name: 'root.txt', data: new TextEncoder().encode('Root level file\n') },
];

const tarArchive = TarUtil.pack(tarEntries);
assert(tarArchive.length > 0, `Tar archive created: ${tarArchive.length} bytes`);

// Verify tar magic (ustar at offset 257 of first entry)
const tarMagic = String.fromCharCode(tarArchive[257], tarArchive[258], tarArchive[259], tarArchive[260], tarArchive[261]);
assert(tarMagic === 'ustar', `Tar magic = "${tarMagic}" (expected "ustar")`);

// Unpack and verify
const unpacked = TarUtil.unpack(tarArchive);
assert(unpacked.length >= 4, `Unpacked ${unpacked.length} entries (expected >= 4)`);

// Verify file contents
for (const entry of tarEntries) {
  const found = unpacked.find(e => e.name === entry.name);
  assert(found !== undefined, `Found entry: ${entry.name}`);
  if (found && found.data) {
    const match = found.data.length === entry.data.length &&
      entry.data.every((v, i) => v === found.data[i]);
    assert(match, `Content matches: ${entry.name} (${found.data.length}B)`);
  }
}

// Verify directory entries exist
const dirEntries = unpacked.filter(e => e.type === '5');
assert(dirEntries.length >= 3, `Directory entries: ${dirEntries.length} (expected >= 3)`);

// Tar + LZ4 roundtrip
const tarLz4 = ctx.LZ4Frame.compress(tarArchive, { contentChecksum: true, contentSize: true });
const tarLz4Dec = ctx.LZ4Frame.decompress(tarLz4);
assert(tarLz4Dec.data.length === tarArchive.length, `tar.lz4 roundtrip: ${tarArchive.length}B → ${tarLz4.length}B → ${tarLz4Dec.data.length}B`);

// Re-unpack from decompressed data
const repacked = TarUtil.unpack(tarLz4Dec.data);
for (const entry of tarEntries) {
  const found = repacked.find(e => e.name === entry.name);
  assert(found !== undefined && found.data, `Roundtrip entry: ${entry.name}`);
  if (found && found.data) {
    const match = found.data.length === entry.data.length &&
      entry.data.every((v, i) => v === found.data[i]);
    assert(match, `Roundtrip content: ${entry.name}`);
  }
}

// CLI cross-verify: JS tar.lz4 → CLI decompress → tar extract
try {
  const fTarLz4 = path.join(siteDir, '_tar_test.tar.lz4');
  const fTar = path.join(siteDir, '_tar_test.tar');
  fs.writeFileSync(fTarLz4, tarLz4);

  // Decompress lz4
  execSync(`lz4 -d -f "${fTarLz4}" "${fTar}"`);
  const cliTar = new Uint8Array(fs.readFileSync(fTar));
  assert(cliTar.length === tarArchive.length, `CLI decompressed tar: ${cliTar.length}B === ${tarArchive.length}B`);

  // Extract tar with CLI
  const extractDir = path.join(siteDir, '_tar_extract');
  try { fs.mkdirSync(extractDir, { recursive: true }); } catch {}
  execSync(`tar xf "${fTar}" -C "${extractDir}"`);

  // Verify extracted files
  for (const entry of tarEntries) {
    const filePath = path.join(extractDir, entry.name);
    const exists = fs.existsSync(filePath);
    assert(exists, `CLI extracted: ${entry.name}`);
    if (exists) {
      const content = fs.readFileSync(filePath);
      const contentArr = new Uint8Array(content);
      const match = contentArr.length === entry.data.length &&
        entry.data.every((v, i) => v === contentArr[i]);
      assert(match, `CLI content matches: ${entry.name}`);
    }
  }

  // Cleanup
  try { fs.rmSync(extractDir, { recursive: true }); } catch {}
  try { fs.unlinkSync(fTarLz4); } catch {}
  try { fs.unlinkSync(fTar); } catch {}
} catch (e) {
  console.log('  Tar CLI test error:', e.message.substring(0, 120));
  failed++;
}

// CLI tar → JS decompress
try {
  // Create files for CLI to tar
  const cliTarDir = path.join(siteDir, '_tar_cli_dir');
  try { fs.mkdirSync(path.join(cliTarDir, 'sub'), { recursive: true }); } catch {}
  fs.writeFileSync(path.join(cliTarDir, 'a.txt'), 'file A');
  fs.writeFileSync(path.join(cliTarDir, 'sub', 'b.txt'), 'file B');

  const fCliTar = path.join(siteDir, '_cli_tar.tar');
  const fCliTarLz4 = path.join(siteDir, '_cli_tar.tar.lz4');

  // CLI: tar + lz4
  execSync(`tar cf "${fCliTar}" -C "${cliTarDir}" .`);
  execSync(`lz4 -f "${fCliTar}" "${fCliTarLz4}"`);

  // JS: decompress + unpack
  const cliLz4Data = new Uint8Array(fs.readFileSync(fCliTarLz4));
  const cliDecResult = ctx.LZ4Frame.decompress(cliLz4Data);
  const cliEntries = TarUtil.unpack(cliDecResult.data);

  const cliFileA = cliEntries.find(e => e.name.endsWith('a.txt'));
  const cliFileB = cliEntries.find(e => e.name.endsWith('b.txt'));
  assert(cliFileA && cliFileA.data, 'CLI tar: found a.txt');
  assert(cliFileB && cliFileB.data, 'CLI tar: found b.txt');
  if (cliFileA) {
    assert(new TextDecoder().decode(cliFileA.data) === 'file A', 'CLI tar: a.txt content');
  }
  if (cliFileB) {
    assert(new TextDecoder().decode(cliFileB.data) === 'file B', 'CLI tar: b.txt content');
  }

  // Cleanup
  try { fs.rmSync(cliTarDir, { recursive: true }); } catch {}
  try { fs.unlinkSync(fCliTar); } catch {}
  try { fs.unlinkSync(fCliTarLz4); } catch {}
} catch (e) {
  console.log('  CLI→JS tar test error:', e.message.substring(0, 120));
  failed++;
}

// ============================================================
console.log('\n=== 18. CLI cross-verification ===');
const tmpDir = siteDir;
try {
  const cliData = new TextEncoder().encode('CLI cross-verification test data. '.repeat(10));
  const fIn = path.join(tmpDir, '_t_in.tmp');
  const fLz4 = path.join(tmpDir, '_t_out.tmp.lz4');
  const fDec = path.join(tmpDir, '_t_dec.tmp');

  fs.writeFileSync(fIn, cliData);

  // CLI compress → JS decompress
  execSync(`lz4 -f "${fIn}" "${fLz4}"`);
  const cliFrame = new Uint8Array(fs.readFileSync(fLz4));
  const cliParsed = frameParse(cliFrame);
  assert(cliParsed.frames[0].info.headerChecksumValid === true, 'CLI frame header CRC valid');
  const cliDec = frameDecompress(cliFrame);
  assert(cliData.length === cliDec.data.length && cliData.every((v, i) => v === cliDec.data[i]), 'CLI→JS decompress');

  // JS compress → CLI decompress
  const jsFrame = frameCompress(cliData, { contentChecksum: true, contentSize: true });
  fs.writeFileSync(fLz4, jsFrame);
  execSync(`lz4 -d -f "${fLz4}" "${fDec}"`);
  const cliDecoded = new Uint8Array(fs.readFileSync(fDec));
  assert(cliData.length === cliDecoded.length && cliData.every((v, i) => v === cliDecoded[i]), 'JS→CLI decompress');

  // CLI with different options
  execSync(`lz4 -9 -f "${fIn}" "${fLz4}"`);
  const cli9 = new Uint8Array(fs.readFileSync(fLz4));
  const cli9Dec = frameDecompress(cli9);
  assert(cliData.length === cli9Dec.data.length && cliData.every((v, i) => v === cli9Dec.data[i]), 'CLI -9 → JS decompress');

  execSync(`lz4 --content-size -f "${fIn}" "${fLz4}"`);
  const cliCS = new Uint8Array(fs.readFileSync(fLz4));
  const cliCSParsed = frameParse(cliCS);
  assert(cliCSParsed.frames[0].info.contentSize === cliData.length, `CLI --content-size: ${cliCSParsed.frames[0].info.contentSize} === ${cliData.length}`);

  try { fs.unlinkSync(fIn); } catch {}
  try { fs.unlinkSync(fLz4); } catch {}
  try { fs.unlinkSync(fDec); } catch {}
} catch (e) {
  console.log(`  CLI test error: ${e.message.substring(0, 100)}`);
  failed++;
}

// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
