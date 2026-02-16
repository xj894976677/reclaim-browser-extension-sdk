# Joclaim SDK 迁移改动记录

## 背景

将 `@joclaim/snarkjs`（fork 版本，使用 ffjavascript 0.2.63）替换为官方 `snarkjs@^0.7.5`（使用 ffjavascript 0.3.1），解决 Chrome 扩展中 Worker CSP 限制问题（`data:` URL → `blob:` URL）。

## 一、改动清单

### 1. attestor-core（版本 0.3.2 → 0.4.1）

**package.json**
- `@joclaim/snarkjs: "0.1.0"` → `snarkjs: "^0.7.5"`
- 版本号升至 `0.4.1`

**src/scripts/build-browser.sh**
- `cp node_modules/@joclaim/snarkjs/build/snarkjs.min.js` → `cp node_modules/snarkjs/build/snarkjs.min.js`

**src/scripts/build-browser.ts**
- esbuild alias/external: `@joclaim/snarkjs` → `snarkjs`

**src/scripts/build-jsc.ts**
- esbuild alias/external: `@joclaim/snarkjs` → `snarkjs`

**src/utils/socket-base.ts**
- WebSocket 事件处理器参数类型改为 `any`，修复 TypeScript 编译错误

### 2. reclaim-browser-extension-sdk（版本 0.3.7 → 0.4.3）

**package.json**
- `@joclaim/snarkjs: "0.1.0"` → `snarkjs: "^0.7.5"`
- `@joclaim/attestor-core: "0.3.2"` → `@joclaim/attestor-core: "0.4.1"`
- 移除 overrides/browser 中的 `"snarkjs": false`
- 版本号升至 `0.4.3`

**webpack.config.js**
- snarkjs alias: `node_modules/@joclaim/snarkjs/build/browser.esm.js` → `node_modules/snarkjs/build/browser.esm.js`
- re2 alias: `false` → `node_modules/@joclaim/attestor-core/lib/scripts/fallbacks/re2.js`（alias 和 fallback 两处均修改）

**src/utils/claim-creator/claim-creator.js**
- 新增 `writeRedactionMode` 传递逻辑（第 349-352 行），将 `providerData.writeRedactionMode` 传入 `params`，使 attestor-core 能正确选择 key-update 或 zk 模式
- key-update 模式下跳过传递 `responseRedactions` 给 attestor-core（第 300 行），使服务端响应 blocks 用 `directReveal` 而非 ZK 证明，实现纯 key-update 模式

### 3. test-extension

**package.json**
- `@joclaim/browser-extension-sdk: "0.3.7"` → `@joclaim/browser-extension-sdk: "0.4.3"`

### 4. attestor-core 服务端（本地运行）

- 执行 `node node_modules/@joclaim/zk-symmetric-crypto/lib/scripts/download-files.js` 下载电路文件到 `resources/` 目录

## 二、解决的问题

| 问题 | 原因 | 解决方式 |
|------|------|----------|
| Worker CSP 违规 | ffjavascript 0.2.63 用 `data:` URL 创建 Worker，被扩展 CSP 拦截 | 切换到官方 snarkjs（ffjavascript 0.3.1 用 `blob:` URL） |
| `F.randomBytes is not a function` | webpack alias 前缀匹配问题 | 修正 snarkjs alias 路径 |
| EJS CSP 违规 | snarkjs alias 指向错误的构建文件 | 指向 `browser.esm.js` |
| `ik is not a function` | `re2` 模块被 webpack 设为空模块（`false`），attestor-core 新版直接 `import RE2 from 're2'` 无 try/catch 保护 | 将 re2 alias 指向 attestor-core 的 fallback（`regularRegex` 函数） |
| 服务端 ENOENT circuit_final.zkey | `@joclaim/zk-symmetric-crypto` npm 包不含电路文件 | 执行 download-files.js 脚本下载 |
| TypeScript 编译错误 | socket-base.ts 事件类型不匹配 | 参数类型改为 `any` |
| `writeRedactionMode` 未传递 | claim-creator.js 未将 `writeRedactionMode` 传给 attestor-core，导致始终走默认模式 | 在 claim-creator.js 中添加传递逻辑 |
| eslint 依赖冲突 | `@adiwajshing/eslint-config` 要求 `eslint >= 9`，项目使用 `eslint@^8` | attestor-core 执行 `npm install --legacy-peer-deps` |
| re2 原生模块版本不匹配 | re2 编译于 Node.js v20，运行环境为 v22，`NODE_MODULE_VERSION` 不一致 | `rm -rf node_modules/re2 && npm install re2 --build-from-source --legacy-peer-deps` |
| SDK 0.4.0 发布不完整 | 首次发布时 build 产物缺少 offscreen、content、scripts 目录 | 重新构建后发布 0.4.1 |
| 进度弹窗消失 | 扩展更新后 content script 未重新注入 | 重新加载扩展后恢复 |

