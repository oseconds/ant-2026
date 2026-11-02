"""Small conservative thin-film and heat solvers on a masked square grid.

All fields are vectors over active cells. ``Grid.unpack`` restores a full
``(n, n)`` array and marks blocked cells with NaN. Lengths and time are
nondimensional; ``dx`` is the grid spacing.
"""
from dataclasses import dataclass

import numpy as np
from scipy.sparse import coo_matrix, diags, eye
from scipy.sparse.linalg import spsolve


@dataclass
class Grid:
    n: int
    blocked: np.ndarray | None = None
    boundary: str = "noflux"
    dx: float | None = None

    def __post_init__(self):
        if not isinstance(self.n, int) or self.n < 2:
            raise ValueError("n must be an integer >= 2")
        if self.boundary not in ("noflux", "periodic"):
            raise ValueError("boundary must be 'noflux' or 'periodic'")
        self.dx = 1.0 / self.n if self.dx is None else self.dx
        if not np.isfinite(self.dx) or self.dx <= 0:
            raise ValueError("dx must be finite and positive")
        blocked = np.zeros((self.n, self.n), dtype=bool) if self.blocked is None else np.asarray(self.blocked, dtype=bool)
        if blocked.shape != (self.n, self.n):
            raise ValueError("blocked must have shape (n, n)")
        self.blocked = blocked.copy()
        self.active = np.flatnonzero(~blocked.ravel())
        if not self.active.size:
            raise ValueError("grid must contain an active cell")
        self._index = np.full(self.n * self.n, -1, dtype=int)
        self._index[self.active] = np.arange(self.active.size)
        self.i, self.j = self._make_edges()
        self.B = coo_matrix((np.r_[np.full(len(self.i), -1.0), np.ones(len(self.i))],
                             (np.r_[np.arange(len(self.i)), np.arange(len(self.i))], np.r_[self.i, self.j])),
                            shape=(len(self.i), self.active.size)).tocsr()
        self.K = (self.B.T @ self.B).tocsr() / self.dx**2

    def _make_edges(self):
        pairs = []
        for y in range(self.n):
            for x in range(self.n):
                a = self._index[y * self.n + x]
                if a < 0:
                    continue
                for yy, xx in ((y, x + 1), (y + 1, x)):
                    if self.boundary == "periodic":
                        yy %= self.n
                        xx %= self.n
                    elif yy >= self.n or xx >= self.n:
                        continue
                    b = self._index[yy * self.n + xx]
                    if b >= 0 and b != a:
                        pairs.append((min(a, b), max(a, b)))
        edges = sorted(pairs)
        return np.array([p[0] for p in edges], dtype=int), np.array([p[1] for p in edges], dtype=int)

    @property
    def size(self):
        return self.active.size

    def pack(self, field):
        a = np.asarray(field, dtype=float)
        if a.shape == (self.n, self.n):
            a = a.ravel()[self.active]
        if a.shape != (self.size,) or not np.all(np.isfinite(a)):
            raise ValueError("field must be finite and match active grid cells")
        return a.copy()

    def unpack(self, values):
        a = self.pack(values)
        out = np.full(self.n * self.n, np.nan)
        out[self.active] = a
        return out.reshape(self.n, self.n)


def _positive_scalar(name, value, allow_zero=False):
    if not np.isfinite(value) or value < 0 or (not allow_zero and value == 0):
        raise ValueError(f"{name} must be finite and {'nonnegative' if allow_zero else 'positive'}")
    return float(value)


def wet_film_energy(grid, h, b=0.1, W=0.5):
    h = grid.pack(h)
    b, W = _positive_scalar("b", b), _positive_scalar("W", W, True)
    if np.any(h <= 0):
        raise ValueError("h must be positive")
    phi = W * (-0.5 * (b / h)**2 + 0.2 * (b / h)**5)
    return float(grid.dx**2 * (0.5 * h @ (grid.K @ h) + phi.sum()))


def wet_film_step(grid, h, dt, A_m=1.0, b=0.1, W=0.5, viscosity=1.0, rtol=1e-10, atol=1e-10, max_iter=30):
    """Convex-split implicit step; raises RuntimeError if Newton fails."""
    old = grid.pack(h)
    dt = _positive_scalar("dt", dt)
    A_m, viscosity = _positive_scalar("A_m", A_m), _positive_scalar("viscosity", viscosity)
    b, W = _positive_scalar("b", b), _positive_scalar("W", W, True)
    if np.any(old <= 0):
        raise ValueError("h must be positive")
    old3 = old**3
    mob = 0.5 * (old3[grid.i] + old3[grid.j]) / (A_m * viscosity)
    A = (grid.B.T @ diags(mob) @ grid.B).tocsr() / grid.dx**2
    rhs_p = W * b**2 / old**3
    hnew = old.copy()
    scale = atol + rtol * max(1.0, np.linalg.norm(old))

    def residual(x):
        p = grid.K @ x - W * b**5 / x**6 + rhs_p
        return x - old + dt * (A @ p), p

    r, p = residual(hnew)
    steps = 0
    while np.linalg.norm(r) > scale and steps < max_iter:
        jac = eye(grid.size, format="csr") + dt * A @ (grid.K + diags(6 * W * b**5 / hnew**7))
        delta = spsolve(jac.tocsc(), -r)
        if not np.all(np.isfinite(delta)):
            break
        alpha = min(1.0, 0.99 * np.min(-hnew[delta < 0] / delta[delta < 0])) if np.any(delta < 0) else 1.0
        accepted = False
        while alpha >= 1e-12:
            trial = hnew + alpha * delta
            if np.all(trial > 0):
                trial_r, trial_p = residual(trial)
                if np.linalg.norm(trial_r) < np.linalg.norm(r):
                    hnew, r, p, accepted = trial, trial_r, trial_p, True
                    break
            alpha *= 0.5
        if not accepted:
            break
        steps += 1
    if np.linalg.norm(r) > scale:
        raise RuntimeError("wet-film Newton solve failed to converge")

    dissipation = float(grid.dx**2 * p @ (A @ p))
    edge_flux = -mob * (p[grid.j] - p[grid.i]) / grid.dx
    before, after = wet_film_energy(grid, old, b, W), wet_film_energy(grid, hnew, b, W)
    receipt = {
        "residual_norm": float(np.linalg.norm(r)), "newton_steps": steps,
        "min_h": float(hnew.min()), "mass_before": float(grid.dx**2 * old.sum()),
        "mass_after": float(grid.dx**2 * hnew.sum()), "energy_before": before,
        "energy_after": after, "dt_dissipation": dt * dissipation,
        "energy_inequality_defect": after - before + dt * dissipation,
        "absolute_edge_flux_volume": float(np.abs(edge_flux).sum() * grid.dx * dt),
        "max_edge_flux": float(np.abs(edge_flux).max(initial=0.0)),
        "integrated_signed_edge_flux": dt * edge_flux * grid.dx,
    }
    return hnew, receipt


def heat_step(grid, h, dt, diffusivity=1.0):
    """Implicit discrete heat step with closed or periodic boundary topology."""
    old = grid.pack(h)
    dt, diffusivity = _positive_scalar("dt", dt), _positive_scalar("diffusivity", diffusivity, True)
    return spsolve((eye(grid.size, format="csr") + dt * diffusivity * grid.K).tocsc(), old)
