# Preflight attempt 04

The pared-down final runner failed before advancing the model because `END_TICK` was not declared inside the browser evaluation scope. No model tick, geometry measurement, or media capture occurred.

Correction: define the already registered endpoint (`6301`) inside that scope. This is a runner scoping fix only.
