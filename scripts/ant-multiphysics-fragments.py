"""Controlled 2D disk-contact fixtures for the ANT multiphysics first pass.

This is a small compliant DEM model, not an ANT production system or a rigid
contact solver. Run with the bundled Python and ``-B`` to write evidence files.
"""

from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/ant/evidence/2026-11-02-multiphysics-first-pass/fragments"
BASE_DT = 2.5e-5
DT_LADDER = (1e-4, 5e-5, BASE_DT)
BASE_K = 4000.0
K_LADDER = (2000.0, 8000.0)
MU = 0.5
E_RESTITUTION = 0.8
GRAVITY = np.array((0.0, -9.81), dtype=float)


@dataclass
class Disk:
    name: str
    pos: np.ndarray
    vel: np.ndarray
    radius: float = 0.5
    mass: float = 1.0
    angle: float = 0.0
    omega: float = 0.0

    @property
    def inertia(self) -> float:
        return 0.5 * self.mass * self.radius**2


@dataclass
class Wall:
    name: str
    start: np.ndarray
    end: np.ndarray
    inward: np.ndarray


@dataclass
class ContactMemory:
    xi_world: np.ndarray
    normal: np.ndarray
    normal_energy: float
    tangent_energy: float


def _cross(a: np.ndarray, b: np.ndarray) -> float:
    return float(a[0] * b[1] - a[1] * b[0])


def _perp(v: np.ndarray) -> np.ndarray:
    return np.array((-v[1], v[0]), dtype=float)


def _transport_tangent_history(xi_world: np.ndarray, old_normal: np.ndarray, normal: np.ndarray, tangent: np.ndarray) -> float:
    angle = math.atan2(_cross(old_normal, normal), float(np.dot(old_normal, normal)))
    c, s = math.cos(angle), math.sin(angle)
    rotated = np.array((c * xi_world[0] - s * xi_world[1], s * xi_world[0] + c * xi_world[1]))
    projected = rotated - float(np.dot(rotated, normal)) * normal
    return float(np.dot(projected, tangent))


def _unit(v: np.ndarray, fallback: np.ndarray | None = None) -> np.ndarray:
    length = float(np.linalg.norm(v))
    if length <= 1e-15:
        return np.array((1.0, 0.0), dtype=float) if fallback is None else fallback.copy()
    return v / length


def normal_dashpot(kn: float, effective_mass: float, restitution: float = E_RESTITUTION) -> float:
    """Return the nominal unclamped linear-dashpot coefficient."""
    if not (0.0 < restitution < 1.0) or kn <= 0.0 or effective_mass <= 0.0:
        raise ValueError("normal damping needs 0 < restitution < 1 and positive mass/stiffness")
    loge = math.log(restitution)
    return -2.0 * loge * math.sqrt(kn * effective_mass) / math.sqrt(math.pi**2 + loge**2)


def unilateral_restitution_reference(kn: float, effective_mass: float, gamma: float) -> float:
    """Exact restitution for a linear spring-dashpot cut off at zero normal force."""
    alpha = gamma / (2.0 * effective_mass)
    omega = math.sqrt(kn / effective_mass - alpha**2)
    if omega <= 0.0:
        raise ValueError("repulsive-only reference requires an underdamped contact")
    q = alpha / omega

    def state(theta: float) -> tuple[float, float, float]:
        decay = math.exp(-q * theta)
        delta = decay * math.sin(theta) / omega
        delta_dot = decay * (math.cos(theta) - q * math.sin(theta))
        normal_force = kn * delta + gamma * delta_dot
        return delta, delta_dot, normal_force

    lo, hi = math.pi / 2.0, math.pi
    if state(lo)[2] <= 0.0 or state(hi)[2] >= 0.0:
        raise ValueError("could not bracket the unloading force cutoff")
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if state(mid)[2] > 0.0:
            lo = mid
        else:
            hi = mid
    _, delta_dot, _ = state(0.5 * (lo + hi))
    return -delta_dot


