import { BODY_GEOMETRY } from '../agents/ant/BodyPoseController.js';

/**
 * p5 instance-mode view for the ANT experiment.
 *
 * The sketch only paints the most recent snapshot supplied by `render()`.
 * Agent movement and pheromone state belong to the framework-independent
 * model/controller. No p5 object is created until `init()` is called.
 */
export class AntRenderer {
    constructor(canvas, { loadP5 = () => import('p5') } = {}) {
        if (!canvas) throw new TypeError('AntRenderer requires a canvas element');
        this.canvas = canvas;
        this.canvasParent = canvas.parentElement || null;
        this.canvasId = canvas.getAttribute ? canvas.getAttribute('id') : (canvas.id || null);
        this.canvasAriaAttributes = [...(canvas.attributes || [])]
            .filter((attribute) => attribute.name?.startsWith('aria-'))
            .map((attribute) => [attribute.name, attribute.value]);
        this.loadP5 = loadP5;
        this.instance = null;
        this.snapshot = null;
        this.fieldImage = null;
        this.fieldSize = null;
        this.plateImages = new WeakMap();
        this.materialImage = null;
        this.materialRevision = null;
        this.debugOptions = {
            pheromone: false,
            material: true,
            surface: false,
            candidate: false,
            source: false,
            exposure: false,
            plateIds: false,
            plateOutlines: false,
            plateCenterlines: false,
            platePickups: false
        };
        this.width = 1;
        this.height = 1;
        this.pixelRatio = 1;
        this.destroyed = false;
        this.initializing = null;
        this.resolveInitialization = null;
        this.rejectInitialization = null;
        this.setupStarted = false;
        this.pendingRemovedInstance = null;
    }

    async init({ width, height, pixelRatio = 1 } = {}) {
        if (this.destroyed) return false;
        if (this.initializing) return this.initializing;
        if (this.instance) return true;

        const bounds = this.canvas.getBoundingClientRect?.();
        this.width = positiveSize(width ?? bounds?.width ?? this.canvas.clientWidth ?? 1);
        this.height = positiveSize(height ?? bounds?.height ?? this.canvas.clientHeight ?? this.width);
        this.pixelRatio = positiveRatio(pixelRatio);

        this.initializing = new Promise((resolve, reject) => {
            this.resolveInitialization = resolve;
            this.rejectInitialization = reject;
            Promise.resolve()
                .then(() => this.loadP5())
                .then((module) => {
                    if (this.destroyed) {
                        resolve(false);
                        return;
                    }
                    const P5 = module?.default || module;
                    if (typeof P5 !== 'function') throw new TypeError('The p5 module did not provide a constructor');
                    this.instance = new P5((p) => this.#createSketch(p), this.canvasParent || undefined);
                    if (this.destroyed || this.initializationFailed) this.#removeInstance();
                })
                .catch((error) => {
                    if (this.destroyed) resolve(false);
                    else this.#failInitialization(error);
                });
        });

        try {
            return await this.initializing;
        } finally {
            this.initializing = null;
            this.resolveInitialization = null;
            this.rejectInitialization = null;
            this.initializationFailed = false;
        }
    }

    /** Paint a detached model snapshot. Calling this after destroy is harmless. */
    render(snapshot) {
        if (this.destroyed) return;
        this.snapshot = snapshot || null;
        this.instance?.redraw?.();
    }

    /** Change diagnostic overlays without writing to simulation state. */
    setDebugOptions(patch = {}) {
        if (this.destroyed || !patch || typeof patch !== 'object') return { ...this.debugOptions };
        for (const key of Object.keys(this.debugOptions)) {
            if (key in patch) this.debugOptions[key] = Boolean(patch[key]);
        }
        this.instance?.redraw?.();
        return { ...this.debugOptions };
    }

    /** Resize the p5 canvas without changing simulation coordinates. */
    resize(width, height, pixelRatio = this.pixelRatio) {
        if (this.destroyed) return;
        this.width = positiveSize(width);
        this.height = positiveSize(height);
        this.pixelRatio = positiveRatio(pixelRatio);
        if (!this.instance) return;
        this.instance.pixelDensity(this.pixelRatio);
        this.instance.resizeCanvas(this.width, this.height, true);
        this.instance.redraw();
    }

    destroy() {
        if (this.destroyed) return this.removalPromise || Promise.resolve();
        this.destroyed = true;
        this.snapshot = null;
        this.fieldImage = null;
        this.plateImages = new WeakMap();
        this.materialImage = null;
        this.materialRevision = null;
        this.resolveInitialization?.(false);
        this.rejectInitialization = null;
        const removal = this.#removeInstance();
        this.canvas = null;
        this.loadP5 = null;
        return removal || Promise.resolve();
    }

    #removeInstance() {
        if (!this.instance) return;
        const instance = this.instance;
        this.instance = null;
        if (this.destroyed && this.initializing && !this.setupStarted) {
            this.pendingRemovedInstance = instance;
        }
        const removal = instance.remove?.();
        this.removalPromise = Promise.resolve(removal).catch(() => undefined);
        return this.removalPromise;
    }

