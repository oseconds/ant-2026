from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


RHO = 1.20
SOUND_SPEED = 343.0
END_CORRECTION_FACTOR = 1.6434
INTERNAL_Q = 20.0
CHAMBER_M = 0.040
CHAMBER_W = 0.040
CHAMBER_H = 0.025
NECK_LENGTH_M = 0.040
NECK_RADII_M = (0.002, 0.003, 0.004)
FREQUENCY_MAX_HZ = 340.0
FREQUENCY_KD_LIMIT = 0.25
FREQUENCY_HZ = np.linspace(1.0, FREQUENCY_MAX_HZ, int(FREQUENCY_MAX_HZ))
PULSE_PA = 1.0
PULSE_WIDTH_S = 0.001
TRANSIENT_DT_S = 1e-5
TRANSIENT_END_S = 0.10
WALL_MASS_KG = 0.002
WALL_STIFFNESS_N_M = 5000.0
WALL_INITIAL_DISPLACEMENT_M3 = 1e-9
WALL_TRANSIENT_DT_S = 1e-5
WALL_TRANSIENT_END_S = 0.10


def open_geometry_cases() -> list[dict]:
    return [
        {
            "name": "open_top_groove",
            "roof_coverage_fraction": 0.0,
            "dimensions_m": {"length": 0.100, "width": 0.020, "depth": 0.005},
            "geometric_void_m3": 0.100 * 0.020 * 0.005,
            "opening_area_m2": 0.100 * 0.020,
            "sealed_cavity_volume_m3": None,
            "neck_area_m2": None,
            "status": "REJECT_HELMHOLTZ_OPEN_TOP_NO_SEALED_VOLUME_OR_NECK",
            "frequency_hz": None,
            "pressure_pa": None,
            "loss_and_radiation": None,
        },
        {
            "name": "broad_mouth_partial_recess",
            "roof_coverage_fraction": 0.2,
            "dimensions_m": {"length": 0.040, "width": 0.040, "depth": 0.010},
            "geometric_void_m3": 0.040 * 0.040 * 0.010,
            "opening_area_m2": 0.8 * 0.040 * 0.040,
            "sealed_cavity_volume_m3": None,
            "neck_area_m2": None,
            "status": "REJECT_HELMHOLTZ_BROAD_FACE_OPENING_NO_DEFINED_NECK",
            "frequency_hz": None,
            "pressure_pa": None,
            "loss_and_radiation": None,
        },
    ]


def roofed_duct_reference(length_m: float = 0.100) -> dict:
    if not math.isfinite(length_m) or length_m <= 0:
        raise ValueError("duct length must be positive and finite")
    return {
        "name": "added_roof_open_open_duct_counterexample",
        "length_m": length_m,
        "cross_section_m2": 0.020 * 0.005,
        "first_mode_hz": SOUND_SPEED / (2.0 * length_m),
        "assumptions": "rigid roof and walls; pressure-release ends; no end correction, loss, or radiation model",
    }


def make_resonator(radius_m: float) -> dict:
    if not math.isfinite(radius_m) or radius_m <= 0:
        raise ValueError("neck radius must be positive and finite")
    volume = CHAMBER_M * CHAMBER_W * CHAMBER_H
    area = math.pi * radius_m**2
    effective_length = NECK_LENGTH_M + END_CORRECTION_FACTOR * radius_m
    inertance = RHO * effective_length / area
    compliance = volume / (RHO * SOUND_SPEED**2)
    omega_0 = 1.0 / math.sqrt(inertance * compliance)
    frequency_0 = omega_0 / (2.0 * math.pi)
    wave_number = omega_0 / SOUND_SPEED
    radiation_resistance = RHO * SOUND_SPEED * (wave_number * radius_m) ** 2 / (2.0 * area)
    internal_resistance = omega_0 * inertance / INTERNAL_Q
    radiation_q = omega_0 * inertance / radiation_resistance
    total_q = omega_0 * inertance / (internal_resistance + radiation_resistance)
    max_dimension = max(CHAMBER_M, CHAMBER_W, CHAMBER_H)
    return {
        "radius_m": radius_m,
        "area_m2": area,
        "volume_m3": volume,
        "physical_length_m": NECK_LENGTH_M,
        "effective_length_m": effective_length,
        "inertance_pa_s2_m3": inertance,
        "compliance_m3_pa": compliance,
        "omega_0_rad_s": omega_0,
        "frequency_0_hz": frequency_0,
        "radiation_resistance_at_f0_pa_s_m3": radiation_resistance,
        "internal_resistance_pa_s_m3": internal_resistance,
        "q_internal": INTERNAL_Q,
        "q_radiation": radiation_q,
        "q_total": total_q,
        "kD_max": wave_number * max_dimension,
        "ka": wave_number * radius_m,
        "kL_neck": wave_number * NECK_LENGTH_M,
    }


