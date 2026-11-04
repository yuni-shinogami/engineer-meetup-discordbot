#!/bin/sh
# docs/dependency-graph.md（依存関係の図）を作り直す。npm run deps:graph から呼ぶ。
# vrchat/・x/ などの部品と、discordbot/ の features/<機能>/・commands/・activity/ はフォルダーごとに 1 つにまとめる。
set -eu
cd "$(dirname "$0")/.."

out=docs/dependency-graph.md
{
  echo '# 依存関係の図'
  echo
  echo '`npm run deps:graph` で作り直す（手で書き換えない）。矢印は「import している → されている」。'
  echo 'フォルダーの枠だけのもの（features の各機能・commands など）は、中のファイルを 1 つにまとめている。'
  echo
  echo '```mermaid'
  npx depcruise src \
    --config .dependency-cruiser.cjs \
    --include-only '^src/' \
    --collapse '^src/(discordbot/(features/[^/]+|commands|activity)|vrchat|x|canva|image-gen|video)/' \
    --output-type mermaid
  echo '```'
} > "$out"
echo "書き出しました: $out"
