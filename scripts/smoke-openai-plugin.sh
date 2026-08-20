#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d)"
trap 'rm -rf -- "$temporary_root"' EXIT

cp -R "$repository_root/plugins/openai/nutty" "$temporary_root/nutty"

printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"nutty-plugin-smoke","version":"1.0.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_nutty_status","arguments":{}}}' \
  | NUTTY_CONFIG_PATH="$temporary_root/missing-config.json" \
      node "$temporary_root/nutty/mcp/server.mjs" \
  > "$temporary_root/responses.ndjson"

for tool in \
  save_memory \
  search_memories \
  get_memory \
  update_memory \
  list_destinations \
  get_nutty_status \
  configure_nutty
do
  grep -Fq "\"name\":\"$tool\"" "$temporary_root/responses.ndjson"
done

grep -Fq '"structuredContent":{"configured":false}' "$temporary_root/responses.ndjson"
printf '%s\n' 'Bundled Nutty plugin smoke test passed.'
