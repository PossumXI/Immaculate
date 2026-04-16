# BridgeBench

Generated at: `2026-04-15T23:26:02.954Z`
Release: `0.1.0+a252873`
Repo commit: `a252873`
Model lane surface: `direct-q-structured-contract`
Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2-86bf2b5-6207dd5e`
The Q lane below measures direct local Q structured-contract behavior, not the served Q gateway edge.

## Q Lane

### Q

- vendor: `Immaculate`
- parse success: `3/4`
- average latency: `91156.71 ms`
- P95 latency: `180039 ms`

## Bridge Runtime Lane

- pack: `substrate-readiness`
- suite: `immaculate-benchmark-2026-04-15T23-25-54-500Z`
- failed assertions: `0`

- actuation-protocols-registered: `pass` | target `visual+haptic+stim protocol profiles present` | actual `immaculate.visual.panel.v1:visual, immaculate.haptic.rig.v1:haptic, immaculate.stim.sandbox.v1:stim`
- actuation-bridge-link-live: `pass` | target `haptic-rig bridge ready under session scope` | actual `visual-panel:disconnected, haptic-rig:bench-haptic-01, stim-sandbox:disconnected`
- actuation-bridge-delivery: `pass` | target `one bridge dispatch / protocol-aware bridge transport / acknowledged` | actual `1 dispatches / bridge / allowed+device_intensity_clamped+device_bridge_ack`
- actuation-udp-delivery: `pass` | target `udp-osc transport / visual protocol frame / encoded command payload` | actual `udp-osc / /immaculate/visual/v1 / benchmark:visual-udp`
- actuation-serial-transport-registered: `pass` | target `registered serial-json transport with vendor/model and heartbeat policy` | actual `atx-fnv1a-a0bad172:http2-json:immaculate-labs:healthy, atx-fnv1a-95cdcdba:serial-json:immaculate-labs:healthy, atx-fnv1a-5799a0c4:udp-osc:generic:healthy`
- actuation-serial-heartbeat: `pass` | target `healthy heartbeat with full capability coverage` | actual `healthy / 3.2 ms / fw-serial-1.0.0`
- actuation-serial-delivery: `pass` | target `serial-json delivery with persisted vendor payload` | actual `serial-json / benchmark:serial-feedback / immaculate.haptic.rig.v1`
- actuation-serial-isolation: `pass` | target `isolated transport with file continuity on stale heartbeat` | actual `isolated / heartbeat_timeout / file`
- actuation-serial-recovery: `pass` | target `reset clears isolation, heartbeat restores health, direct serial delivery resumes` | actual `degraded -> healthy -> serial-json`
- actuation-http2-transport-registered: `pass` | target `registered http2-json transport with vendor/model and heartbeat policy` | actual `atx-fnv1a-a0bad172:http2-json:immaculate-labs:haptic-rpc-s2:20/5000:healthy, atx-fnv1a-95cdcdba:serial-json:immaculate-labs:haptic-bridge-s1:20/5000:healthy, atx-fnv1a-5799a0c4:udp-osc:generic:udp-osc:5000/15000:healthy`
- actuation-http2-heartbeat: `pass` | target `healthy heartbeat with low latency and full capability coverage` | actual `healthy / 1.9 ms / fw-http2-0.9.0`
- actuation-http2-preferred-delivery: `pass` | target `http2-json delivery selected over other healthy haptic transports` | actual `http2-json / benchmark:http2-preferred / allowed+http2_json_transport+http2_device_ack`