def _contact_force(
    key: tuple,
    normal: np.ndarray,
    overlap: float,
    relative_velocity: np.ndarray,
    arm_a: np.ndarray,
    arm_b: np.ndarray | None,
    effective_mass: float,
    disk_a: Disk,
    disk_b: Disk | None,
    force: np.ndarray,
    torque: np.ndarray,
    memories: dict[tuple, ContactMemory],
    dt: float,
    kn: float,
    kt: float,
    mu: float,
) -> tuple[dict, ContactMemory | None, float, float, float, float]:
    tangent = _perp(normal)
    vn = float(np.dot(relative_velocity, normal))
    vt = float(np.dot(relative_velocity, tangent))
    gamma = normal_dashpot(kn, effective_mass)
    fn = max(0.0, kn * overlap - gamma * vn)
    old = memories.get(key)
    old_xi = _transport_tangent_history(old.xi_world, old.normal, normal, tangent) if old is not None else 0.0
    old_un = old.normal_energy if old is not None else 0.0
    old_ut = old.tangent_energy if old is not None else 0.0
    projected_ut = 0.5 * kt * old_xi**2
    frame_energy_change = projected_ut - old_ut
    if fn <= 0.0:
        released = old_ut
        cutoff_energy = 0.5 * kn * overlap**2 if old is not None else 0.0
        row = {
            "key": key,
            "overlap": overlap,
            "normal_force": 0.0,
            "tangent_force": 0.0,
            "xi": 0.0,
            "normal": normal.copy(),
            "tangent": tangent.copy(),
            "vt": vt,
            "active": False,
            "normal_energy": 0.0,
            "tangent_energy": 0.0,
            "tangent_frame_energy_change": 0.0,
            "normal_force_cutoff_energy": cutoff_energy,
        }
        return row, None, 0.0, 0.0, released, 0.0, cutoff_energy

    xi = old_xi + vt * dt
    ft = -kt * xi
    cap = mu * fn
    if abs(ft) > cap:
        direction = math.copysign(1.0, vt if abs(vt) > 1e-14 else xi)
        ft = -cap * direction
        xi = -ft / kt if kt > 0.0 else 0.0

    normal_energy = 0.5 * kn * overlap**2
    tangent_energy = 0.5 * kt * xi**2
    if disk_b is None:
        force_on_a = fn * normal + ft * tangent
        force[0] += force_on_a
        torque[0] += _cross(arm_a, ft * tangent)
    else:
        force_on_a = -fn * normal - ft * tangent
        force[0] += force_on_a
        torque[0] += _cross(arm_a, -ft * tangent)
    if disk_b is not None and arm_b is not None:
        force_on_b = fn * normal + ft * tangent
        force[1] += force_on_b
        torque[1] += _cross(arm_b, ft * tangent)

    normal_loss = -(fn * vn * dt + normal_energy - old_un) if dt > 0.0 else 0.0
    tangent_loss = -(ft * vt * dt + tangent_energy - projected_ut) if dt > 0.0 else 0.0
    if dt <= 0.0:
        frame_energy_change = 0.0
    memory = ContactMemory(xi * tangent, normal.copy(), normal_energy, tangent_energy)
    row = {
        "key": key,
        "overlap": overlap,
        "normal_force": fn,
        "tangent_force": ft,
        "xi": xi,
        "normal": normal.copy(),
        "tangent": tangent.copy(),
        "vt": vt,
        "active": True,
        "normal_energy": normal_energy,
        "tangent_energy": tangent_energy,
        "tangent_frame_energy_change": frame_energy_change,
        "normal_force_cutoff_energy": 0.0,
    }
    return row, memory, normal_loss, tangent_loss, 0.0, frame_energy_change, 0.0


def _wall_point(disk: Disk, wall: Wall) -> tuple[np.ndarray, np.ndarray, float]:
    segment = wall.end - wall.start
    denom = float(np.dot(segment, segment))
    q = 0.0 if denom <= 1e-15 else float(np.clip(np.dot(disk.pos - wall.start, segment) / denom, 0.0, 1.0))
    point = wall.start + q * segment
    delta = disk.pos - point
    distance = float(np.linalg.norm(delta))
    normal = _unit(delta, wall.inward)
    return point, normal, disk.radius - distance


def _energies(disks: list[Disk], gravity: np.ndarray, contacts: list[dict]) -> dict[str, float]:
    trans = sum(0.5 * d.mass * float(np.dot(d.vel, d.vel)) for d in disks)
    rot = sum(0.5 * d.inertia * d.omega**2 for d in disks)
    potential = sum(-d.mass * float(np.dot(gravity, d.pos)) for d in disks)
    normal = sum(c["normal_energy"] for c in contacts if c["active"])
    tangent = sum(c["tangent_energy"] for c in contacts if c["active"])
    return {
        "kinetic_translation": trans,
        "kinetic_rotation": rot,
        "gravity_potential": potential,
        "contact_normal_spring": normal,
        "contact_tangent_spring": tangent,
        "mechanical_total": trans + rot + potential + normal + tangent,
    }


def _seed_memories(disks: list[Disk], walls: list[Wall], kn: float) -> dict[tuple, ContactMemory]:
    memories: dict[tuple, ContactMemory] = {}
    for i, a in enumerate(disks):
        for b in disks[i + 1:]:
            delta = b.pos - a.pos
            distance = float(np.linalg.norm(delta))
            overlap = a.radius + b.radius - distance
            if overlap <= 0.0:
                continue
            normal = _unit(delta)
            vn = float(np.dot(b.vel - a.vel, normal))
            effective_mass = a.mass * b.mass / (a.mass + b.mass)
            fn = max(0.0, kn * overlap - normal_dashpot(kn, effective_mass) * vn)
            if fn > 0.0:
                memories[("disk", a.name, b.name)] = ContactMemory(
                    np.zeros(2), normal.copy(), 0.5 * kn * overlap**2, 0.0
                )
    for disk in disks:
        for wall in walls:
            _, normal, overlap = _wall_point(disk, wall)
            if overlap <= 0.0:
                continue
            vn = float(np.dot(disk.vel, normal))
            fn = max(0.0, kn * overlap - normal_dashpot(kn, disk.mass) * vn)
            if fn > 0.0:
                memories[("wall", disk.name, wall.name)] = ContactMemory(
                    np.zeros(2), normal.copy(), 0.5 * kn * overlap**2, 0.0
                )
    return memories


