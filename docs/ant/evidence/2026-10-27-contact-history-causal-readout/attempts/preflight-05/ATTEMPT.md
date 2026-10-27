# Preflight attempt 05

The endpoint scope fix allowed setup to finish, but the pared-down runner also lacked its local 60 Hz timestep constant and stopped before the first simulation tick. No geometry measurement or media capture occurred.

Correction: declare the registered `1/60` timestep in the browser scope. No experiment parameter changes.
