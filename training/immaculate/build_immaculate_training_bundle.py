import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path_value: Path) -> dict:
    payload = json.loads(path_value.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path_value} must contain a JSON object.")
    return payload


def git_value(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(root),
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return "unknown"
    value = result.stdout.strip()
    return value or "unknown"


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def relative_path(root: Path, path_value: Path) -> str:
    try:
        return str(path_value.resolve().relative_to(root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path_value.resolve()).replace("\\", "/")


def pick_q_model(report: dict) -> dict | None:
    models = report.get("models")
    if not isinstance(models, list):
        return None
    for model in models:
        if not isinstance(model, dict):
            continue
        requested = str(model.get("requestedModel", "")).strip().lower()
        display = str(model.get("displayName", "")).strip()
        truthful = str(model.get("truthfulLabel", "")).strip()
        if requested == "q" or display == "Q" or truthful == "Q" or truthful.startswith("Q"):
            return model
    return None


def build_signals(harbor: dict, bridgebench: dict, comparison: dict, gateway_validation: dict, readiness_gate: dict) -> list[dict]:
    signals: list[dict] = []

    for task in harbor.get("tasks", []):
        if not isinstance(task, dict):
            continue
        q_lane = task.get("qGateway", {})
        if not isinstance(q_lane, dict):
            continue
        response = q_lane.get("response", {})
        if not isinstance(response, dict):
            response = {}
        signals.append(
            {
                "kind": "harbor",
                "id": task.get("id"),
                "label": task.get("label"),
                "score": q_lane.get("score"),
                "durationSec": q_lane.get("durationSec"),
                "route": response.get("route"),
                "reason": response.get("reason"),
                "commit": response.get("commit"),
            }
        )

    q_bridge_model = pick_q_model(bridgebench) or {}
    for task in q_bridge_model.get("tasks", []):
        if not isinstance(task, dict):
            continue
        signals.append(
            {
                "kind": "bridgebench",
                "id": task.get("scenarioId"),
                "label": task.get("label"),
                "parseSuccess": task.get("parseSuccess"),
                "latencyMs": task.get("latencyMs"),
                "route": task.get("routeSuggestion"),
                "reason": task.get("reasonSummary"),
                "commit": task.get("commitStatement"),
            }
        )

    q_comparison_model = pick_q_model(comparison) or {}
    for task in q_comparison_model.get("tasks", []):
        if not isinstance(task, dict):
            continue
        signals.append(
            {
                "kind": "model-comparison",
                "id": task.get("taskId"),
                "label": task.get("label"),
                "parseSuccess": task.get("parseSuccess"),
                "latencyMs": task.get("latencyMs"),
                "route": task.get("routeSuggestion"),
                "reason": task.get("reasonSummary"),
                "commit": task.get("commitStatement"),
            }
        )

    checks = gateway_validation.get("checks", {})
    if isinstance(checks, dict):
        health = checks.get("health", {})
        if isinstance(health, dict):
            signals.append(
                {
                    "kind": "gateway-validation",
                    "id": "gateway-health",
                    "label": "Dedicated Q gateway health",
                    "status": health.get("status"),
                    "wallLatencyMs": health.get("wallLatencyMs"),
                    "ready": health.get("body", {}).get("modelReady") if isinstance(health.get("body"), dict) else None,
                }
            )
        authorized_chat = checks.get("authorizedChat", {})
        if isinstance(authorized_chat, dict):
            body = authorized_chat.get("body", {})
            content = None
            if isinstance(body, dict):
                choices = body.get("choices", [])
                if isinstance(choices, list) and choices and isinstance(choices[0], dict):
                    message = choices[0].get("message", {})
                    if isinstance(message, dict):
                        content = message.get("content")
            signals.append(
                {
                    "kind": "gateway-validation",
                    "id": "gateway-authorized-chat",
                    "label": "Dedicated Q gateway keyed chat",
                    "status": authorized_chat.get("status"),
                    "wallLatencyMs": authorized_chat.get("wallLatencyMs"),
                    "route": content,
                }
            )
        concurrent_rejection = checks.get("concurrentRejection", {})
        if isinstance(concurrent_rejection, dict):
            signals.append(
                {
                    "kind": "gateway-validation",
                    "id": "gateway-concurrency-rejection",
                    "label": "Dedicated Q gateway concurrency rejection",
                    "status": concurrent_rejection.get("status"),
                    "wallLatencyMs": concurrent_rejection.get("wallLatencyMs"),
                }
            )

    signals.append(
        {
            "kind": "readiness-gate",
            "id": "q-readiness-gate",
            "label": "Direct Q readiness gate",
            "ready": readiness_gate.get("ready"),
            "threshold": readiness_gate.get("threshold"),
            "reasons": readiness_gate.get("reasons", []),
        }
    )

    return signals


def build_bundle(
    output_path: Path,
    harbor_path: Path,
    bridgebench_path: Path,
    comparison_path: Path,
    gateway_validation_path: Path,
    readiness_gate_path: Path,
) -> dict:
    root = repo_root()
    harbor = load_json(harbor_path)
    bridgebench = load_json(bridgebench_path)
    comparison = load_json(comparison_path)
    gateway_validation = load_json(gateway_validation_path)
    readiness_gate = load_json(readiness_gate_path)

    sources = [
        {"label": "Harbor terminal bench", "path": relative_path(root, harbor_path), "generatedAt": harbor.get("generatedAt")},
        {"label": "BridgeBench", "path": relative_path(root, bridgebench_path), "generatedAt": bridgebench.get("generatedAt")},
        {
            "label": "Q structured contract benchmark",
            "path": relative_path(root, comparison_path),
            "generatedAt": comparison.get("generatedAt"),
        },
        {
            "label": "Q gateway validation",
            "path": relative_path(root, gateway_validation_path),
            "generatedAt": gateway_validation.get("generatedAt"),
        },
        {
            "label": "Q readiness gate",
            "path": relative_path(root, readiness_gate_path),
            "generatedAt": readiness_gate.get("generatedAt"),
        },
    ]

    q_bridge_model = pick_q_model(bridgebench)
    q_comparison_model = pick_q_model(comparison)
    signals = build_signals(harbor, bridgebench, comparison, gateway_validation, readiness_gate)
    signal_hash = sha256_text(json.dumps(signals, sort_keys=True))
    git_short_sha = git_value(root, "rev-parse", "--short=7", "HEAD")

    bundle = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "bundleKind": "immaculate-orchestration-training",
        "bundleId": f"immaculate-orchestration-{git_short_sha}-{signal_hash[:8]}",
        "repo": {
            "gitSha": git_value(root, "rev-parse", "HEAD"),
            "gitShortSha": git_short_sha,
            "packageVersion": load_json(root / "package.json").get("version", "0.0.0"),
        },
        "sources": sources,
        "summary": {
            "sourceCount": len(sources),
            "signalCount": len(signals),
            "harborTaskCount": len(harbor.get("tasks", [])) if isinstance(harbor.get("tasks"), list) else 0,
            "bridgebenchScenarioCount": len(q_bridge_model.get("tasks", [])) if isinstance(q_bridge_model, dict) else 0,
            "comparisonTaskCount": len(q_comparison_model.get("tasks", [])) if isinstance(q_comparison_model, dict) else 0,
            "qReady": readiness_gate.get("ready"),
        },
        "signals": signals,
        "truthBoundary": [
            "This bundle is for improving Immaculate orchestration logic, evals, and routing policy review.",
            "It does not claim a second separate weight family outside the tracked Q training lane.",
        ],
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    latest_path = root / ".training-output" / "immaculate" / "latest-training-bundle.json"
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    latest_path.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    return {"bundle": bundle, "latestPath": latest_path}


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Build the Immaculate orchestration training bundle from live repo surfaces.")
    parser.add_argument(
        "--output",
        default=str(root / ".training-output" / "immaculate" / "immaculate-training-bundle.json"),
        help="Output path for the bundle JSON.",
    )
    parser.add_argument(
        "--harbor",
        default=str(root / "docs" / "wiki" / "Harbor-Terminal-Bench.json"),
        help="Path to Harbor-Terminal-Bench.json",
    )
    parser.add_argument(
        "--bridgebench",
        default=str(root / "docs" / "wiki" / "BridgeBench.json"),
        help="Path to BridgeBench.json",
    )
    parser.add_argument(
        "--model-comparison",
        default=str(root / "docs" / "wiki" / "Model-Benchmark-Comparison.json"),
        help="Path to Model-Benchmark-Comparison.json",
    )
    parser.add_argument(
        "--gateway-validation",
        default=str(root / "docs" / "wiki" / "Q-Gateway-Validation.json"),
        help="Path to Q-Gateway-Validation.json",
    )
    parser.add_argument(
        "--readiness-gate",
        default=str(root / "docs" / "wiki" / "Q-Readiness-Gate.json"),
        help="Path to Q-Readiness-Gate.json",
    )
    args = parser.parse_args()

    result = build_bundle(
        output_path=Path(args.output).resolve(),
        harbor_path=Path(args.harbor).resolve(),
        bridgebench_path=Path(args.bridgebench).resolve(),
        comparison_path=Path(args.model_comparison).resolve(),
        gateway_validation_path=Path(args.gateway_validation).resolve(),
        readiness_gate_path=Path(args.readiness_gate).resolve(),
    )

    print(
        json.dumps(
            {
                "accepted": True,
                "bundle_id": result["bundle"]["bundleId"],
                "signal_count": result["bundle"]["summary"]["signalCount"],
                "output": str(Path(args.output).resolve()),
                "latest": str(result["latestPath"].resolve()),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
