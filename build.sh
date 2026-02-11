#!/bin/bash
# 构建脚本 - 清除缓存后重新构建 examples

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 清除缓存 ==="
cd "$SCRIPT_DIR"
rm -rf node_modules/.cache 2>/dev/null || true

echo "=== 构建 basic-extension ==="
cd "$SCRIPT_DIR/examples/basic-extension"
rm -rf node_modules/.cache dist 2>/dev/null || true
npm install
npx vite build

echo "=== 准备 web-app ==="
cd "$SCRIPT_DIR/examples/web-app"
rm -rf node_modules/.cache 2>/dev/null || true
if [ ! -f ".env" ]; then
  echo ".env 不存在，从 .env.example 生成..."
  cp .env.example .env
  echo ".env 已生成"
fi
npm install

echo ""
echo "=== 构建完成 ==="
echo "basic-extension: dist/ 已生成，可加载到 Chrome"
echo "web-app: 运行 'cd examples/web-app && npm run dev' 启动"
