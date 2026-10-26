import { AntAgent } from './AntAgent.js';
import { LocalOccupancy } from './LocalOccupancy.js';
import { PheromoneField } from './PheromoneField.js';
import { GaitController } from './GaitController.js';
import { BodyPoseController, gasterRearPoint } from './BodyPoseController.js';
import { GasterDeposition } from './GasterDeposition.js';
import { ColonyActivation } from './ColonyActivation.js';
import { SurfaceField } from './SurfaceField.js';
import { TrailPlateBirth } from './TrailPlateBirth.js';
import { MaterialStratigraphy } from './MaterialStratigraphy.js';

const STEP_MS = 1000 / 60;
const MAX_FRAME_GAP_MS = 100;
// A steep Hill response suppresses diffuse residue while rewarding repeated
// passes. Concentrations are cell values, not fractions of the storage cap.
const TRAIL_HALF_SATURATION = 0.035;
const TRAIL_RESPONSE_EXPONENT = 3;
const TRAIL_SCORE_GAIN = 2.8;
const DECISION_TEMPERATURE = 0.85;
const MIN_EXPLORATION_PROBABILITY = 0.04;
const SENSOR_OFFSETS = [-1, -0.5, 0, 0.5, 1];
const LOCAL_SENSOR_DISTANCES = [0.016, 0.028];
const LOCAL_SENSOR_HALF_WIDTH = 0.009;
const LOCAL_BAND_HALF_WIDTH = 0.003;
const LOCAL_STEERING_LIMIT = 0.45;
const LOCAL_TRAIL_HALF_SATURATION = 0.018;
const LOCAL_TURN_DAMPING = 0.65;
const ADHERENCE_RISE_SECONDS = 0.25;
const ADHERENCE_FADE_SECONDS = 1.8;
const ADHERENCE_HEADING_WEIGHT = 0.82;
const ADHERENCE_DIRECTION_SCORE = 3;
const DEPOSITION_BASELINE = 0.5;
const DEPOSITION_ADHERENCE_EXPONENT = 2;
const SEPARATION_ACCELERATION = 0.003;
const HESITATION_SPEED_RATIO = 0.05;
const HESITATION_MIN_SECONDS = 0.7;
const HESITATION_RANGE_SECONDS = 0.8;
const TAU = Math.PI * 2;
// This is only an entry region. Agents have no reason to return to it.
const SPAWN_CENTER = { x: 0.5, y: 0.72 };
const SPAWN_RADIUS = 0.018;
const SPAWN_HEADING = -Math.PI / 2;
const SPAWN_HEADING_SPREAD = 0.3;
const SPAWN_INTERVAL_MIN_MS = 400;
const SPAWN_INTERVAL_RANGE_MS = 500;
const SPAWN_RETRY_MS = 120;
const SPAWN_PLACEMENT_ATTEMPTS = 12;
const SPAWN_CLEARANCE = 0.004;
const DEFAULT_STATE = Object.freeze({
    model: 'ant',
    audioExperiment: { mode: 'bornSurface', baseSubstrate: false },
    population: { count: 28, activationFeedback: true },
    pheromone: {
        halfLifeSeconds: 15, amountPerUnitDistance: 4.5, radius: 0.0045, reinforcementGain: 5,
        depositionMode: 'dab'
    },
    behavior: { sensorDistance: 0.042, sensorWidth: 0.014, bodyRadius: 0.006 }
});

/** Framework independent population and shared-environment simulation. */
export class AntController {
    constructor({ state, random = Math.random, fieldFactory = (options) => new PheromoneField(options),
        gaitController = new GaitController(), bodyPoseController = new BodyPoseController(),
        gasterDeposition = null, surfaceField = new SurfaceField(),
        trailPlateBirth = new TrailPlateBirth(), materialStratigraphy = new MaterialStratigraphy(),
        materialLocomotionResistance = true, audioBridge = null, acceptedHeadingMode = 'production' } = {}) {
        if (!['production', 'isotropic-diagnostic'].includes(acceptedHeadingMode)) {
            throw new TypeError('acceptedHeadingMode must be production or isotropic-diagnostic');
        }
        this.state = normalizeState(state || {});
        this.random = random;
        this.acceptedHeadingMode = acceptedHeadingMode;
        this.fieldFactory = fieldFactory;
        this.listeners = new Set();
        this.destroyed = false;
        this.initialized = false;
        this.running = false;
        this.lastFrameTimestamp = null;
        this.accumulatorMs = 0;
        this.simulationTimeMs = 0;
        this.nextSpawnTimeMs = null;
        this.nextAgentId = 1;
        this.totalSpawned = 0;
        this.totalRetired = 0;
        this.agents = [];
        this.field = null;
        this.occupancy = new LocalOccupancy();
        this.gaitController = gaitController;
        this.bodyPoseController = bodyPoseController;
        this.gasterDeposition = gasterDeposition || new GasterDeposition({ mode: this.state.pheromone.depositionMode });
        this.colonyActivation = new ColonyActivation({ ceiling: this.state.population.count, origin: SPAWN_CENTER });
        this.surfaceField = surfaceField;
        this.trailPlateBirth = trailPlateBirth;
        this.materialStratigraphy = materialStratigraphy;
        this.materialLocomotionResistance = materialLocomotionResistance === true;
        this.audioBridge = audioBridge;
        this.audioBridge?.setMode?.(this.state.audioExperiment.mode);
        this.audioBridge?.setBaseSubstrateEnabled?.(this.state.audioExperiment.baseSubstrate);
    }

