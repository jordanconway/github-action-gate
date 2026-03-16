#!/usr/bin/env bash
# Patch the Prisma-generated client so it can run inside Cloudflare Workers
# where:
# - import.meta.url is undefined in bundled modules
# - the Node-only runtime must be swapped for the edge/wasm runtime
# - WASM cannot be compiled at runtime — it must be imported statically
#
# Run after `npx prisma generate`.

set -euo pipefail

GEN_DIR="src/generated/prisma"

if [ ! -d "$GEN_DIR" ]; then
  echo "⚠️  $GEN_DIR not found — skipping patch"
  exit 0
fi

# 1. Guard the fileURLToPath(import.meta.url) call in client.ts
sed -i.bak \
  "s|globalThis\['__dirname'\] = path.dirname(fileURLToPath(import.meta.url))|globalThis['__dirname'] = typeof import.meta.url === 'string' ? path.dirname(fileURLToPath(import.meta.url)) : '/'|" \
  "$GEN_DIR/client.ts"
rm -f "$GEN_DIR/client.ts.bak"

# 2. Swap the Node runtime for the edge/wasm runtime in all generated files
find "$GEN_DIR" -name '*.ts' -exec sed -i.bak \
  's|@prisma/client/runtime/client|@prisma/client/runtime/wasm-compiler-edge|g' {} +
find "$GEN_DIR" -name '*.bak' -delete

# 3. Extract the base64-encoded WASM query compiler to a raw .wasm file.
#    Cloudflare Workers forbid runtime WASM compilation — modules must be
#    imported statically so wrangler can pre-compile them at deploy time.
# 4. Patch class.ts to import the raw .wasm file instead of decoding base64.
CLASS_FILE="$GEN_DIR/internal/class.ts"
node -e "
  const fs = require('fs');

  // --- Extract WASM from base64 ---
  const b64Src = fs.readFileSync(
    'node_modules/@prisma/client/runtime/query_compiler_fast_bg.sqlite.wasm-base64.mjs',
    'utf8'
  );
  const match = b64Src.match(/const wasm = \"([^\"]+)\"/);
  if (!match) { console.error('Could not extract base64 WASM'); process.exit(1); }
  const wasmPath = '$GEN_DIR/internal/query_compiler_bg.wasm';
  fs.writeFileSync(wasmPath, Buffer.from(match[1], 'base64'));
  console.log('   Extracted WASM to ' + wasmPath + ' (' + fs.statSync(wasmPath).size + ' bytes)');

  // --- Patch class.ts ---
  let code = fs.readFileSync('$CLASS_FILE', 'utf8');

  // Add static WASM import after the runtime import
  code = code.replace(
    /^(import \* as runtime from .+)$/m,
    \"\\\$1\\n// @ts-ignore — .wasm import handled by wrangler bundler\\nimport queryCompilerWasmModule from './query_compiler_bg.wasm';\"
  );

  // Replace getQueryCompilerWasmModule to return the pre-compiled module
  code = code.replace(
    /getQueryCompilerWasmModule: async \(\) => \{[\s\S]*?return await decodeBase64AsWasm\(wasm\)\s*\}/,
    'getQueryCompilerWasmModule: async () => queryCompilerWasmModule'
  );

  fs.writeFileSync('$CLASS_FILE', code);
  console.log('   Patched class.ts for static WASM import');
"

echo "✅  Patched $GEN_DIR for Cloudflare Workers compatibility"
