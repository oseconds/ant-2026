"""Verify the isolated first-pass inventory without rerunning physical models."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/ant/evidence/2026-11-02-multiphysics-first-pass"
AUTHORITY = "5bdd516b412d03d78c2511ceb372180941206968"
BASE = "796d5c7f6c028ea47ca99825d58f15bad3fbc5cc"
BINARY = {".gz", ".npz", ".npy", ".png", ".wav"}


def file_bytes(path: Path) -> bytes:
    data = path.read_bytes()
    return data if path.suffix.lower() in BINARY else data.replace(b"\r\n", b"\n")


def receipt(path: Path) -> dict:
    data = file_bytes(path)
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}


def verify_entries(entries: list[dict]) -> None:
    seen = set()
    for entry in entries:
        path = (ROOT / entry["path"]).resolve()
        if not path.is_relative_to(ROOT) or entry["path"] in seen:
            raise ValueError("Unsafe or duplicate inventory path")
        seen.add(entry["path"])
        if receipt(path) != entry:
            raise ValueError(f"Inventory mismatch: {entry['path']}")


def inventory() -> list[dict]:
    paths = {p for p in PACKAGE.rglob("*") if p.is_file()
             and p not in {PACKAGE / "manifest.json", PACKAGE / "SHA256SUMS"}}
    paths.update((ROOT / "scripts").glob("ant-multiphysics-*"))
    paths.update((ROOT / "scripts").glob("ant_multiphysics_*"))
    paths.update((ROOT / "tests").glob("test_ant_multiphysics*.py"))
    paths.update((ROOT / "tests").glob("ant-multiphysics-*.test.js"))
    paths.update(ROOT / p for p in [".gitattributes", "docs/ant/daily/README.md",
                 "docs/ant/daily/2026-11-02-multiphysics-first-pass.md"])
    return [receipt(p) for p in sorted(paths) if p.is_file()]


def protected_paths() -> None:
    paths = ["src", "static", "docs/ant/README.md", "docs/ant/world-model.md"]
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", AUTHORITY, "--", *paths], cwd=ROOT, text=True)
    if changed.strip():
        raise ValueError(f"Protected production/decision paths changed: {changed}")
    old_package = "docs/ant/evidence/2026-11-02-wet-film-formation-first-probe"
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", BASE, "--", old_package], cwd=ROOT, text=True)
    if changed.strip():
        raise ValueError("The previous wet-film package was modified")


def previous_inventory() -> int:
    prior = ROOT / "docs/ant/evidence/2026-11-02-wet-film-formation-first-probe/manifest.json"
    entries = json.loads(prior.read_text(encoding="utf-8"))["files"]
    for entry in entries:
        if entry["path"] == "docs/ant/daily/README.md":
            # The shared chronology index is intentionally extended by each pass.
            data = subprocess.check_output(["git", "show", f"{BASE}:{entry['path']}"], cwd=ROOT)
            data = data.replace(b"\r\n", b"\n")
            if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise ValueError("Pinned prior chronology index mismatch")
        else:
            path = ROOT / entry["path"]
            data = path.read_bytes()
            # Preserve the older verifier's narrower text convention exactly.
            if path.suffix in {".md", ".py", ".json", ".csv", ".txt", ".svg"} or path.name == "SHA256SUMS":
                data = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
            if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise ValueError(f"Prior inventory mismatch: {entry['path']}")
    return len(entries)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-manifest", action="store_true")
    args = parser.parse_args()
    protected_paths()
    prior_entries = previous_inventory()
    manifest = PACKAGE / "manifest.json"
    sums = PACKAGE / "SHA256SUMS"
    if args.write_manifest:
        document = {
            "schema": "ant-multiphysics-first-pass-v1", "authority": AUTHORITY,
            "base": BASE, "audio_reference": "918764c2d4924eb89fd6874122edc30b73d1499c",
            "branch": "codex/ant-multiphysics-first-pass-20261102",
            "convention": "LF-canonical text; gzip/NPZ/NPY/PNG/WAV raw bytes; excludes manifest and SHA256SUMS.",
            "files": inventory(),
        }
        manifest.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8", newline="\n")
        entries = document["files"] + [receipt(manifest)]
        sums.write_text("".join(f"{e['sha256']}  {e['path']}\n" for e in entries),
                        encoding="utf-8", newline="\n")
    document = json.loads(manifest.read_text(encoding="utf-8"))
    verify_entries(document["files"])
    if inventory() != document["files"]:
        raise ValueError("The package/script inventory changed")
    expected = "".join(f"{e['sha256']}  {e['path']}\n"
                       for e in document["files"] + [receipt(manifest)])
    if sums.read_text(encoding="utf-8").replace("\r\n", "\n") != expected:
        raise ValueError("SHA256SUMS disagrees with the manifest")
    print(json.dumps({"status": "PASS", "entries": len(document["files"]),
                      "previous_wet_film_entries": prior_entries,
                      "previous_wet_film_sums_entries_including_manifest": prior_entries + 1,
                      "prior_shared_daily_index": "verified at pinned base; live index intentionally extended",
                      "protected_paths": "unchanged", "manifest_sha256": receipt(manifest)["sha256"]}))


if __name__ == "__main__":
    main()
