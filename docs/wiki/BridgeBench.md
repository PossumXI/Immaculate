# BridgeBench

Generated at: `2026-04-14T00:39:17.379Z`

## Model Lane

### Q (gemma4:e4b)

- vendor: `Google DeepMind`
- parse success: `0/4`
- average latency: `41822.28 ms`
- P95 latency: `65737.04 ms`

### gemma3:4b

- vendor: `Google DeepMind`
- parse success: `4/4`
- average latency: `20167.37 ms`
- P95 latency: `30130.14 ms`

### qwen3:8b

- vendor: `Alibaba Cloud`
- parse success: `0/4`
- average latency: `79419.19 ms`
- P95 latency: `164256.62 ms`

## Bridge Runtime Lane

- pack: `substrate-readiness`
- suite: `immaculate-benchmark-2026-04-14T00-39-08-197Z`
- failed assertions: `0`

- actuation-protocols-registered: `pass` | target `visual+haptic+stim protocol profiles present` | actual `immaculate.visual.panel.v1:visual, immaculate.haptic.rig.v1:haptic, immaculate.stim.sandbox.v1:stim`
- actuation-bridge-link-live: `pass` | target `haptic-rig bridge ready under session scope` | actual `visual-panel:disconnected, haptic-rig:bench-haptic-01, stim-sandbox:disconnected`
- actuation-bridge-delivery: `pass` | target `one bridge dispatch / protocol-aware bridge transport / acknowledged` | actual `1 dispatches / bridge / allowed+device_intensity_clamped+device_bridge_ack`
- actuation-udp-delivery: `pass` | target `udp-osc transport / visual protocol frame / encoded command payload` | actual `udp-osc / /immaculate/visual/v1 / benchmark:visual-udp`
- actuation-serial-transport-registered: `pass` | target `registered serial-json transport with vendor/model and heartbeat policy` | actual `atx-fnv1a-93daf0c7:http2-json:immaculate-labs:healthy, atx-fnv1a-1f1b60de:serial-json:immaculate-labs:healthy, atx-fnv1a-504f6e50:udp-osc:generic:healthy`
- actuation-serial-heartbeat: `pass` | target `healthy heartbeat with full capability coverage` | actual `healthy / 3.2 ms / fw-serial-1.0.0`
- actuation-serial-delivery: `pass` | target `serial-json delivery with persisted vendor payload` | actual `serial-json / benchmark:serial-feedback / immaculate.haptic.rig.v1`
- actuation-serial-isolation: `pass` | target `isolated transport with file fallback on stale heartbeat` | actual `isolated / heartbeat_timeout / file`
- actuation-serial-recovery: `pass` | target `reset clears isolation, heartbeat restores health, direct serial delivery resumes` | actual `degraded -> healthy -> serial-json`
- actuation-http2-transport-registered: `pass` | target `registered http2-json transport with vendor/model and heartbeat policy` | actual `atx-fnv1a-93daf0c7:http2-json:immaculate-labs:haptic-rpc-s2:20/5000:healthy, atx-fnv1a-1f1b60de:serial-json:immaculate-labs:haptic-bridge-s1:20/5000:healthy, atx-fnv1a-504f6e50:udp-osc:generic:udp-osc:5000/15000:healthy`
- actuation-http2-heartbeat: `pass` | target `healthy heartbeat with low latency and full capability coverage` | actual `healthy / 1.9 ms / fw-http2-0.9.0`
- actuation-http2-preferred-delivery: `pass` | target `http2-json delivery selected over other healthy haptic transports` | actual `http2-json / benchmark:http2-preferred / allowed+http2_json_transport+http2_device_ack`

## Orchestrator Baseline

- temporal suite: `immaculate-benchmark-2026-04-13T22-40-03-299Z`
- failed assertions: `0`
- workflow wall-clock P95: Immaculate `0 ms` / Temporal `0 ms`