    async init() {
        this.assertAlive();
        if (this.initialized) return this;
        this.field = this.fieldFactory({ decayHalfLifeSeconds: this.state.pheromone.halfLifeSeconds });
        this.initialized = true;
        this.running = true;
        this.spawnNextAnt();
        this.emit('update');
        return this;
    }

    getState() { return clone(this.state); }

    getSnapshot() {
        const agents = this.agents.map((agent) => ({
            ...agent.getSnapshot(),
            gait: this.gaitController.getSnapshot(agent),
            bodyPose: this.bodyPoseController.getSnapshot(agent)
        }));
        const field = this.field?.getSnapshot() || {
            width: 0, height: 0, values: new Float32Array(), maxValue: 0,
            nodeSum: 0, reconstructedIntegral: 0, totalMass: 0
        };
        let speedTotal = 0;
        for (const agent of agents) speedTotal += Math.hypot(agent.vx, agent.vy);
        return {
            state: this.getState(),
            status: this.running ? 'active' : 'stopped',
            agents,
            pheromone: field,
            surface: this.surfaceField.getSnapshot(),
            surfacePlates: this.trailPlateBirth.getSnapshot(),
            stratigraphy: this.materialStratigraphy.getSnapshot(),
            audio: {
                mode: this.state.audioExperiment.mode,
                enabled: this.audioBridge?.enabled ?? false,
                loading: this.audioBridge?.loading ?? false,
                error: this.audioBridge?.error ?? null,
                volume: this.audioBridge?.volume ?? 1,
                baseSubstrateEnabled: this.state.audioExperiment.baseSubstrate,
                diagnostics: this.audioBridge?.getDiagnostics?.() ?? null
            },
            analysis: {
                population: agents.length,
                totalSpawned: this.totalSpawned,
                totalRetired: this.totalRetired,
                meanSpeed: agents.length ? speedTotal / agents.length : 0,
                pheromoneNodeSum: field.nodeSum,
                pheromoneReconstructedIntegral: field.reconstructedIntegral,
                // Compatibility alias for the native node sum, not a mass integral.
                pheromoneMass: field.totalMass,
                simulationTimeMs: this.simulationTimeMs,
                colonyActivation: {
                    ...this.colonyActivation.getSnapshot(),
                    enabled: this.state.population.activationFeedback,
                    desiredPopulation: this.state.population.activationFeedback
                        ? this.colonyActivation.getSnapshot().desiredPopulation : this.state.population.count,
                    recruitmentLimit: this.recruitmentLimit
                },
                minSeparation: minimumSeparation(agents)
            }
        };
    }

