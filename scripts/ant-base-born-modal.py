#!/usr/bin/env python3
"""All-active pole checks on the frozen Born operators; no perceptual claim."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("prior_modal", Path(__file__).with_name("ant-sonic-modal-transfer.py"))
PRIOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PRIOR)
EVIDENCE = ROOT / "docs/ant/evidence/2026-10-14-base-born-causal-decomposition"
INDEX = ROOT / "test-results/ant-base-born-causal-decomposition-20261014/render-index.json"
TOPOLOGIES = ROOT / "test-results/ant-plate-sonic-individuality-20261013/modal-topologies.json"


def pole(q, b, tension, d, gamma, rate):
    a, product = 2-d-(tension+gamma)*q-b*q*q, 1-d-gamma*q
    stable = (-1 < product < 1 and 1-a+product > 0 and 1+a+product > 0)
    roots = np.roots([1, -a, product])
    result = {"stable": bool(stable), "a": a, "product": product,
              "inputGain": product, "maxPoleMagnitude": float(np.max(np.abs(roots)))}
    if a*a < 4*product:
        angle = math.acos(a/(2*math.sqrt(product)))
        result.update(frequencyHz=rate*angle/(2*math.pi), decayTauSeconds=-2/(rate*math.log(product)))
    else:
        result["realRoots"] = [float(x) for x in roots]
    return result


def main():
    index = json.loads(INDEX.read_text())
    topologies = {t["key"]: t for t in json.loads(TOPOLOGIES.read_text())}
    rows = []
    for selected in index["selected"]:
        key = selected["key"]
        q = -np.linalg.eigvalsh(PRIOR.laplacian(topologies[key]))
        assert np.all(q > 0) and abs(np.median(q)-4) < 1e-10
        base = next(r for r in index["rows"] if r["id"] == key+"-baseline")
        b, tension, density, coeff_d = base["coefficients"]
        native = [pole(float(x), b, tension/density, coeff_d*50, 0, 6000) for x in q]
        variants = []
        for row in index["rows"]:
            if row["plateKey"] != key or row.get("isBaseReference"):
                continue
            vb, vt, vrho, vd = row["coefficients"]
            gamma = row.get("definition", {}).get("frequencyLoss", 0)
            rate = row["physicsRate"]
            modes = [pole(float(x), vb, vt/vrho, vd*50, gamma, rate) for x in q]
            assert all(m["stable"] and "frequencyHz" in m for m in modes), row["id"]
            result = {"condition": row["condition"], "allModesStable": True,
                      "frequencyHz": PRIOR.finite_quantiles([m["frequencyHz"] for m in modes]),
                      "decayTauSeconds": PRIOR.finite_quantiles([m["decayTauSeconds"] for m in modes]),
                      "q4": pole(4.0, vb, vt/vrho, vd*50, gamma, rate)}
            if row["condition"] == "rate-aware-48":
                error = [100*(a["frequencyHz"]/n["frequencyHz"]-1) for a,n in zip(modes,native)]
                result["frequencyErrorPercentVersusExactPoleResampling"] = PRIOR.finite_quantiles(error)
            variants.append(result)
        generic = next(r for r in index["rows"] if r["plateKey"] == key and r.get("isBaseReference"))["coefficients"]
        generic_on_born = [pole(float(x), generic["stiffness"], generic["tension"], generic["loss"], generic["frequencyLoss"], 48000) for x in q]
        rows.append({"key": key, "nodes": len(q), "q": PRIOR.finite_quantiles(q), "conditions": variants,
                     "fullBaseLawOnBornAt48kPredictedOnly": {
                         "frequencyHz": PRIOR.finite_quantiles([m["frequencyHz"] for m in generic_on_born]),
                         "decayTauSeconds": PRIOR.finite_quantiles([m["decayTauSeconds"] for m in generic_on_born])}})
    forbidden = pole(4, .01041070909374015*64, .0012476847034339226*64, .000178*8, .0000616140594288357*8, 6000)
    assert not forbidden["stable"] and forbidden["maxPoleMagnitude"] > 1
    # A scalar velocity loss has a q-independent pole radius, unlike gamma loss.
    assert abs(pole(1,.009,.0002/1.2,.000765,0,6000)["decayTauSeconds"]
               - pole(4,.009,.0002/1.2,.000765,0,6000)["decayTauSeconds"]) < 1e-12
    result = {"meaning": "linear all-active homogeneous poles and previous-state input gain B(q); no eigenvector participation, sleep, field/readout prediction or audibility claim",
              "equation": "x[n+1]=(2-d-(tau+gamma)q-bq^2)x[n]-(1-d-gamma*q)x[n-1]+(1-d-gamma*q)f[n]",
              "rateReference": "exact free poles p48=p6^(1/8); local /64 elastic approximation is bounded, not exact forced equivalence",
              "sourceHashes": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__).resolve(),TOPOLOGIES,INDEX]},
              "fullBaseTimescaleAt6kRejectedWithoutRenderingQ4": forbidden, "plates": rows}
    (EVIDENCE/"modal-audit.json").write_text(json.dumps(result, separators=(",", ":"), allow_nan=False)+"\n")


if __name__ == "__main__":
    main()