def _angular_momentum(disks: list[Disk]) -> float:
    return sum(d.mass * _cross(d.pos, d.vel) + d.inertia * d.omega for d in disks)


def _phase_for_fixture(name: str, t: float, disks: list[Disk]) -> tuple[str, dict[str, np.ndarray]]:
    if name not in ("row_blockage", "single_stop"):
        return "free", {}
    if t < 0.35:
        phase, value = "forward_drive", 8.0
    elif t < 0.75:
        phase, value = "forward_hold", 8.0
    elif t < 1.10:
        phase, value = "reverse_drive", -8.0
    else:
        phase, value = "released", 0.0
    return phase, {d.name: np.array((value, 0.0), dtype=float) for d in disks}


def simulate(
    name: str,
    disks: list[Disk],
    walls: list[Wall],
    *,
    duration: float,
    dt: float,
    mu: float,
    kn: float = BASE_K,
    kt: float = BASE_K,
    gravity: np.ndarray | None = None,
    driven: bool = False,
    log_interval: float = 0.001,
) -> dict:
    if duration <= 0 or dt <= 0 or mu < 0 or kn <= 0 or kt <= 0:
        raise ValueError("duration/stiffness/time step must be positive and friction nonnegative")
    steps_float = duration / dt
    steps = int(round(steps_float))
    if abs(steps * dt - duration) > max(1e-12, duration * 1e-10):
        raise ValueError("duration must be an integer multiple of dt")
    gravity = np.zeros(2, dtype=float) if gravity is None else np.asarray(gravity, dtype=float)
    memories = _seed_memories(disks, walls, kn)
    cumulative = {
        "drive_work": 0.0,
        "normal_contact_loss_signed": 0.0,
        "tangent_contact_loss_signed": 0.0,
        "contact_frame_energy_change": 0.0,
        "contact_history_release": 0.0,
        "normal_force_cutoff_energy": 0.0,
    }
    trace: list[dict] = []
    contact_rows: list[dict] = []
    initial_energy = None
    initial_state = {
        d.name: {
            "position": d.pos.tolist(),
            "velocity": d.vel.tolist(),
            "angle": d.angle,
            "angular_velocity": d.omega,
        }
        for d in disks
    }
    max_overlap = 0.0
    peak_normal_force = 0.0
    max_coulomb_excess = 0.0
    max_angular_speed = max(abs(d.omega) for d in disks)
    start_x_cm = sum(d.mass * d.pos[0] for d in disks) / sum(d.mass for d in disks)
    stride = max(1, int(round(log_interval / dt)))

    for step in range(steps + 1):
        t = step * dt
        phase, drive_map = _phase_for_fixture(name, t, disks) if driven else ("free", {})
        forces = np.array([d.mass * gravity + drive_map.get(d.name, np.zeros(2)) for d in disks], dtype=float)
        torques = np.zeros(len(disks), dtype=float)
        contacts: list[dict] = []
        new_memories: dict[tuple, ContactMemory] = {}
        normal_loss_step = tangent_loss_step = frame_change_step = release_step = cutoff_energy_step = 0.0

        for i in range(len(disks)):
            for j in range(i + 1, len(disks)):
                a, b = disks[i], disks[j]
                delta = b.pos - a.pos
                distance = float(np.linalg.norm(delta))
                overlap = a.radius + b.radius - distance
                key = ("disk", a.name, b.name)
                if overlap <= 0.0:
                    old = memories.get(key)
                    if old is not None:
                        release_step += old.normal_energy + old.tangent_energy
                    continue
                normal = _unit(delta)
                arm_a = (a.radius - overlap / 2.0) * normal
                arm_b = -(b.radius - overlap / 2.0) * normal
                relative = (b.vel + b.omega * _perp(arm_b)) - (a.vel + a.omega * _perp(arm_a))
                effective_mass = a.mass * b.mass / (a.mass + b.mass)
                pair_force = np.zeros((2, 2), dtype=float)
                pair_torque = np.zeros(2, dtype=float)
                row, memory, dn, dtan, released, frame_change, cutoff_energy = _contact_force(
                    key, normal, overlap, relative, arm_a, arm_b, effective_mass,
                    a, b, pair_force, pair_torque, memories, dt if step < steps else 0.0, kn, kt, mu,
                )
                forces[i] += pair_force[0]
                forces[j] += pair_force[1]
                torques[i] += pair_torque[0]
                torques[j] += pair_torque[1]
                normal_loss_step += dn
                tangent_loss_step += dtan
                frame_change_step += frame_change
                release_step += released
                cutoff_energy_step += cutoff_energy
                if memory is not None:
                    new_memories[key] = memory
                contacts.append(row)

        for i, disk in enumerate(disks):
            for wall in walls:
                _, normal, overlap = _wall_point(disk, wall)
                key = ("wall", disk.name, wall.name)
                if overlap <= 0.0:
                    old = memories.get(key)
                    if old is not None:
                        release_step += old.normal_energy + old.tangent_energy
                    continue
                tangent = _perp(normal)
                arm = -(disk.radius - overlap / 2.0) * normal
                contact_velocity = disk.vel + disk.omega * _perp(arm)
                relative = contact_velocity
                effective_mass = disk.mass
                wall_force = np.zeros((1, 2), dtype=float)
                wall_torque = np.zeros(1, dtype=float)
                row, memory, dn, dtan, released, frame_change, cutoff_energy = _contact_force(
                    key, normal, overlap, relative, arm, None, effective_mass,
                    disk, None, wall_force, wall_torque, memories, dt if step < steps else 0.0, kn, kt, mu,
                )
                forces[i] += wall_force[0]
                torques[i] += wall_torque[0]
                normal_loss_step += dn
                tangent_loss_step += dtan
                frame_change_step += frame_change
                release_step += released
                cutoff_energy_step += cutoff_energy
                if memory is not None:
                    new_memories[key] = memory
                row["wall_name"] = wall.name
                row["disk_name"] = disk.name
                contacts.append(row)

        memories = new_memories
        cumulative["normal_contact_loss_signed"] += normal_loss_step
        cumulative["tangent_contact_loss_signed"] += tangent_loss_step
        cumulative["contact_frame_energy_change"] += frame_change_step
        cumulative["contact_history_release"] += release_step
        cumulative["normal_force_cutoff_energy"] += cutoff_energy_step

        for contact in contacts:
            overlap = float(contact["overlap"])
            fn = float(contact["normal_force"])
            ft = float(contact["tangent_force"])
            max_overlap = max(max_overlap, overlap)
            peak_normal_force = max(peak_normal_force, fn)
            if fn > 0.0:
                max_coulomb_excess = max(max_coulomb_excess, abs(ft) - mu * fn)

        energy = _energies(disks, gravity, contacts)
        if initial_energy is None:
            initial_energy = energy["mechanical_total"]
        energy["drive_work"] = cumulative["drive_work"]
        energy["normal_contact_loss_signed"] = cumulative["normal_contact_loss_signed"]
        energy["tangent_contact_loss_signed"] = cumulative["tangent_contact_loss_signed"]
        energy["contact_frame_energy_change"] = cumulative["contact_frame_energy_change"]
        energy["contact_history_release"] = cumulative["contact_history_release"]
        energy["normal_force_cutoff_energy"] = cumulative["normal_force_cutoff_energy"]
        energy["balance_residual"] = (
            energy["mechanical_total"] - initial_energy - cumulative["drive_work"]
            + cumulative["normal_contact_loss_signed"]
            + cumulative["tangent_contact_loss_signed"]
            + cumulative["contact_history_release"]
            - cumulative["contact_frame_energy_change"]
        )

        if step % stride == 0 or step == steps:
            row = {"time": t, "phase": phase, **energy}
            row["drive_force_x_total"] = sum(float(f[0]) for f in drive_map.values())
            for d in disks:
                row[f"{d.name}_x"] = float(d.pos[0])
                row[f"{d.name}_y"] = float(d.pos[1])
                row[f"{d.name}_vx"] = float(d.vel[0])
                row[f"{d.name}_vy"] = float(d.vel[1])
                row[f"{d.name}_theta"] = float(d.angle)
                row[f"{d.name}_omega"] = float(d.omega)
            row["center_of_mass_x"] = sum(d.mass * d.pos[0] for d in disks) / sum(d.mass for d in disks)
            row["contact_count"] = sum(c["active"] for c in contacts)
            row["disk_disk_contact_count"] = sum(c["active"] and c["key"][0] == "disk" for c in contacts)
            row["wall_contact_count"] = sum(c["active"] and c["key"][0] == "wall" for c in contacts)
            row["end_stop_contact_count"] = sum(c["active"] and c.get("wall_name") == "end_stop" for c in contacts)
            row["max_overlap"] = max((c["overlap"] for c in contacts), default=0.0)
            row["peak_normal_force"] = max((c["normal_force"] for c in contacts), default=0.0)
            trace.append(row)
            for contact in contacts:
                contact_rows.append({
                    "time": t,
                    "phase": phase,
                    "contact_type": contact["key"][0],
                    "body_a": contact.get("disk_name", contact["key"][1]),
                    "body_b": contact.get("wall_name", contact["key"][2] if len(contact["key"]) > 2 else ""),
                    "overlap": float(contact["overlap"]),
                    "normal_x": float(contact["normal"][0]),
                    "normal_y": float(contact["normal"][1]),
                    "normal_force": float(contact["normal_force"]),
                    "tangent_force": float(contact["tangent_force"]),
                    "tangent_slip_speed": float(contact["vt"]),
                    "tangent_spring_displacement": float(contact["xi"]),
                    "active_force": bool(contact["active"]),
                    "normal_spring_energy": float(contact["normal_energy"]),
                    "tangent_spring_energy": float(contact["tangent_energy"]),
                    "tangent_frame_energy_change": float(contact.get("tangent_frame_energy_change", 0.0)),
                    "normal_force_cutoff_energy": float(contact.get("normal_force_cutoff_energy", 0.0)),
                })

        if step == steps:
            break

        prior_velocities = [d.vel.copy() for d in disks]
        for i, disk in enumerate(disks):
            disk.vel += forces[i] / disk.mass * dt
            disk.omega += torques[i] / disk.inertia * dt
            disk.pos += disk.vel * dt
            disk.angle += disk.omega * dt
            drive_force = drive_map.get(disk.name, np.zeros(2))
            cumulative["drive_work"] += float(np.dot(drive_force, 0.5 * (prior_velocities[i] + disk.vel))) * dt
        max_angular_speed = max(max_angular_speed, *(abs(d.omega) for d in disks))

    final = trace[-1]
    final_x_cm = final["center_of_mass_x"]
    summary = {
        "fixture": name,
        "mu": mu,
        "dt": dt,
        "kn": kn,
        "kt": kt,
        "duration": duration,
        "gravity": gravity.tolist(),
        "disks": [d.name for d in disks],
        "units": {
            "length": "m",
            "mass": "kg",
            "time": "s",
            "force": "N",
            "moment": "N m",
            "energy": "J",
            "angle": "rad",
        },
        "walls": [
            {"name": w.name, "start": w.start.tolist(), "end": w.end.tolist(), "inward": w.inward.tolist()}
            for w in walls
        ],
        "disk_radius": {d.name: d.radius for d in disks},
        "disk_mass": {d.name: d.mass for d in disks},
        "disk_moment_of_inertia": {d.name: d.inertia for d in disks},
        "initial_state": initial_state,
        "normal_dashpot_pair": normal_dashpot(kn, disks[0].mass * disks[1].mass / (disks[0].mass + disks[1].mass)) if len(disks) > 1 else None,
        "normal_dashpot_wall": {d.name: normal_dashpot(kn, d.mass) for d in disks},
        "tangential_dashpot": 0.0,
        "normal_dashpot_unclamped_reference_e": E_RESTITUTION,
        "initial_center_of_mass_x": start_x_cm,
        "final_center_of_mass_x": final_x_cm,
        "net_center_of_mass_dx": final_x_cm - start_x_cm,
        "peak_overlap": max_overlap,
        "peak_normal_force": peak_normal_force,
        "max_coulomb_excess": max_coulomb_excess,
        "max_angular_speed": max_angular_speed,
        "initial_mechanical_energy": initial_energy,
        "final_mechanical_energy": final["mechanical_total"],
        "drive_work": cumulative["drive_work"],
        "normal_contact_loss_signed": cumulative["normal_contact_loss_signed"],
        "tangent_contact_loss_signed": cumulative["tangent_contact_loss_signed"],
        "contact_frame_energy_change": cumulative["contact_frame_energy_change"],
        "contact_history_release": cumulative["contact_history_release"],
        "normal_force_cutoff_energy": cumulative["normal_force_cutoff_energy"],
        "final_energy_balance_residual": final["balance_residual"],
        "final_translation_speeds": {d.name: float(np.linalg.norm(d.vel)) for d in disks},
        "final_angular_speeds": {d.name: float(d.omega) for d in disks},
        "final_angular_momentum": _angular_momentum(disks),
    }
    return {
        "summary": summary,
        "trace": trace,
        "contact_rows": contact_rows,
        "final_angular_speeds": summary["final_angular_speeds"],
        "final_angular_momentum": summary["final_angular_momentum"],
    }


