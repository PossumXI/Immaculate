import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


def fail(message: str, code: int = 1) -> None:
    raise SystemExit(message)


try:
    import wandb  # type: ignore
except Exception as exc:  # pragma: no cover
    fail(f"Unable to import wandb: {exc}")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def status_json_path() -> Path:
    return repo_root() / "docs" / "wiki" / "Benchmark-Status.json"


def export_json_path() -> Path:
    return repo_root() / "docs" / "wiki" / "Benchmark-Wandb-Export.json"


def export_markdown_path() -> Path:
    return repo_root() / "docs" / "wiki" / "Benchmark-Wandb-Export.md"


def load_status() -> dict:
    path = status_json_path()
    if not path.exists():
      fail(f"Missing benchmark status file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def run_path_from_url(run_url: str) -> str:
    parsed = urlparse(run_url)
    return parsed.path.strip("/")


def benchmark_artifact(run) -> object | None:
    for artifact in run.logged_artifacts():
        if getattr(artifact, "type", None) == "benchmark-report":
            return artifact
    return None


def export_runs(status: dict) -> dict:
    api = wandb.Api()
    publications = status.get("publications", {}) or {}
    exported_packs: list[dict] = []

    for pack_id, publication in sorted(
        publications.items(),
        key=lambda item: str(item[1].get("generatedAt") or ""),
        reverse=True,
    ):
        run_url = publication.get("runUrl")
        if not run_url:
            continue
        run = api.run(run_path_from_url(run_url))
        artifact = benchmark_artifact(run)
        exported_packs.append(
            {
                "packId": pack_id,
                "packLabel": publication.get("packLabel"),
                "suiteId": publication.get("suiteId"),
                "generatedAt": publication.get("generatedAt"),
                "publishedAt": publication.get("publishedAt"),
                "runId": run.id,
                "runName": run.name,
                "runUrl": run.url,
                "runState": getattr(run, "state", None),
                "summary": {
                    "benchmark/run_kind": run.summary.get("benchmark/run_kind"),
                    "benchmark/current_stage": run.summary.get("benchmark/current_stage"),
                    "benchmark/failed_assertions": run.summary.get("benchmark/failed_assertions"),
                    "benchmark/integrity_status": run.summary.get("benchmark/integrity_status"),
                    "benchmark/planned_duration_ms": run.summary.get("benchmark/planned_duration_ms"),
                    "benchmark/wall_clock_duration_ms": run.summary.get("benchmark/wall_clock_duration_ms"),
                    "benchmark/hardware": run.summary.get("benchmark/hardware"),
                    "benchmark/owner": run.summary.get("benchmark/owner"),
                    "benchmark/role": run.summary.get("benchmark/role"),
                    "benchmark/website": run.summary.get("benchmark/website"),
                },
                "artifact": {
                    "name": getattr(artifact, "name", None),
                    "type": getattr(artifact, "type", None),
                    "aliases": list(getattr(artifact, "aliases", []) or []),
                    "metadata": dict(getattr(artifact, "metadata", {}) or {}),
                }
                if artifact
                else None,
            }
        )

    return {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "entity": status.get("entity"),
        "project": status.get("project"),
        "projectUrl": status.get("projectUrl"),
        "owner": status.get("owner"),
        "role": status.get("role"),
        "website": status.get("website"),
        "packs": exported_packs,
    }


def render_markdown(export: dict) -> str:
    lines = [
        "# W&B Benchmark Export",
        "",
        "This page is exported from live W&B benchmark runs and committed into the repo wiki.",
        "",
        f"- Exported at: {export.get('exportedAt')}",
        f"- W&B project: {export.get('projectUrl')}",
        f"- Owner: {export.get('owner')}",
        f"- Role: {export.get('role')}",
        f"- Website: {export.get('website')}",
        "",
        "## Exported Runs",
        "",
    ]

    packs = export.get("packs", []) or []
    if not packs:
        lines.extend(["No W&B benchmark runs were exported.", ""])
        return "\n".join(lines).rstrip() + "\n"

    for pack in packs:
        summary = pack.get("summary", {}) or {}
        artifact = pack.get("artifact", {}) or {}
        lines.extend(
            [
                f"### {pack.get('packLabel') or pack.get('packId') or 'Unknown Pack'}",
                "",
                f"- Suite: `{pack.get('suiteId')}`",
                f"- Run ID: `{pack.get('runId')}`",
                f"- Run name: `{pack.get('runName')}`",
                f"- Run URL: {pack.get('runUrl')}",
                f"- State: `{pack.get('runState')}`",
                f"- Generated: `{pack.get('generatedAt')}`",
                f"- Published: `{pack.get('publishedAt')}`",
                f"- Failed assertions: `{summary.get('benchmark/failed_assertions')}`",
                f"- Run kind: `{summary.get('benchmark/run_kind')}`",
                f"- Integrity: `{summary.get('benchmark/integrity_status')}`",
                f"- Stage: `{summary.get('benchmark/current_stage')}`",
                f"- Planned duration: `{summary.get('benchmark/planned_duration_ms')}` ms",
                f"- Wall-clock duration: `{summary.get('benchmark/wall_clock_duration_ms')}` ms",
                f"- Hardware: `{summary.get('benchmark/hardware')}`",
                f"- Owner: `{summary.get('benchmark/owner')}`",
                f"- Role: `{summary.get('benchmark/role')}`",
                f"- Website: `{summary.get('benchmark/website')}`",
                f"- Benchmark artifact: `{artifact.get('name')}`",
                f"- Artifact aliases: `{', '.join(artifact.get('aliases', [])) if artifact else ''}`",
                "",
            ]
        )

    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    if not (os.getenv("WANDB_API_KEY") or os.getenv("IMMACULATE_WANDB_API_KEY")):
        fail("Set WANDB_API_KEY or IMMACULATE_WANDB_API_KEY before exporting W&B benchmarks.")

    export = export_runs(load_status())
    json_path = export_json_path()
    markdown_path = export_markdown_path()
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(f"{json.dumps(export, indent=2)}\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(export), encoding="utf-8")
    print(
        json.dumps(
            {
                "exportJsonPath": str(json_path),
                "exportMarkdownPath": str(markdown_path),
                "projectUrl": export.get("projectUrl"),
                "packCount": len(export.get("packs", [])),
            }
        )
    )


if __name__ == "__main__":
    main()