    #createSketch(p) {
        p.setup = () => {
            this.setupStarted = true;
            if (this.destroyed) {
                // p5 2.x creates its default canvas immediately before calling setup.
                // If destroy raced that asynchronous startup, remove the instance a
                // second time so this late canvas cannot survive the first cleanup.
                const instance = this.pendingRemovedInstance;
                this.pendingRemovedInstance = null;
                if (instance) {
                    const removal = instance.remove?.();
                    this.removalPromise = Promise.resolve(removal).catch(() => undefined);
                }
                return;
            }
            try {
                p.pixelDensity(this.pixelRatio);
                p.createCanvas(this.width, this.height, p.P2D, this.canvas);
                this.#restoreCanvasIdentity();
                p.noLoop();
                if (this.canvas && this.canvas.tabIndex < 0) this.canvas.tabIndex = 0;
                p.redraw();
                this.resolveInitialization?.(true);
            } catch (error) {
                this.#restoreCanvasIdentity();
                this.#failInitialization(error);
            }
        };

        p.draw = () => {
            if (this.destroyed) return;
            drawSnapshot(p, this.snapshot, this);
        };

    }

    #failInitialization(error) {
        if (this.destroyed || this.initializationFailed) return;
        this.initializationFailed = true;
        this.rejectInitialization?.(error);
        this.#removeInstance();
    }

    #restoreCanvasIdentity() {
        const canvas = this.canvas;
        if (!canvas) return;
        if (canvas.setAttribute && canvas.removeAttribute) {
            if (this.canvasId === null) canvas.removeAttribute('id');
            else if (canvas.getAttribute('id') !== this.canvasId) canvas.setAttribute('id', this.canvasId);
            for (const attribute of [...(canvas.attributes || [])]) {
                if (attribute.name?.startsWith('aria-')) canvas.removeAttribute(attribute.name);
            }
            for (const [name, value] of this.canvasAriaAttributes) canvas.setAttribute(name, value);
        } else if (canvas.id !== (this.canvasId || '')) canvas.id = this.canvasId || '';
        if (this.canvasParent && canvas.parentNode !== this.canvasParent) this.canvasParent.appendChild(canvas);
    }
}

const BASE_TRACE_ALPHA = 22;
const ESTABLISHED_ROUTE_ALPHA = 90;

