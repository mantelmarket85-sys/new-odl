#!/bin/bash
# Fast per-file JSX syntax check (low memory, no full vite build)
cd /home/user/webapp/lms-frontend
for f in "$@"; do
  OUT=$(npx esbuild "$f" --bundle \
    --external:react --external:react-dom --external:react-router-dom \
    --external:framer-motion --external:lucide-react --external:recharts \
    --loader:.js=jsx --jsx=automatic --outfile=/dev/null 2>&1)
  ERR=$(echo "$OUT" | grep -iE "error" | grep -v "import.meta")
  if [ -n "$ERR" ]; then
    echo "❌ $f"
    echo "$OUT" | grep -iE "error" -A4 | head -30
  else
    echo "✅ $f"
  fi
done
