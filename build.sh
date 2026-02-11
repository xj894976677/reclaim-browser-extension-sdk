#!/bin/bash
# 构建脚本 - 替换所有 bundle 中的远程地址为本地地址，清除缓存后重新构建 examples
# 避免旧缓存导致修改未生效的问题

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 清除缓存 ==="
cd "$SCRIPT_DIR"
rm -rf node_modules/.cache 2>/dev/null || true

# 统一替换函数
replace_urls() {
  local dir="$1"
  for f in $(grep -rl 'api.reclaimprotocol.org\|attestor.reclaimprotocol.org\|logs.reclaimprotocol.org' "$dir" 2>/dev/null || true); do
    sed -i '' 's|https://api.reclaimprotocol.org|http://localhost:8001|g' "$f"
    sed -i '' 's|wss://attestor.reclaimprotocol.org/ws|ws://localhost:8001/ws|g' "$f"
    sed -i '' 's|https://logs.reclaimprotocol.org/api/business-logs/logDump|http://localhost:8001/api/logs|g' "$f"
    echo "  已替换: $f"
  done
}

echo "=== 替换 build/ 中的远程地址 ==="
replace_urls "build/"

echo "=== 替换 basic-extension/public/ 中的远程地址 ==="
replace_urls "examples/basic-extension/public/"

echo "=== 构建 basic-extension ==="
cd "$SCRIPT_DIR/examples/basic-extension"
rm -rf node_modules/.cache dist 2>/dev/null || true
npm install
npx vite build

echo "=== 验证 dist/ 无旧地址残留 ==="
REMAINING=$(grep -rl 'api.reclaimprotocol.org\|attestor.reclaimprotocol.org\|logs.reclaimprotocol.org' dist/ 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo "警告: dist/ 中仍有旧地址残留:"
  echo "$REMAINING"
  exit 1
fi
echo "  验证通过"

echo "=== 准备 web-app ==="
cd "$SCRIPT_DIR/examples/web-app"
rm -rf node_modules/.cache 2>/dev/null || true
if [ ! -f ".env" ]; then
  echo ".env 不存在，从 .env.example 生成..."
  cp .env.example .env
  sed -i '' 's|^VITE_RECLAIM_APP_ID=.*|VITE_RECLAIM_APP_ID=0x79A46bc98aAb77FDA01F0fFdB5D806E1e0A485dc|' .env
  sed -i '' 's|^VITE_RECLAIM_APP_SECRET=.*|VITE_RECLAIM_APP_SECRET=0x231056ae611c9c2bab06ae6d46f85335c7a23912a2d3b66e5de244a94b1491cc|' .env
  sed -i '' 's|^VITE_RECLAIM_EXTENSION_ID=.*|VITE_RECLAIM_EXTENSION_ID=emdoloppalidgolapfeeieleddikmcha|' .env
  echo ".env 已生成"
fi
npm install

echo ""
echo "=== 构建完成 ==="
echo "basic-extension: dist/ 已生成，可加载到 Chrome"
echo "web-app: 运行 'cd examples/web-app && npm run dev' 启动"