def frequency_response(resonator: dict, frequencies_hz: np.ndarray = FREQUENCY_HZ,
                        drive_pa_rms: float = PULSE_PA) -> dict[str, np.ndarray]:
    if not math.isfinite(drive_pa_rms) or drive_pa_rms < 0:
        raise ValueError("drive pressure must be finite and non-negative")
    omega = 2.0 * np.pi * np.asarray(frequencies_hz, dtype=np.float64)
    radius = resonator["radius_m"]
    area = resonator["area_m2"]
    k = omega / SOUND_SPEED
    radiation_resistance = RHO * SOUND_SPEED * (k * radius) ** 2 / (2.0 * area)
    total_resistance = resonator["internal_resistance_pa_s_m3"] + radiation_resistance
    compliance = resonator["compliance_m3_pa"]
    inertance = resonator["inertance_pa_s2_m3"]
    impedance = 1.0 / compliance - omega**2 * inertance + 1j * omega * total_resistance
    volume_displacement = drive_pa_rms / impedance
    volume_velocity = 1j * omega * volume_displacement
    cavity_pressure = volume_displacement / compliance
    internal_power = resonator["internal_resistance_pa_s_m3"] * np.abs(volume_velocity) ** 2
    radiation_power = radiation_resistance * np.abs(volume_velocity) ** 2
    input_power = np.real(drive_pa_rms * np.conjugate(volume_velocity))
    far_field_pressure = RHO * omega * np.abs(volume_velocity) / (2.0 * np.pi)
    stored_energy = (0.5 * compliance * np.abs(cavity_pressure) ** 2
                     + 0.5 * inertance * np.abs(volume_velocity) ** 2)
    return {
        "frequency_hz": np.asarray(frequencies_hz, dtype=np.float64),
        "cavity_pressure_pa": cavity_pressure,
        "volume_displacement_m3": volume_displacement,
        "volume_velocity_m3_s": volume_velocity,
        "radiation_resistance_pa_s_m3": radiation_resistance,
        "input_power_w": input_power,
        "internal_loss_w": internal_power,
        "radiation_power_w": radiation_power,
        "far_field_pressure_pa_at_1m": far_field_pressure,
        "stored_energy_j": stored_energy,
    }


