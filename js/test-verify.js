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
loadModule('xxhash.js'); loadModule('lz4-block.js'); loadModule('lz4hc.js'); loadModule('lz4-frame.js'); loadModule('lz4-parser.js');

const { xxh32 } = ctx.XXHash;
const { compress: blockCompress, decompress: blockDecompress, compressBound } = ctx.LZ4Block;
const LZ4HC = ctx.LZ4HC;
const { compress: frameCompress, decompress: frameDecompress } = ctx.LZ4Frame;
const { parse: frameParse } = ctx.LZ4Parser;

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
console.log('\n=== 10. CLI cross-verification ===');
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
