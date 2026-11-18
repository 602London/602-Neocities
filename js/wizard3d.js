// 3D spinning version of the logo. Traces the outline of img/7wizard602.png,
// extrudes it into a solid piece, and puts the artwork on the front and back.
// If anything fails to load, the flat <img> inside .logo3d stays visible.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { contours } from "https://cdn.jsdelivr.net/npm/d3-contour@4.0.2/+esm";

const container = document.querySelector(".logo3d");
const IMG_SRC = container.dataset.src;

// Thickness of the extruded logo, its width, and the resolution the outline is traced at
const DEPTH = 0.3;
const WIDTH = 4;
const GRID = 700;
const SPIN = 0.45;
const HOVER_SPIN = 0.8;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.enableZoom = false;   // keep the mouse wheel scrolling the page
controls.autoRotate = true;
controls.autoRotateSpeed = SPIN;

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(3, 4, 5);
scene.add(key);
const rim = new THREE.PointLight(0x6a6aff, 30, 20);
rim.position.set(-4, 1, -3);
scene.add(rim);

const logo = new THREE.Group();
scene.add(logo);

// Douglas-Peucker: drop points that barely change the outline
function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        const [ax, ay] = pts[a], [bx, by] = pts[b];
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        let maxD = 0, idx = -1;
        for (let i = a + 1; i < b; i++) {
            const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > tol) {
            keep[idx] = 1;
            stack.push([a, idx], [idx, b]);
        }
    }
    return pts.filter((_, i) => keep[i]);
}

// Size the canvas to the container and pull the camera back far enough that a sphere
// around the whole logo fits, so no corner gets clipped at any spin or drag angle
let logoHeight = WIDTH;
function fit() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    const radius = Math.hypot(WIDTH / 2, logoHeight / 2, DEPTH / 2) + 0.1;   // + room for the bob
    const halfFovV = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfFovH = Math.atan(Math.tan(halfFovV) * camera.aspect);
    const dist = radius / Math.sin(Math.min(halfFovV, halfFovH));
    camera.position.setLength(dist);
    camera.updateProjectionMatrix();
}
camera.position.set(0, 0, 1);
new ResizeObserver(fit).observe(container);

new THREE.TextureLoader().load(IMG_SRC, (rawTex) => {
    // Flatten the artwork onto black so the hidden colour of transparent pixels
    // can't bleed into the edges as a white fringe
    const flat = document.createElement("canvas");
    flat.width = rawTex.image.width;
    flat.height = rawTex.image.height;
    const flatCtx = flat.getContext("2d");
    flatCtx.fillStyle = "#000";
    flatCtx.fillRect(0, 0, flat.width, flat.height);
    flatCtx.drawImage(rawTex.image, 0, 0);
    const tex = new THREE.CanvasTexture(flat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Read the alpha channel at a reduced size and trace its outline
    const gw = GRID;
    const gh = Math.round(GRID * rawTex.image.height / rawTex.image.width);
    const canvas = document.createElement("canvas");
    canvas.width = gw + 2;
    canvas.height = gh + 2;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(rawTex.image, 1, 1, gw, gh);
    const pixels = ctx.getImageData(0, 0, gw + 2, gh + 2).data;
    const alpha = new Float64Array((gw + 2) * (gh + 2));
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];

    const outline = contours().size([gw + 2, gh + 2]).thresholds([128])(alpha)[0].coordinates;

    const scale = WIDTH / gw;
    const height = gh * scale;
    const toVec = ([x, y]) => new THREE.Vector2((x - 1) * scale - WIDTH / 2, height / 2 - (y - 1) * scale);
    const ringArea = (r) => Math.abs(THREE.ShapeUtils.area(r));

    const shapes = [];
    for (const polygon of outline) {
        const [outer, ...holes] = polygon.map((ring) => simplify(ring.slice(0, -1), 0.35).map(toVec));
        if (outer.length < 3 || ringArea(outer) < 0.0008) continue;
        const shape = new THREE.Shape(outer);
        for (const hole of holes) {
            if (hole.length >= 3 && ringArea(hole) > 0.0004) shape.holes.push(new THREE.Path(hole));
        }
        shapes.push(shape);
    }

    // Kept small: the marker strokes are thin and a big bevel would pinch them inside-out
    const geo = new THREE.ExtrudeGeometry(shapes, {
        depth: DEPTH,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.006,
        bevelSegments: 3,
        curveSegments: 1
    });
    geo.translate(0, 0, -DEPTH / 2);

    // Map the artwork straight onto the front and back by x/y position
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, pos.getX(i) / WIDTH + 0.5, pos.getY(i) / height + 0.5);
    }
    uv.needsUpdate = true;
    geo.computeVertexNormals();

    const faceMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.45,
        metalness: 0.2
    });
    // Matte walls: a shiny finish caught the key light as white streaks on the upper-right edges
    const sideMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a5c,
        roughness: 0.9,
        metalness: 0
    });
    // ExtrudeGeometry puts the caps in group 0 and the walls/bevel in group 1
    logo.add(new THREE.Mesh(geo, [faceMat, sideMat]));

    // Swap the flat image for the 3D canvas only once the model is ready
    logoHeight = height;
    container.appendChild(renderer.domElement);
    container.classList.add("is-3d");
    fit();
    renderer.setAnimationLoop(animate);
});

// Click (without dragging) gives the logo a quick extra twirl
let spinBoost = 0;
let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
    downAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener("pointerup", (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) {
        spinBoost = Math.PI * 2;
    }
    downAt = null;
});

// Hovering speeds the idle spin up a little
renderer.domElement.addEventListener("pointerenter", () => controls.autoRotateSpeed = HOVER_SPIN);
renderer.domElement.addEventListener("pointerleave", () => controls.autoRotateSpeed = SPIN);

const clock = new THREE.Clock();
function animate() {
    const dt = clock.getDelta();
    const time = clock.elapsedTime;

    if (spinBoost > 0) {
        const step = Math.max(spinBoost * 2 * dt, 0.01);
        const applied = Math.min(step, spinBoost);
        logo.rotation.y += applied;
        spinBoost -= applied;
    }

    logo.position.y = Math.sin(time * 1.2) * 0.08;
    logo.rotation.z = Math.sin(time * 0.7) * 0.03;
    rim.intensity = 25 + Math.sin(time * 2) * 8;

    controls.update();
    renderer.render(scene, camera);
}
