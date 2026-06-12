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
loadModule('xxhash.js'); loadModule('lz4-block.js'); loadModule('lz4-frame.js'); loadModule('lz4-parser.js');

const { xxh32 } = ctx.XXHash;
const { compress: blockCompress, decompress: blockDecompress, compressBound } = ctx.LZ4Block;
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
console.log('\n=== 8. CLI cross-verification ===');
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