def _floor_disk() -> Disk:
    overlap = 9.81 / BASE_K
    return Disk("fragment", np.array((0.0, 0.5 - overlap)), np.array((0.5, 0.0)), omega=2.0)


def _floor_walls() -> list[Wall]:
    return [Wall("floor", np.array((-100.0, 0.0)), np.array((100.0, 0.0)), np.array((0.0, 1.0)))]


def run_pair_impact(mu: float, dt: float, kn: float = BASE_K, *, head_on: bool = False) -> dict:
    impact_v = np.array((1.0, 0.0 if head_on else 0.35))
    disks = [
        Disk("A", np.array((-0.505, 0.0)), impact_v.copy()),
        Disk("B", np.array((0.505, 0.0)), np.array((0.0, 0.0))),
    ]
    start_h = _angular_momentum(disks)
    result = simulate("pair_impact", disks, [], duration=0.12, dt=dt, mu=mu, kn=kn, kt=kn)
    result["summary"]["initial_angular_momentum"] = start_h
    result["summary"]["angular_momentum_drift"] = result["summary"]["final_angular_momentum"] - start_h
    result["summary"]["final_contact_active"] = bool(result["trace"][-1]["contact_count"])
    result["summary"]["final_omega_A"] = result["final_angular_speeds"]["A"]
    result["summary"]["final_omega_B"] = result["final_angular_speeds"]["B"]
    result["summary"]["impact_kind"] = "head_on_restitution" if head_on else "oblique_frictional_torque"
    if head_on:
        measured = float((disks[1].vel[0] - disks[0].vel[0]) / impact_v[0])
        gamma = normal_dashpot(kn, 0.5)
        result["summary"]["nominal_unclamped_reference_e"] = E_RESTITUTION
        result["summary"]["repulsive_only_reference_e"] = unilateral_restitution_reference(kn, 0.5, gamma)
        result["summary"]["measured_normal_restitution"] = measured
        result["summary"]["restitution_reference_abs_error"] = abs(measured - result["summary"]["repulsive_only_reference_e"])
    return result


