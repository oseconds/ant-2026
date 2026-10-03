import { SPHERE_MATERIALS } from '../models/sphere/materials.js';
import { sphereDisplayScale } from './sphereMath.js';

const SPHERE_VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  uniform mat4 uMvp;
  uniform mat4 uViewModel;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec4 eyePosition = uViewModel * vec4(aPosition, 1.0);
    vPosition = eyePosition.xyz;
    vNormal = (uViewModel * vec4(aNormal, 0.0)).xyz;
    gl_Position = uMvp * vec4(aPosition, 1.0);
  }
`;

const SPHERE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 uBaseColor;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(-vPosition);
    vec3 lightA = normalize(vec3(-0.55, 0.75, 1.0));
    vec3 lightB = normalize(vec3(0.85, 0.10, 0.45));
    float diffuse = max(dot(normal, lightA), 0.0);
    vec3 halfVector = normalize(lightA + viewDirection);
    float specular = pow(max(dot(normal, halfVector), 0.0), 72.0);
    float strip = pow(max(dot(normal, lightB), 0.0), 16.0);
    float edge = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
    vec3 color = uBaseColor * (0.19 + diffuse * 0.62 + strip * 0.18);
    color += mix(vec3(0.48), uBaseColor, 0.42) * (specular * 0.88 + strip * 0.20);
    color += uBaseColor * edge * 0.12;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const LINE_VERTEX_SHADER = `
  attribute vec3 aPosition;
  uniform mat4 uMvp;
  void main() { gl_Position = uMvp * vec4(aPosition, 1.0); }
`;

const LINE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec4 uColor;
  void main() { gl_FragColor = uColor; }
`;

function multiply4(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] = a[row] * b[column * 4]
        + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2]
        + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function translation(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function scaling(value) {
  return new Float32Array([
    value, 0, 0, 0,
    0, value, 0, 0,
    0, 0, value, 0,
    0, 0, 0, 1
  ]);
}

function rotation(yaw, pitch) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  return new Float32Array([
    cosYaw, 0, -sinYaw, 0,
    sinYaw * sinPitch, cosPitch, cosYaw * sinPitch, 0,
    sinYaw * cosPitch, -sinPitch, cosYaw * cosPitch, 0,
    0, 0, 0, 1
  ]);
}

function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * range, -1,
    0, 0, 2 * near * far * range, 0
  ]);
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to allocate a sphere shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || 'Sphere shader compilation failed.');
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  let vertexShader;
  let fragmentShader;
  let shaderProgram;
  try {
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    shaderProgram = gl.createProgram();
    if (!shaderProgram) throw new Error('Unable to allocate a sphere shader program.');
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(shaderProgram) || 'Sphere shader program link failed.');
    }
    return shaderProgram;
  } catch (error) {
    if (shaderProgram) gl.deleteProgram(shaderProgram);
    throw error;
  } finally {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
  }
}

export class SphereRenderer {
  constructor(canvas) {
    if (!canvas) throw new TypeError('SphereRenderer requires a canvas.');
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!this.gl) throw new Error('WebGL is unavailable.');

