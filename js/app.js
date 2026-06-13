/**
 * Main application logic - Tab switching, event binding, UI updates.
 */
var App = (() => {
  let currentTab = 'compress';

  function init() {
    setupTabs();
    setupCompressTab();
    setupParserTab();
    setupBenchTab();
    setupLangToggle();
    I18n.applyToDOM();
    switchTab('compress');
  }

  function setupLangToggle() {
    document.getElementById('lang-toggle').addEventListener('click', () => {
      I18n.toggle();
      // Re-render dynamic content in current tab
      document.getElementById('compress-result').innerHTML = '';
      document.getElementById('text-result').innerHTML = '';
      document.getElementById('parser-output').innerHTML = '';
      document.getElementById('bench-result').innerHTML = '';
    });
  }

  // ========== Tab Management ==========
  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  }

  // ========== Compress Tab ==========
  let selectedFiles = [];
  let dictData = null;
  let skippableData = null;

  function setupCompressTab() {
    // Mode toggle
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('compress-mode').value = btn.dataset.mode;
        document.getElementById('file-section').style.display = btn.dataset.mode === 'file' ? '' : 'none';
        document.getElementById('text-section').style.display = btn.dataset.mode === 'text' ? '' : 'none';
      });
    });

    // File selection
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) {
        selectedFiles = Array.from(e.dataTransfer.files);
        updateFileList();
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) {
        selectedFiles = Array.from(fileInput.files);
        updateFileList();
      }
    });

    // Process button
    document.getElementById('btn-process').addEventListener('click', processAllFiles);

    // Test button
    document.getElementById('btn-test').addEventListener('click', testIntegrity);

    // Folder selection
    const folderInput = document.getElementById('folder-input');
    document.getElementById('btn-select-folder').addEventListener('click', () => folderInput.click());
    folderInput.addEventListener('change', () => {
      if (folderInput.files.length) {
        // webkitRelativePath gives subdirectory structure
        selectedFiles = Array.from(folderInput.files);
        updateFileList();
      }
    });

    // Clear button
    document.getElementById('btn-clear').addEventListener('click', () => {
      selectedFiles = [];
      fileInput.value = '';
      folderInput.value = '';
      document.getElementById('compress-result').innerHTML = '';
    });

    // Pack as .tar.lz4
    document.getElementById('btn-pack-tar').addEventListener('click', packAsTarLz4);

    // Action change: show/hide test button and level selector
    document.getElementById('file-action').addEventListener('change', (e) => {
      const isDecompress = e.target.value === 'decompress';
      document.getElementById('btn-test').style.display = isDecompress ? '' : 'none';
      document.getElementById('level-group').style.display = isDecompress ? 'none' : '';
      document.getElementById('dict-group').style.display = isDecompress ? 'none' : '';
      document.getElementById('skippable-group').style.display = isDecompress ? 'none' : '';
    });

    // Dictionary file
    const dictInput = document.getElementById('dict-input');
    document.getElementById('btn-dict-select').addEventListener('click', () => dictInput.click());
    dictInput.addEventListener('change', () => {
      if (dictInput.files.length) {
        const file = dictInput.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          dictData = new Uint8Array(reader.result);
          document.getElementById('dict-name').textContent = file.name + ` (${formatBytes(dictData.length)})`;
        };
        reader.readAsArrayBuffer(file);
      }
    });

    // Text compress
    document.getElementById('btn-text-compress').addEventListener('click', textCompress);
    document.getElementById('btn-text-decompress').addEventListener('click', textDecompress);

    // Skippable frame
    setupSkippableFrame();
    
    // Initialize skippable group visibility
    document.getElementById('skippable-group').style.display = '';
  }

  function setupSkippableFrame() {
    const modeSelect = document.getElementById('opt-skippable-mode');
    const variantSelect = document.getElementById('opt-skippable-variant');
    const inputArea = document.getElementById('skippable-input-area');
    const fileInput = document.getElementById('skippable-file-input');
    const btnSelectFile = document.getElementById('btn-skippable-select');
    const fileNameSpan = document.getElementById('skippable-file-name');

    // Mode change
    modeSelect.addEventListener('change', () => {
      const mode = modeSelect.value;
      if (mode === 'metadata') {
        inputArea.innerHTML = '<textarea id="skippable-json-input" rows="3" placeholder=\'{"version":1,"author":"test","note":"自定义元数据"}\' data-i18n-placeholder="compress.skippable.placeholder"></textarea>';
      } else if (mode === 'file') {
        inputArea.innerHTML = `
          <input type="file" id="skippable-file-input" style="display:none" accept="*/*">
          <div style="margin-top:0.5rem;display:flex;gap:0.5rem;">
            <button class="btn btn-sm" id="btn-skippable-select" data-i18n="compress.skippable.selectFile">选择文件</button>
            <span id="skippable-file-name" class="dict-name" style="flex:1;">未选择</span>
          </div>`;
        // Re-bind file select button
        const newBtn = document.getElementById('btn-skippable-select');
        newBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
          if (fileInput.files.length) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = () => {
              skippableData = new Uint8Array(reader.result);
              fileNameSpan.textContent = file.name + ` (${formatBytes(skippableData.length)})`;
            };
            reader.readAsArrayBuffer(file);
          }
        });
      } else {
        inputArea.innerHTML = '';
        skippableData = null;
      }
    });

    // File select button
    btnSelectFile.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          skippableData = new Uint8Array(reader.result);
          fileNameSpan.textContent = file.name + ` (${formatBytes(skippableData.length)})`;
        };
        reader.readAsArrayBuffer(file);
      }
    });
  }

  function updateFileList() {
    const resultDiv = document.getElementById('compress-result');
    if (selectedFiles.length === 0) { resultDiv.innerHTML = ''; return; }

    // Detect if files were selected from a folder (have webkitRelativePath)
    const hasPaths = selectedFiles.some(f => f.webkitRelativePath);

    let html = '<div class="file-list">';
    if (hasPaths) {
      // Group by top-level subdirectory
      const groups = {};
      for (const f of selectedFiles) {
        const parts = f.webkitRelativePath.split('/');
        const dir = parts.length > 2 ? parts.slice(1, -1).join('/') : '(root)';
        if (!groups[dir]) groups[dir] = [];
        groups[dir].push(f);
      }
      for (const [dir, files] of Object.entries(groups)) {
        if (dir !== '(root)') {
          html += `<div class="file-group-header">📁 ${dir}/</div>`;
        }
        for (const f of files) {
          const name = f.webkitRelativePath ? f.webkitRelativePath.split('/').pop() : f.name;
          html += `<div class="file-item">📄 ${name} <span class="file-size">(${formatBytes(f.size)})</span></div>`;
        }
      }
    } else {
      for (const f of selectedFiles) {
        html += `<div class="file-item">📄 ${f.name} <span class="file-size">(${formatBytes(f.size)})</span></div>`;
      }
    }
    html += `<div class="file-summary">${selectedFiles.length} ${I18n.t('result.files')}, ${formatBytes(selectedFiles.reduce((s, f) => s + f.size, 0))} ${I18n.t('result.total')}</div>`;
    html += '</div>';
    resultDiv.innerHTML = html;
  }

  async function processAllFiles() {
    if (selectedFiles.length === 0) { alert(I18n.t('compress.noFile')); return; }
    const action = document.getElementById('file-action').value;
    const resultDiv = document.getElementById('compress-result');
    const results = [];
    const STREAM_THRESHOLD = 4 * 1024 * 1024; // Use streaming for files > 4MB
    
    // Get skippable frame before processing
    const options = getCompressOptions();
    const skippableFrame = window._lastSkippableFrame;

    resultDiv.innerHTML = `<div class="loading">${I18n.t('result.processing')}</div>`;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        let result;
        if (action === 'compress') {
          if (skippableFrame && file.size <= STREAM_THRESHOLD) {
            // With skippable frame, need to manually concatenate
            const fileResult = await LZ4Compress.handleFileCompress(file, options);
            // Concatenate: skippable frame + compressed data
            const totalLen = skippableFrame.length + fileResult.compressedSize;
            const combined = new Uint8Array(totalLen);
            combined.set(skippableFrame, 0);
            combined.set(fileResult.data, skippableFrame.length);
            result = {
              data: combined,
              originalSize: fileResult.originalSize,
              compressedSize: totalLen,
              ratio: (fileResult.originalSize / totalLen).toFixed(2),
              elapsed: fileResult.elapsed,
              speed: fileResult.speed,
              hasSkippable: true,
              skippableSize: skippableFrame.length
            };
          } else if (file.size > STREAM_THRESHOLD && typeof LZ4Stream !== 'undefined') {
            // Streaming mode for large files
            const streamResult = await LZ4Stream.compressFile(file, options);
            result = { data: streamResult.data, ...streamResult.stats, inputName: file.name };
          } else {
            result = await LZ4Compress.handleFileCompress(file, options);
          }
          result.filename = file.name + '.lz4';
        } else {
          if (file.size > STREAM_THRESHOLD && typeof LZ4Stream !== 'undefined') {
            const streamResult = await LZ4Stream.decompressFile(file);
            result = { data: streamResult.data, ...streamResult.stats, inputName: file.name };
          } else {
            result = await LZ4Compress.handleFileDecompress(file, { dictData: dictData });
          }
          result.filename = file.name.endsWith('.lz4') ? file.name.slice(0, -4) : file.name + '.dec';
        }
        result.inputName = file.name;
        results.push(result);
      } catch (e) {
        results.push({ inputName: file.name, error: e.message });
      }
    }

    // Render results
    let html = '';
    const allSuccess = results.every(r => !r.error);
    html += `<div class="result-card ${allSuccess ? 'success' : 'error'}">`;
    html += `<h3>${action === 'compress' ? I18n.t('result.compressDone') : I18n.t('result.decompressDone')} (${results.length} ${I18n.t('result.files')})</h3>`;

    html += '<table class="bench-table"><thead><tr>';
    html += `<th>${I18n.t('result.fileName')}</th><th>${I18n.t('result.original')}</th><th>${action === 'compress' ? I18n.t('result.compressed') : I18n.t('result.decompressed')}</th><th>${I18n.t('result.ratio')}</th><th>${I18n.t('result.time')}</th>`;
    html += '</tr></thead><tbody>';

    for (const r of results) {
      if (r.error) {
        html += `<tr><td>${r.inputName}</td><td colspan="4" style="color:var(--error)">${r.error}</td></tr>`;
      } else {
        const origSize = action === 'compress' ? r.originalSize : r.compressedSize;
        const outSize = action === 'compress' ? r.compressedSize : r.decompressedSize;
        let rowHtml = `<tr><td>${r.inputName}</td><td>${formatBytes(origSize)}</td><td>${formatBytes(outSize)}</td><td>${r.ratio}:1</td><td>${r.elapsed} ms</td></tr>`;
        
        // Show skippable frame info
        if (r.hasSkippable) {
          rowHtml += `<tr style="background:rgba(0,128,0,0.05)">
            <td colspan="5" style="font-size:0.8rem;padding-left:1rem;color:var(--primary)">
              ⏭️ 跳过帧: 嵌入 ${formatBytes(r.skippableSize)} 元数据
            </td></tr>`;
        }
        html += rowHtml;
      }
    }
    html += '</tbody></table>';

    if (allSuccess && results.length > 0) {
      html += `<button class="btn btn-primary" onclick="App.downloadAll()">${I18n.t('result.downloadAll')}</button>`;

      // Detect tar format in decompressed data
      if (action === 'decompress') {
        for (const r of results) {
          if (r.data && r.data.length > 263) {
            // Check for "ustar" magic at offset 257
            const magic = String.fromCharCode(r.data[257], r.data[258], r.data[259], r.data[260], r.data[261]);
            if (magic === 'ustar') {
              html += ` <button class="btn btn-primary" onclick="App.extractTar()">${I18n.t('compress.extractTar')}</button>`;
              break;
            }
          }
        }
      }
    }
    html += '</div>';
    resultDiv.innerHTML = html;

    window._lastResults = results.filter(r => !r.error);
  }

  function extractTar() {
    if (!window._lastResults || window._lastResults.length === 0) return;
    const resultDiv = document.getElementById('compress-result');

    try {
      for (const r of window._lastResults) {
        if (!r.data) continue;
        const entries = TarUtil.unpack(r.data);
        // Download each file
        for (const entry of entries) {
          if (entry.data && entry.data.length > 0) {
            const filename = entry.name.split('/').pop() || entry.name;
            LZ4Compress.downloadFile(entry.data, filename);
          }
        }
        // Show summary
        const dirs = entries.filter(e => e.type === '5').length;
        const files = entries.filter(e => e.type === '0').length;
        const totalSize = entries.reduce((s, e) => s + (e.data ? e.data.length : 0), 0);
        resultDiv.innerHTML += `
          <div class="result-card success" style="margin-top:0.5rem;">
            <h3>${I18n.t('compress.extractDone')}</h3>
            <p>${files} ${I18n.t('result.files')}, ${dirs} directories, ${formatBytes(totalSize)} ${I18n.t('result.total')}</p>
          </div>`;
      }
    } catch (e) {
      resultDiv.innerHTML += `<div class="result-card error">${e.message}</div>`;
    }
  }

  function downloadAll() {
    if (!window._lastResults) return;
    for (const r of window._lastResults) {
      LZ4Compress.downloadFile(r.data, r.filename);
    }
  }

  async function testIntegrity() {
    if (selectedFiles.length === 0) { alert(I18n.t('compress.noFile')); return; }
    const resultDiv = document.getElementById('compress-result');
    resultDiv.innerHTML = `<div class="loading">${I18n.t('result.testing')}</div>`;

    let html = '<div class="result-card success"><h3>' + I18n.t('result.testResults') + '</h3>';
    html += '<table class="bench-table"><thead><tr>';
    html += `<th>${I18n.t('result.fileName')}</th><th>${I18n.t('result.status')}</th><th>${I18n.t('result.original')}</th><th>${I18n.t('result.decompressed')}</th>`;
    html += '</tr></thead><tbody>';

    for (const file of selectedFiles) {
      try {
        const data = await readFileAsUint8(file);
        const decompressed = LZ4Frame.decompress(data);
        const match = decompressed.data.length > 0;
        html += `<tr><td>${file.name}</td><td style="color:var(--success)">✓ OK</td><td>${formatBytes(data.length)}</td><td>${formatBytes(decompressed.data.length)}</td></tr>`;
      } catch (e) {
        html += `<tr><td>${file.name}</td><td style="color:var(--error)">✗ FAIL</td><td colspan="2">${e.message}</td></tr>`;
      }
    }
    html += '</tbody></table></div>';
    resultDiv.innerHTML = html;
  }

  function readFileAsUint8(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  async function packAsTarLz4() {
    if (selectedFiles.length === 0) { alert(I18n.t('compress.noFile')); return; }
    const resultDiv = document.getElementById('compress-result');
    resultDiv.innerHTML = `<div class="loading">${I18n.t('result.processing')}</div>`;

    try {
      // Read all files and build tar entries with relative paths
      const entries = [];
      for (const file of selectedFiles) {
        const data = await readFileAsUint8(file);
        // Use webkitRelativePath if available, otherwise just filename
        const name = file.webkitRelativePath || file.name;
        entries.push({ name, data });
      }

      // Pack into tar
      const tarData = TarUtil.pack(entries);

      // LZ4 compress the tar
      const startTime = performance.now();
      const options = getCompressOptions();
      const lz4Data = LZ4Frame.compress(tarData, options);
      const elapsed = performance.now() - startTime;

      // Determine output filename (use folder name if available)
      const folderName = selectedFiles[0]?.webkitRelativePath?.split('/')[0] || 'archive';
      const outName = folderName + '.tar.lz4';

      resultDiv.innerHTML = `
        <div class="result-card success">
          <h3>${I18n.t('compress.packDone')}</h3>
          <div class="stats-grid">
            <div class="stat"><label>${I18n.t('result.original')}</label><span>${formatBytes(tarData.length)}</span></div>
            <div class="stat"><label>${I18n.t('result.compressed')}</label><span>${formatBytes(lz4Data.length)}</span></div>
            <div class="stat"><label>${I18n.t('result.ratio')}</label><span>${(tarData.length / lz4Data.length).toFixed(2)}:1</span></div>
            <div class="stat"><label>${I18n.t('result.files')}</label><span>${entries.length}</span></div>
            <div class="stat"><label>${I18n.t('result.time')}</label><span>${elapsed.toFixed(1)} ms</span></div>
          </div>
          <button class="btn btn-primary" onclick="App.downloadResult()">${I18n.t('result.download')} ${outName}</button>
        </div>`;
      window._lastResult = { data: lz4Data, filename: outName };
    } catch (e) {
      resultDiv.innerHTML = `<div class="result-card error"><h3>${I18n.t('result.error')}</h3><p>${e.message}</p></div>`;
    }
  }

  function getCompressOptions() {
    const blockSize = parseInt(document.getElementById('opt-block-size').value);
    const level = parseInt(document.getElementById('opt-level').value);
    
    // Get skippable frame info
    const skippableMode = document.getElementById('opt-skippable-mode').value;
    const skippableVariant = parseInt(document.getElementById('opt-skippable-variant').value);
    let skippableFrame = null;
    
    // Reset skippableData based on mode
    if (skippableMode === 'none') {
      skippableData = null;
    } else if (skippableMode === 'metadata') {
      const jsonStr = document.getElementById('skippable-json-input').value;
      if (jsonStr) {
        try {
          skippableData = new TextEncoder().encode(jsonStr);
        } catch (e) {
          skippableData = null;
        }
      } else {
        skippableData = null;
      }
    }
    // For 'file' mode, skippableData is set by the file input handler
    
    if (skippableMode !== 'none' && skippableData) {
      skippableFrame = LZ4Frame.createSkippableFrame(skippableData, skippableVariant);
    }
    
    // Store for later use
    window._lastSkippableFrame = skippableFrame;
    
    return {
      compressionLevel: level,
      blockSizeID: blockSize,
      blockMode: parseInt(document.getElementById('opt-block-mode').value),
      contentChecksum: document.getElementById('opt-content-crc').checked && !document.getElementById('opt-no-frame-crc').checked,
      blockChecksum: document.getElementById('opt-block-crc').checked,
      contentSize: document.getElementById('opt-content-size').checked,
      dictData: dictData,
      skippableFrame: skippableFrame
    };
  }

  function textCompress() {
    const text = document.getElementById('text-input').value;
    if (!text) { alert('Please enter text to compress'); return; }
    try {
      const options = getCompressOptions();
      const startTime = performance.now();
      const result = LZ4Compress.compressText(text, options);
      const elapsed = performance.now() - startTime;
      const hexStr = Array.from(result.compressed.slice(0, 128)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      document.getElementById('text-output').value = hexStr + (result.compressed.length > 128 ? '...' : '');
      document.getElementById('text-result').innerHTML = `
        <div class="result-card success">
          <div class="stats-grid">
            <div class="stat"><label>${I18n.t('result.original')}</label><span>${formatBytes(result.originalSize)}</span></div>
            <div class="stat"><label>${I18n.t('result.compressed')}</label><span>${formatBytes(result.compressed.length)}</span></div>
            <div class="stat"><label>${I18n.t('result.ratio')}</label><span>${(result.originalSize / result.compressed.length).toFixed(2)}:1</span></div>
            <div class="stat"><label>${I18n.t('result.time')}</label><span>${elapsed.toFixed(1)} ms</span></div>
          </div>
        </div>`;
      window._lastTextResult = result.compressed;
    } catch (e) {
      document.getElementById('text-result').innerHTML = `<div class="result-card error">${e.message}</div>`;
    }
  }

  function textDecompress() {
    const hexStr = document.getElementById('text-output').value.trim();
    if (!hexStr && !window._lastTextResult) { alert('No data to decompress'); return; }
    try {
      let data = window._lastTextResult;
      if (!data) {
        const bytes = hexStr.split(/\s+/).map(h => parseInt(h, 16));
        data = new Uint8Array(bytes);
      }
      const result = LZ4Compress.decompressText(data);
      document.getElementById('text-input').value = result.text;
      document.getElementById('text-result').innerHTML = `
        <div class="result-card success">
          <div class="stats-grid">
            <div class="stat"><label>${I18n.t('result.decompressed')}</label><span>${formatBytes(result.decompressedSize)}</span></div>
          </div>
        </div>`;
    } catch (e) {
      document.getElementById('text-result').innerHTML = `<div class="result-card error">${e.message}</div>`;
    }
  }

  function downloadResult() {
    if (window._lastResult) {
      LZ4Compress.downloadFile(window._lastResult.data, window._lastResult.filename);
    }
  }

  // ========== Parser Tab ==========
  function setupParserTab() {
    const parserInput = document.getElementById('parser-input');
    const parserDrop = document.getElementById('parser-drop-zone');
    const parserFileInput = document.getElementById('parser-file-input');

    parserDrop.addEventListener('click', () => parserFileInput.click());
    parserDrop.addEventListener('dragover', e => { e.preventDefault(); parserDrop.classList.add('drag-over'); });
    parserDrop.addEventListener('dragleave', () => parserDrop.classList.remove('drag-over'));
    parserDrop.addEventListener('drop', e => {
      e.preventDefault();
      parserDrop.classList.remove('drag-over');
      if (e.dataTransfer.files.length) parseFile(e.dataTransfer.files[0]);
    });
    parserFileInput.addEventListener('change', () => {
      if (parserFileInput.files.length) parseFile(parserFileInput.files[0]);
    });
  }

  function parseFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result);
        const result = LZ4Parser.parse(data);
        renderParseResult(result, data);
      } catch (e) {
        document.getElementById('parser-output').innerHTML = `<div class="result-card error">${e.message}</div>`;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderParseResult(result, raw) {
    const output = document.getElementById('parser-output');

    // Stats
    let statsHtml = `
      <div class="parser-stats">
        <div class="stat"><label>${I18n.t('parser.fileSize')}</label><span>${formatBytes(result.totalSize)}</span></div>
        <div class="stat"><label>${I18n.t('parser.frames')}</label><span>${result.stats.frameCount}</span></div>
        <div class="stat"><label>${I18n.t('parser.blocks')}</label><span>${result.stats.blockCount}</span></div>
        <div class="stat"><label>${I18n.t('parser.compressedData')}</label><span>${formatBytes(result.stats.compressedSize)}</span></div>
        <div class="stat"><label>${I18n.t('result.ratio')}</label><span>${result.stats.ratio}:1</span></div>
      </div>`;

    // Frames
    let framesHtml = '';
    for (let fi = 0; fi < result.frames.length; fi++) {
      const frame = result.frames[fi];
      framesHtml += `<div class="frame-card"><h3>Frame #${fi} (${frame.type})</h3>`;

      if (frame.info) {
        framesHtml += '<div class="frame-info">';
        for (const [k, v] of Object.entries(frame.info)) {
          framesHtml += `<span class="info-tag">${k}: ${v}</span>`;
        }
        framesHtml += '</div>';
      }

      // Fields table
      framesHtml += '<table class="field-table"><thead><tr><th>' + I18n.t('parser.offset') + '</th><th>' + I18n.t('parser.field') + '</th><th>' + I18n.t('parser.hex') + '</th><th>' + I18n.t('parser.description') + '</th></tr></thead><tbody>';
      for (const field of (frame.fields || [])) {
        framesHtml += `<tr>
          <td class="hex-addr">0x${field.offset.toString(16).padStart(6, '0')}</td>
          <td><strong>${field.name}</strong></td>
          <td class="hex-val">${field.hex}</td>
          <td>${field.description}</td>
        </tr>`;
      }
      framesHtml += '</tbody></table>';

      // Blocks summary
      if (frame.blocks && frame.blocks.length > 0) {
        framesHtml += `<div class="blocks-summary"><h4>${I18n.t('parser.dataBlocks')} (${frame.blocks.length})</h4>`;
        framesHtml += '<div class="block-grid">';
        for (const block of frame.blocks) {
          framesHtml += `<div class="block-chip ${block.isUncompressed ? 'uncompressed' : 'compressed'}">
            #${block.index} ${block.isUncompressed ? 'RAW' : 'LZ4'} ${formatBytes(block.compressedSize)}
          </div>`;
        }
        framesHtml += '</div></div>';
      }

      framesHtml += '</div>';
    }

    // Hex dump (first 256 bytes)
    let hexHtml = `<div class="hex-dump"><h3>${I18n.t('parser.hexDump')}</h3><pre>`;
    for (let i = 0; i < Math.min(256, raw.length); i += 16) {
      const addr = i.toString(16).padStart(6, '0');
      const hexPart = [];
      const asciiPart = [];
      for (let j = 0; j < 16 && i + j < raw.length; j++) {
        const b = raw[i + j];
        hexPart.push(b.toString(16).padStart(2, '0'));
        asciiPart.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
      }
      hexHtml += `<span class="hex-addr">${addr}</span>  ${hexPart.join(' ').padEnd(48)}  <span class="hex-ascii">${asciiPart.join('')}</span>\n`;
    }
    if (raw.length > 256) hexHtml += `\n... (${raw.length - 256} ${I18n.t('parser.moreBytes')})`;
    hexHtml += '</pre></div>';

    output.innerHTML = statsHtml + framesHtml + hexHtml;
  }

  // ========== Benchmark Tab ==========
  function setupBenchTab() {
    document.getElementById('btn-bench-start').addEventListener('click', runBenchmark);
    document.getElementById('btn-bench-file').addEventListener('click', () => {
      document.getElementById('bench-file-input').click();
    });
    document.getElementById('bench-file-input').addEventListener('change', (e) => {
      if (e.target.files.length) runFileBenchmark(e.target.files[0]);
    });
  }

  async function runBenchmark() {
    const sizeSelect = document.getElementById('bench-size');
    const maxSize = parseInt(sizeSelect.value);
    const resultDiv = document.getElementById('bench-result');
    const progressBar = document.getElementById('bench-progress');

    resultDiv.innerHTML = '';
    progressBar.style.display = 'block';
    progressBar.querySelector('.progress-bar-fill').style.width = '0%';

    try {
      const sizes = [1024, 4096, 16384, 65536, 262144, 1048576].filter(s => s <= maxSize);
      const results = await LZ4Bench.runFullBenchmark({
        sizes,
        onProgress: (p) => {
          progressBar.querySelector('.progress-bar-fill').style.width = `${(p.current / p.total * 100).toFixed(0)}%`;
          progressBar.querySelector('.progress-label').textContent = `${I18n.t('bench.testing')} ${formatBytes(p.size)}... (${p.current}/${p.total})`;
        }
      });

      renderBenchResults(results);
    } catch (e) {
      resultDiv.innerHTML = `<div class="result-card error">${e.message}</div>`;
    } finally {
      progressBar.style.display = 'none';
    }
  }

  async function runFileBenchmark(file) {
    const resultDiv = document.getElementById('bench-result');
    resultDiv.innerHTML = '<div class="loading">' + I18n.t('result.processing') + '</div>';
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });
      const result = LZ4Bench.runWithData(data);
      resultDiv.innerHTML = `
        <div class="result-card success">
          <h3>${I18n.t('bench.benchFile')}: ${file.name} (${formatBytes(data.length)})</h3>
          <div class="stats-grid">
            <div class="stat"><label>${I18n.t('bench.compSpeed')}</label><span>${result.compressSpeed} MB/s</span></div>
            <div class="stat"><label>${I18n.t('bench.decompSpeed')}</label><span>${result.decompressSpeed} MB/s</span></div>
            <div class="stat"><label>${I18n.t('result.compressed')}</label><span>${formatBytes(result.compressedSize)}</span></div>
            <div class="stat"><label>${I18n.t('result.ratio')}</label><span>${result.ratio}:1</span></div>
            <div class="stat"><label>${I18n.t('bench.compTime')}</label><span>${result.compressTime} ms</span></div>
            <div class="stat"><label>${I18n.t('bench.decompTime')}</label><span>${result.decompressTime} ms</span></div>
          </div>
        </div>`;
    } catch (e) {
      resultDiv.innerHTML = `<div class="result-card error">${e.message}</div>`;
    }
  }

  function renderBenchResults(results) {
    const resultDiv = document.getElementById('bench-result');
    let html = `<table class="bench-table">
      <thead><tr>
        <th>${I18n.t('bench.inputSize')}</th><th>${I18n.t('bench.compressed')}</th><th>${I18n.t('result.ratio')}</th>
        <th>${I18n.t('bench.compSpeed')}</th><th>${I18n.t('bench.decompSpeed')}</th>
        <th>${I18n.t('bench.compTime')}</th><th>${I18n.t('bench.decompTime')}</th>
      </tr></thead><tbody>`;

    for (const r of results) {
      html += `<tr>
        <td>${formatBytes(r.inputSize)}</td>
        <td>${formatBytes(r.compressedSize)}</td>
        <td>${r.ratio}:1</td>
        <td class="speed">${r.compressSpeed}</td>
        <td class="speed">${r.decompressSpeed}</td>
        <td>${r.compressTime} ms</td>
        <td>${r.decompressTime} ms</td>
      </tr>`;
    }
    html += '</tbody></table>';
    resultDiv.innerHTML = html;
  }

  // ========== Utilities ==========
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  return { init, downloadResult, downloadAll, extractTar };
})();

document.addEventListener('DOMContentLoaded', App.init);