def run_floor_arrest(mu: float, dt: float, kn: float = BASE_K) -> dict:
    overlap = 9.81 / kn
    disk = Disk("fragment", np.array((0.0, 0.5 - overlap)), np.array((0.5, 0.0)), omega=2.0)
    result = simulate("floor_arrest", [disk], _floor_walls(), duration=0.14, dt=dt, mu=mu, kn=kn, kt=kn, gravity=GRAVITY)
    result["summary"]["analytic_stop_time"] = 0.5 / (mu * 9.81) if mu > 0.0 else None
    result["summary"]["analytic_stop_distance"] = 0.5**2 / (2.0 * mu * 9.81) if mu > 0.0 else None
    result["summary"]["measured_dx"] = disk.pos[0]
    result["summary"]["measured_vx_final"] = disk.vel[0]
    result["summary"]["measured_omega_final"] = disk.omega
    return result


def _row_scene(count: int = 3, kn: float = BASE_K) -> tuple[list[Disk], list[Wall]]:
    y = 0.5 - 9.81 / kn
    xs = [-1.0, 0.0, 1.0] if count == 3 else [1.0]
    disks = [Disk(f"fragment_{i + 1}", np.array((x, y)), np.zeros(2)) for i, x in enumerate(xs)]
    walls = [
        Wall("floor", np.array((-10.0, 0.0)), np.array((10.0, 0.0)), np.array((0.0, 1.0))),
        Wall("end_stop", np.array((1.5, 0.0)), np.array((1.5, 1.05)), np.array((-1.0, 0.0))),
        Wall("ceiling", np.array((-10.0, 1.05)), np.array((10.0, 1.05)), np.array((0.0, -1.0))),
    ]
    return disks, walls