function drawSnapshot(p, snapshot, renderer) {
    const width = p.width, height = p.height;
    p.background(255);

    if (renderer.debugOptions.surface) drawScalarDebugGrid(p, snapshot?.surface, width, height, {
        threshold: 0.002, maxAlpha: 42, tone: [40, 115, 155]
    });

    // Frozen material is a solid, restrained layer beneath current chemical memory.
    // Compile one restrained material image per topology revision; live pheromone
    // never changes the frozen historical masks or their physical Z columns.
    const material = snapshot?.stratigraphy;
    const topology = material?.stratigraphy || material;
    if (renderer.debugOptions.material
        && topology?.topLayerByCell?.length && material.width > 0 && material.height > 0) {
        if (!renderer.materialImage || renderer.materialRevision !== material.revision) {
            const image = p.createImage(material.width, material.height);
            image.loadPixels();
            for (let index = 0; index < topology.topLayerByCell.length; index += 1) {
                const depthCount = topology.layerCountByCell?.[index] || 1;
                image.pixels[index * 4] = 100;
                image.pixels[index * 4 + 1] = 100;
                image.pixels[index * 4 + 2] = 100;
                image.pixels[index * 4 + 3] = topology.topLayerByCell[index] >= 0
                    ? Math.min(21, 9 + depthCount * 1.25) : 0;
            }
            image.updatePixels();
            renderer.materialImage = image;
            renderer.materialRevision = material.revision;
        }
        p.image(renderer.materialImage, 0, 0, width, height);
    }
    for (const plate of renderer.debugOptions.material && !material
        ? snapshot?.surfacePlates?.plates || [] : []) {
        if (!plate?.grid || !plate.mask?.length) continue;
        let image = renderer.plateImages.get(plate);
        if (!image) {
            image = p.createImage(plate.grid.width, plate.grid.height);
            image.loadPixels();
            for (let index = 0; index < plate.mask.length; index += 1) {
                image.pixels[index * 4] = 70;
                image.pixels[index * 4 + 1] = 70;
                image.pixels[index * 4 + 2] = 70;
                image.pixels[index * 4 + 3] = plate.mask[index] ? 10 : 0;
            }
            image.updatePixels();
            renderer.plateImages.set(plate, image);
        }
        p.image(image, 0, 0, width, height);
    }

    const field = snapshot?.pheromone;
    if (renderer.debugOptions.pheromone
        && field?.values?.length && field.width > 0 && field.height > 0) {
        const image = updateFieldImage(p, renderer, field);
        // The field remains at its native grid resolution and fixed alpha values;
        // only the display interpolation is softened when it is scaled to canvas.
        if (p.drawingContext) {
            p.drawingContext.imageSmoothingEnabled = true;
            if ('imageSmoothingQuality' in p.drawingContext) {
                p.drawingContext.imageSmoothingQuality = 'high';
            }
        }
        p.image(image, 0, 0, width, height);
    }

    if (renderer.debugOptions.exposure) drawExposureDebug(p, material, width, height);
    if (renderer.debugOptions.source) drawSourceAnnulusDebug(p, snapshot?.surfacePlates?.requirements, width, height);
    if (renderer.debugOptions.candidate) drawCandidateDebug(p, snapshot?.surfacePlates?.candidate, width, height);
    const plates = material?.plates?.length ? material.plates : snapshot?.surfacePlates?.plates;
    if (renderer.debugOptions.plateOutlines || renderer.debugOptions.plateCenterlines
        || renderer.debugOptions.platePickups) {
        drawPlateGeometryDebug(p, plates, material, snapshot?.debugAudioTopology,
            renderer.debugOptions, width, height);
    }
    if (renderer.debugOptions.plateIds) drawPlateIdsDebug(p, plates, width, height);

    const diameterScale = Math.min(width, height) * BODY_GEOMETRY.radiusScale;
    for (const agent of snapshot?.agents || []) {
        if (!isPoint(agent)) continue;
        drawAnt(p, agent, width, height, diameterScale);
    }
}

function drawScalarDebugGrid(p, field, width, height, { threshold = 0, maxAlpha = 40, tone = [0, 0, 0] } = {}) {
    if (!field?.values?.length || !(field.width > 0) || !(field.height > 0)) return;
    const cellW = width / field.width, cellH = height / field.height;
    p.noStroke();
    for (let index = 0; index < field.values.length; index += 1) {
        const value = field.values[index];
        if (!Number.isFinite(value) || value <= threshold) continue;
        const alpha = Math.min(maxAlpha, Math.max(4, value * maxAlpha * 3));
        p.fill(tone[0], tone[1], tone[2], alpha);
        const x = (index % field.width + 0.5) * cellW;
        const y = (Math.floor(index / field.width) + 0.5) * cellH;
        p.circle(x, y, Math.max(1, Math.min(cellW, cellH) * 0.85));
    }
}

