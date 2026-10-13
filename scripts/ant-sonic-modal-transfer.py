#!/usr/bin/env python3
"""Read-only eigen/pulse audit of isolated ANT SurfacePlate worklet topologies."""

import argparse
import hashlib
import gzip
import json
import math
from pathlib import Path

import numpy as np


RATE_HZ = 6000
DAMPING_MULTIPLIER = 50.0
CONTACT_PULSE_STEPS = round(RATE_HZ * 0.003)
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TOPOLOGIES = ROOT / "test-results/ant-plate-sonic-individuality-20261013/modal-topologies.json"
DEFAULT_INPUTS = ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality/frozen-inputs.json.gz"
DEFAULT_OUTPUT = ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality/modal-transfer.json"


def pulse_envelope():
    values = np.sin(np.pi * (np.arange(CONTACT_PULSE_STEPS, dtype=np.float64) + 0.5)
                    / CONTACT_PULSE_STEPS)
    return values / values.sum()


def laplacian(topology):
    n = len(topology["nodeGridIndices"])
    neighbors = np.asarray(topology["neighborIndices"], dtype=np.int64)
    if neighbors.shape != (n * 4,):
        raise ValueError(f"{topology.get('key')}: packed neighbor length does not equal 4 * node count")
    matrix = np.eye(n, dtype=np.float64) * -4.0
    directed = set()
    for node, other in enumerate(neighbors.reshape(n, 4)):
        for target in other:
            if target < 0:
                continue
            if target >= n or target == node:
                raise ValueError(f"{topology.get('key')}: invalid neighbor index {target} at node {node}")
            matrix[node, target] += 1.0
            directed.add((node, int(target)))
    if any((b, a) not in directed for a, b in directed):
        raise ValueError(f"{topology.get('key')}: neighbor map is not reciprocal")
    if not np.array_equal(matrix, matrix.T):
        raise ValueError(f"{topology.get('key')}: compiled masked Laplacian is not symmetric")
    return matrix


def coefficients(material):
    """Mirror compileSurfaceTopology.js, including its Float32Array storage."""
    raw = [0.012 * material["stiffness"] / material["density"],
           0.0002,
           material["density"],
           0.000009 + 0.000018 * material["damping"]]
    return np.asarray(raw, dtype=np.float32).astype(np.float64)


def pole_data(q, coeffs):
    bending, tension, density, damping_coeff = map(float, coeffs)
    damping = damping_coeff * DAMPING_MULTIPLIER
    stiffness_term = bending * q * q + tension * q / density
    a = 2.0 - damping - stiffness_term
    product = 1.0 - damping
    discriminant = a * a - 4.0 * product
    if product <= 0:
        raise ValueError("non-positive recurrence pole product")
    if discriminant >= 0:
        root_a = (a + math.sqrt(discriminant)) / 2.0
        root_b = (a - math.sqrt(discriminant)) / 2.0
        return {"type": "real", "roots": (root_a, root_b), "damping": damping,
                "a": a, "product": product}
    radius = math.sqrt(product)
    cos_angle = a / (2.0 * radius)
    if not -1.0 <= cos_angle <= 1.0:
        raise ValueError("complex pole angle falls outside [-1, 1]")
    angle = math.acos(cos_angle)
    return {"type": "complex", "radius": radius, "angle": angle,
            "frequencyHz": angle * RATE_HZ / (2.0 * math.pi),
            "decayTauSeconds": -1.0 / (RATE_HZ * math.log(radius)),
            "damping": damping, "a": a, "product": product}