def run_row_blockage(mu: float, dt: float, kn: float = BASE_K, single: bool = False) -> dict:
    name = "single_stop" if single else "row_blockage"
    disks, walls = _row_scene(count=1 if single else 3, kn=kn)
    result = simulate(name, disks, walls, duration=1.10, dt=dt, mu=mu, kn=kn, kt=kn, gravity=GRAVITY, driven=True)
    trace = result["trace"]
    hold_rows = [r for r in trace if 0.65 <= r["time"] < 0.75]
    result["summary"]["hold_rightward_dx"] = (hold_rows[-1]["center_of_mass_x"] - hold_rows[0]["center_of_mass_x"]) if len(hold_rows) > 1 else None
    result["summary"]["hold_min_drive_force_x"] = min((r["drive_force_x_total"] for r in hold_rows), default=0.0)
    reverse_rows = [r for r in trace if 0.75 <= r["time"] <= 1.10]
    result["summary"]["reverse_leftward_dx"] = (reverse_rows[0]["center_of_mass_x"] - reverse_rows[-1]["center_of_mass_x"]) if len(reverse_rows) > 1 else None
    result["summary"]["hold_min_disk_contacts"] = min((r["disk_disk_contact_count"] for r in hold_rows), default=0)
    result["summary"]["hold_min_end_stop_contacts"] = min((r["end_stop_contact_count"] for r in hold_rows), default=0)
    result["summary"]["reverse_final_end_stop_contacts"] = reverse_rows[-1]["end_stop_contact_count"] if reverse_rows else None
    result["summary"]["classification"] = "single-body geometric stop control" if single else "wall-supported multi-contact blockage; not a collective-jam claim"
    return result


def _write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    keys: list[str] = []
    for row in rows:
        for key in row:
            if key not in keys:
                keys.append(key)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in row.items()})