function drawExposureDebug(p, material, width, height) {
    const layers = material?.stratigraphy?.layerCountByCell;
    if (!layers?.length || !(material.width > 0) || !(material.height > 0)) return;
    const cellW = width / material.width, cellH = height / material.height;
    p.noStroke();
    for (let index = 0; index < layers.length; index += 1) {
        const depth = layers[index];
        if (depth <= 1) continue;
        p.fill(80, 55, 130, Math.min(75, 18 + depth * 7));
        p.circle((index % material.width + 0.5) * cellW,
            (Math.floor(index / material.width) + 0.5) * cellH,
            Math.max(1, Math.min(cellW, cellH) * 0.9));
    }
}

function drawSourceAnnulusDebug(p, requirements, width, height) {
    const annulus = requirements?.sourceAnnulus;
    const origin = annulus?.origin;
    const radii = annulus?.radii;
    if (!isPoint(origin) || !Array.isArray(radii) || radii.length !== 2) return;
    p.noFill();
    p.stroke(125, 95, 35, 145);
    p.strokeWeight(1);
    for (const radius of radii) {
        if (!(radius > 0)) continue;
        p.ellipse(origin.x * width, origin.y * height, radius * 2 * width, radius * 2 * height);
    }
}

function drawCandidateDebug(p, candidate, width, height) {
    const points = candidate?.pathPoints;
    if (!Array.isArray(points) || points.length < 2) return;
    p.noFill();
    p.stroke(0, 115, 120, 190);
    p.strokeWeight(1.4);
    for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1], b = points[index];
        if (!isPoint(a) || !isPoint(b)) continue;
        p.line(a.x * width, a.y * height, b.x * width, b.y * height);
    }
    if (isPoint(candidate.source)) {
        p.noStroke(); p.fill(0, 115, 120, 190);
        p.circle(candidate.source.x * width, candidate.source.y * height, 5);
    }
    if (isPoint(candidate.target)) {
        p.noStroke(); p.fill(120, 65, 145, 190);
        p.circle(candidate.target.x * width, candidate.target.y * height, 5);
    }
}

function drawPlateIdsDebug(p, plates, width, height) {
    if (!Array.isArray(plates) || typeof p.text !== 'function') return;
    p.noStroke();
    if (typeof p.textSize === 'function') p.textSize(9);
    for (const plate of plates) {
        if (typeof plate?.id !== 'string') continue;
        const points = [plate.source || plate.centerline?.[0], plate.target || plate.centerline?.at(-1)]
            .filter((point, index, all) => isPoint(point) && all.findIndex(other =>
                other?.x === point.x && other?.y === point.y) === index);
        p.fill(...plateDebugColor(plate.id), 190);
        for (const point of points) {
            p.text(plate.id.replace('trail-plate-', 'P'), point.x * width + 3, point.y * height - 3);
        }
    }
}

function drawPlateGeometryDebug(p, plates, material, audioTopology, options, width, height) {
    if (!Array.isArray(plates)) return;
    const topLayer = material?.stratigraphy?.topLayerByCell;
    let audioPickupNodesDrawn = false;
    for (let plateIndex = 0; plateIndex < plates.length; plateIndex += 1) {
        const plate = plates[plateIndex];
        const grid = plate?.grid;
        if (!plate?.id || !grid?.width || !grid?.height || !plate.mask?.length) continue;
        const color = plateDebugColor(plate.id);
        if (options.plateOutlines) drawPlateOutline(p, plate, plateIndex, topLayer, color, width, height);
        if (options.plateCenterlines) drawPlateCenterline(p, plate, plateIndex, topLayer, color, width, height);
        if (options.platePickups) audioPickupNodesDrawn = drawPlatePickups(p, plate, plateIndex,
            topLayer, audioTopology, color, width, height) || audioPickupNodesDrawn;
    }
    const exposureLegend = plates.length && (options.plateOutlines || options.plateCenterlines);
    if (options.platePickups && plates.length) drawPickupLegend(p, audioPickupNodesDrawn, height - 6);
    if (exposureLegend) {
        drawPlateExposureLegend(p, height);
    }
}