    subscribe(listener) {
        this.assertAlive();
        if (typeof listener !== 'function') throw new TypeError('Listener must be a function.');
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    update(timestampMs) {
        if (this.destroyed || !this.initialized || !this.running || !Number.isFinite(timestampMs)) return false;
        if (this.lastFrameTimestamp === null) {
            this.lastFrameTimestamp = timestampMs;
            return false;
        }
        const elapsed = Math.max(0, Math.min(MAX_FRAME_GAP_MS, timestampMs - this.lastFrameTimestamp));
        this.lastFrameTimestamp = timestampMs;
        this.accumulatorMs += elapsed;
        let steps = 0;
        while (this.accumulatorMs + 1e-9 >= STEP_MS) {
            this.accumulatorMs -= STEP_MS;
            this.tick(STEP_MS / 1000);
            steps += 1;
        }
        if (steps) this.emit('update');
        return steps > 0;
    }

    configure(patch = {}) {
        this.assertAlive();
        this.state = normalizeState(mergeState(this.state, patch));
        this.audioBridge?.setMode?.(this.state.audioExperiment.mode);
        this.audioBridge?.setBaseSubstrateEnabled?.(this.state.audioExperiment.baseSubstrate);
        if (this.gasterDeposition.mode !== this.state.pheromone.depositionMode) {
            for (const agent of this.agents) this.applyDeposits(this.gasterDeposition.retire(agent.id,
                this.bodyPoseController.getSnapshot(agent)?.gasterRear || gasterRearPoint(agent)));
            this.gasterDeposition.mode = this.state.pheromone.depositionMode;
        }
        if (this.field) this.field.decayHalfLifeSeconds = this.state.pheromone.halfLifeSeconds;
        // A changed population target must not bypass gradual entry or erase the
        // shared history that already exists. Keep surviving agents and their traits.
        const retainedCount = Math.min(this.agents.length, this.state.population.count);
        for (const agent of this.agents.slice(retainedCount)) {
            this.applyDeposits(this.gasterDeposition.retire(agent.id,
                this.bodyPoseController.getSnapshot(agent)?.gasterRear || gasterRearPoint(agent)));
        }
        this.totalRetired += this.agents.length - retainedCount;
        this.agents.length = retainedCount;
        this.gaitController.retain?.(this.agents.map(agent => agent.id));
        this.bodyPoseController.retain(this.agents.map(agent => agent.id));
        this.gasterDeposition.retain(this.agents.map(agent => agent.id));
        for (const agent of this.agents) agent.radius = this.state.behavior.bodyRadius;
        this.colonyActivation.configure({ ceiling: this.state.population.count });
        this.syncRecruitment();
        this.emit('update');
        return this.getState();
    }

    stop() {
        this.audioBridge?.stop();
        if (this.destroyed || !this.initialized || !this.running) return false;
        this.running = false;
        this.nextSpawnTimeMs = null;
        this.resetFrameClock();
        this.emit('update');
        return true;
    }

    strike() { return false; }
    setPickup() { return false; }

    // The injected transport owns audio; the simulation only requests its state.
    async setAudioEnabled(enabled) {
        this.assertAlive();
        if (!this.audioBridge) return false;
        this.syncEnvironmentAudio();
        const pending = this.audioBridge.setEnabled(Boolean(enabled));
        this.emit('update');
        try { return await pending; }
        finally { this.emit('update'); }
    }

    setAudioVolume(volume) {
        this.assertAlive();
        if (!this.audioBridge) return false;
        const result = this.audioBridge.setVolume(volume);
        this.emit('update');
        return result;
    }

    async setBaseSubstrateEnabled(enabled) {
        this.assertAlive();
        const next = Boolean(enabled);
        this.state = normalizeState(mergeState(this.state, {
            audioExperiment: { baseSubstrate: next }
        }));
        const pending = this.audioBridge?.setBaseSubstrateEnabled?.(next);
        this.emit('update');
        try {
            return pending === undefined ? next : await pending;
        } finally {
            this.emit('update');
        }
    }

    requestAudioDiagnostics() {
        return this.audioBridge?.requestDiagnostics?.() ?? false;
    }

    syncEnvironmentAudio() {
        if (typeof this.audioBridge?.syncMaterial === 'function') {
            this.audioBridge.syncMaterial(this.materialStratigraphy.getAudioState());
        } else {
            this.audioBridge?.syncPlates?.(this.trailPlateBirth.getPlates());
        }
    }

    async destroy() {
        if (this.destroyed) return;
        this.running = false;
        this.destroyed = true;
        this.initialized = false;
        this.nextSpawnTimeMs = null;
        this.listeners.clear();
        this.agents = [];
        this.field?.clear();
        this.field = null;
        this.lastFrameTimestamp = null;
        this.accumulatorMs = 0;
        this.gaitController.reset?.();
        this.bodyPoseController.reset();
        this.gasterDeposition.reset();
        this.colonyActivation.reset();
        this.surfaceField.clear();
        this.trailPlateBirth.reset();
        this.materialStratigraphy.reset();
        await this.audioBridge?.destroy();
    }

    tick(dt) {
        if (this.destroyed || !this.initialized || !this.running || !Number.isFinite(dt) || dt <= 0) return;
        const current = this.agents;
        // Read at the causal boundary; contacts and births later in this tick affect the next one.
        const materialSnapshot = this.materialLocomotionResistance
            ? this.materialStratigraphy.getSnapshot() : null;
        const materialRevision = this.materialStratigraphy.revision;
        const previousRear = current.map(agent => this.bodyPoseController.getSnapshot(agent)?.gasterRear
            || gasterRearPoint(agent));
        const sensed = current.map((agent) => this.occupancy.sense(agent, current));
        this.surfaceField.relax(dt);
        this.field.decay(dt);
        const localTrails = current.map((agent) => this.senseLocalTrail(agent));
        for (let index = 0; index < current.length; index += 1) {
            this.updateIntention(current[index], current, sensed[index], dt, localTrails[index]);
        }

        const displacements = current.map((agent, index) => {
            const info = sensed[index];
            const separationMagnitude = Math.hypot(info.separationX, info.separationY);
            // Keep the current forward motion while the three local bands make small
            // corrections. Nearby bodies still constrain steering and contact.
            const steeringAngularVelocity = clamp(
                agent.angularVelocity,
                -2.2,
                2.2
            );

            const localTurn = clamp(
                localTrails[index].steering * (0.35 + 0.65 * agent.trailAdherence)
                - steeringAngularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence,
                -LOCAL_STEERING_LIMIT,
                LOCAL_STEERING_LIMIT
            );
            let targetHeading = blendAngle(agent.intentHeading, agent.heading,
                agent.trailAdherence * ADHERENCE_HEADING_WEIGHT)
                + localTurn;
            if (separationMagnitude > 0.03) {
                const awayHeading = Math.atan2(info.separationY, info.separationX);
                targetHeading = blendAngle(targetHeading, awayHeading, Math.min(0.66, separationMagnitude * 0.34));
            }
            if (info.frontCrowding > 0.12 && Math.abs(info.leftCrowding - info.rightCrowding) > 0.02) {
                const side = info.leftCrowding < info.rightCrowding ? -1 : 1;
                targetHeading = blendAngle(targetHeading, agent.heading + side * 0.42,
                    Math.min(0.58, info.frontCrowding * 0.6));
            }
            agent.turnToward(targetHeading, dt);
            const cycle = Math.sin(agent.speedPhase);
            let desiredSpeed = agent.personality.preferredSpeed * (0.58 + 0.34 * (cycle + 1) * 0.5);
            // Inertia limits braking; the swept contact guard is a final safeguard.
            desiredSpeed *= (1 - info.frontCrowding) ** 2;
            desiredSpeed *= 1 - Math.min(0.45, separationMagnitude * 0.1);
            // Same-direction traffic caps pace without adding a steering target.
            desiredSpeed = Math.min(desiredSpeed, info.followingSpeedLimit);
            if (agent.hesitationRemaining > 0) desiredSpeed *= HESITATION_SPEED_RATIO;
            if (materialSnapshot) desiredSpeed *= materialLocomotionMultiplier(
                materialLayerCountAtSnapshot(materialSnapshot, agent.x, agent.y));
            agent.targetSpeed = desiredSpeed;
            agent.accelerateToward(desiredSpeed, dt);
            agent.vx += info.separationX * SEPARATION_ACCELERATION * dt;
            agent.vy += info.separationY * SEPARATION_ACCELERATION * dt;
            const movement = {
                x: clamp(agent.vx * dt, -0.008, 0.008),
                y: clamp(agent.vy * dt, -0.008, 0.008)
            };
            // Coherent following earns nonlinear reinforcement; every moving ant
            // retains a weak trace that can seed a new branch.
            movement.depositionMultiplier = DEPOSITION_BASELINE * (0.75 + 0.25 * localTrails[index].strength)
                + this.state.pheromone.reinforcementGain
                * agent.trailAdherence ** DEPOSITION_ADHERENCE_EXPONENT;
            return movement;
        });

        const collisionScales = this.occupancy.constrainDisplacements(current, displacements);
        const survivors = [];
        for (let index = 0; index < current.length; index += 1) {
            const agent = current[index];
            const displacement = displacements[index];
            const scale = collisionScales[index];
            const from = { x: agent.x, y: agent.y };
            agent.x += displacement.x * scale;
            agent.y += displacement.y * scale;
            if (scale < 0.999) {
                agent.vx *= scale;
                agent.vy *= scale;
            }
            const exiting = agent.x < 0 || agent.x > 1 || agent.y < 0 || agent.y > 1;
            // Contact is resolved on the outward motion. Only its observed portion
            // contributes to environmental memory and gait/contact accounting.
            const to = exiting ? observedSegmentEnd(from, agent) : { x: agent.x, y: agent.y };
            const travelled = Math.hypot(to.x - from.x, to.y - from.y);
            // Observe final travel, including collision braking. No audio operation
            // contributes to movement, its random stream, or the shared trail field.
            const observedAgent = { ...agent, x: to.x, y: to.y };
            this.bodyPoseController.advance(observedAgent, dt, localTrails[index]);
            const rear = this.bodyPoseController.getSnapshot(observedAgent)?.gasterRear || gasterRearPoint(observedAgent);
            this.applyDeposits(this.gasterDeposition.advance(agent.id, travelled, previousRear[index], rear,
                this.state.pheromone.amountPerUnitDistance * displacement.depositionMultiplier));
            if (exiting) this.applyDeposits(this.gasterDeposition.retire(agent.id, rear));
            const contacts = this.gaitController.advance(observedAgent, travelled, dt,
                this.simulationTimeMs + dt * 1000, { from, to });
            for (const event of contacts) {
                const responses = this.surfaceField.applyFootContact(event);
                this.trailPlateBirth.observeFootContact(event);
                this.materialStratigraphy.applyFootContact(event, this.surfaceField);
                this.emit('foot-contact', event);
                try {
                    const delivered = this.audioBridge?.handleFootContact(event, { responses });
                    void Promise.resolve(delivered).catch(error => this.emit('error', { message: error.message }));
                } catch (error) { this.emit('error', { message: error.message }); }
            }
            if (!exiting) {
                this.advanceBehaviorClocks(agent, dt);
                survivors.push(agent);
            }
        }
        const retiredCount = current.length - survivors.length;
        if (retiredCount) {
            this.agents = survivors;
            this.totalRetired += retiredCount;
            this.gaitController.retain?.(survivors.map(agent => agent.id));
            this.bodyPoseController.retain(survivors.map(agent => agent.id));
            this.gasterDeposition.retain(survivors.map(agent => agent.id));
        }
        this.simulationTimeMs += dt * 1000;
        const births = this.trailPlateBirth.advance({
            pheromone: this.field, surface: this.surfaceField,
            simulationTimeMs: this.simulationTimeMs
        });
        if (births.length) {
            for (const plate of births) {
                this.materialStratigraphy.addPlate(plate);
                this.emit('plate-birth', plate);
            }
        }
        const nodules = this.materialStratigraphy.advance({
            surface: this.surfaceField,
            simulationTimeMs: this.simulationTimeMs
        });
        for (const nodule of nodules) this.emit('sphere-birth', nodule);
        if (this.materialStratigraphy.revision !== materialRevision) this.syncEnvironmentAudio();
        // Recruitment follows slowly accumulated entrance-route evidence, rather
        // than individual exits. A lower desired count never culls living agents.
        if (this.state.population.activationFeedback) this.colonyActivation.advance(this.field, dt);
        this.syncRecruitment();
        // Use the simulation clock, not browser timers. A delayed frame or blocked
        // entry never releases a batch of overdue agents.
        if (this.nextSpawnTimeMs !== null && this.simulationTimeMs + 1e-9 >= this.nextSpawnTimeMs) {
            this.spawnNextAnt();
        }
    }

    spawnNextAnt() {
        if (this.destroyed || !this.initialized || !this.running
            || this.agents.length >= this.recruitmentLimit) {
            this.nextSpawnTimeMs = null;
            return false;
        }
        const radius = this.state.behavior.bodyRadius;
        for (let attempt = 0; attempt < SPAWN_PLACEMENT_ATTEMPTS; attempt += 1) {
            const angle = this.random() * TAU;
            const distance = Math.sqrt(this.random()) * SPAWN_RADIUS;
            const x = SPAWN_CENTER.x + Math.cos(angle) * distance;
            const y = SPAWN_CENTER.y + Math.sin(angle) * distance;
            if (this.agents.some(agent => Math.hypot(x - agent.x, y - agent.y)
                < radius + agent.radius + SPAWN_CLEARANCE)) continue;
            const headingSample = this.random();
            const heading = this.acceptedHeadingMode === 'isotropic-diagnostic'
                ? wrapAngle(-Math.PI + TAU * headingSample)
                : SPAWN_HEADING + (headingSample * 2 - 1) * SPAWN_HEADING_SPREAD;
            this.agents.push(new AntAgent({
                id: 'ant-' + this.nextAgentId++, x, y, radius, random: this.random,
                heading
            }));
            this.totalSpawned += 1;
            if (this.agents.length < this.recruitmentLimit) this.scheduleNextSpawn();
            else this.nextSpawnTimeMs = null;
            return true;
        }
        this.nextSpawnTimeMs = this.simulationTimeMs + SPAWN_RETRY_MS;
        return false;
    }

    scheduleNextSpawn() {
        this.nextSpawnTimeMs = this.simulationTimeMs
            + SPAWN_INTERVAL_MIN_MS + this.random() * SPAWN_INTERVAL_RANGE_MS;
    }

    get recruitmentLimit() {
        return this.state.population.activationFeedback
            ? this.colonyActivation.getSnapshot().recruitmentLimit : this.state.population.count;
    }

    syncRecruitment() {
        if (this.agents.length >= this.recruitmentLimit) this.nextSpawnTimeMs = null;
        else if (this.initialized && this.running && this.nextSpawnTimeMs === null) this.scheduleNextSpawn();
    }

    applyDeposits(deposits) {
        for (const deposit of deposits) {
            const radius = this.state.pheromone.radius;
            if (deposit.type === 'point') this.field?.depositPoint(deposit.position, { amount: deposit.amount, radius });
            else this.field?.depositSegment(deposit.from, deposit.to, {
                amountPerUnitDistance: deposit.amountPerUnitDistance, radius
            });
        }
    }

    updateIntention(agent, agents, occupancy, dt, localTrail = this.senseLocalTrail(agent)) {
        this.updateTrailAdherence(agent, localTrail, dt);
        const persistence = Math.max(agent.trailConfidence, agent.trailAdherence);
        agent.decisionRemaining -= dt;
        agent.committedRemaining -= dt;
        agent.inspectionRemaining -= dt;
        agent.hesitationRemaining -= dt;
        if (agent.hesitationRemaining <= 0) agent.hesitationRemaining = 0;
        if (agent.inspectionRemaining <= 0) {
            agent.inspectionRemaining = 1.2 + this.random() * 2.4;
            if (this.random() < 0.23) {
                agent.intentHeading = wrapAngle(agent.intentHeading + signed(this.random) * 0.24
                    * (1 - 0.8 * persistence));
                // Leave enough time for inertial deceleration to produce a near-stop,
                // rather than a barely visible dip in an otherwise constant pace.
                agent.hesitationRemaining = Math.max(agent.hesitationRemaining,
                    HESITATION_MIN_SECONDS + this.random() * HESITATION_RANGE_SECONDS);
            }
        }

        const blocked = occupancy.frontCrowding > 0.25;
        const newlyBlocked = blocked && !agent.wasBlocked;
        agent.wasBlocked = blocked;
        if (agent.decisionRemaining > 0 && agent.committedRemaining > 0 && !newlyBlocked) return;
        const offsets = [-0.92, -0.47, 0, 0.47, 0.92];
        const options = offsets.map((offset) => {
            const jitter = 0.12 * (1 - 0.8 * persistence);
            const heading = wrapAngle(agent.heading + offset + (this.random() - 0.5) * jitter);
            const distance = this.state.behavior.sensorDistance;
            const trail = trailResponse(this.senseTrail(agent, heading));
            const crowding = this.occupancy.crowdingInDirection(agent, agents, heading, distance * 1.45);
            return { heading, offset, trail, crowding };
        });
        // A flat field offers no clear directional cue, even if all sensors are
        // elevated. Trail confidence is a continuous sensor value, not a role.
        agent.trailConfidence = Math.max(...options.map(option => option.trail))
            - Math.min(...options.map(option => option.trail));
        const confidence = Math.max(agent.trailConfidence, agent.trailAdherence);
        const exploration = Math.max(MIN_EXPLORATION_PROBABILITY,
            agent.personality.exploration * (1.2 - confidence));
        // Absolute near evidence is distinct from directional contrast: a strong
        // flat field keeps the existing intervals without claiming a route.
        const evidenceDuration = 0.8 + 0.2 * localTrail.strength;
        agent.decisionRemaining = (0.25 + this.random() * 0.42) * (1 + 0.35 * confidence) * evidenceDuration;
        agent.committedRemaining = (0.3 + this.random() * 0.9) * evidenceDuration;
        for (const option of options) {
            option.score = option.trail * agent.personality.pheromoneSensitivity * TRAIL_SCORE_GAIN
                - option.crowding * 3.2
                + (Math.cos(option.offset) - 1) * confidence * 0.55
                + (Math.cos(option.offset) - 1) * agent.trailAdherence * ADHERENCE_DIRECTION_SCORE
                + (this.random() - 0.5) * 0.42 * (1 - 0.85 * confidence);
        }
        const chosen = this.random() < exploration
            ? options[Math.floor(this.random() * options.length)]
            : weightedChoice(options, this.random, DECISION_TEMPERATURE * (1 - 0.4 * confidence));
        agent.intentHeading = chosen.heading;
    }

    /** Sense across a wider footprint without widening the deposited field. */
    senseTrail(agent, heading) {
        const { sensorDistance, sensorWidth } = this.state.behavior;
        const x = agent.x + Math.cos(heading) * sensorDistance;
        const y = agent.y + Math.sin(heading) * sensorDistance;
        const nx = -Math.sin(heading), ny = Math.cos(heading);
        let signal = 0;
        for (const offset of SENSOR_OFFSETS) {
            // Favor a centered trail but retain distant narrow peaks; averaging
            // empty cells here would dilute the very trail we want to discover.
            const weight = 1 - Math.abs(offset) * 0.45;
            const sx = x + nx * sensorWidth * offset, sy = y + ny * sensorWidth * offset;
            if (sx < 0 || sx > 1 || sy < 0 || sy > 1) continue;
            signal = Math.max(signal, this.field.sample(sx, sy) * weight);
        }
        return signal;
    }

    /** A short cross-section follows a trail; the wider sensor discovers it. */
    senseLocalTrail(agent) {
        const dx = Math.cos(agent.heading), dy = Math.sin(agent.heading);
        const nx = -dy, ny = dx;
        const profiles = LOCAL_SENSOR_DISTANCES.map(distance => [-1, 0, 1].map(side => {
            const x = agent.x + dx * distance + nx * LOCAL_SENSOR_HALF_WIDTH * side;
            const y = agent.y + dy * distance + ny * LOCAL_SENSOR_HALF_WIDTH * side;
            // A small symmetric footprint reduces sensitivity to the field's grid
            // alignment. It samples the field without spreading deposited pheromone.
            return [-1, 0, 1].reduce((signal, offset) => {
                const sx = x + nx * LOCAL_BAND_HALF_WIDTH * offset;
                const sy = y + ny * LOCAL_BAND_HALF_WIDTH * offset;
                // Clamping an out-of-domain sample to an edge cell would invent a cue.
                if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return signal;
                return signal + this.field.sample(sx, sy) * (offset === 0 ? 0.5 : 0.25);
            }, 0);
        }));
        const [left, center, right] = profiles[0].map((value, index) => (value + profiles[1][index]) * 0.5);
        const peaks = profiles.map(profile => Math.max(...profile));
        // Precise local contrast can hold a recently discovered narrow route before
        // it becomes a strongly reinforced long-range cue. Diffuse fields still
        // have zero coherence, and weak residue has very little steering weight.
        const strength = trailResponse(Math.sqrt(peaks[0] * peaks[1]), LOCAL_TRAIL_HALF_SATURATION);
        // Contrast at both depths supports persistence even between two sample
        // bands. A flat field or equally strong, separated side bands is ambiguous.
        const coherence = Math.min(...profiles.map(profile => {
            const peak = Math.max(...profile), floor = Math.min(...profile);
            const split = Math.max(0, Math.min(profile[0], profile[2]) - profile[1]);
            return (peak - floor) / (peak + 1e-9) * (1 - split / (peak + 1e-9));
        }));
        // Balance the whole cross-section instead of aiming at an argmax point.
        const balance = (right - left) / (left + center + right + 1e-9);
        return {
            left, center, right, strength, coherence,
            steering: LOCAL_STEERING_LIMIT * balance * strength
        };
    }

    updateTrailAdherence(agent, localTrail, dt) {
        const target = clamp(localTrail.strength * localTrail.coherence, 0, 1);
        const previous = agent.trailAdherence;
        const seconds = target > previous ? ADHERENCE_RISE_SECONDS : ADHERENCE_FADE_SECONDS;
        agent.trailAdherence = clamp(previous + (target - previous) * -Math.expm1(-dt / seconds), 0, 1);
    }

    advanceBehaviorClocks(agent, dt) {
        agent.speedPhase = wrapAngle(agent.speedPhase + dt * TAU / agent.speedCycle);
    }

    resetFrameClock() { this.lastFrameTimestamp = null; this.accumulatorMs = 0; }
    assertAlive() { if (this.destroyed) throw new Error('AntController has been destroyed.'); }
    emit(type, payload) {
        if (this.destroyed || this.listeners.size === 0) return;
        const event = { type, payload: payload === undefined ? this.getSnapshot() : payload };
        for (const listener of [...this.listeners]) listener(event);
    }
}

function normalizeState(input) {
    const state = mergeState(DEFAULT_STATE, input);
    state.model = 'ant';
    state.audioExperiment.mode = state.audioExperiment.mode === 'legacy' ? 'legacy' : 'bornSurface';
    state.audioExperiment.baseSubstrate = state.audioExperiment.baseSubstrate === true;
    state.population.count = Math.round(clampFinite(state.population.count, 8, 100, DEFAULT_STATE.population.count));
    state.population.activationFeedback = state.population.activationFeedback !== false;
    state.pheromone.halfLifeSeconds = clampFinite(state.pheromone.halfLifeSeconds, 0.5, 120, DEFAULT_STATE.pheromone.halfLifeSeconds);
    state.pheromone.amountPerUnitDistance = clampFinite(state.pheromone.amountPerUnitDistance, 0.1, 30, DEFAULT_STATE.pheromone.amountPerUnitDistance);
    state.pheromone.radius = clampFinite(state.pheromone.radius, 0.002, 0.04, DEFAULT_STATE.pheromone.radius);
    state.pheromone.reinforcementGain = clampFinite(state.pheromone.reinforcementGain, 0, 5, DEFAULT_STATE.pheromone.reinforcementGain);
    if (!['dab', 'continuous'].includes(state.pheromone.depositionMode)) {
        state.pheromone.depositionMode = DEFAULT_STATE.pheromone.depositionMode;
    }
    state.behavior.sensorDistance = clampFinite(state.behavior.sensorDistance, 0.012, 0.1, 0.042);
    state.behavior.sensorWidth = clampFinite(state.behavior.sensorWidth, 0.004, 0.04, DEFAULT_STATE.behavior.sensorWidth);
    state.behavior.bodyRadius = clampFinite(state.behavior.bodyRadius, 0.003, 0.015, 0.006);
    return state;
}
function mergeState(base, patch) {
    return {
        ...clone(base), ...clone(patch),
        audioExperiment: { ...clone(base.audioExperiment), ...clone(patch.audioExperiment || {}) },
        population: { ...clone(base.population), ...clone(patch.population || {}) },
        pheromone: { ...clone(base.pheromone), ...clone(patch.pheromone || {}) },
        behavior: { ...clone(base.behavior), ...clone(patch.behavior || {}) }
    };
}
function clone(value) { return structuredClone(value); }
function clampFinite(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(number, min, max) : fallback;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function signed(random) { return random() * 2 - 1; }
function trailResponse(signal, halfSaturation = TRAIL_HALF_SATURATION) {
    const normalized = (signal / halfSaturation) ** TRAIL_RESPONSE_EXPONENT;
    return normalized / (1 + normalized);
}
function wrapAngle(value) { return ((value + Math.PI) % TAU + TAU) % TAU - Math.PI; }
function blendAngle(from, to, amount) { return from + wrapAngle(to - from) * amount; }
function observedSegmentEnd(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    let fraction = 1;
    if (to.x < 0) fraction = Math.min(fraction, -from.x / dx);
    else if (to.x > 1) fraction = Math.min(fraction, (1 - from.x) / dx);
    if (to.y < 0) fraction = Math.min(fraction, -from.y / dy);
    else if (to.y > 1) fraction = Math.min(fraction, (1 - from.y) / dy);
    // Roundoff protection for the accounting endpoint, never a movement clamp.
    return { x: clamp(from.x + dx * fraction, 0, 1), y: clamp(from.y + dy * fraction, 0, 1) };
}
function weightedChoice(options, random, temperature) {
    const max = Math.max(...options.map((option) => option.score));
    const weights = options.map((option) => Math.exp((option.score - max) / temperature));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let choice = random() * total;
    for (let index = 0; index < options.length; index += 1) {
        choice -= weights[index];
        if (choice <= 0) return options[index];
    }
    return options.at(-1);
}
function minimumSeparation(agents) {
    let minimum = Infinity;
    for (let i = 0; i < agents.length; i += 1) {
        for (let j = i + 1; j < agents.length; j += 1) {
            minimum = Math.min(minimum, Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y));
        }
    }
    return Number.isFinite(minimum) ? minimum : null;
}

export function materialLocomotionMultiplier(layerCount) {
    return 1 - 0.10 * (1 - Math.exp(-layerCount / 4));
}

export function materialLayerCountAtSnapshot(snapshot, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return 0;
    const counts = snapshot?.stratigraphy?.layerCountByCell;
    if (!Number.isInteger(snapshot?.width) || !Number.isInteger(snapshot?.height)
        || !ArrayBuffer.isView(counts)) return 0;
    const cell = Math.round(y * (snapshot.height - 1)) * snapshot.width
        + Math.round(x * (snapshot.width - 1));
    return counts[cell] || 0;
}
