"""Verify budgets/receipts and optionally rerun two bounded reference cases."""
import argparse
import csv
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

for _thread_var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ[_thread_var] = "1"
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT/"docs/ant/evidence/2026-11-02-wet-film-formation-first-probe"
AUTHORITY = "5bdd516b412d03d78c2511ceb372180941206968"
MANIFEST = PACKAGE/"manifest.json"
SUMS = PACKAGE/"SHA256SUMS"
TOOLS = ["ant_wet_film_core.py", "ant-wet-film-formation.py", "ant-wet-film-results.py",
         "ant-wet-film-atlas.py", "ant-wet-film-verify.py"]


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def canonical(path):
    data = path.read_bytes()
    if path.suffix in (".md", ".py", ".json", ".csv", ".txt", ".svg") or path.name == "SHA256SUMS":
        data = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return data


def receipt(path):
    data = canonical(path)
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())


def verify_numerics():
    changed = subprocess.check_output(["git", "diff", "--name-only", AUTHORITY, "--", "src", "static"], cwd=ROOT)
    assert not changed.strip(), "production source/static changed"
    summary = read_json(PACKAGE/"data/summary.json")
    assert summary["authority"] == AUTHORITY and len(summary["runs"]) == 25
    checked = []
    for run in summary["runs"]:
        name = run["id"]
        with (PACKAGE/"data"/(name+".csv")).open(newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        ts = np.array([float(r["time"]) for r in rows])
        assert ts[0] == 0 and np.all(np.diff(ts) > 0)
        assert abs(ts[-1]-run["endpoint"]) < 1e-12
        assert len(rows)-1 == run["accepted_steps"]
        masses = np.array([float(r["mass"]) for r in rows])
        expected = np.array([float(r["expected_mass"]) for r in rows])
        error = float(np.max(np.abs(masses-expected)))
        assert error <= 1e-8
        assert abs(error-run["max_absolute_mass_error"]) < 1e-14
        assert all(float(r["minimum_height"]) > 0 for r in rows)
        assert len(run["numerical_retry_ledger"]) == run["numerical_retry_count"]
        volumes = np.array([float(r["supplied_volume"]) for r in rows])
        assert np.max(np.abs(expected-expected[0]-(volumes-volumes[0]))) < 1e-12
        with np.load(PACKAGE/"data"/(name+".npz")) as z:
            assert np.all(np.isfinite(z["heights"][:, ~z["blocked"]]))
            assert np.all(np.isnan(z["heights"][:, z["blocked"]]))
            for time, field in zip(z["times"], z["heights"]):
                indices = np.flatnonzero(np.abs(ts-time) < 1e-12)
                assert len(indices) == 1
                row = rows[indices[0]]
                assert abs(np.nansum(field)/run["n"]**2-float(row["mass"])) < 1e-12
                assert abs(np.nanmax(field)-float(row["maximum_height"])) < 1e-12
        defect = None
        if run["arm"] == "film":
            steps = np.array([float(r["step"]) for r in rows[:-1]])
            assert np.max(np.abs(steps-np.diff(ts))) < 1e-12
            local = [float(r["energy_inequality_defect"]) for r in rows[:-1]]
            assert max(local) <= 1e-8
            energy = np.array([float(r["energy"]) for r in rows])
            work = np.array([float(r["source_energy_work"]) for r in rows])
            loss = np.array([float(r["cumulative_dt_dissipation"]) for r in rows])
            defect = float(np.max(energy-energy[0]-(work-work[0])+loss))
            assert defect <= 1e-8
        checked.append(dict(id=name, mass_error=error, energy_budget_max_defect=defect,
                            positive=True, snapshots_match_histories=True,
                            retries=run["numerical_retry_count"]))
    return dict(status="PASS", authority=AUTHORITY, production_source_diff_from_authority=[],
                checked_runs=len(checked), runs=checked)


def rerun():
    spec = importlib.util.spec_from_file_location("wet_campaign", ROOT/"scripts/ant-wet-film-formation.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    destination = ROOT/".cache/wet-film-first-probe/rerun"
    module.PACKAGE = destination
    receipts = []
    for case in ("pair", "ant"):
        result = module.run_case(case, "film")
        module.write_json(destination/"data"/(result["id"]+".json"), result)
        files = []
        for suffix in (".npz", ".csv", ".json"):
            name = result["id"]+suffix
            original = PACKAGE/"data"/name
            repeated = destination/"data"/name
            equal = canonical(original) == canonical(repeated)
            assert equal, f"deterministic rerun mismatch: {name}"
            files.append(dict(file=name, sha256=receipt(original)["sha256"], bytes_equal=equal,
                              raw_bytes_equal=original.read_bytes() == repeated.read_bytes()))
        receipts.append(dict(case=case, files=files))
        print(json.dumps(dict(rerun=case, status="BYTE_IDENTICAL")), flush=True)
    path = PACKAGE/"validation/deterministic-rerun.json"
    path.write_text(json.dumps(dict(status="PASS", runs=receipts,
                                    cache=destination.relative_to(ROOT).as_posix()), indent=2)+"\n", encoding="utf-8")


def manifest(write=False):
    files = sorted(p for p in PACKAGE.rglob("*") if p.is_file() and p not in (MANIFEST, SUMS))
    paths = files+[ROOT/"scripts"/p for p in TOOLS]
    paths += sorted((ROOT/"tests").glob("test_ant_wet_film*.py"))
    paths += [ROOT/"docs/ant/daily/2026-11-02-wet-film-formation-first-probe.md", ROOT/"docs/ant/daily/README.md"]
    paths += [ROOT/"src/lib/agents/ant"/p for p in ("SurfaceField.js", "TrailPlateBirth.js", "MaterialStratigraphy.js", "GaitController.js")]
    paths += [ROOT/"docs/ant/README.md", ROOT/"docs/ant/world-model.md",
              ROOT/"docs/ant/archive/2026-11-02-material-formation-physics-brainstorming/README.md"]
    paths += [ROOT/".gitattributes"]
    current = [receipt(p) for p in paths]
    if write:
        value = dict(schema="ant-wet-film-first-probe-manifest-v1", authority=AUTHORITY,
                     branch="codex/ant-wet-film-formation-first-probe-20261102",
                     convention="Text LF-normalized UTF-8; compressed arrays, gzip and PNG raw bytes; manifest excludes itself and SHA256SUMS.",
                     files=current)
        MANIFEST.write_text(json.dumps(value, indent=2)+"\n", encoding="utf-8")
        rows = current+[receipt(MANIFEST)]
        SUMS.write_text("# SHA-256; repository-relative paths; LF-normalized text and raw binary.\n"+
                        "".join(f"{r['sha256']}  {r['path']}\n" for r in rows), encoding="utf-8")
    saved = read_json(MANIFEST)
    assert saved["files"] == current, "manifest inventory or hashes differ"
    rows = current+[receipt(MANIFEST)]
    expected = "# SHA-256; repository-relative paths; LF-normalized text and raw binary.\n"+"".join(f"{r['sha256']}  {r['path']}\n" for r in rows)
    assert canonical(SUMS).decode() == expected
    print(json.dumps(dict(manifest="PASS", entries=len(rows), manifest_sha256=receipt(MANIFEST)["sha256"])))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rerun", action="store_true")
    parser.add_argument("--write-manifest", action="store_true")
    parser.add_argument("--manifest-only", action="store_true")
    args = parser.parse_args()
    if args.rerun:
        rerun()
    if not args.manifest_only:
        result = verify_numerics()
        path = PACKAGE/"validation/budgets.json"
        path.write_text(json.dumps(result, indent=2)+"\n", encoding="utf-8")
        print(json.dumps(dict(numerics="PASS", runs=result["checked_runs"])))
    if args.write_manifest or args.manifest_only:
        manifest(args.write_manifest)


if __name__ == "__main__":
    main()