def exact_pulse_response(resonator: dict, times_s: np.ndarray, pulse_pa: float = PULSE_PA,
                         pulse_width_s: float = PULSE_WIDTH_S) -> tuple[np.ndarray, np.ndarray]:
    mass = resonator["inertance_pa_s2_m3"]
    compliance = resonator["compliance_m3_pa"]
    resistance = (resonator["internal_resistance_pa_s_m3"]
                  + resonator["radiation_resistance_at_f0_pa_s_m3"])
    alpha = resistance / (2.0 * mass)
    omega_0 = resonator["omega_0_rad_s"]
    omega_d = math.sqrt(omega_0**2 - alpha**2)
    if omega_d <= 0:
        raise ValueError("frozen resonator must be underdamped")

    def step_response(time_s: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        time_s = np.maximum(np.asarray(time_s, dtype=np.float64), 0.0)
        envelope = np.exp(-alpha * time_s)
        q = pulse_pa * compliance * (1.0 - envelope * (
            np.cos(omega_d * time_s) + alpha / omega_d * np.sin(omega_d * time_s)))
        u = pulse_pa / (mass * omega_d) * envelope * np.sin(omega_d * time_s)
        return q, u

    q_on, u_on = step_response(times_s)
    q_off, u_off = step_response(np.asarray(times_s, dtype=np.float64) - pulse_width_s)
    return q_on - q_off, u_on - u_off


def integrate_pulse(resonator: dict, dt_s: float = TRANSIENT_DT_S,
                    end_s: float = TRANSIENT_END_S, pulse_pa: float = PULSE_PA,
                    pulse_width_s: float = PULSE_WIDTH_S) -> dict[str, np.ndarray | float]:
    if not all(math.isfinite(value) and value > 0 for value in (dt_s, end_s, pulse_width_s)):
        raise ValueError("time step, end time, and pulse width must be positive and finite")
    steps = int(round(end_s / dt_s))
    pulse_steps = int(round(pulse_width_s / dt_s))
    if not math.isclose(steps * dt_s, end_s) or not math.isclose(pulse_steps * dt_s, pulse_width_s):
        raise ValueError("time grid must contain the end time and pulse width exactly")
    mass = resonator["inertance_pa_s2_m3"]
    compliance = resonator["compliance_m3_pa"]
    internal_resistance = resonator["internal_resistance_pa_s_m3"]
    radiation_resistance = resonator["radiation_resistance_at_f0_pa_s_m3"]
    total_resistance = internal_resistance + radiation_resistance
    times = np.arange(steps + 1, dtype=np.float64) * dt_s
    q = np.zeros(steps + 1, dtype=np.float64)
    u = np.zeros(steps + 1, dtype=np.float64)
    drive = np.zeros(steps + 1, dtype=np.float64)
    input_energy = np.zeros(steps + 1, dtype=np.float64)
    internal_energy = np.zeros(steps + 1, dtype=np.float64)
    radiation_energy = np.zeros(steps + 1, dtype=np.float64)

    def derivative(state_q: float, state_u: float, force: float) -> tuple[float, float]:
        return state_u, (force - total_resistance * state_u - state_q / compliance) / mass

    for index in range(steps):
        t = times[index]
        force = pulse_pa if index < pulse_steps else 0.0
        drive[index] = force
        q0, u0 = q[index], u[index]
        k1q, k1u = derivative(q0, u0, force)
        k2q, k2u = derivative(q0 + 0.5 * dt_s * k1q, u0 + 0.5 * dt_s * k1u, force)
        k3q, k3u = derivative(q0 + 0.5 * dt_s * k2q, u0 + 0.5 * dt_s * k2u, force)
        k4q, k4u = derivative(q0 + dt_s * k3q, u0 + dt_s * k3u, force)
        q[index + 1] = q0 + dt_s * (k1q + 2.0 * k2q + 2.0 * k3q + k4q) / 6.0
        u[index + 1] = u0 + dt_s * (k1u + 2.0 * k2u + 2.0 * k3u + k4u) / 6.0
        input_energy[index + 1] = input_energy[index] + force * 0.5 * (u0 + u[index + 1]) * dt_s
        internal_energy[index + 1] = internal_energy[index] + internal_resistance * 0.5 * (
            u0**2 + u[index + 1] ** 2) * dt_s
        radiation_energy[index + 1] = radiation_energy[index] + radiation_resistance * 0.5 * (
            u0**2 + u[index + 1] ** 2) * dt_s
    drive[-1] = 0.0
    pressure = q / compliance
    stored_energy = 0.5 * mass * u**2 + 0.5 * q**2 / compliance
    closure_error = input_energy - internal_energy - radiation_energy - stored_energy
    exact_q, exact_u = exact_pulse_response(resonator, times, pulse_pa, pulse_width_s)
    pressure_scale = np.max(np.abs(exact_q / compliance))
    velocity_scale = np.max(np.abs(exact_u))
    return {
        "time_s": times,
        "drive_pa": drive,
        "volume_displacement_m3": q,
        "volume_velocity_m3_s": u,
        "cavity_pressure_pa": pressure,
        "exact_volume_displacement_m3": exact_q,
        "exact_volume_velocity_m3_s": exact_u,
        "stored_energy_j": stored_energy,
        "input_energy_j": input_energy,
        "internal_loss_j": internal_energy,
        "radiation_loss_j": radiation_energy,
        "closure_error_j": closure_error,
        "closure_fraction": float(abs(closure_error[-1]) / input_energy[-1]),
        "peak_pressure_error_fraction": float(
            abs(np.max(np.abs(pressure)) - pressure_scale) / pressure_scale),
        "pressure_trace_error_fraction": float(
            np.max(np.abs(pressure - exact_q / compliance)) / pressure_scale),
        "velocity_trace_error_fraction": float(np.max(np.abs(u - exact_u)) / velocity_scale),
    }


def wall_compliance_case(resonator: dict) -> dict:
    wall_area = CHAMBER_M * CHAMBER_W
    wall_mass = WALL_MASS_KG
    wall_stiffness = WALL_STIFFNESS_N_M
    compliance = resonator["compliance_m3_pa"]
    wall_compliance = wall_area**2 / wall_stiffness
    mass = np.diag([resonator["inertance_pa_s2_m3"], wall_mass])
    stiffness = np.array([
        [1.0 / compliance, wall_area / compliance],
        [wall_area / compliance, wall_stiffness + wall_area**2 / compliance],
    ])
    state_matrix = np.linalg.solve(mass, stiffness)
    eigenvalues = np.linalg.eigvals(state_matrix).real
    trace = float(np.trace(state_matrix))
    determinant = float(np.linalg.det(state_matrix))
    discriminant = trace**2 - 4.0 * determinant
    closed_roots = np.sort(np.array([
        0.5 * (trace - math.sqrt(discriminant)),
        0.5 * (trace + math.sqrt(discriminant)),
    ]))
    coupled_roots = np.sort(eigenvalues[eigenvalues > 0])
    coupled_hz = np.sqrt(coupled_roots) / (2.0 * math.pi)
    coupled_mode_compactness = {
        "neck_length_m": NECK_LENGTH_M,
        "kD_screen_max": FREQUENCY_KD_LIMIT,
        "modes": [
            {
                "frequency_hz": float(frequency),
                "kD": float(2.0 * math.pi * frequency * NECK_LENGTH_M / SOUND_SPEED),
                "screen_status": (
                    "INSIDE_COMPACT_SCREEN"
                    if 2.0 * math.pi * frequency * NECK_LENGTH_M / SOUND_SPEED
                    <= FREQUENCY_KD_LIMIT
                    else "OUTSIDE_SCREEN_SURROGATE_ROOT_ONLY_NO_PHYSICAL_VALIDATION"
                ),
            }
            for frequency in coupled_hz
        ],
    }
    return {
        "wall_area_m2": wall_area,
        "wall_modal_mass_kg": wall_mass,
        "wall_modal_stiffness_n_m": wall_stiffness,
        "wall_uncoupled_frequency_hz": math.sqrt(wall_stiffness / wall_mass) / (2.0 * math.pi),
        "air_compliance_m3_pa": compliance,
        "wall_compliance_m3_pa": wall_compliance,
        "wall_to_air_compliance_ratio": wall_compliance / compliance,
        "rigid_wall_frequency_hz": resonator["frequency_0_hz"],
        "coupled_undamped_frequencies_hz": coupled_hz.tolist(),
        "coupled_mode_compactness": coupled_mode_compactness,
        "closed_form_eigenvalue_roots_rad2_s2": closed_roots.tolist(),
        "numeric_eigenvalue_roots_rad2_s2": coupled_roots.tolist(),
        "eigenvalue_root_relative_error": float(np.max(np.abs(closed_roots - coupled_roots)
                                                        / closed_roots)),
        "status": "RIGID_WALL_REJECTED_FOR_ILLUSTRATIVE_COMPLIANT_WALL",
    }


def integrate_wall_coupling(resonator: dict, dt_s: float = WALL_TRANSIENT_DT_S,
                            end_s: float = WALL_TRANSIENT_END_S,
                            initial_displacement_m3: float = WALL_INITIAL_DISPLACEMENT_M3) -> dict:
    if not all(math.isfinite(value) and value > 0 for value in (dt_s, end_s, initial_displacement_m3)):
        raise ValueError("wall-coupling time grid and initial displacement must be positive and finite")
    steps = int(round(end_s / dt_s))
    if not math.isclose(steps * dt_s, end_s):
        raise ValueError("wall-coupling time grid must contain the end time exactly")
    wall_area = CHAMBER_M * CHAMBER_W
    wall_mass = WALL_MASS_KG
    wall_stiffness = WALL_STIFFNESS_N_M
    neck_mass = resonator["inertance_pa_s2_m3"]
    air_compliance = resonator["compliance_m3_pa"]
    times = np.arange(steps + 1, dtype=np.float64) * dt_s
    states = np.zeros((steps + 1, 4), dtype=np.float64)
    states[0, 0] = initial_displacement_m3
    pressure_work = np.zeros(steps + 1, dtype=np.float64)

    def derivative(state: np.ndarray) -> np.ndarray:
        q, u, x, xdot = state
        pressure = (q + wall_area * x) / air_compliance
        return np.array([
            u,
            -pressure / neck_mass,
            xdot,
            (-wall_stiffness * x - wall_area * pressure) / wall_mass,
        ])

    for index in range(steps):
        state = states[index]
        k1 = derivative(state)
        k2 = derivative(state + 0.5 * dt_s * k1)
        k3 = derivative(state + 0.5 * dt_s * k2)
        k4 = derivative(state + dt_s * k3)
        states[index + 1] = state + dt_s * (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0
        p0 = (state[0] + wall_area * state[2]) / air_compliance
        p1 = (states[index + 1, 0] + wall_area * states[index + 1, 2]) / air_compliance
        f0 = -wall_area * p0
        f1 = -wall_area * p1
        pressure_work[index + 1] = pressure_work[index] + 0.5 * (
            f0 * state[3] + f1 * states[index + 1, 3]) * dt_s

    q, u, x, xdot = states.T
    pressure = (q + wall_area * x) / air_compliance
    wall_force = -wall_area * pressure
    air_energy = 0.5 * air_compliance * pressure**2
    neck_energy = 0.5 * neck_mass * u**2
    wall_kinetic = 0.5 * wall_mass * xdot**2
    wall_potential = 0.5 * wall_stiffness * x**2
    wall_energy = wall_kinetic + wall_potential
    total_energy = air_energy + neck_energy + wall_energy
    initial_energy = float(total_energy[0])
    wall_energy_change = wall_energy - wall_energy[0]
    work_error = wall_energy_change - pressure_work
    return {
        "time_s": times,
        "volume_displacement_m3": q,
        "volume_velocity_m3_s": u,
        "wall_displacement_m": x,
        "wall_velocity_m_s": xdot,
        "cavity_pressure_pa": pressure,
        "pressure_force_on_wall_n": wall_force,
        "air_energy_j": air_energy,
        "neck_energy_j": neck_energy,
        "wall_kinetic_energy_j": wall_kinetic,
        "wall_potential_energy_j": wall_potential,
        "wall_energy_j": wall_energy,
        "total_energy_j": total_energy,
        "total_energy_drift_fraction": float(np.max(np.abs(total_energy - initial_energy)) / initial_energy),
        "pressure_work_on_wall_j": pressure_work,
        "wall_energy_change_j": wall_energy_change,
        "pressure_work_error_j": work_error,
        "pressure_work_error_fraction": float(np.max(np.abs(work_error)) / initial_energy),
        "initial_energy_j": initial_energy,
        "peak_pressure_pa": float(np.max(np.abs(pressure))),
        "peak_wall_displacement_m": float(np.max(np.abs(x))),
    }


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_outputs(output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    open_cases = open_geometry_cases()
    duct = roofed_duct_reference()
    resonators = [make_resonator(radius) for radius in NECK_RADII_M]
    max_dimension = max(CHAMBER_M, CHAMBER_W, CHAMBER_H)
    max_kd = 2.0 * math.pi * FREQUENCY_HZ[-1] * max_dimension / SOUND_SPEED
    max_ka = 2.0 * math.pi * FREQUENCY_HZ[-1] * max(NECK_RADII_M) / SOUND_SPEED
    if max_kd > FREQUENCY_KD_LIMIT:
        raise ValueError("accepted frequency band exceeds the frozen compactness screen")
    base = resonators[1]
    responses = [frequency_response(resonator) for resonator in resonators]
    frequency_rows = []
    for row_index, frequency_hz in enumerate(FREQUENCY_HZ):
        row = {"frequency_hz": float(frequency_hz)}
        for resonator, response in zip(resonators, responses):
            radius_mm = int(round(resonator["radius_m"] * 1000))
            row[f"cavity_pressure_ratio_r{radius_mm}mm"] = float(abs(response["cavity_pressure_pa"][row_index]))
            row[f"volume_velocity_m3_s_per_pa_r{radius_mm}mm"] = float(abs(response["volume_velocity_m3_s"][row_index]))
            row[f"internal_loss_w_per_pa2_r{radius_mm}mm"] = float(response["internal_loss_w"][row_index])
            row[f"radiated_power_w_per_pa2_r{radius_mm}mm"] = float(response["radiation_power_w"][row_index])
            row[f"input_power_w_per_pa2_r{radius_mm}mm"] = float(response["input_power_w"][row_index])
            row[f"far_field_pressure_pa_per_pa_r{radius_mm}mm_at_1m"] = float(
                response["far_field_pressure_pa_at_1m"][row_index])
        frequency_rows.append(row)
    write_csv(output_dir / "frequency_response.csv", list(frequency_rows[0]), frequency_rows)

    sweep_rows = []
    for resonator, response in zip(resonators, responses):
        radius_mm = int(round(resonator["radius_m"] * 1000))
        peak_index = int(np.argmax(np.abs(response["cavity_pressure_pa"])))
        exact_f0_response = frequency_response(
            resonator, np.asarray([resonator["frequency_0_hz"]], dtype=np.float64))
        sweep_rows.append({
            "neck_radius_mm": radius_mm,
            "aperture_area_mm2": resonator["area_m2"] * 1e6,
            "sealed_chamber_volume_cm3": resonator["volume_m3"] * 1e6,
            "physical_neck_length_mm": resonator["physical_length_m"] * 1000,
            "effective_neck_length_mm": resonator["effective_length_m"] * 1000,
            "neck_aspect_ratio_L_over_2a": resonator["physical_length_m"] / (2.0 * resonator["radius_m"]),
            "inertance_pa_s2_m3": resonator["inertance_pa_s2_m3"],
            "compliance_m3_pa": resonator["compliance_m3_pa"],
            "f0_analytic_hz": resonator["frequency_0_hz"],
            "frequency_peak_hz": float(response["frequency_hz"][peak_index]),
            "peak_cavity_pressure_ratio_pa_per_pa": float(abs(response["cavity_pressure_pa"][peak_index])),
            "radiation_resistance_at_f0_pa_s_m3": resonator["radiation_resistance_at_f0_pa_s_m3"],
            "internal_resistance_pa_s_m3": resonator["internal_resistance_pa_s_m3"],
            "q_internal": resonator["q_internal"],
            "q_radiation": resonator["q_radiation"],
            "q_total": resonator["q_total"],
            "kD_max": resonator["kD_max"],
            "ka": resonator["ka"],
            "kL_neck": resonator["kL_neck"],
            "cavity_pressure_at_f0_pa_per_pa": float(abs(exact_f0_response["cavity_pressure_pa"][0])),
            "radiated_power_at_f0_w_per_pa2": float(exact_f0_response["radiation_power_w"][0]),
            "internal_loss_at_f0_w_per_pa2": float(exact_f0_response["internal_loss_w"][0]),
            "radiation_fraction_at_f0": float(exact_f0_response["radiation_power_w"][0]
                                               / exact_f0_response["input_power_w"][0]),
            "far_field_pressure_at_f0_pa_per_pa_at_1m": float(
                exact_f0_response["far_field_pressure_pa_at_1m"][0]),
        })
    write_csv(output_dir / "aperture_sweep.csv", list(sweep_rows[0]), sweep_rows)

    transient = integrate_pulse(base)
    transient_rows = []
    for index, time_s in enumerate(transient["time_s"]):
        transient_rows.append({
            "time_s": float(time_s),
            "drive_pa": float(transient["drive_pa"][index]),
            "volume_displacement_m3": float(transient["volume_displacement_m3"][index]),
            "volume_velocity_m3_s": float(transient["volume_velocity_m3_s"][index]),
            "cavity_pressure_pa": float(transient["cavity_pressure_pa"][index]),
            "exact_volume_displacement_m3": float(transient["exact_volume_displacement_m3"][index]),
            "exact_volume_velocity_m3_s": float(transient["exact_volume_velocity_m3_s"][index]),
            "stored_energy_j": float(transient["stored_energy_j"][index]),
            "input_energy_j": float(transient["input_energy_j"][index]),
            "internal_loss_j": float(transient["internal_loss_j"][index]),
            "radiation_loss_j": float(transient["radiation_loss_j"][index]),
            "closure_error_j": float(transient["closure_error_j"][index]),
        })
    write_csv(output_dir / "transient_energy.csv", list(transient_rows[0]), transient_rows)

    wall = wall_compliance_case(base)
    wall_transient = integrate_wall_coupling(base)
    wall_rows = []
    for index, time_s in enumerate(wall_transient["time_s"]):
        wall_rows.append({
            "time_s": float(time_s),
            "volume_displacement_m3": float(wall_transient["volume_displacement_m3"][index]),
            "volume_velocity_m3_s": float(wall_transient["volume_velocity_m3_s"][index]),
            "wall_displacement_m": float(wall_transient["wall_displacement_m"][index]),
            "wall_velocity_m_s": float(wall_transient["wall_velocity_m_s"][index]),
            "cavity_pressure_pa": float(wall_transient["cavity_pressure_pa"][index]),
            "pressure_force_on_wall_n": float(wall_transient["pressure_force_on_wall_n"][index]),
            "air_energy_j": float(wall_transient["air_energy_j"][index]),
            "neck_energy_j": float(wall_transient["neck_energy_j"][index]),
            "wall_kinetic_energy_j": float(wall_transient["wall_kinetic_energy_j"][index]),
            "wall_potential_energy_j": float(wall_transient["wall_potential_energy_j"][index]),
            "wall_energy_j": float(wall_transient["wall_energy_j"][index]),
            "total_energy_j": float(wall_transient["total_energy_j"][index]),
            "pressure_work_on_wall_j": float(wall_transient["pressure_work_on_wall_j"][index]),
            "wall_energy_change_j": float(wall_transient["wall_energy_change_j"][index]),
            "pressure_work_error_j": float(wall_transient["pressure_work_error_j"][index]),
        })
    write_csv(output_dir / "wall_coupling_energy.csv", list(wall_rows[0]), wall_rows)

    fig, axes = plt.subplots(2, 1, figsize=(9, 7), constrained_layout=True)
    for resonator, response in zip(resonators, responses):
        radius_mm = int(round(resonator["radius_m"] * 1000))
        axes[0].plot(response["frequency_hz"], np.abs(response["cavity_pressure_pa"]),
                     label=f"neck radius {radius_mm} mm")
        axes[1].plot(response["frequency_hz"], response["radiation_power_w"],
                     label=f"neck radius {radius_mm} mm")
    axes[0].set(xlim=(0, 340), ylim=(0, 25), xlabel="Frequency (Hz)",
                ylabel="Cavity pressure / drive (Pa rms per Pa rms)")
    axes[1].set(xlim=(0, 340), ylim=(0, 2.1e-7), xlabel="Frequency (Hz)",
                ylabel="Radiated power (W per Pa rms squared)")
    for axis in axes:
        axis.grid(True, alpha=0.25)
        axis.legend()
    fig.savefig(output_dir / "frequency_response.png", dpi=160)
    plt.close(fig)

    times = transient["time_s"]
    keep = times <= 0.06
    fig, axes = plt.subplots(2, 1, figsize=(9, 7), constrained_layout=True)
    axes[0].plot(times[keep], transient["cavity_pressure_pa"][keep], label="RK4 pressure")
    axes[0].plot(times[keep], transient["exact_volume_displacement_m3"][keep]
                 / base["compliance_m3_pa"], linestyle="--", label="exact pressure")
    axes[0].set(xlim=(0, 0.06), ylim=(-3, 3), xlabel="Time (s)", ylabel="Cavity pressure (Pa)")
    axes[0].legend()
    axes[1].plot(times[keep], transient["input_energy_j"][keep], label="input")
    axes[1].plot(times[keep], transient["internal_loss_j"][keep], label="internal loss")
    axes[1].plot(times[keep], transient["radiation_loss_j"][keep], label="radiated loss")
    axes[1].plot(times[keep], transient["stored_energy_j"][keep], label="stored")
    axes[1].set(xlim=(0, 0.06), ylim=(0, 2.5e-10), xlabel="Time (s)", ylabel="Energy (J)")
    axes[1].legend()
    for axis in axes:
        axis.grid(True, alpha=0.25)
    fig.savefig(output_dir / "transient_energy.png", dpi=160)
    plt.close(fig)

    wall_times = wall_transient["time_s"]
    wall_keep = wall_times <= 0.05
    fig, axes = plt.subplots(2, 1, figsize=(9, 7), constrained_layout=True)
    axes[0].plot(wall_times[wall_keep], wall_transient["air_energy_j"][wall_keep], label="air")
    axes[0].plot(wall_times[wall_keep], wall_transient["neck_energy_j"][wall_keep], label="neck")
    axes[0].plot(wall_times[wall_keep], wall_transient["wall_energy_j"][wall_keep], label="wall")
    axes[0].plot(wall_times[wall_keep], wall_transient["total_energy_j"][wall_keep],
                 color="black", linestyle="--", label="total")
    axes[0].set(xlim=(0, 0.05), ylim=(0, 2e-9), xlabel="Time (s)", ylabel="Energy (J)")
    axes[0].legend()
    axes[1].plot(wall_times[wall_keep], wall_transient["pressure_work_on_wall_j"][wall_keep],
                 label="pressure-force work on wall")
    axes[1].plot(wall_times[wall_keep], wall_transient["wall_energy_change_j"][wall_keep],
                 linestyle="--", label="wall energy change")
    axes[1].set(xlim=(0, 0.05), ylim=(-2e-9, 2e-9), xlabel="Time (s)", ylabel="Energy (J)")
    axes[1].legend()
    for axis in axes:
        axis.grid(True, alpha=0.25)
    fig.savefig(output_dir / "wall_coupling_energy.png", dpi=160)
    plt.close(fig)

    summary = {
        "status": "CONTROLLED_PHYSICAL_MODEL_ONLY; ANT_CAVITY_MAPPING_UNSUPPORTED",
        "source_boundary": "ANT compiles 2D surface masks to plate nodes; no roof, sealed air volume, or air solver is represented in this scope.",
        "illustrative_air_constants": {"density_kg_m3": RHO, "sound_speed_m_s": SOUND_SPEED},
        "accepted_frequency_sweep": {
            "start_hz": float(FREQUENCY_HZ[0]),
            "end_hz": float(FREQUENCY_HZ[-1]),
            "step_hz": float(FREQUENCY_HZ[1] - FREQUENCY_HZ[0]),
            "max_kD_at_end": max_kd,
            "max_ka_at_end": max_ka,
            "study_kD_screen": FREQUENCY_KD_LIMIT,
            "screen_is_universal_error_bound": False,
        },
        "open_geometry_cases": open_cases,
        "roofed_duct_reference": duct,
        "canonical_chamber_m": {"length": CHAMBER_M, "width": CHAMBER_W, "height": CHAMBER_H},
        "neck_length_m": NECK_LENGTH_M,
        "end_correction_factor_times_radius": END_CORRECTION_FACTOR,
        "internal_q_scenario": INTERNAL_Q,
        "aperture_sweep": sweep_rows,
        "base_transient": {
            "neck_radius_mm": base["radius_m"] * 1000,
            "pulse_pa": PULSE_PA,
            "pulse_width_s": PULSE_WIDTH_S,
            "time_step_s": TRANSIENT_DT_S,
            "end_time_s": TRANSIENT_END_S,
            "peak_pressure_error_fraction_vs_exact": transient["peak_pressure_error_fraction"],
            "pressure_trace_error_fraction_vs_exact": transient["pressure_trace_error_fraction"],
            "velocity_trace_error_fraction_vs_exact": transient["velocity_trace_error_fraction"],
            "input_energy_j": float(transient["input_energy_j"][-1]),
            "internal_loss_j": float(transient["internal_loss_j"][-1]),
            "radiation_loss_j": float(transient["radiation_loss_j"][-1]),
            "stored_energy_at_end_j": float(transient["stored_energy_j"][-1]),
            "energy_closure_error_j": float(transient["closure_error_j"][-1]),
            "energy_closure_fraction": transient["closure_fraction"],
        },
        "wall_compliance_example": wall,
        "wall_time_domain": {
            "neck_radius_mm": base["radius_m"] * 1000,
            "wall_initial_displacement_m3": WALL_INITIAL_DISPLACEMENT_M3,
            "time_step_s": WALL_TRANSIENT_DT_S,
            "end_time_s": WALL_TRANSIENT_END_S,
            "initial_energy_j": wall_transient["initial_energy_j"],
            "maximum_total_energy_drift_fraction": wall_transient["total_energy_drift_fraction"],
            "maximum_pressure_work_error_fraction": wall_transient["pressure_work_error_fraction"],
            "peak_pressure_pa": wall_transient["peak_pressure_pa"],
            "peak_wall_displacement_m": wall_transient["peak_wall_displacement_m"],
        },
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the frozen ANT cavity physical-minimum model.")
    parser.add_argument("--outdir", type=Path,
                        default=Path("docs/ant/evidence/2026-11-02-multiphysics-first-pass/cavity"))
    args = parser.parse_args()
    summary = write_outputs(args.outdir)
    print(json.dumps({
        "status": summary["status"],
        "base_frequency_hz": summary["aperture_sweep"][1]["f0_analytic_hz"],
        "energy_closure_fraction": summary["base_transient"]["energy_closure_fraction"],
        "output_dir": str(args.outdir),
    }, indent=2))


if __name__ == "__main__":
    main()
