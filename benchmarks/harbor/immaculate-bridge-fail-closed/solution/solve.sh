#!/bin/bash
set -euo pipefail

cat > /app/response.json <<'EOF'
{
  "route": "guarded",
  "reason": "Critical pressure, nonce replay, and degraded bridge health require a fail-closed route that stays truthful about delivery state.",
  "commit": "Quarantine the bridge ACK path, keep delivery unresolved, and route only through the verified direct lane if action remains allowed."
}
EOF