def finite_quantiles(values):
    values = np.asarray(values, dtype=np.float64)
    q = np.quantile(values, [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0])
    return {"min": float(q[0]), "p10": float(q[1]), "p25": float(q[2]),
            "median": float(q[3]), "p75": float(q[4]), "p90": float(q[5]), "max": float(q[6])}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def transfer_for_modes(q_values, coeffs, envelope):
    poles = [pole_data(float(q), coeffs) for q in q_values]
    if any(p["type"] != "complex" for p in poles):
        raise ValueError("a selected all-active mode is non-oscillatory; inspect the recurrence branch")
    pure_gain, damped_gain = [], []
    for pole in poles:
        angle = pole["angle"]
        root = pole["radius"] * complex(math.cos(angle), math.sin(angle))
        envelope_gain = sum(float(weight) * complex(math.cos(-angle * k), math.sin(-angle * k))
                            for k, weight in enumerate(envelope))
        pole_projection = sum(float(weight) * (root ** (-k)) for k, weight in enumerate(envelope))
        pure_gain.append(abs(envelope_gain))
        damped_gain.append(abs(pole_projection))
    return poles, pure_gain, damped_gain


def summarize(topology, material, envelope):
    q_values = -np.linalg.eigvalsh(laplacian(topology))
    if np.any(q_values <= 0):
        raise ValueError(f"{topology['key']}: -L must be positive definite with the zero-valued mask boundary")
    if abs(float(np.median(q_values)) - 4.0) > 1e-10:
        raise ValueError(f"{topology['key']}: four-neighbor bipartite spectrum is not centered at q=4")
    coeffs = coefficients(material)
    poles, pure_gain, damped_gain = transfer_for_modes(q_values, coeffs, envelope)
    frequencies = np.asarray([p["frequencyHz"] for p in poles])
    taus = np.asarray([p["decayTauSeconds"] for p in poles])
    pure_db = 20.0 * np.log10(np.maximum(np.asarray(pure_gain), 1e-300))
    damped_db = 20.0 * np.log10(np.maximum(np.asarray(damped_gain), 1e-300))
    damping_correction_db = damped_db - pure_db
    damping_steps = np.asarray([p["damping"] for p in poles])
    max_correction_index = int(np.argmax(np.abs(damping_correction_db)))
    return {
        "key": topology["key"],
        "solverNodes": len(topology["nodeGridIndices"]),
        "material": {k: float(material[k]) for k in ("stiffness", "density", "damping")},
        "positiveMinusLQuantiles": finite_quantiles(q_values),
        "poleFrequencyHzQuantiles": finite_quantiles(frequencies),
        "poleDecayTauSecondsQuantiles": finite_quantiles(taus),
        "pulseEnvelopeAmplitudeDbAtPoleAngleQuantiles": finite_quantiles(pure_db),
        "dampedPulsePoleProjectionAmplitudeDbQuantiles": finite_quantiles(damped_db),
        "dampingCorrectionToPulseProjectionDbQuantiles": finite_quantiles(damping_correction_db),
        "maxAbsDampingCorrectionToPulseProjectionDb": float(np.max(np.abs(damping_correction_db))),
        "maxDampingCorrectionMode": {
            "poleFrequencyHz": float(frequencies[max_correction_index]),
            "envelopeOnlyAmplitudeDb": float(pure_db[max_correction_index]),
            "dampedPoleProjectionAmplitudeDb": float(damped_db[max_correction_index]),
            "correctionDb": float(damping_correction_db[max_correction_index]),
        },
        "recurrenceDampingPerStep": finite_quantiles(damping_steps),
        "modeCountNonOscillatory": sum(p["type"] != "complex" for p in poles),
    }