def _flatten_summary(result: dict, run_id: str) -> dict:
    return {"run_id": run_id, **{k: v for k, v in result["summary"].items() if k not in ("trace", "contact_rows", "final_disks")}}


def _fixed_geometry_plot(results: list[tuple[str, dict]], path: Path) -> None:
    selected = [(label, r) for label, r in results if r["summary"]["fixture"] in ("pair_impact", "floor_arrest", "row_blockage", "single_stop")]
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5), constrained_layout=True)
    groups = [
        ("Pair impact", [p for p in selected if p[1]["summary"]["fixture"] == "pair_impact"], (-1.2, 1.2, -0.8, 0.8)),
        ("Floor Coulomb response", [p for p in selected if p[1]["summary"]["fixture"] == "floor_arrest"], (-0.55, 0.55, 0.0, 1.1)),
        ("Loaded row / reverse", [p for p in selected if p[1]["summary"]["fixture"] == "row_blockage"], (-2.0, 2.0, 0.0, 1.1)),
    ]
    color = {"A": "#386cb0", "B": "#f0027f", "fragment": "#1b9e77", "fragment_1": "#386cb0", "fragment_2": "#fdb462", "fragment_3": "#1b9e77"}
    for ax, (title, group, limits) in zip(axes, groups):
        if not group:
            continue
        label, result = next((label, r) for label, r in group if r["summary"]["dt"] == BASE_DT and r["summary"]["mu"] == MU and r["summary"]["kn"] == BASE_K)
        trace = result["trace"]
        indices = sorted(set([0, len(trace)//3, 2*len(trace)//3, len(trace)-1]))
        for idx in indices:
            row = trace[idx]
            for disk in result["summary"]["disks"]:
                x, y = row[f"{disk}_x"], row[f"{disk}_y"]
                angle = row[f"{disk}_theta"]
                radius = 0.5
                ax.add_patch(plt.Circle((x, y), radius, fill=False, color=color.get(disk, "#333333"), alpha=0.28 + 0.12 * indices.index(idx), lw=1.2))
                ax.plot((x, x + 0.75 * radius * math.cos(angle)), (y, y + 0.75 * radius * math.sin(angle)), color=color.get(disk, "#333333"), alpha=0.35 + 0.15 * indices.index(idx), lw=1.1)
        if title == "Loaded row / reverse":
            ax.axvline(1.5, color="#444444", lw=1.5)
            ax.axhline(0.0, color="#777777", lw=1.0)
            ax.axhline(1.05, color="#777777", lw=1.0)
        elif title == "Floor Coulomb response":
            ax.axhline(0.0, color="#777777", lw=1.0)
        ax.set_xlim(limits[0], limits[1])
        ax.set_ylim(limits[2], limits[3])
        ax.set_aspect("equal", adjustable="box")
        ax.set_title(f"{title}\n{label}")
        ax.set_xlabel("x (m)")
        ax.set_ylabel("y (m)")
        ax.grid(alpha=0.18)
    fig.suptitle("Fixed-scale geometry snapshots: preregistered baseline parameters")
    fig.savefig(path, dpi=180)
    plt.close(fig)


def _fixed_energy_plot(results: list[tuple[str, dict]], path: Path) -> None:
    fixtures = ["pair_impact", "floor_arrest", "row_blockage"]
    components = ("kinetic_translation", "kinetic_rotation", "contact_normal_spring", "contact_tangent_spring", "gravity_potential")
    ledger = ("drive_work", "normal_contact_loss_signed", "tangent_contact_loss_signed", "contact_history_release", "normal_force_cutoff_energy", "balance_residual")
    component_colors = {key: color for key, color in zip(components, ("#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e"))}
    ledger_colors = {key: color for key, color in zip(ledger, ("#7570b3", "#d95f02", "#e7298a", "#666666", "#66a61e", "#000000"))}
    fig, axes = plt.subplots(len(fixtures), 2, figsize=(15, 11), constrained_layout=True)
    legend_items: dict[str, object] = {}
    for row_index, (fixture, ax_pair) in enumerate(zip(fixtures, axes)):
        ax_components, ax_ledger = ax_pair
        if fixture == "pair_impact":
            wanted = {f"impact_mu050_dt{BASE_DT:g}", "impact_mu000_base"}
        elif fixture == "floor_arrest":
            wanted = {f"floor_mu050_dt{BASE_DT:g}", "floor_mu000_base"}
        else:
            wanted = {f"row_mu050_dt{BASE_DT:g}", "row_mu000_base"}
        group = [(label, r) for label, r in results if label in wanted]
        component_values, ledger_values = [], []
        for label, result in group:
            trace = result["trace"]
            t = [r["time"] for r in trace]
            arm = "μ=0.5" if result["summary"]["mu"] > 0.0 else "μ=0"
            for key in components:
                start = trace[0].get(key, 0.0)
                values = [r.get(key, 0.0) - start for r in trace]
                component_values.extend(values)
                line, = ax_components.plot(t, values, lw=1.0, color=component_colors[key], alpha=0.78, ls="-" if arm == "μ=0.5" else "--")
                legend_items.setdefault(f"{arm} {key}", line)
            for key in ledger:
                values = [r.get(key, 0.0) for r in trace]
                ledger_values.extend(values)
                line, = ax_ledger.plot(t, values, lw=1.0, color=ledger_colors[key], alpha=0.78, ls="-" if arm == "μ=0.5" else "--")
                legend_items.setdefault(f"{arm} {key}", line)
        for ax, values, title in ((ax_components, component_values, "energy components Δ from t=0"), (ax_ledger, ledger_values, "signed work / loss ledger")):
            span = max(1e-6, max((abs(v) for v in values), default=1e-6))
            ax.set_ylim(-1.05 * span, 1.05 * span)
            ax.set_title(f"{fixture}: {title}; fixed limit ±{1.05 * span:.4g} J")
            ax.set_ylabel("J")
            ax.grid(alpha=0.2)
        if fixture == "row_blockage":
            for ax in (ax_components, ax_ledger):
                ax.axvline(0.35, color="#555555", ls=":")
                ax.axvline(0.75, color="#555555", ls=":")
                ax.axvline(1.10, color="#555555", ls=":")
        if row_index == len(fixtures) - 1:
            ax_components.set_xlabel("time (s)")
            ax_ledger.set_xlabel("time (s)")
    fig.legend(legend_items.values(), legend_items.keys(), loc="outside lower center", ncol=4, fontsize=6)
    fig.suptitle("Fixed-scale energy and work comparison (matched μ arms)")
    fig.savefig(path, dpi=180)
    plt.close(fig)


def run_campaign(output: Path = EVIDENCE / "results") -> dict:
    output.mkdir(parents=True, exist_ok=True)
    results: list[tuple[str, dict]] = []

    for dt in DT_LADDER:
        label = f"head_on_mu000_dt{dt:g}"
        results.append((label, run_pair_impact(0.0, dt, head_on=True)))

    for dt in DT_LADDER:
        label = f"impact_mu050_dt{dt:g}"
        results.append((label, run_pair_impact(MU, dt)))
    results.append(("impact_mu000_base", run_pair_impact(0.0, BASE_DT)))

    for dt in DT_LADDER:
        label = f"floor_mu050_dt{dt:g}"
        results.append((label, run_floor_arrest(MU, dt)))
    results.append(("floor_mu000_base", run_floor_arrest(0.0, BASE_DT)))
    for kn in K_LADDER:
        results.append((f"floor_mu050_kn{int(kn)}", run_floor_arrest(MU, BASE_DT, kn)))

    for dt in DT_LADDER:
        label = f"row_mu050_dt{dt:g}"
        results.append((label, run_row_blockage(MU, dt)))
    results.append(("row_mu000_base", run_row_blockage(0.0, BASE_DT)))
    for kn in K_LADDER:
        results.append((f"row_mu050_kn{int(kn)}", run_row_blockage(MU, BASE_DT, kn)))
    results.append(("single_stop_base", run_row_blockage(MU, BASE_DT, single=True)))

    summary_rows = [_flatten_summary(result, label) for label, result in results]
    trace_rows = [{"run_id": label, **row} for label, result in results for row in result["trace"]]
    contact_rows = [{"run_id": label, **row} for label, result in results for row in result["contact_rows"]]
    _write_csv(output / "run-summary.csv", summary_rows)
    _write_csv(output / "timeseries.csv", trace_rows)
    _write_csv(output / "contact-ledger.csv", contact_rows)
    _fixed_geometry_plot(results, output / "geometry-timelines.png")
    _fixed_energy_plot(results, output / "energy-ledger.png")
    result_doc = {
        "protocol": "docs/ant/evidence/2026-11-02-multiphysics-first-pass/fragments/PROTOCOL.md",
        "integrator": "semi-implicit Euler; explicit contact forces; energy residual retained as diagnostic",
        "model": "2D compliant disk DEM; linear spring-dashpot normal contact; history tangential spring with Coulomb cap",
        "units": {"length": "m", "mass": "kg", "time": "s", "force": "N", "moment": "N m", "energy": "J", "angle": "rad"},
        "parameter_calibration": "illustrative, uncalibrated synthetic fixture values",
        "energy_work_status": "INCONCLUSIVE; signed balance residual excludes separately reported normal-force-cutoff energy and is not a validated dissipation budget",
        "run_count": len(results),
        "runs": summary_rows,
    }
    (output / "results.json").write_text(json.dumps(result_doc, indent=2), encoding="utf-8")
    return result_doc


if __name__ == "__main__":
    report = run_campaign()
    print(json.dumps({"run_count": report["run_count"], "output": str(EVIDENCE / "results")}, indent=2))