## 三、与旧版（attestor-core 4.0.3）的差异

### snarkjs 版本
| | 旧版 | 新版 |
|---|---|---|
| 包名 | `@joclaim/snarkjs@0.1.0` | `snarkjs@^0.7.5`（实际安装 0.7.6） |
| ffjavascript | 0.2.63 | 0.3.1 |
| Worker URL 类型 | `data:` | `blob:` |
| `groth16Prove` options 参数 | 已移除 | 保留（支持 `singleThread`） |
| `wtns.getWtnsCalculator` | 有（自定义添加） | 无（operator 有 fallback guard） |

### re2 处理方式
| | 旧版 | 新版 |
|---|---|---|
| 源码 | try/catch 保护，`Object.keys(RE2).length` 检查，fallback 到 `new RegExp` | 直接 `import RE2 from 're2'`，依赖构建工具替换 |
| SDK webpack | `re2: false` | `re2: attestor-core/lib/scripts/fallbacks/re2.js` |
| fallback 函数 | 内联 `new RegExp(str, 'sgi')` | `regularRegex(pattern, flags)` 去掉 `u` flag |

### 电路文件加载
| | 旧版 | 新版 |
|---|---|---|
| 客户端（offscreen） | `makeRemoteFileFetch({ baseUrl: '/browser-rpc/resources' })` | 相同 |
| 服务端（Node.js） | `makeLocalFileFetch()` 从 `resources/` 读取 | 相同，需手动执行 download-files.js |

| key-update 模式走 ZK | `addServerSideReveals` 中 `responseRedactions` 非空时，服务端 blocks 始终用 ZK 证明，与 `writeRedactionMode` 无关 | key-update 模式下不传递 `responseRedactions` 给 attestor-core，服务端 blocks 改用 `directReveal` |

## 五、环境搭建指南

### 从 git 拉取后的初始化步骤

```bash
# 1. 安装 SDK 依赖
cd reclaim-browser-extension-sdk
npm install

# 2. 构建 SDK
npm run build

# 3. 安装 test-extension 依赖
cd ../test-extension
npm install

# 4. 下载电路文件（test-extension 需要）
npm run setup
# 如果 setup 超时，可手动执行：
node node_modules/@joclaim/browser-extension-sdk/build/scripts/download-circuit-files.js

# 5. 构建 test-extension
npm run build

# 6. 安装 attestor-core 服务端依赖
cd ../attestor-core
npm install --legacy-peer-deps

# 7. 下载服务端电路文件（必须，npm 包不含电路文件）
node node_modules/@joclaim/zk-symmetric-crypto/lib/scripts/download-files.js

# 8. 如果 re2 原生模块报版本不匹配错误
rm -rf node_modules/re2 && npm install re2 --build-from-source --legacy-peer-deps
```

### 电路文件说明

`@joclaim/zk-symmetric-crypto` npm 包不包含电路文件（`circuit_final.zkey`、`circuit.wasm` 等），需要通过脚本从 GitHub 下载：

- **客户端（浏览器扩展）**：通过 `npm run setup` 或 `download-circuit-files.js` 下载到 `public/browser-rpc/resources/`
- **服务端（attestor-core）**：通过 `download-files.js` 下载到 `node_modules/@joclaim/zk-symmetric-crypto/resources/` 和 `bin/`

如果不下载电路文件，ZK 证明生成/验证会报 `ENOENT: no such file or directory` 错误。
