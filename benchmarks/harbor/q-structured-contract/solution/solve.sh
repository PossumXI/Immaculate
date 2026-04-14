#!/bin/bash
set -euo pipefail

cat > /app/response.json <<'EOF'
{
  "route": "guarded",
  "reason": "Nonce mismatch and late ACK make the bridge untrusted, so the next step must stay fail-closed and truthful.",
  "commit": "Reject the forged ACK, keep delivery unacknowledged, and record the containment action in the audit trail."
}
EOF
