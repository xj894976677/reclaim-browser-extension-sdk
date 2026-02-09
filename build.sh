#!/bin/bash
# 构建脚本 - 替换 bundle 中的远程地址为本地地址，清除缓存后重新构建 examples
# 避免旧缓存导致修改未生效的问题

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 清除 SDK node_modules 缓存 ==="
cd "$SCRIPT_DIR"
rm -rf node_modules/.cache 2>/dev/null || true

echo "=== 替换 build/ 中的远程地址为本地地址 ==="
for f in $(grep -rl 'api.reclaimprotocol.org\|attestor.reclaimprotocol.org\|logs.reclaimprotocol.org' build/ 2>/dev/null || true); do
  sed -i '' 's|https://api.reclaimprotocol.org|http://localhost:8001|g' "$f"
  sed -i '' 's|wss://attestor.reclaimprotocol.org/ws|ws://localhost:8001/ws|g' "$f"
  sed -i '' 's|https://logs.reclaimprotocol.org/api/business-logs/logDump|http://localhost:8001/api/logs|g' "$f"
  echo "  已替换: $f"
done
# 验证无残留
REMAINING=$(grep -rl 'api.reclaimprotocol.org\|attestor.reclaimprotocol.org\|logs.reclaimprotocol.org' build/ 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo "警告: 以下文件仍有旧地址残留:"
  echo "$REMAINING"
  exit 1
fi
echo "  验证通过，无旧地址残留"

echo "=== 构建 basic-extension ==="
cd "$SCRIPT_DIR/examples/basic-extension"
rm -rf node_modules/.cache dist 2>/dev/null || true
npm install
npx vite build

echo "=== 准备 web-app ==="
cd "$SCRIPT_DIR/examples/web-app"
rm -rf node_modules/.cache 2>/dev/null || true
npm install

echo ""
echo "=== 构建完成 ==="
echo "basic-extension: dist/ 已生成，可加载到 Chrome"
echo "web-app: 运行 'cd examples/web-app && npm run dev' 启动"
