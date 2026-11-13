#!/bin/bash
# Baut ../Tintenwerk.html aus den Quellen in dev/src (Reihenfolge = Dateinamen)
set -e
S="$(cd "$(dirname "$0")/../src" && pwd)"; OUT="${1:-$S/../../Tintenwerk.html}"
{ cat "$S/00_head.html" "$S/05_body.html"; echo '<script>'; cat "$S/10_glyphs.js" "$S/20_layout.js" "$S/30_export.js"; echo '</script>'; echo '<script>'; cat "$S/40_ui_core.js" "$S/50_ui_more.js"; echo '</script>'; echo '</body>'; echo '</html>'; } > "$OUT"
wc -c "$OUT"
