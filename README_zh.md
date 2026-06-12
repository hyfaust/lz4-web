# lz4-web

[English](README.md) | [简体中文](README_zh.md)

---

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![LZ4 Version](https://img.shields.io/badge/LZ4-v1.10.0-green.svg)](https://github.com/lz4/lz4)
[![Pure Browser](https://img.shields.io/badge/Platform-Browser-orange.svg)]()
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg)]()

> 纯浏览器端 LZ4 压缩工具箱 — 无需服务器、无需后端，直接在浏览器中完成压缩、解压、解析和基准测试。基于 LZ4 v1.10.0 算法的 JavaScript 实现。

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [使用方法](#使用方法)
  - [压缩 / 解压](#压缩--解压)
  - [帧格式解析器](#帧格式解析器)
  - [交互式文档](#交互式文档)
  - [基准测试](#基准测试)
- [压缩选项](#压缩选项)
- [字典压缩](#字典压缩)
- [Tar 归档支持](#tar-归档支持)
- [项目结构](#项目结构)
- [API 参考](#api-参考)
- [CLI 兼容性](#cli-兼容性)
- [测试](#测试)
- [许可证](#许可证)

## 特性

- **纯浏览器运行** — 无需服务器、无需后端、无需构建步骤，直接打开 `index.html` 即可使用
- **零依赖** — 纯 JavaScript 实现，无任何外部库
- **完整 LZ4 v1.10.0 支持** — Block 格式、Frame 格式、HC 模式（级别 2–12）、字典压缩
- **中英双语界面** — 一键切换中文/英文
- **12 级压缩** — 快速模式（级别 1）和 HC 模式（级别 2–12），可配置加速因子
- **字典压缩** — 针对数据模式预训练字典，小数据压缩率提升 50–60%
- **帧格式解析器** — 上传任意 `.lz4` 文件，可视化展示完整内部结构：魔数、标志位、数据块、校验和
- **Tar + LZ4 归档** — 将整个文件夹打包为单个 `.tar.lz4` 文件，可用标准 `tar` 工具解压
- **流式处理** — 超过 4MB 的文件自动分块处理，避免内存溢出
- **Web Worker 并行** — 大文件使用多线程压缩
- **Skippable Frame** — 创建和解析 LZ4 可跳过帧，用于嵌入自定义元数据
- **Legacy 格式** — 支持 Linux 内核兼容的 Legacy 格式压缩
- **浏览器内基准测试** — 使用生成数据或自定义文件测试压缩/解压性能
- **160+ 自动化测试** — 完整测试套件，含 CLI 交叉验证

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/hyfaust/lz4-web.git
cd lz4-web/site

# 直接在浏览器中打开
# Windows
start index.html

# macOS
open index.html

# Linux
xdg-open index.html

# 或启动本地服务器
python -m http.server 8080
# 然后访问 http://localhost:8080
```

无需 `npm install`，无需构建步骤，无需编译。打开即用。

## 使用方法

### 压缩 / 解压

**文件模式：**
1. 点击拖拽区域或拖入文件（支持多文件和文件夹选择）
2. 配置选项：压缩级别、块大小、块模式、校验和
3. 点击 **▶ 开始处理** 进行压缩或解压
4. 下载结果

**文本模式：**
1. 切换到文本模式
2. 在输入框中输入文本
3. 点击 **压缩 →** 进行压缩，或 **← 解压** 进行解压
4. 查看十六进制输出和统计信息

**文件夹打包：**
1. 点击 **📁 选择文件夹** 选择整个目录
2. 点击 **📦 打包为 .tar.lz4** 创建单个归档文件
3. 生成的 `.tar.lz4` 可用标准工具解压：
   ```bash
   lz4 -d archive.tar.lz4 | tar xf -
   ```

### 帧格式解析器

1. 切换到 **🔍 帧格式解析** 标签
2. 上传任意 `.lz4` 文件
3. 查看完整帧结构：
   - 魔数、FLG/BD 标志位、内容大小、字典 ID
   - 头部校验和验证
   - 数据块列表（大小、压缩状态）
   - 前 256 字节的十六进制转储

### 交互式文档

**📖 文档** 标签包含以下交互式说明：
- LZ4 算法概述及与其他算法对比
- 帧格式规范（含可视化图示）
- 块格式规范（含编码示例）
- 压缩级别指南
- 字典压缩指南
- CLI 快速参考
- 使用场景与最佳实践

### 基准测试

1. 切换到 **📊 基准测试** 标签
2. 选择最大测试数据大小（64 KB – 16 MB）
3. 点击 **▶ 运行基准测试** 使用生成数据，或 **📁 用文件测试** 使用自定义数据
4. 在表格中查看压缩速度、解压速度和压缩比

## 压缩选项

| 选项 | 取值 | 说明 |
|------|------|------|
| **压缩级别** | 1–12, --fast=1/2/5/10 | 1 = 快速（默认），2–12 = HC 模式，压缩比递增 |
| **块大小** | 64 KB, 256 KB, 1 MB, 4 MB | 最大块大小（默认：4 MB） |
| **块模式** | 链接模式, 独立模式 | 独立 = 可随机访问；链接 = 压缩比更好 |
| **内容校验** | 开/关 | 对整个解压内容计算 xxHash-32 校验和 |
| **块校验** | 开/关 | 对每个压缩块计算 xxHash-32 校验和 |
| **内容大小** | 开/关 | 在帧头中存储原始文件大小 |
| **禁用帧校验** | 开/关 | 禁用内容校验和 |
| **字典** | 文件 | 预训练字典文件，用于小数据压缩 |

## 字典压缩

字典压缩对压缩大量结构相似的小记录非常有效（如 JSON 日志、HTTP 请求、数据库行）。

```bash
# 使用 Zstandard 的字典构建器从样本数据构建字典
zstd --train samples/*.json -o dict.bin

# 在 lz4-web 中使用：上传 dict.bin 作为字典文件
# 对 JSON 记录通常可节省 50–60% 的压缩空间
```

字典存储在 LZ4 帧的 Dictionary ID 字段中，解压时必须提供相同的字典。

## Tar 归档支持

**打包文件夹：**
```
选择文件夹 → 打包为 .tar.lz4 → 下载
```

**解压（CLI）：**
```bash
lz4 -d archive.tar.lz4 | tar xf -
```

**解压（浏览器）：**
上传 `.tar.lz4` 文件 → 解压 → 点击 **📂 解包文件**

## 项目结构

```
site/
├── index.html           # 主页面（SPA，Tab 导航）
├── css/
│   └── style.css        # 全局样式（暗色主题）
├── js/
│   ├── xxhash.js        # xxHash-32 实现
│   ├── lz4-block.js     # LZ4 Block 格式编解码器
│   ├── lz4hc.js         # LZ4 HC（高压缩）模式
│   ├── lz4-frame.js     # LZ4 Frame 格式编解码器
│   ├── lz4-parser.js    # 帧格式可视化解析器
│   ├── lz4-compress.js  # 压缩工具模块
│   ├── lz4-bench.js     # 基准测试模块
│   ├── lz4-stream.js    # 流式分块处理
│   ├── lz4-worker.js    # Web Worker（并行压缩）
│   ├── lz4-parallel.js  # 并行压缩编排器
│   ├── tar.js           # UStar tar 格式读写器
│   ├── i18n.js          # 中英双语翻译模块
│   ├── app.js           # 主应用逻辑
│   └── test-verify.js   # 160+ 自动化测试
├── LICENSE              # GPL v3
└── README_zh.md
```

## API 参考

JavaScript 模块暴露以下核心 API：

### LZ4Block

```js
// 压缩块（快速模式）
LZ4Block.compress(data, { acceleration: 1, dict: null })  // → Uint8Array

// 解压块
LZ4Block.decompress(compressed, maxSize, { dict: null })  // → Uint8Array

// 最大压缩后大小
LZ4Block.compressBound(inputSize)  // → number
```

### LZ4HC

```js
// HC 压缩（级别 2–12）
LZ4HC.compress(data, { level: 9, dict: null, favorDecSpeed: false })
```

### LZ4Frame

```js
// 帧格式压缩/解压
LZ4Frame.compress(data, { compressionLevel, blockSizeID, contentChecksum, contentSize, dictData })
LZ4Frame.decompress(data, { dictData })  // → { data, frameInfo }

// Legacy 格式
LZ4Frame.compressLegacy(data, { acceleration })

// Skippable Frame
LZ4Frame.createSkippableFrame(userData, magicVariant)
LZ4Frame.concatFrames([frame1, frame2, ...])
LZ4Frame.parseFrameStream(concatenatedData)
```

### LZ4Parser

```js
// 解析 LZ4 文件并可视化结构
LZ4Parser.parse(data)  // → { frames, stats }
```

### TarUtil

```js
// 将文件打包为 tar
TarUtil.pack([{ name: 'path/file.txt', data: Uint8Array }])  // → Uint8Array

// 解包 tar
TarUtil.unpack(tarData)  // → [{ name, data, type, size }]
```

## CLI 兼容性

lz4-web 生成的输出与官方 `lz4` CLI 工具**完全兼容**：

```bash
# JS 压缩 → CLI 解压 ✅
lz4 -d js_output.lz4 original.txt

# CLI 压缩 → JS 解压 ✅
lz4 -9 file.txt && lz4 -d file.txt.lz4  # （在浏览器中操作）

# JS tar.lz4 → CLI 解压 ✅
lz4 -d archive.tar.lz4 | tar xf -

# CLI tar.lz4 → JS 解压 ✅
# 在浏览器中上传 archive.tar.lz4 → 解包文件
```

已验证的压缩级别：1, 2, 3, 5, 6, 7, 9, 10, 12。

## 测试

项目包含完整的测试套件（`js/test-verify.js`），共 **160+ 项测试**，覆盖 18 个类别：

```bash
# 运行所有测试
node js/test-verify.js
```

| 类别 | 测试数 | 说明 |
|------|--------|------|
| xxHash-32 | 3 | 已知值校验 |
| Block 往返 | 6 | 各种数据模式 |
| 加速因子 | 6 | 速度/压缩比权衡 |
| Frame 级别 | 7 | 级别 1–12 + --fast |
| Frame 选项 | 5 | ContentSize、CRC、BlockCRC |
| 解析器精度 | 15 | 多选项组合 |
| 大数据 | 2 | 64 KB + 256 KB |
| 字典压缩 | 9 | 56–62% 压缩节省 |
| HC 模式 | 14 | 级别 2–12 + CLI 交叉验证 |
| --favor-decSpeed | 3 | 级别 10–12 |
| Legacy 格式 | 5 | CLI -l 交叉验证 |
| Skippable Frame | 24 | 全部 16 种魔术数变体 + CLI |
| Tar 打包/解包 | 16 | 打包、解包、CLI 交叉验证 |
| 并行压缩 | 3 | Worker 代码 + 块往返 |
| CLI 交叉验证 | 5 | JS ↔ CLI 双向 |

## 许可证

本项目基于 [GNU 通用公共许可证 v3.0](LICENSE) 授权。

LZ4 算法和库由 [Yann Collet](https://github.com/Cyan4973) 开发，基于 BSD 2-Clause 和 GPL-2.0-or-later 许可。详见 [github.com/lz4/lz4](https://github.com/lz4/lz4)。

## 致谢

- [LZ4](https://github.com/lz4/lz4) by Yann Collet — LZ4 压缩算法原始实现
- [xxHash](https://github.com/Cyan4973/xxHash) by Yann Collet — 用于校验和的快速哈希算法
