# BridgeBench

Generated at: `2026-04-22T13:49:35.931Z`
Release: `0.1.0+8d26389`
Repo commit: `8d26389`
Model lane surface: `direct-q-structured-contract`
Q foundation model: `Gemma 4`
Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`
The Q lane below measures direct local Q structured-contract behavior, not the served Q gateway edge.

## Q Lane

### Q

- vendor: `Arobi Technology Alliance`
- parse success: `4/4`
- average latency: `27388.1 ms`
- P95 latency: `42892.09 ms`

## Bridge Runtime Lane

- pack: `substrate-readiness`
- suite: `immaculate-benchmark-2026-04-22T13-49-17-122Z`
- failed assertions: `0`

- actuation-protocols-registered: `pass` | target `visual+haptic+stim protocol profiles present` | actual `immaculate.visual.panel.v1:visual, immaculate.haptic.rig.v1:haptic, immaculate.stim.sandbox.v1:stim`
- actuation-bridge-link-live: `pass` | target `haptic-rig bridge ready under session scope` | actual `visual-panel:disconnected, haptic-rig:bench-haptic-01, stim-sandbox:disconnected`
- actuation-bridge-delivery: `pass` | target `one bridge dispatch / protocol-aware bridge transport / acknowledged` | actual `1 dispatches / bridge / allowed+device_intensity_clamped+device_bridge_ack`
- actuation-udp-delivery: `pass` | target `udp-osc transport / visual protocol frame / encoded command payload` | actual `udp-osc / /immaculate/visual/v1 / benchmark:visual-udp`
- actuation-serial-transport-registered: `pass` | target `registered serial-json transport with vendor/model and heartbeat policy` | actual `atx-fnv1a-ca651cf4:http2-json:immaculate-labs:healthy, atx-fnv1a-f843c321:serial-json:immaculate-labs:healthy, atx-fnv1a-b49690b8:udp-osc:generic:healthy`
- actuation-serial-heartbeat: `pass` | target `healthy heartbeat with full capability coverage` | actual `healthy / 3.2 ms / fw-serial-1.0.0`
- actuation-serial-delivery: `pass` | target `serial-json delivery with persisted vendor payload` | actual `serial-json / benchmark:serial-feedback / immaculate.haptic.rig.v1`
- actuation-serial-isolation: `pass` | target `isolated transport with file continuity on stale heartbeat` | actual `isolated / heartbeat_timeout / file`
- actuation-serial-recovery: `pass` | target `reset clears isolation, heartbeat restores health, direct serial delivery resumes` | actual `degraded -> healthy -> serial-json`
- actuation-http2-transport-registered: `pass` | target `registered http2-json transport with vendor/model and heartbeat policy` | actual `atx-fnv1a-ca651cf4:http2-json:immaculate-labs:haptic-rpc-s2:20/5000:healthy, atx-fnv1a-f843c321:serial-json:immaculate-labs:haptic-bridge-s1:20/5000:healthy, atx-fnv1a-b49690b8:udp-osc:generic:udp-osc:5000/15000:healthy`
- actuation-http2-heartbeat: `pass` | target `healthy heartbeat with low latency and full capability coverage` | actual `healthy / 1.9 ms / fw-http2-0.9.0`
- actuation-http2-preferred-delivery: `pass` | target `http2-json delivery selected over other healthy haptic transports` | actual `http2-json / benchmark:http2-preferred / allowed+http2_json_transport+http2_device_ack`
