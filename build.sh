#!/bin/bash
# ==========================================================================
# SDK 构建脚本 - 从源码编译，彻底避免缓存问题
#
# 构建链路:
#   src/ → [webpack] → build/ → [install-assets.js] → public/ → [vite] → dist/
#
# 缓存风险点及对策:
#   1. webpack 持久缓存 (node_modules/.cache/)
#      → 每次构建前清除
#   2. npm file: 链接 (basic-extension → SDK)
#      → 重新 npm install 确保 symlink 正确
#   3. build/ 旧产物
#      → webpack-build-utils/build.js 内部先 rm -rf build/ 再编译
#   4. public/reclaim-browser-extension-sdk/ 旧拷贝
#      → 构建前手动清除，由 install-assets.js 重新复制
#   5. vite 缓存 (node_modules/.vite/)
#      → 每次构建前清除
#   6. dist/ 旧产物
#      → vite.config.js 设置 emptyOutDir: true 自动清除
#
# 未来引入本地 tls/snarkjs 时的注意事项:
#   - 修改 package.json 中的依赖后，必须删除 node_modules 重新 npm install
#   - webpack 缓存必须清除（本脚本已处理）
#   - 如果使用 file: 协议引用本地包，每次修改源码后需重新运行本脚本
# ==========================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "步骤 1: 清除所有缓存"
echo "=========================================="
# webpack 持久缓存
rm -rf node_modules/.cache 2>/dev/null || true
# basic-extension 的 vite 和 webpack 缓存
rm -rf examples/basic-extension/node_modules/.cache 2>/dev/null || true
rm -rf examples/basic-extension/node_modules/.vite 2>/dev/null || true
# basic-extension 的旧 SDK 拷贝（避免残留旧文件）
rm -rf examples/basic-extension/public/reclaim-browser-extension-sdk 2>/dev/null || true
rm -f  examples/basic-extension/public/343.bundle.js 2>/dev/null || true
# basic-extension 的旧 dist
rm -rf examples/basic-extension/dist 2>/dev/null || true
echo "  已清除所有缓存和旧构建产物"

echo ""
echo "=========================================="
echo "步骤 2: 安装 SDK 依赖"
echo "=========================================="
if [ ! -d "node_modules" ]; then
    echo "  npm install..."
    npm install
else
    echo "  node_modules 已存在"
    # 如果需要强制重新安装（例如改了 package.json 中的本地依赖），取消注释下面两行:
    # rm -rf node_modules
    # npm install
fi

echo ""
echo "=========================================="
echo "步骤 3: webpack 编译 SDK (src/ → build/)"
echo "=========================================="
# webpack-build-utils/build.js 内部会先 rm -rf build/ 再编译
# 保留日志输出以便调试问题
NODE_ENV=production npm run build 2>&1

echo ""
echo "=========================================="
echo "步骤 4: 验证 build/ 产物"
echo "=========================================="
# 确认 build/ 存在关键文件
for f in build/ReclaimExtensionSDK.bundle.js build/background/background.bundle.js build/content/content.bundle.js build/offscreen/offscreen.bundle.js build/interceptor/injection-scripts.bundle.js; do
  if [ ! -f "$f" ]; then
    echo "错误: 缺少关键文件 $f"
    exit 1
  fi
done
echo "  关键 bundle 文件完整"

# 确认无远程地址残留
REMAINING=$(grep -rl 'api.reclaimprotocol.org\|attestor.reclaimprotocol.org\|logs.reclaimprotocol.org' build/ 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo "错误: build/ 中仍有远程地址残留:"
  echo "$REMAINING"
  echo ""
  echo "请检查 src/ 中是否有未修改的远程 URL"
  exit 1
fi
echo "  所有 URL 指向 localhost:8001 ✓"

echo ""
echo "=========================================="
echo "步骤 5: 构建 basic-extension"
echo "=========================================="
cd "$SCRIPT_DIR/examples/basic-extension"
# 重新 npm install 确保 file:../../ symlink 指向最新 SDK
npm install
# npm run build = reclaim-extension-setup (install-assets.js: 下载电路 + 复制 SDK) + vite build
npm run build

echo ""
echo "=========================================="
echo "步骤 6: 验证 dist/ 产物"
echo "=========================================="
REMAINING=$(grep -rl 'api.reclaimprotocol.org\|attestor.reclaimprotocol.org\|logs.reclaimprotocol.org' dist/ 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo "错误: dist/ 中仍有远程地址残留:"
  echo "$REMAINING"
  exit 1
fi
echo "  dist/ 验证通过 ✓"

echo ""
echo "=========================================="
echo "步骤 7: 准备 web-app"
echo "=========================================="
cd "$SCRIPT_DIR/examples/web-app"
rm -rf node_modules/.cache 2>/dev/null || true
if [ ! -f ".env" ]; then
  echo ".env 不存在，从 .env.example 生成..."
  cp .env.example .env
  # 使用任意本地测试值（不连接远程 Reclaim 服务）
  sed -i '' 's|^VITE_RECLAIM_APP_ID=.*|VITE_RECLAIM_APP_ID=0xDEADBEEF00000000000000000000000000000001|' .env
  sed -i '' 's|^VITE_RECLAIM_APP_SECRET=.*|VITE_RECLAIM_APP_SECRET=0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef|' .env
  sed -i '' 's|^VITE_RECLAIM_EXTENSION_ID=.*|VITE_RECLAIM_EXTENSION_ID=elmologhmcjpdalmdhlopllajilfodef|' .env
  echo ".env 已生成"
else
  echo ".env 已存在"
fi
npm install

echo ""
echo "=========================================="
echo "构建完成"
echo "=========================================="
echo "basic-extension: dist/ 已生成，可加载到 Chrome"
echo "web-app: 运行 'cd examples/web-app && npm run dev' 启动"
echo ""
echo "构建链路: src/ → webpack → build/ → install-assets → public/ → vite → dist/"
echo "所有产物均从 src/ 源码编译生成，无预构建缓存"