function drawPlateOutline(p, plate, plateIndex, topLayer, color, width, height) {
    const { width: columns, height: rows } = plate.grid;
    const mask = plate.mask;
    p.noFill();
    p.strokeWeight(1.5);
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const cell = row * columns + column;
            if (!mask[cell]) continue;
            const x0 = column / columns * width, x1 = (column + 1) / columns * width;
            const y0 = row / rows * height, y1 = (row + 1) / rows * height;
            const alpha = plateCellAlpha(topLayer, cell, plateIndex);
            p.stroke(...color, alpha);
            // Neighbor checks emit only the connected outer contour edges; shared
            // endpoints join adjacent segments without painting filled cells.
            if (row === 0 || !mask[cell - columns]) p.line(x0, y0, x1, y0);
            if (column === columns - 1 || !mask[cell + 1]) p.line(x1, y0, x1, y1);
            if (row === rows - 1 || !mask[cell + columns]) p.line(x1, y1, x0, y1);
            if (column === 0 || !mask[cell - 1]) p.line(x0, y1, x0, y0);
        }
    }
}

function drawPlateCenterline(p, plate, plateIndex, topLayer, color, width, height) {
    const nodes = new Map((plate.centerline || []).filter(node => Number.isInteger(node?.index)
      && isPoint(node)).map(node => [node.index, node]));
    p.noFill();
    p.strokeWeight(1.7);
    for (const edge of plate.edges || []) {
        const [from, to] = edge || [];
        const a = nodes.get(from), b = nodes.get(to);
        if (!a || !b) continue;
        const exposed = plateCellIsExposed(topLayer, from, plateIndex)
          && plateCellIsExposed(topLayer, to, plateIndex);
        p.stroke(...color, exposed ? 225 : 65);
        p.line(a.x * width, a.y * height, b.x * width, b.y * height);
    }
}

function drawPlatePickups(p, plate, plateIndex, topLayer, audioTopology, color, width, height) {
    if (typeof p.circle !== 'function') return;
    const layer = audioTopology?.layerIds?.indexOf(plate.id) ?? -1;
    const pickupNodes = audioTopology?.pickupNodeIndices;
    const nodeGridIndices = audioTopology?.nodeGridIndices;
    const solverGrid = audioTopology?.solverGrid;
    const hasAudioNodes = layer >= 0 && Number.isInteger(solverGrid) && solverGrid > 1
        && pickupNodes?.length >= layer * 2 + 2 && nodeGridIndices?.length;
    if (hasAudioNodes) {
        for (let index = 0; index < 2; index += 1) {
            const node = pickupNodes[layer * 2 + index];
            if (!Number.isInteger(node) || node < 0 || node >= nodeGridIndices.length) continue;
            const cell = nodeGridIndices[node];
            if (!Number.isInteger(cell) || cell < 0 || cell >= solverGrid ** 2) continue;
            const point = { x: (cell % solverGrid) / (solverGrid - 1),
                y: Math.floor(cell / solverGrid) / (solverGrid - 1) };
            const sourceCell = Math.round(point.y * (plate.grid.height - 1)) * plate.grid.width
                + Math.round(point.x * (plate.grid.width - 1));
            p.noStroke();
            p.fill(...color, plateCellAlpha(topLayer, sourceCell, plateIndex));
            p.circle(point.x * width, point.y * height, 7);
        }
        return true;
    }
    for (const point of plate.pickups || []) {
        if (!isPoint(point)) continue;
        const sourceCell = Math.round(point.y * (plate.grid.height - 1)) * plate.grid.width
            + Math.round(point.x * (plate.grid.width - 1));
        p.noFill();
        p.stroke(...color, plateCellAlpha(topLayer, sourceCell, plateIndex));
        p.strokeWeight(1.5);
        p.circle(point.x * width, point.y * height, 9);
    }
    return false;
}

function drawPickupLegend(p, audioNodes, y) {
    if (typeof p.text !== 'function') return;
    p.noStroke();
    p.fill(55, 55, 55, 220);
    if (typeof p.textSize === 'function') p.textSize(9);
    p.text(audioNodes ? 'filled = audio pickup node' : 'hollow = Plate pickup target (audio topology unavailable)',
        6, y);
}