    this.resources = [];
    try {
      this.initialize();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  initialize() {
    const gl = this.gl;
    this.sphereProgram = this.trackProgram(createProgram(gl, SPHERE_VERTEX_SHADER, SPHERE_FRAGMENT_SHADER));
    this.lineProgram = this.trackProgram(createProgram(gl, LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER));

    const geometry = this.createSphereGeometry(32, 48);
    this.sphereVertexBuffer = this.createBuffer(gl.ARRAY_BUFFER, geometry.vertices);
    this.sphereIndexBuffer = this.createBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indices);
    this.sphereIndexCount = geometry.indices.length;

    const gridVertices = this.createGridGeometry(80);
    this.gridBuffer = this.createBuffer(gl.ARRAY_BUFFER, gridVertices);
    this.gridVertexCount = gridVertices.length / 3;

    this.sphereLocations = {
      position: gl.getAttribLocation(this.sphereProgram, 'aPosition'),
      normal: gl.getAttribLocation(this.sphereProgram, 'aNormal'),
      mvp: gl.getUniformLocation(this.sphereProgram, 'uMvp'),
      viewModel: gl.getUniformLocation(this.sphereProgram, 'uViewModel'),
      color: gl.getUniformLocation(this.sphereProgram, 'uBaseColor')
    };
    this.lineLocations = {
      position: gl.getAttribLocation(this.lineProgram, 'aPosition'),
      mvp: gl.getUniformLocation(this.lineProgram, 'uMvp'),
      color: gl.getUniformLocation(this.lineProgram, 'uColor')
    };

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0.035, 0.055, 0.07, 1);
  }

  createSphereGeometry(latitudeCount, longitudeCount) {
    const vertices = [];
    const indices = [];
    for (let latitude = 0; latitude <= latitudeCount; latitude += 1) {
      const theta = Math.PI * latitude / latitudeCount;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let longitude = 0; longitude <= longitudeCount; longitude += 1) {
        const phi = 2 * Math.PI * longitude / longitudeCount;
        const x = sinTheta * Math.cos(phi);
        const y = cosTheta;
        const z = sinTheta * Math.sin(phi);
        vertices.push(x, y, z, x, y, z);
      }
    }
    for (let latitude = 0; latitude < latitudeCount; latitude += 1) {
      for (let longitude = 0; longitude < longitudeCount; longitude += 1) {
        const a = latitude * (longitudeCount + 1) + longitude;
        const b = a + longitudeCount + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
  }

  createGridGeometry(segmentCount) {
    const vertices = [];
    const lineRadius = 1.004;
    const appendLoop = (pointAt) => {
      let previous = pointAt(0);
      for (let segment = 1; segment <= segmentCount; segment += 1) {
        const next = pointAt(segment / segmentCount * Math.PI * 2);
        vertices.push(...previous, ...next);
        previous = next;
      }
    };

    for (const latitude of [-1.0472, -0.5236, 0, 0.5236, 1.0472]) {
      appendLoop((angle) => [
        lineRadius * Math.cos(latitude) * Math.cos(angle),
        lineRadius * Math.sin(latitude),
        lineRadius * Math.cos(latitude) * Math.sin(angle)
      ]);
    }
    for (let longitude = 0; longitude < 6; longitude += 1) {
      const phi = longitude * Math.PI / 6;
      let previous = null;
      for (let segment = 0; segment <= segmentCount; segment += 1) {
        const latitude = -Math.PI / 2 + Math.PI * segment / segmentCount;
        const next = [
          lineRadius * Math.cos(latitude) * Math.cos(phi),
          lineRadius * Math.sin(latitude),
          lineRadius * Math.cos(latitude) * Math.sin(phi)
        ];
        if (previous) vertices.push(...previous, ...next);
        previous = next;
      }
    }
    return new Float32Array(vertices);
  }

  trackProgram(program) {
    this.resources.push({ type: 'program', resource: program });
    return program;
  }

  createBuffer(target, data) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Unable to allocate a sphere geometry buffer.');
    this.resources.push({ type: 'buffer', resource: buffer });
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return buffer;
  }

  drawObject(modelMatrix, color, projection, view) {
    const gl = this.gl;
    const viewModel = multiply4(view, modelMatrix);
    const mvp = multiply4(projection, viewModel);
    gl.useProgram(this.sphereProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sphereVertexBuffer);
    gl.enableVertexAttribArray(this.sphereLocations.position);
    gl.vertexAttribPointer(this.sphereLocations.position, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.sphereLocations.normal);
    gl.vertexAttribPointer(this.sphereLocations.normal, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sphereIndexBuffer);
    gl.uniformMatrix4fv(this.sphereLocations.mvp, false, mvp);
    gl.uniformMatrix4fv(this.sphereLocations.viewModel, false, viewModel);
    gl.uniform3fv(this.sphereLocations.color, color);
    gl.drawElements(gl.TRIANGLES, this.sphereIndexCount, gl.UNSIGNED_SHORT, 0);
  }

  render(snapshot, { view = { yaw: 0.38, pitch: -0.24 } } = {}) {
    const gl = this.gl;
    if (!gl) return;

    const state = snapshot?.state || snapshot || {};
    const physical = state.physical || {};
    const pickup = state.pickup?.position || { x: 0.72, y: 0.12, z: 0.684 };
    const yaw = Number(view.yaw) || 0;
    const pitch = Number(view.pitch) || 0;
    const objectScale = sphereDisplayScale(physical.diameter);
    const model = multiply4(rotation(yaw, pitch), scaling(objectScale));
    const viewMatrix = translation(0, 0, -3.8);

    const width = this.canvas.width || 1;
    const height = this.canvas.height || 1;
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const projection = perspective(Math.PI / 4, width / height, 0.1, 30);
    const material = SPHERE_MATERIALS[physical.material] || SPHERE_MATERIALS.stainless304;
    this.drawObject(model, material.color, projection, viewMatrix);

    const viewModel = multiply4(viewMatrix, model);
    gl.useProgram(this.lineProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer);
    gl.enableVertexAttribArray(this.lineLocations.position);
    gl.vertexAttribPointer(this.lineLocations.position, 3, gl.FLOAT, false, 12, 0);
    gl.uniformMatrix4fv(this.lineLocations.mvp, false, multiply4(projection, viewModel));
    gl.uniform4f(this.lineLocations.color, 0.10, 0.78, 0.82, 0.36);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.LINES, 0, this.gridVertexCount);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    const drawMarker = (point, radius, color) => {
      const offset = translation(point.x * 1.012, point.y * 1.012, point.z * 1.012);
      const markerModel = multiply4(model, multiply4(offset, scaling(radius)));
      this.drawObject(markerModel, color, projection, viewMatrix);
    };
    drawMarker(pickup, 0.035, [0.98, 0.60, 0.10]);
    if (state.excitation?.position) drawMarker(state.excitation.position, 0.032, [0.86, 0.12, 0.12]);
  }

  destroy() {
    if (!this.gl) return;
    for (const { type, resource } of this.resources) {
      if (type === 'buffer') this.gl.deleteBuffer(resource);
      if (type === 'program') this.gl.deleteProgram(resource);
    }
    this.resources = [];
    this.gl = null;
    this.canvas = null;
  }
}

export default SphereRenderer;
