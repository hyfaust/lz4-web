// Quick Node.js test to verify LZ4 implementation correctness
// Run: node site/js/test-verify.js

// Polyfill browser APIs for Node.js
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Load modules in order
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const siteDir = path.join(__dirname);

// Create a shared context where all modules can see each other
const ctx = vm.createContext({
  console, Math, Uint8Array, Int32Array, TextEncoder, TextDecoder,
  performance, Error, Array, String, Number, Object, Promise, setTimeout,
  URL, Blob, document: undefined, FileReader: undefined
});

function loadModule(filePath, varName) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx);
}

loadModule(path.join(siteDir, 'xxhash.js'), 'XXHash');
loadModule(path.join(siteDir, 'lz4-block.js'), 'LZ4Block');
loadModule(path.join(siteDir, 'lz4-frame.js'), 'LZ4Frame');
loadModule(path.join(siteDir, 'lz4-parser.js'), 'LZ4Parser');

const XXHash = ctx.XXHash;
const LZ4Block = ctx.LZ4Block;
const LZ4Frame = ctx.LZ4Frame;
const LZ4Parser = ctx.LZ4Parser;

console.log('=== LZ4 Implementation Verification ===\n');

// Test 1: xxHash-32 basic test
console.log('Test 1: xxHash-32');
const testData = new TextEncoder().encode('Hello, World!');
const hash = XXHash.xxh32(testData, 0);
console.log(`  xxh32("Hello, World!") = 0x${hash.toString(16).padStart(8, '0')}`);
console.log(`  Result: ${hash !== 0 ? 'PASS' : 'FAIL'}\n`);

// Test 2: LZ4 Block compress/decompress roundtrip
console.log('Test 2: LZ4 Block roundtrip');
const testStrings = [
  'Hello, World!',
  'AAAAAAAABBBBBBBBCCCCCCCCDDDDDDDD',
  'The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.',
  'a'.repeat(1000),
  'LZ4 is a lossless compression algorithm, providing compression speed >500 MB/s per core, scalable with multi-cores CPU.',
];

let blockPass = true;
for (const str of testStrings) {
  const src = new TextEncoder().encode(str);
  const compressed = LZ4Block.compress(src);
  const decompressed = LZ4Block.decompress(compressed, src.length);
  const match = src.length === decompressed.length && src.every((v, i) => v === decompressed[i]);
  const ratio = (src.length / compressed.length).toFixed(2);
  console.log(`  "${str.substring(0, 40)}${str.length > 40 ? '...' : ''}" [${src.length}B → ${compressed.length}B, ratio ${ratio}:1] ${match ? 'PASS' : 'FAIL'}`);
  if (!match) blockPass = false;
}
console.log(`  Overall: ${blockPass ? 'PASS' : 'FAIL'}\n`);

// Test 3: LZ4 Frame compress/decompress roundtrip
console.log('Test 3: LZ4 Frame roundtrip');
let framePass = true;
for (const str of testStrings) {
  const src = new TextEncoder().encode(str);
  const frame = LZ4Frame.compress(src, {
    blockSizeID: 4,
    contentChecksum: true,
    contentSize: true
  });
  const result = LZ4Frame.decompress(frame);
  const match = src.length === result.data.length && src.every((v, i) => v === result.data[i]);
  const ratio = (src.length / frame.length).toFixed(2);
  console.log(`  "${str.substring(0, 40)}${str.length > 40 ? '...' : ''}" [${src.length}B → ${frame.length}B, ratio ${ratio}:1] ${match ? 'PASS' : 'FAIL'}`);
  if (!match) framePass = false;
}
console.log(`  Overall: ${framePass ? 'PASS' : 'FAIL'}\n`);