function drawPlateExposureLegend(p, height) {
    if (typeof p.text !== 'function') return;
    const y = height - 26;
    p.stroke(70, 70, 70, 225);
    p.strokeWeight(1.5);
    p.line(6, y, 20, y);
    p.stroke(70, 70, 70, 65);
    p.line(6, y + 11, 20, y + 11);
    p.noStroke();
    p.fill(55, 55, 55, 220);
    if (typeof p.textSize === 'function') p.textSize(9);
    p.text('solid = exposed · faint = buried', 24, y + 3);
}

function plateCellAlpha(topLayer, cell, plateIndex) {
    return plateCellIsExposed(topLayer, cell, plateIndex) ? 225 : 65;
}

function plateCellIsExposed(topLayer, cell, plateIndex) {
    return !topLayer?.length || topLayer[cell] === plateIndex;
}

function plateDebugColor(id) {
    const colors = [[65, 95, 145], [145, 80, 35], [105, 80, 145], [55, 105, 65], [150, 65, 90], [0, 105, 110]];
    const number = Number(id.match(/(\d+)$/)?.[1]);
    const index = Number.isFinite(number) ? Math.max(0, number - 1) : [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return colors[index % colors.length];
}

function drawAnt(p, agent, width, height, diameterScale) {
    const radius =
        Number.isFinite(agent.radius) && agent.radius > 0
            ? agent.radius
            : 0.006;

    const centerX = agent.x * width;
    const centerY = agent.y * height;

    const legs = Array.isArray(agent.gait?.legs) ? agent.gait.legs : null;

    const isPointLike = (point) =>
        point &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y);

    // gait 데이터가 없으면 fallback 점
    if (!legs || legs.length === 0) {
        p.noStroke();
        p.fill(40);
        p.circle(centerX, centerY, Math.max(1.5, radius * diameterScale));
        return;
    }

    const r = radius * diameterScale;
    const pose = agent.bodyPose;
    const headYaw = Number.isFinite(pose?.headYaw) ? pose.headYaw : 0;
    const gasterYaw = Number.isFinite(pose?.gasterYaw) ? pose.gasterYaw : 0;
    const antennae = pose?.antennae || null;

    // ----------------------------
    // LEGS
    // gait geometry 그대로 그림
    // ----------------------------
    p.stroke(65);
    p.strokeWeight(Math.max(0.45, r * 0.06));
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);
    p.noFill();

    for (const leg of legs) {
        if (!isPointLike(leg.root) || !isPointLike(leg.knee) || !isPointLike(leg.foot)) {
            continue;
        }

        p.line(
            leg.root.x * width,
            leg.root.y * height,
            leg.knee.x * width,
            leg.knee.y * height
        );

        p.line(
            leg.knee.x * width,
            leg.knee.y * height,
            leg.foot.x * width,
            leg.foot.y * height
        );
    }

    p.noStroke();
    p.fill(65);

    for (const leg of legs) {
        if (!isPointLike(leg.knee)) continue;
        p.circle(
            leg.knee.x * width,
            leg.knee.y * height,
            Math.max(0.7, r * 0.06)
        );
    }

    // ----------------------------
    // LOCAL BODY SPACE
    // 다리 좌표는 기존처럼 thorax heading을 기준으로 유지합니다.
    // ----------------------------
    p.push();
    p.translate(centerX, centerY);
    p.rotate(Number.isFinite(agent.heading) ? agent.heading : 0);

    // 몸통은 뒤에서 앞으로 그려 좁은 petiole이 두 부분을 이어 주게 합니다.
    // gaster
    drawGaster(p, r, gasterYaw);
    p.noStroke();
    p.fill(28);
    // petiole
    p.ellipse(BODY_GEOMETRY.gasterPivotX * r, 0, 0.28 * r, 0.22 * r); // petiole
    // thorax
    p.ellipse(0, 0, 1.05 * r, 0.70 * r); // thorax
    // head
    drawHead(p, r, headYaw, antennae);

    p.pop();
}

