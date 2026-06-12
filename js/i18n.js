/**
 * i18n module - Chinese/English bilingual support with localStorage persistence.
 */
var I18n = (() => {
  let currentLang = localStorage.getItem('lz4-lang') || 'zh';

  const dict = {
    // ========== Header ==========
    'header.title': { en: 'LZ4 Toolkit', zh: 'LZ4 工具箱' },
    'header.subtitle': { en: 'Compress, Decompress, Parse & Benchmark — Pure Browser Implementation', zh: '压缩、解压、解析与基准测试 — 纯浏览器实现' },

    // ========== Tab Navigation ==========
    'tab.compress': { en: '🔧 Compress / Decompress', zh: '🔧 压缩 / 解压' },
    'tab.parser': { en: '🔍 Frame Parser', zh: '🔍 帧格式解析' },
    'tab.docs': { en: '📖 Documentation', zh: '📖 文档' },
    'tab.bench': { en: '📊 Benchmark', zh: '📊 基准测试' },

    // ========== Compress Tab ==========
    'compress.title': { en: 'LZ4 Compression / Decompression Tool', zh: 'LZ4 压缩 / 解压工具' },
    'compress.fileMode': { en: '📁 File Mode', zh: '📁 文件模式' },
    'compress.textMode': { en: '📝 Text Mode', zh: '📝 文本模式' },
    'compress.action': { en: 'Action', zh: '操作' },
    'compress.action.compress': { en: 'Compress (.lz4)', zh: '压缩 (.lz4)' },
    'compress.action.decompress': { en: 'Decompress', zh: '解压' },
    'compress.blockSize': { en: 'Block Size', zh: '块大小' },
    'compress.blockMode': { en: 'Block Mode', zh: '块模式' },
    'compress.blockMode.linked': { en: 'Linked', zh: '链接模式' },
    'compress.blockMode.independent': { en: 'Independent', zh: '独立模式' },
    'compress.contentCRC': { en: 'Content CRC', zh: '内容校验' },
    'compress.blockCRC': { en: 'Block CRC', zh: '块校验' },
    'compress.dropText': { en: 'Drop file here or click to select', zh: '拖拽文件到此处或点击选择' },
    'compress.dropHint': { en: 'Supports any file for compression, .lz4 for decompression', zh: '支持任意文件压缩，.lz4 文件解压' },
    'compress.inputText': { en: 'Input Text', zh: '输入文本' },
    'compress.inputPlaceholder': { en: 'Enter text to compress...', zh: '输入要压缩的文本...' },
    'compress.btnCompress': { en: 'Compress →', zh: '压缩 →' },
    'compress.btnDecompress': { en: '← Decompress', zh: '← 解压' },
    'compress.outputHex': { en: 'Compressed Output (hex)', zh: '压缩输出 (十六进制)' },
    'compress.outputPlaceholder': { en: 'Compressed data will appear here...', zh: '压缩数据将显示在此...' },

    // ========== Compress Results ==========
    'result.processing': { en: 'Processing...', zh: '处理中...' },
    'result.compressDone': { en: 'Compression Complete', zh: '压缩完成' },
    'result.decompressDone': { en: 'Decompression Complete', zh: '解压完成' },
    'result.original': { en: 'Original', zh: '原始大小' },
    'result.compressed': { en: 'Compressed', zh: '压缩后' },
    'result.decompressed': { en: 'Decompressed', zh: '解压后' },
    'result.ratio': { en: 'Ratio', zh: '压缩比' },
    'result.time': { en: 'Time', zh: '耗时' },
    'result.speed': { en: 'Speed', zh: '速度' },
    'result.download': { en: 'Download .lz4', zh: '下载 .lz4' },
    'result.downloadFile': { en: 'Download', zh: '下载' },
    'result.error': { en: 'Error', zh: '错误' },

    // ========== Parser Tab ==========
    'parser.title': { en: 'LZ4 Frame Format Parser', zh: 'LZ4 帧格式解析器' },
    'parser.desc': { en: 'Upload an .lz4 file to visualize its internal frame structure — magic number, flags, blocks, checksums, and more.', zh: '上传 .lz4 文件，可视化其内部帧结构 — 魔数、标志位、数据块、校验和等。' },
    'parser.dropText': { en: 'Drop an .lz4 file here or click to analyze', zh: '拖拽 .lz4 文件到此处或点击分析' },

    // ========== Parser Results ==========
    'parser.fileSize': { en: 'File Size', zh: '文件大小' },
    'parser.frames': { en: 'Frames', zh: '帧数' },
    'parser.blocks': { en: 'Blocks', zh: '块数' },
    'parser.compressedData': { en: 'Compressed Data', zh: '压缩数据' },
    'parser.offset': { en: 'Offset', zh: '偏移' },
    'parser.field': { en: 'Field', zh: '字段' },
    'parser.hex': { en: 'Hex', zh: '十六进制' },
    'parser.description': { en: 'Description', zh: '描述' },
    'parser.dataBlocks': { en: 'Data Blocks', zh: '数据块' },
    'parser.hexDump': { en: 'Hex Dump (first 256 bytes)', zh: '十六进制转储 (前 256 字节)' },
    'parser.moreBytes': { en: 'more bytes', zh: '更多字节' },

    // ========== Benchmark Tab ==========
    'bench.title': { en: 'In-Browser LZ4 Benchmark', zh: '浏览器内 LZ4 基准测试' },
    'bench.desc': { en: 'Test LZ4 compression/decompression performance in your browser using generated or custom data.', zh: '在浏览器中测试 LZ4 压缩/解压性能，支持生成数据或自定义文件。' },
    'bench.maxSize': { en: 'Max Test Data Size', zh: '最大测试数据大小' },
    'bench.runBtn': { en: '▶ Run Benchmark', zh: '▶ 运行基准测试' },
    'bench.fileBtn': { en: '📁 Test with File', zh: '📁 用文件测试' },
    'bench.running': { en: 'Running...', zh: '运行中...' },
    'bench.testing': { en: 'Testing', zh: '测试中' },
    'bench.inputSize': { en: 'Input Size', zh: '输入大小' },
    'bench.compressed': { en: 'Compressed', zh: '压缩后' },
    'bench.compSpeed': { en: 'Compress (MB/s)', zh: '压缩速度 (MB/s)' },
    'bench.decompSpeed': { en: 'Decompress (MB/s)', zh: '解压速度 (MB/s)' },
    'bench.compTime': { en: 'Compress Time', zh: '压缩耗时' },
    'bench.decompTime': { en: 'Decompress Time', zh: '解压耗时' },
    'bench.benchFile': { en: 'Benchmark', zh: '基准测试' },

    // ========== Documentation ==========
    'doc.overview': { en: 'LZ4 Overview', zh: 'LZ4 概述' },
    'doc.whatIs': { en: 'What is LZ4?', zh: '什么是 LZ4？' },
    'doc.whatIsP': { en: 'LZ4 is a lossless compression algorithm designed by <strong>Yann Collet</strong>, focusing on <strong>extreme speed</strong> for both compression and decompression. It belongs to the LZ77 family of algorithms.', zh: 'LZ4 是由 <strong>Yann Collet</strong> 设计的无损压缩算法，专注于压缩和解压的<strong>极致速度</strong>。它属于 LZ77 算法家族。' },
    'doc.keyChars': { en: 'Key Characteristics', zh: '核心特性' },
    'doc.compSpeed': { en: '<strong>Compression speed:</strong> &gt;500 MB/s per core (default level)', zh: '<strong>压缩速度：</strong>&gt;500 MB/s 每核（默认级别）' },
    'doc.decompSpeed': { en: '<strong>Decompression speed:</strong> Multiple GB/s per core (near RAM bandwidth limit)', zh: '<strong>解压速度：</strong>数 GB/s 每核（接近内存带宽极限）' },
    'doc.compRatio': { en: '<strong>Compression ratio:</strong> ~2.1:1 typical (varies by data type)', zh: '<strong>压缩比：</strong>约 2.1:1（取决于数据类型）' },
    'doc.memUsage': { en: '<strong>Memory usage:</strong> 16 KB for compression (configurable), minimal for decompression', zh: '<strong>内存占用：</strong>压缩 16KB（可配置），解压极低' },
    'doc.threadSafe': { en: '<strong>Thread-safe:</strong> Yes, supports multi-threaded compression (v1.10.0+)', zh: '<strong>线程安全：</strong>是，支持多线程压缩 (v1.10.0+)' },
    'doc.comparison': { en: 'Comparison with Other Algorithms', zh: '与其他算法对比' },
    'doc.algorithm': { en: 'Algorithm', zh: '算法' },
    'doc.compSpdCol': { en: 'Comp. Speed', zh: '压缩速度' },
    'doc.decompSpdCol': { en: 'Decomp. Speed', zh: '解压速度' },
    'doc.ratioCol': { en: 'Ratio', zh: '压缩比' },
    'doc.useCase': { en: 'Use Case', zh: '适用场景' },
    'doc.howItWorks': { en: 'How It Works', zh: '工作原理' },
    'doc.howItWorksP': { en: 'LZ4 uses a hash-based approach to find matching sequences in previously processed data:', zh: 'LZ4 使用基于哈希的方法在已处理数据中查找匹配序列：' },
    'doc.howStep1': { en: 'A sliding window of 64 KB is maintained for match searching', zh: '维护 64 KB 的滑动窗口用于匹配搜索' },
    'doc.howStep2': { en: 'A 4-byte hash table enables O(1) match lookup', zh: '4 字节哈希表实现 O(1) 匹配查找' },
    'doc.howStep3': { en: 'Each sequence consists of: <code>token + literal_length + literals + offset + match_length</code>', zh: '每个序列由以下组成：<code>token + 字面量长度 + 字面量 + 偏移量 + 匹配长度</code>' },
    'doc.howStep4': { en: 'No entropy coding is used — decompression is pure memory copies', zh: '不使用熵编码 — 解压纯靠内存拷贝' },

    // Frame Format doc
    'doc.frameSpec': { en: 'LZ4 Frame Format Specification', zh: 'LZ4 帧格式规范' },
    'doc.frameStructure': { en: 'Frame Structure', zh: '帧结构' },
    'doc.frameDesc': { en: 'The LZ4 Frame format is the standard self-describing format used by the <code>lz4</code> CLI. It wraps compressed blocks with metadata for interoperability.', zh: 'LZ4 帧格式是 <code>lz4</code> CLI 使用的标准自描述格式。它用元数据包裹压缩块以实现互操作性。' },
    'doc.magicNumber': { en: 'Magic Number', zh: '魔数' },
    'doc.flags': { en: 'Flags', zh: '标志位' },
    'doc.blockDesc': { en: 'Block Descriptor', zh: '块描述符' },
    'doc.contentSize': { en: 'Content Size', zh: '内容大小' },
    'doc.dictId': { en: 'Dictionary ID', zh: '字典 ID' },
    'doc.headerCRC': { en: 'Header CRC', zh: '头部校验' },
    'doc.dataBlocks': { en: 'Data Blocks', zh: '数据块' },
    'doc.endMark': { en: 'End Mark', zh: '结束标记' },
    'doc.contentCRC': { en: 'Content CRC', zh: '内容校验' },
    'doc.magicDesc': { en: '<code>0x184D2204</code> (4 bytes, little-endian). Identifies a valid LZ4 frame. Skippable frames use <code>0x184D2A50-0x184D2A5F</code>.', zh: '<code>0x184D2204</code>（4 字节，小端序）。标识有效的 LZ4 帧。可跳过帧使用 <code>0x184D2A50-0x184D2A5F</code>。' },
    'doc.flgByte': { en: 'FLG Byte (Flags)', zh: 'FLG 字节（标志位）' },
    'doc.flgVersion': { en: 'Version', zh: '版本号' },
    'doc.flgVersionDesc': { en: 'Must be <code>01</code>', zh: '必须为 <code>01</code>' },
    'doc.flgBlockIndep': { en: 'Block Independence', zh: '块独立性' },
    'doc.flgBlockIndepDesc': { en: '1 = independent blocks, 0 = linked', zh: '1 = 独立块，0 = 链接块' },
    'doc.flgBlockCRC': { en: 'Block Checksum', zh: '块校验和' },
    'doc.flgBlockCRCDesc': { en: '1 = each block has xxh32 checksum', zh: '1 = 每个块附带 xxh32 校验和' },
    'doc.flgContentSize': { en: 'Content Size', zh: '内容大小' },
    'doc.flgContentSizeDesc': { en: '1 = 8-byte content size field present', zh: '1 = 包含 8 字节内容大小字段' },
    'doc.flgContentCRC': { en: 'Content Checksum', zh: '内容校验和' },
    'doc.flgContentCRCDesc': { en: '1 = xxh32 checksum of entire content', zh: '1 = 整个内容的 xxh32 校验和' },
    'doc.flgReserved': { en: 'Reserved', zh: '保留' },
    'doc.flgReservedDesc': { en: 'Must be 0', zh: '必须为 0' },
    'doc.flgDictID': { en: 'Dictionary ID', zh: '字典 ID' },
    'doc.flgDictIDDesc': { en: '1 = 4-byte Dict ID field present', zh: '1 = 包含 4 字节字典 ID 字段' },
    'doc.bdByte': { en: 'BD Byte (Block Descriptor)', zh: 'BD 字节（块描述符）' },
    'doc.bdBits': { en: 'Bits 4-6', zh: '位 4-6' },
    'doc.bdMaxSize': { en: 'Max Block Size', zh: '最大块大小' },
    'doc.headerChecksum': { en: 'Header Checksum', zh: '头部校验和' },
    'doc.ex1Scenario': { en: '3 literals, match=5', zh: '3 个字面量，匹配=5' },
    'doc.exNone': { en: 'none', zh: '无' },
    'doc.ex1Result': { en: '3 literal bytes, copy 5 from offset', zh: '3 字节字面量，从偏移位置拷贝 5 字节' },
    'doc.ex2Scenario': { en: '20 literals, match=4', zh: '20 个字面量，匹配=4' },
    'doc.ex2Result': { en: '15+5=20 literal bytes, copy 4', zh: '15+5=20 字节字面量，拷贝 4' },
    'doc.ex3Scenario': { en: '0 literals, match=100', zh: '0 个字面量，匹配=100' },
    'doc.ex3Result': { en: '0 literals, 4+15+81=100 byte copy', zh: '0 字面量，4+15+81=100 字节拷贝' },
    'doc.lvFastest': { en: 'Fastest', zh: '最快' },
    'doc.lvGood': { en: 'Good', zh: '良好' },
    'doc.lv1Note': { en: 'Best for real-time', zh: '实时场景最佳选择' },
    'doc.lvMedium': { en: 'Medium', zh: '中等' },
    'doc.lvBetter': { en: 'Better', zh: '更好' },
    'doc.lv2Note': { en: 'v1.10.0: new mid-range level', zh: 'v1.10.0 新增中间级别' },
    'doc.lvSlow': { en: 'Slow', zh: '慢' },
    'doc.lv3Note': { en: 'Progressively better ratio', zh: '压缩比逐步提升' },
    'doc.lvSlowest': { en: 'Slowest', zh: '最慢' },
    'doc.lvBest': { en: 'Best', zh: '最佳' },
    'doc.lv10Note': { en: 'Optimal parsing, highest ratio', zh: '最优解析，最高压缩比' },
    'doc.lvUltra': { en: 'Ultra fast', zh: '极快' },
    'doc.lvLower': { en: 'Lower', zh: '较低' },
    'doc.lvFastNote': { en: 'Higher acceleration factor', zh: '更高加速因子' },
    'doc.dictIDTitle': { en: 'Dictionary ID', zh: '字典 ID' },
    'doc.optLevel': { en: 'Compression level', zh: '压缩级别' },
    'doc.optDecompress': { en: 'Decompress', zh: '解压' },
    'doc.optForce': { en: 'Force overwrite', zh: '强制覆盖' },
    'doc.optKeep': { en: 'Keep source file', zh: '保留源文件' },
    'doc.optRemove': { en: 'Remove source file', zh: '删除源文件' },
    'doc.optThread': { en: 'Thread count (0=auto)', zh: '线程数 (0=自动)' },
    'doc.optDict': { en: 'Use dictionary file', zh: '使用字典文件' },
    'doc.optBD': { en: 'Block dependency mode', zh: '块依赖模式' },
    'doc.optBX': { en: 'Enable block checksum', zh: '启用块校验和' },
    'doc.optContentSize': { en: 'Store original size in frame', zh: '在帧中存储原始大小' },
    'doc.optFast': { en: 'Ultra fast compression', zh: '超快压缩' },
    'doc.optBest': { en: 'Same as -12', zh: '等同于 -12' },
    'doc.envLevel': { en: 'Default compression level', zh: '默认压缩级别' },
    'doc.envWorkers': { en: 'Default thread count', zh: '默认线程数' },
    'doc.ucLog': { en: '<strong>Log compression:</strong> Fast compression, instant decompression for log analysis', zh: '<strong>日志压缩：</strong>快速压缩，即时解压用于日志分析' },
    'doc.ucDB': { en: '<strong>Database storage:</strong> Used by RocksDB, Cassandra, HBase for block compression', zh: '<strong>数据库存储：</strong>RocksDB、Cassandra、HBase 使用 LZ4 进行块压缩' },
    'doc.ucNet': { en: '<strong>Network transfer:</strong> Reduce bandwidth with minimal latency overhead', zh: '<strong>网络传输：</strong>以最小延迟开销减少带宽' },
    'doc.ucGame': { en: '<strong>Game assets:</strong> Fast decompression during loading screens', zh: '<strong>游戏资源：</strong>加载画面期间快速解压' },
    'doc.ucMem': { en: '<strong>Memory compression:</strong> Linux zswap/zram uses LZ4 for page compression', zh: '<strong>内存压缩：</strong>Linux zswap/zram 使用 LZ4 进行页面压缩' },
    'doc.ucBackup': { en: '<strong>Backup & archival:</strong> Use with <code>tar</code>: <code>tar cf - dir/ | lz4 > archive.tar.lz4</code>', zh: '<strong>备份归档：</strong>结合 <code>tar</code> 使用：<code>tar cf - dir/ | lz4 > archive.tar.lz4</code>' },
    'doc.bp1': { en: 'Use default level (-1) unless you specifically need better ratio', zh: '除非特别需要更高压缩比，否则使用默认级别 (-1)' },
    'doc.bp2': { en: 'Enable <code>--content-size</code> for better tooling support', zh: '启用 <code>--content-size</code> 以获得更好的工具支持' },
    'doc.bp3': { en: 'For small data (&lt;1KB), consider dictionary compression', zh: '对于小数据（&lt;1KB），考虑使用字典压缩' },
    'doc.bp4': { en: 'Use <code>--favor-decSpeed</code> for levels 10+ when decompression speed matters', zh: '级别 10+ 且关注解压速度时，使用 <code>--favor-decSpeed</code>' },
    'doc.bp5': { en: 'Multi-thread (<code>-T</code>) only helps for large files; overhead isn\'t worth it for small files', zh: '多线程（<code>-T</code>）仅对大文件有效；小文件不值得使用' },
    'doc.bit': { en: 'Bit', zh: '位' },
    'doc.field': { en: 'Field', zh: '字段' },
    'doc.description': { en: 'Description', zh: '说明' },
    'doc.dataBlocksDesc': { en: 'Each block has a 4-byte size header (little-endian). If the highest bit (<code>0x80000000</code>) is set, the block is stored uncompressed. The remaining 31 bits give the data size.', zh: '每个块有 4 字节大小头（小端序）。如果最高位（<code>0x80000000</code>）被设置，则块以未压缩方式存储。其余 31 位为数据大小。' },
    'doc.headerChecksumDesc': { en: 'One byte: <code>(xxh32(descriptor) >> 8) & 0xFF</code>. Covers all descriptor bytes from FLG through optional fields.', zh: '一个字节：<code>(xxh32(描述符) >> 8) & 0xFF</code>。覆盖从 FLG 到可选字段的所有描述符字节。' },
    'doc.endMarkDesc': { en: '<code>0x00000000</code> — signals the end of the block sequence.', zh: '<code>0x00000000</code> — 标记块序列结束。' },

    // Block Format doc
    'doc.blockSpec': { en: 'LZ4 Block Format Specification', zh: 'LZ4 块格式规范' },
    'doc.blockStructure': { en: 'Block Structure', zh: '块结构' },
    'doc.blockStructDesc': { en: 'An LZ4 compressed block is a sequence of <strong>sequences</strong>. Each sequence consists of a token, optional literal length bytes, literals, a 2-byte offset, and optional match length bytes.', zh: 'LZ4 压缩块由多个<strong>序列</strong>组成。每个序列包含一个 token、可选的字面量长度字节、字面量、2 字节偏移量和可选的匹配长度字节。' },
    'doc.tokenByte': { en: 'Token Byte', zh: 'Token 字节' },
    'doc.tokenDesc': { en: 'A single byte split into two 4-bit fields:', zh: '一个字节分为两个 4 位字段：' },
    'doc.tokenHigh': { en: '<strong>High 4 bits:</strong> Literal length (0-15). If 15, read additional bytes (each 0-255, summed until &lt;255)', zh: '<strong>高 4 位：</strong>字面量长度 (0-15)。如果为 15，读取额外字节（每个 0-255，累加直到 &lt;255）' },
    'doc.tokenLow': { en: '<strong>Low 4 bits:</strong> Match length minus MIN_MATCH(4). Value 0 means 4 bytes, 15 means 19+ bytes (read extras)', zh: '<strong>低 4 位：</strong>匹配长度减去 MIN_MATCH(4)。值 0 表示 4 字节，15 表示 19+ 字节（需读取额外字节）' },
    'doc.offset': { en: 'Offset', zh: '偏移量' },
    'doc.offsetDesc': { en: '2 bytes, little-endian. Represents how far back to copy from. Value 0 is <strong>invalid</strong>. Maximum value: 65535.', zh: '2 字节，小端序。表示从多远的位置开始拷贝。值 0 <strong>无效</strong>。最大值：65535。' },
    'doc.encodingExamples': { en: 'Encoding Examples', zh: '编码示例' },
    'doc.scenario': { en: 'Scenario', zh: '场景' },
    'doc.token': { en: 'Token', zh: 'Token' },
    'doc.extraBytes': { en: 'Extra Bytes', zh: '额外字节' },
    'doc.result': { en: 'Result', zh: '结果' },
    'doc.endOfBlock': { en: 'End-of-Block Rules', zh: '块结束规则' },
    'doc.eobRule1': { en: 'The last sequence contains <strong>only literals</strong> (no offset)', zh: '最后一个序列<strong>仅包含字面量</strong>（无偏移量）' },
    'doc.eobRule2': { en: 'The last 5 bytes of input are <strong>always literals</strong>', zh: '输入的最后 5 字节<strong>始终为字面量</strong>' },
    'doc.eobRule3': { en: 'The last match must start at least 12 bytes before end of block', zh: '最后一个匹配必须在块结束前至少 12 字节开始' },
    'doc.eobRule4': { en: 'Blocks &lt; 12 bytes cannot be compressed', zh: '&lt; 12 字节的块无法压缩' },
    'doc.overlapCopy': { en: 'Overlap Copy (RLE-like)', zh: '重叠拷贝（类 RLE）' },
    'doc.overlapDesc': { en: 'When <code>matchLength &gt; offset</code>, the match extends beyond the current write position. This is handled by byte-by-byte copy, effectively repeating bytes. An offset of 1 with matchLength=100 repeats the last byte 100 times.', zh: '当 <code>matchLength &gt; offset</code> 时，匹配延伸到当前写入位置之后。通过逐字节拷贝处理，有效地重复字节。偏移量为 1、matchLength=100 时，最后一个字节重复 100 次。' },

    // Compression Levels doc
    'doc.compLevels': { en: 'Compression Levels Guide', zh: '压缩级别指南' },
    'doc.fastMode': { en: 'Fast Mode (Levels 1-2)', zh: '快速模式 (级别 1-2)' },
    'doc.fastModeDesc': { en: 'Uses the standard LZ4 algorithm with a hash table. An <strong>acceleration factor</strong> controls the speed/ratio tradeoff — higher values skip more positions, resulting in faster but less compressed output.', zh: '使用标准 LZ4 算法和哈希表。<strong>加速因子</strong>控制速度/压缩比权衡 — 值越大跳过更多位置，速度更快但压缩比更低。' },
    'doc.hcMode': { en: 'HC Mode (Levels 3-12)', zh: 'HC 模式 (级别 3-12)' },
    'doc.hcModeDesc': { en: 'High Compression mode uses more CPU to find better matches. HC mode uses a chain-based search instead of a simple hash table.', zh: '高压缩模式使用更多 CPU 来查找更好的匹配。HC 模式使用基于链的搜索而非简单哈希表。' },
    'doc.level': { en: 'Level', zh: '级别' },
    'doc.algorithmCol': { en: 'Algorithm', zh: '算法' },
    'doc.speed': { en: 'Speed', zh: '速度' },
    'doc.notes': { en: 'Notes', zh: '说明' },
    'doc.keyInsight': { en: 'Key insight:', zh: '关键洞察：' },
    'doc.keyInsightText': { en: 'Decompression speed is <strong>identical</strong> regardless of compression level. The decompressor doesn\'t know or care which level was used.', zh: '解压速度与压缩级别<strong>完全相同</strong>。解压器不知道也不关心使用了哪个级别。' },
    'doc.whenToUse': { en: 'When to Use Each Level', zh: '各级别使用场景' },
    'doc.useLevel1': { en: '<strong>Level 1:</strong> Default — great balance. Use for log files, network transfer, real-time data', zh: '<strong>级别 1：</strong>默认 — 良好平衡。用于日志文件、网络传输、实时数据' },
    'doc.useLevel3': { en: '<strong>Level 3-9:</strong> When you compress once but decompress many times (e.g., game assets, software distribution)', zh: '<strong>级别 3-9：</strong>压缩一次但解压多次（如游戏资源、软件分发）' },
    'doc.useLevel10': { en: '<strong>Level 10-12:</strong> Archival storage where compression time doesn\'t matter', zh: '<strong>级别 10-12：</strong>归档存储，压缩时间不重要' },
    'doc.useFast': { en: '<strong>--fast:</strong> Extreme speed scenarios, embedded systems, high-throughput pipelines', zh: '<strong>--fast：</strong>极端速度场景、嵌入式系统、高吞吐管道' },

    // Dictionary doc
    'doc.dictComp': { en: 'Dictionary Compression', zh: '字典压缩' },
    'doc.dictOverview': { en: 'Overview', zh: '概述' },
    'doc.dictOverviewP': { en: 'Dictionary compression is highly effective for <strong>small data</strong> (KB range) such as JSON records, log lines, or short messages. A pre-trained dictionary provides "known prefix" context to the compressor.', zh: '字典压缩对<strong>小数据</strong>（KB 级别）非常有效，如 JSON 记录、日志行或短消息。预训练字典为压缩器提供"已知前缀"上下文。' },
    'doc.dictHowItWorks': { en: 'How It Works', zh: '工作原理' },
    'doc.dictStep1': { en: 'Build a dictionary from representative samples of your data', zh: '从数据的代表性样本构建字典' },
    'doc.dictStep2': { en: 'Load the dictionary into the compression stream before processing', zh: '在处理前将字典加载到压缩流中' },
    'doc.dictStep3': { en: 'The compressor uses dictionary content as virtual history, enabling better matches', zh: '压缩器使用字典内容作为虚拟历史，实现更好的匹配' },
    'doc.dictStep4': { en: 'The decompressor must use the <strong>exact same dictionary</strong>', zh: '解压器必须使用<strong>完全相同的字典</strong>' },
    'doc.dictIdDesc': { en: 'The Frame format supports a 4-byte Dictionary ID field to help decoders select the correct dictionary. This is optional — the dictionary can also be identified by context.', zh: '帧格式支持 4 字节字典 ID 字段，帮助解码器选择正确的字典。这是可选的 — 字典也可以通过上下文确定。' },
    'doc.buildingDicts': { en: 'Building Dictionaries', zh: '构建字典' },
    'doc.buildingDictsP': { en: 'Recommended: Use the <a href="https://github.com/facebook/zstd" style="color:var(--primary-light)">Zstandard Dictionary Builder</a> — it works well with LZ4 too. The dictionary should contain common patterns found in your data samples.', zh: '推荐：使用 <a href="https://github.com/facebook/zstd" style="color:var(--primary-light)">Zstandard 字典构建器</a> — 它也适用于 LZ4。字典应包含数据样本中的常见模式。' },

    // CLI Reference
    'doc.cliRef': { en: 'CLI Quick Reference', zh: 'CLI 快速参考' },
    'doc.basicUsage': { en: 'Basic Usage', zh: '基本用法' },
    'doc.commonOptions': { en: 'Common Options', zh: '常用选项' },
    'doc.option': { en: 'Option', zh: '选项' },
    'doc.envVars': { en: 'Environment Variables (v1.10.0+)', zh: '环境变量 (v1.10.0+)' },
    'doc.variable': { en: 'Variable', zh: '变量' },

    // Use Cases
    'doc.useCases': { en: 'Use Cases & Best Practices', zh: '使用场景与最佳实践' },
    'doc.recUseCases': { en: 'Recommended Use Cases', zh: '推荐使用场景' },
    'doc.bestPractices': { en: 'Best Practices', zh: '最佳实践' },

    // ========== Footer ==========
    'footer.line1': { en: 'LZ4 Toolkit — Pure browser implementation of <a href="https://lz4.org" target="_blank">LZ4</a> compression algorithm v1.10.0', zh: 'LZ4 工具箱 — <a href="https://lz4.org" target="_blank">LZ4</a> 压缩算法 v1.10.0 的纯浏览器实现' },
    'footer.line2': { en: 'Based on <a href="https://github.com/lz4/lz4" target="_blank">github.com/lz4/lz4</a> specification & source code', zh: '基于 <a href="https://github.com/lz4/lz4" target="_blank">github.com/lz4/lz4</a> 规范与源码' },

    // ========== Language toggle ==========
    'lang.label': { en: 'EN', zh: '中' },
    'lang.switch': { en: 'Switch to Chinese', zh: '切换到英文' },

    // ========== GitHub ==========
    'github.tooltip': { en: 'View on GitHub', zh: '在 GitHub 上查看' },
  };

  /**
   * Get translated text for a key.
   */
  function t(key) {
    const entry = dict[key];
    if (!entry) return key;
    return entry[currentLang] || entry['en'] || key;
  }

  /**
   * Get current language.
   */
  function getLang() {
    return currentLang;
  }

  /**
   * Switch language and update all elements.
   */
  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('lz4-lang', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    applyToDOM();
  }

  /**
   * Toggle between zh and en.
   */
  function toggle() {
    setLang(currentLang === 'zh' ? 'en' : 'zh');
  }

  /**
   * Apply translations to all elements with data-i18n attribute.
   * data-i18n="key" → sets innerHTML
   * data-i18n-placeholder="key" → sets placeholder
   * data-i18n-title="key" → sets title
   */
  function applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = t(key);
      if (text !== key) el.innerHTML = text;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = t(key);
      if (text !== key) el.placeholder = text;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const text = t(key);
      if (text !== key) el.title = text;
    });
    // Update lang toggle button text
    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) {
      langBtn.textContent = currentLang === 'zh' ? 'EN' : '中';
      langBtn.title = t('lang.switch');
    }
  }

  return { t, getLang, setLang, toggle, applyToDOM };
})();