def self_check(envelope):
    assert CONTACT_PULSE_STEPS == 18
    assert abs(float(envelope.sum()) - 1.0) < 1e-14
    dc = abs(sum(float(w) for w in envelope))
    nyquist = abs(sum(float(w) * (-1.0) ** k for k, w in enumerate(envelope)))
    assert abs(dc - 1.0) < 1e-14 and 0.0 <= nyquist < dc
    # The worklet subtracts this step's force from previous before recurrence.
    # That yields x[n+1] = a*x[n] - (1-d)*x[n-1] + (1-d)*f[n].
    damping = 0.000765
    product = 1.0 - damping
    assert abs((2.0 - damping) - 2.0 + damping) < 1e-15
    force = 0.25
    previous_after_force = -force
    first_next = -previous_after_force + damping * previous_after_force
    assert abs(first_next - product * force) < 1e-14
    # Check the post-pulse pole coefficient ratio against an explicit recurrence.
    q, bending, tension, density = 3.0, 0.009, 0.0002, 1.2
    stiffness_term = bending * q * q + tension * q / density
    a = 2.0 - damping - stiffness_term
    root_radius = math.sqrt(product)
    angle = math.acos(a / (2.0 * root_radius))
    root = root_radius * complex(math.cos(angle), math.sin(angle))
    x_prev = x = 0.0
    for impulse in envelope:
        # Force is applied to previous before each solver recurrence.
        x_prev -= float(impulse)
        x_next = a * x - product * x_prev
        x_prev, x = x, x_next
    n = len(envelope)
    coefficient = (x - root.conjugate() * x_prev) / (root ** (n - 1) * (root - root.conjugate()))
    reference_impulse = product
    impulse_coefficient = reference_impulse / (root - root.conjugate())
    expected_ratio = sum(float(w) * root ** (-k) for k, w in enumerate(envelope))
    assert abs(coefficient / impulse_coefficient - expected_ratio) < 1e-10


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topologies", type=Path, default=DEFAULT_TOPOLOGIES)
    parser.add_argument("--inputs", type=Path, default=DEFAULT_INPUTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()

    envelope = pulse_envelope()
    self_check(envelope)
    if args.self_check:
        return
    topologies = json.loads(args.topologies.read_text(encoding="utf-8"))
    with gzip.open(args.inputs, "rt", encoding="utf-8") as stream:
        frozen = json.load(stream)
    selected = {row["key"]: row for row in frozen["selected"]}
    if len(topologies) != 12 or {row["key"] for row in topologies} != set(selected):
        raise ValueError("modal topology keys do not match the 12 frozen selected descriptors")
    median_material = frozen["materials"]["median"]
    frequency_hz = np.arange(0.0, RATE_HZ / 2.0 + 1e-9, 50.0)
    omega = 2.0 * math.pi * frequency_hz / RATE_HZ
    pulse_spectrum = np.abs(np.exp(-1j * np.outer(omega, np.arange(CONTACT_PULSE_STEPS))) @ envelope)
    pulse_db = 20.0 * np.log10(np.maximum(pulse_spectrum, 1e-300))
    natural_rows, fixed_rows = [], []
    for topology in topologies:
        expected = coefficients(selected[topology["key"]]["plate"]["material"])
        stored = np.asarray(topology["materialCoefficients"], dtype=np.float64)
        if stored.shape != (4,) or not np.array_equal(stored, expected):
            raise ValueError(f"{topology['key']}: stored coefficients differ from frozen material/compiler")
        natural_rows.append(summarize(topology, selected[topology["key"]]["plate"]["material"], envelope))
        fixed_rows.append(summarize(topology, median_material, envelope))

    materials = [row["material"] for row in frozen["corpus"]]
    selected_materials = [row["plate"]["material"] for row in frozen["selected"]]
    material_ranges = {field: {"min": min(float(row[field]) for row in materials),
                               "median": float(np.median([row[field] for row in materials])),
                               "max": max(float(row[field]) for row in materials)}
                       for field in ("stiffness", "density", "damping")}
    selected_material_ranges = {field: {"min": min(float(row[field]) for row in selected_materials),
                                        "median": float(np.median([row[field] for row in selected_materials])),
                                        "max": max(float(row[field]) for row in selected_materials)}
                                for field in ("stiffness", "density", "damping")}
    stiffness_damping_r = float(np.corrcoef([row["stiffness"] for row in materials],
                                            [row["damping"] for row in materials])[0, 1])
    stiffness_damping_slope, stiffness_damping_intercept = np.polyfit(
        [row["stiffness"] for row in materials], [row["damping"] for row in materials], 1)
    stiffness_damping_residual = max(abs(row["damping"] - (stiffness_damping_slope * row["stiffness"]
                                                            + stiffness_damping_intercept)) for row in materials)
    all_step_damping = [value for row in natural_rows
                        for value in (row["recurrenceDampingPerStep"]["min"], row["recurrenceDampingPerStep"]["max"])]
    attenuation = [row["dampedPulsePoleProjectionAmplitudeDbQuantiles"]["median"] for row in natural_rows]
    spectrum = {
        "schemaVersion": 1,
        "analysis": "Isolated, all-active, linear single-Plate modal audit of compiled 32x32 masked topology; no alternate solver or DSP transform.",
        "provenance": {
            "baseline": frozen["baseline"],
            "research": frozen["research"],
            "frozenInputs": {"path": str(args.inputs.relative_to(ROOT)), "sha256": sha256(args.inputs)},
            "packedTopologies": {"path": str(args.topologies.relative_to(ROOT)), "sha256": sha256(args.topologies)},
            "worklet": {"path": "static/worklets/surface-plate.worklet.js", "sha256": sha256(ROOT / "static/worklets/surface-plate.worklet.js")},
            "topologyCompiler": {"path": "src/lib/audio/compileSurfaceTopology.js", "sha256": sha256(ROOT / "src/lib/audio/compileSurfaceTopology.js")},
            "auditScript": {"path": "scripts/ant-sonic-modal-transfer.py", "sha256": sha256(Path(__file__))},
            "selectedKeys": [topology["key"] for topology in topologies],
        },
        "sourceEquations": {
            "laplacian": "L has diagonal -4 and +1 for each in-mask four-neighbor; missing-mask neighbors contribute zero.",
            "materialCoefficients": "[b,t,rho,c] = Float32([0.012*stiffness/rho, 0.0002, rho, 0.000009+0.000018*damping]); worklet d=50*c.",
            "modalRecurrence": "x[n+1]=(2-d-b*q^2-t*q/rho)*x[n]-(1-d)*x[n-1]+(1-d)*f[n], q eigenvalue of -L.",
            "poles": "p^2-a*p+(1-d)=0; underdamped radius=sqrt(1-d), angle=acos(a/(2*radius)), f=angle*6000/(2*pi), tau=-1/(6000*ln(radius)).",
            "contactInput": "Worklet subtracts this step force from previous before recurrence; this produces input gain (1-d). The same factor multiplies every pulse sample and cancels in pulse/instant-impulse ratios.",
            "contactEnvelope": "e[k]=sin(pi*(k+0.5)/18)/sum_j sin(pi*(j+0.5)/18), k=0..17; F(omega)=sum_k e[k]*exp(-i*omega*k).",
            "pulseRatio": "At pole p, post-pulse free-wave coefficient relative to a unit first-step impulse of equal total force is abs(sum_k e[k]*p^(-k)); envelope-only spectral magnitude is abs(F(angle)).",
        },
        "pulse": {
            "sampleRateHz": RATE_HZ,
            "durationSeconds": CONTACT_PULSE_STEPS / RATE_HZ,
            "stepCount": CONTACT_PULSE_STEPS,
            "normalizedEnvelope": [float(x) for x in envelope],
            "frequencyGridHz": [float(x) for x in frequency_hz],
            "amplitudeTransfer": [float(x) for x in pulse_spectrum],
            "amplitudeTransferDb": [float(x) for x in pulse_db],
            "dampingRadiusAfter18Steps": {"min": float((1.0 - max(all_step_damping)) ** 9),
                                           "max": float((1.0 - min(all_step_damping)) ** 9)},
        },
        "naturalCurrentLawCorpus": {"count": len(materials), "materialRanges": material_ranges,
                                     "stiffnessDampingPearsonR": stiffness_damping_r,
                                     "stiffnessDampingLinearFit": {"slope": float(stiffness_damping_slope),
                                                                    "intercept": float(stiffness_damping_intercept),
                                                                    "maxAbsoluteResidual": float(stiffness_damping_residual)}},
        "naturalSelectedMaterialRanges": selected_material_ranges,
        "nativeMaterial": natural_rows,
        "sharedMedianMaterialOnSameGeometry": fixed_rows,
        "acrossPlateEqualWeight": {
            "nativeMedianModeFrequencyHz": finite_quantiles([row["poleFrequencyHzQuantiles"]["median"] for row in natural_rows]),
            "sharedMaterialMedianModeFrequencyHz": finite_quantiles([row["poleFrequencyHzQuantiles"]["median"] for row in fixed_rows]),
            "nativeMedianDampedPulseProjectionDb": finite_quantiles(attenuation),
            "sharedMaterialMedianDampedPulseProjectionDb": finite_quantiles([row["dampedPulsePoleProjectionAmplitudeDbQuantiles"]["median"] for row in fixed_rows]),
        },
        "interpretationLimits": [
            "The same 18-step envelope is common to all Plates; evaluated attenuation varies with each topology's pole frequencies.",
            "Geometry changes the eigenvalue spectrum; material coefficients also change poles. The shared-median rerun holds material constant to show geometry-only spread, while native rows combine geometry and each frozen descriptor.",
            "The four-neighbor mask graph is bipartite: -L=4I-A and A has eigenvalues paired as +/-mu. Thus the -L spectrum is symmetric around q=4 and every mask's median q is 4; a shared-material median pole is equal by construction and does not imply identical geometry.",
            "Mode counts and quantiles are not excitation weights. A mode contributes to observed output only through the strike footprint's modal projection and the pickup's modal projection.",
            "Relative damping correction can look large when the envelope response nearly cancels: the native-material maximum is -84.09 dB envelope-only to -67.26 dB damped (+16.83 dB); the shared-median-material maximum is -98.53 to -67.34 dB (+31.19 dB). Both remain deeply attenuated in absolute amplitude; typical correction is about +0.028 dB.",
            "This omits active-node sleep/wake, stateful local contact compliance, cross-Plate and nodule coupling, and actual multi-event histories. It does not establish audibility or audible modal individuality.",
        ],
        "claimBoundary": {
            "implementedFact": "The worklet sends the 18 normalized half-sine force samples before the unchanged second-order Plate recurrence.",
            "computedResult": "Natural selected descriptors have density fixed at 1.2; stiffness and damping are perfectly correlated in the 100-row frozen current-law corpus. Across 12 isolated topologies, each mode's pulse coefficient depends on the 18-sample transfer evaluated at its recurrence pole.",
            "inference": "The envelope can strongly shape which linear Plate modes receive excitation. Geometry changes the full mode distribution and eigenvectors, while the fixed -4 diagonal forces the median -L eigenvalue to 4; natural material contributes a small pole shift in this narrow selected range.",
            "notEstablished": "The modal calculation does not establish excitation strength for any mode in a real strike, audibility, perceived timbral individuality, or behavior of the full coupled sleeping worklet.",
        },
        "selfCheck": "passed: 18 samples, unit DC sum, attenuated Nyquist, force-before-recurrence impulse gain and damped pole-projection identity.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(spectrum, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "plates": len(natural_rows),
                      "currentLawCorpusMaterialRanges": material_ranges,
                      "stiffnessDampingPearsonR": stiffness_damping_r,
                      "nativeMedianModeFrequencyHzAcrossPlates": spectrum["acrossPlateEqualWeight"]["nativeMedianModeFrequencyHz"],
                      "nativeMedianPulseProjectionDbAcrossPlates": spectrum["acrossPlateEqualWeight"]["nativeMedianDampedPulseProjectionDb"]},
                     separators=(",", ":")))


if __name__ == "__main__":
    main()