function drawGaster(p, r, yaw) {
    p.push();
    p.translate(BODY_GEOMETRY.gasterPivotX * r, 0); // shared pivot for the body pose and secretion point.
    p.rotate(yaw);
    p.noStroke();
    p.fill(28);
    p.ellipse(BODY_GEOMETRY.gasterCenterX * r, 0,
        BODY_GEOMETRY.gasterHalfLength * 2 * r, 1.02 * r);
    p.pop();
}

function drawHead(p, r, yaw, antennae) {
    p.push();
    p.translate(BODY_GEOMETRY.headPivotX * r, 0); // thorax 앞쪽을 축으로 head and antennae together.
    p.rotate(yaw);
    p.stroke(85);
    p.strokeWeight(Math.max(0.35, r * 0.055));
    p.strokeCap(p.ROUND);
    p.noFill();

    // ----------------------------
    // ANTENNAE
    // 너무 ㄱ자처럼 과하게 말고,
    // 길게 뻗었다가 살짝 꺾이는 느낌
    // 얇은 두 분절을 head-local 좌표로 그려, 긴 형태는 유지하고 회전만 따라가게 합니다.
    // ----------------------------
    const rootX = (1.28 - BODY_GEOMETRY.headPivotX) * r;
    const elbowBaseX = (1.85 - BODY_GEOMETRY.headPivotX) * r;
    const tipBaseX = (2.45 - BODY_GEOMETRY.headPivotX) * r;
    const left = antennaEngagement(antennae?.left);
    const right = antennaEngagement(antennae?.right);
    const drawAntenna = (side, engagement) => {
        const spread = side * (0.42 + 0.055 * engagement) * r;
        const tipSpread = side * (0.68 + 0.095 * engagement) * r;
        const elbowX = elbowBaseX + 0.045 * engagement * r;
        const tipX = tipBaseX + 0.12 * engagement * r;
        p.line(rootX, side * 0.23 * r, elbowX, spread);
        p.line(elbowX, spread, tipX, tipSpread);
    };
    drawAntenna(-1, left);
    drawAntenna(1, right);

    // ----------------------------
    // BODY
    // 몸통을 마지막에 그려서
    // 다리/더듬이 뿌리 부분을 자연스럽게 덮음
    // 여기서는 head가 마지막 body part라 antenna 뿌리를 덮습니다.
    // ----------------------------
    p.noStroke();
    p.fill(28);
    p.ellipse((1.09 - BODY_GEOMETRY.headPivotX) * r, 0, 1.08 * r, 0.86 * r);
    p.pop();
}

function updateFieldImage(p, renderer, field) {
    const width = Math.floor(field.width), height = Math.floor(field.height);
    if (!renderer.fieldImage || renderer.fieldSize?.width !== width || renderer.fieldSize?.height !== height) {
        renderer.fieldImage = p.createImage(width, height);
        renderer.fieldSize = { width, height };
    }
    const image = renderer.fieldImage;
    image.loadPixels();
    const pixels = image.pixels;
    const values = field.values;
    const limit = Math.min(values.length, width * height);
    pixels.fill(0);
    for (let index = 0; index < limit; index++) {
        const opacity = pheromoneValueToAlpha(values[index]);
        const offset = index * 4;
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
        pixels[offset + 3] = opacity;
    }
    image.updatePixels();
    return image;
}

/** Two-scale fixed mapping; it never normalizes contrast to the current field maximum. */
export function pheromoneValueToAlpha(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const base = smoothstep(0.004, 0.050, value);
    const route = smoothstep(0.040, 0.180, value);
    return Math.min(112, Math.round(base * BASE_TRACE_ALPHA + route * ESTABLISHED_ROUTE_ALPHA));
}

function smoothstep(min, max, value) {
    const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
    return t * t * (3 - 2 * t);
}

function isPoint(value) {
    return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function antennaEngagement(value) {
    return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function positiveSize(value) {
    return Number.isFinite(value) && value > 0 ? value : 1;
}

function positiveRatio(value) {
    return Number.isFinite(value) && value > 0 ? Math.min(2, value) : 1;
}

export default AntRenderer;