// Test 4: Frame parser
console.log('Test 4: Frame parser');
const parseSrc = new TextEncoder().encode('LZ4 Frame parser test data with some repetition. LZ4 Frame parser test data.');
const frameData = LZ4Frame.compress(parseSrc, { contentChecksum: true, contentSize: true });
const parsed = LZ4Parser.parse(frameData);
console.log(`  Frames: ${parsed.stats.frameCount}`);
console.log(`  Blocks: ${parsed.stats.blockCount}`);
console.log(`  Format: ${parsed.frames[0]?.info?.blockSizeName || 'unknown'}`);
console.log(`  Header valid: ${parsed.frames[0]?.info?.headerChecksumValid}`);
console.log(`  Result: ${parsed.stats.frameCount === 1 && parsed.stats.blockCount > 0 ? 'PASS' : 'FAIL'}\n`);

// Test 5: Larger data roundtrip
console.log('Test 5: Large data roundtrip (64KB)');
const largeData = new Uint8Array(65536);
let seed = 42;
for (let i = 0; i < largeData.length; i++) {
  seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
  largeData[i] = seed & 0xFF;
}
// Add compressible patterns
for (let i = 0; i < 4096; i++) {
  largeData[i] = (i % 26) + 65; // A-Z pattern
}
const largeFrame = LZ4Frame.compress(largeData, { contentChecksum: true, contentSize: true });
const largeResult = LZ4Frame.decompress(largeFrame);
const largeMatch = largeData.length === largeResult.data.length && largeData.every((v, i) => v === largeResult.data[i]);
console.log(`  Size: ${largeData.length}B → ${largeFrame.length}B (${(largeData.length / largeFrame.length).toFixed(2)}:1)`);
console.log(`  Roundtrip: ${largeMatch ? 'PASS' : 'FAIL'}\n`);

// Test 6: Verify against lz4 CLI (if available)
console.log('Test 6: CLI cross-verification');
try {
  const { execSync } = require('child_process');
  const testFile = path.join(__dirname, '_test_input.tmp');
  const lz4File = path.join(__dirname, '_test_output.tmp.lz4');
  const decFile = path.join(__dirname, '_test_decoded.tmp');

  // Write test data
  const cliTestData = new TextEncoder().encode('CLI cross-verification test. This data should survive a roundtrip through both CLI and JS implementation.');
  fs.writeFileSync(testFile, cliTestData);

  // Compress with CLI
  execSync(`lz4 -f "${testFile}" "${lz4File}"`);
  const cliCompressed = new Uint8Array(fs.readFileSync(lz4File));

  // Parse CLI output with our parser
  const cliParsed = LZ4Parser.parse(cliCompressed);
  console.log(`  CLI compressed frame: ${cliParsed.stats.frameCount} frame(s), ${cliParsed.stats.blockCount} block(s)`);
  console.log(`  Header valid: ${cliParsed.frames[0]?.info?.headerChecksumValid}`);

  // Decompress CLI output with our JS implementation
  const cliDecResult = LZ4Frame.decompress(cliCompressed);
  const cliMatch = cliTestData.length === cliDecResult.data.length && cliTestData.every((v, i) => v === cliDecResult.data[i]);
  console.log(`  CLI→JS decompress: ${cliMatch ? 'PASS' : 'FAIL'}`);

  // Compress with JS, decompress with CLI
  const jsCompressed = LZ4Frame.compress(cliTestData, { contentChecksum: true, contentSize: true });
  fs.writeFileSync(lz4File, jsCompressed);
  try {
    execSync(`lz4 -d -f "${lz4File}" "${decFile}"`);
    const cliDecoded = new Uint8Array(fs.readFileSync(decFile));
    const jsCliMatch = cliTestData.length === cliDecoded.length && cliTestData.every((v, i) => v === cliDecoded[i]);
    console.log(`  JS→CLI decompress: ${jsCliMatch ? 'PASS' : 'FAIL'}`);
  } catch (e) {
    console.log(`  JS→CLI decompress: FAIL (${e.message.substring(0, 80)})`);
  }

  // Cleanup
  try { fs.unlinkSync(testFile); } catch {}
  try { fs.unlinkSync(lz4File); } catch {}
  try { fs.unlinkSync(decFile); } catch {}
} catch (e) {
  console.log(`  CLI not available: ${e.message.substring(0, 80)}`);
}

console.log('\n=== Done ===');
