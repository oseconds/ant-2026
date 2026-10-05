# Repository guidance

- Read `README.md` before changing the library or demo. For ANT work, use its ANT architecture and next-experiment sections as the project reference.
- Before resuming interrupted work, inspect `git status` and `git diff`; preserve valid partial changes and avoid duplicating them.
- Keep ANT simulation behavior in the framework-independent model. `AntController` coordinates systems, `LocalOccupancy` handles nearby bodies and contact constraints, `PheromoneField` holds shared trail memory, and `AntRenderer` only draws snapshots.
- Work one ANT experiment at a time. The handoff recorded in `README.md` identifies direction-aware local traffic as the next pass from its stated baseline; re-check current history and working tree in case that pass has already advanced.
- For that traffic pass, preserve equal agents and existing trail behavior. Do not change pheromone tuning, population, field resolution, spawning, audio, encounter/quorum/raid behavior, or UI in the same change.
- Do not claim the procession criterion is met from automated checks alone; inspect the actual visual result.
