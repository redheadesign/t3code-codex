import {
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Line,
  LoadingManager,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  Quaternion,
  Scene,
  SkinnedMesh,
  Spherical,
  Sphere,
  Texture,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type Material,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import basisTranscoder from "three/addons/libs/basis/basis_transcoder.js?url";
import basisWasm from "three/addons/libs/basis/basis_transcoder.wasm?url";
import dracoWasm from "three/addons/libs/draco/gltf/draco_decoder.wasm?url";
import dracoWrapper from "three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { observeResize } from "~/lib/observeResize";
import { readDesignAsset } from "./designAssetStore";
import type { DesignModelSettings } from "./designDocument";
import {
  DESIGN_MODEL_MAX_BYTES,
  DesignModelAssetError,
  parseDesignModel,
} from "./designModelAsset";

interface DesignModelItem {
  readonly id: string;
  readonly name: string;
}

export interface DesignModelDetails {
  readonly layers: readonly (DesignModelItem & { readonly depth: number })[];
  readonly materials: readonly (DesignModelItem & { readonly color: string })[];
  readonly animations: readonly DesignModelItem[];
  readonly cameras: readonly DesignModelItem[];
}

type SceneCamera = PerspectiveCamera | OrthographicCamera;
type SceneMesh = Mesh | Line | Points;
type ColoredMaterial = Material & { color: Color };

export class DesignModelGraphicsError extends Error {}

function isRenderable(object: Object3D): object is SceneMesh {
  return object instanceof Mesh || object instanceof Line || object instanceof Points;
}

function materialsFor(object: SceneMesh): readonly Material[] {
  return Array.isArray(object.material) ? object.material : [object.material];
}

function disposeModel(roots: readonly Object3D[]) {
  const geometries = new Set<SceneMesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<SkinnedMesh["skeleton"]>();
  const images = new Set<ImageBitmap>();
  for (const root of roots) {
    root.traverse((object) => {
      if (!isRenderable(object)) return;
      geometries.add(object.geometry);
      if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
      for (const material of materialsFor(object)) materials.add(material);
    });
  }
  for (const geometry of geometries) geometry.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap)
      images.add(texture.image);
    texture.dispose();
  }
  for (const image of images) image.close();
}

async function loadModel(data: ReturnType<typeof parseDesignModel>, renderer: WebGLRenderer) {
  const local = new LoadingManager();
  const objectUrls = new Map<string, string>();
  const resolveLocalResource = (url: string) => {
    // Asset validation disallows supplied blob URLs. These are created by GLTFLoader for embedded images.
    if (url.startsWith("blob:")) return url;
    const resource = data.resources.get(url);
    if (!resource) throw new DesignModelAssetError("external-resource");
    const existing = objectUrls.get(url);
    if (existing) return existing;
    const resolved = URL.createObjectURL(resource);
    objectUrls.set(url, resolved);
    return resolved;
  };
  local.setURLModifier(resolveLocalResource);
  const decoders = new LoadingManager();
  const decoderFiles = new Map([
    ["draco_decoder.wasm", dracoWasm],
    ["draco_wasm_wrapper.js", dracoWrapper],
    ["basis_transcoder.js", basisTranscoder],
    ["basis_transcoder.wasm", basisWasm],
  ]);
  decoders.setURLModifier((url) => {
    const bundled = decoderFiles.get(url);
    return bundled ?? resolveLocalResource(url);
  });
  const draco = new DRACOLoader(decoders).setWorkerLimit(1);
  const basis = new KTX2Loader(decoders).setWorkerLimit(1).detectSupport(renderer);
  try {
    return await new GLTFLoader(local)
      .setDRACOLoader(draco)
      .setKTX2Loader(basis)
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(data.source, "");
  } finally {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    draco.dispose();
    basis.dispose();
  }
}

function getModelParts(gltf: GLTF) {
  const layers: { id: string; name: string; depth: number; object: Object3D }[] = [];
  const materialGroups = new Map<
    string,
    {
      id: string;
      name: string;
      color: string;
      entries: { material: ColoredMaterial; original: Color }[];
    }
  >();
  const seenMaterials = new Set<Material>();
  const cameras: { id: string; name: string; object: SceneCamera; preview: SceneCamera }[] = [];
  const visit = (object: Object3D, id: string, depth: number) => {
    layers.push({ id, name: object.name || object.type, depth, object });
    if (object instanceof PerspectiveCamera || object instanceof OrthographicCamera)
      cameras.push({ id, name: object.name || object.type, object, preview: object.clone(false) });
    if (isRenderable(object)) {
      for (const material of materialsFor(object)) {
        if (
          !("color" in material) ||
          !(material.color instanceof Color) ||
          seenMaterials.has(material)
        )
          continue;
        seenMaterials.add(material);
        const association = gltf.parser.associations.get(material)?.materials;
        const materialId =
          association === undefined
            ? `layer:${id}:${materialGroups.size}`
            : `material:${association}`;
        const entry = { material: material as ColoredMaterial, original: material.color.clone() };
        const group = materialGroups.get(materialId);
        if (group) group.entries.push(entry);
        else
          materialGroups.set(materialId, {
            id: materialId,
            name: material.name || material.type,
            color: `#${material.color.getHexString()}`,
            entries: [entry],
          });
      }
    }
    object.children.forEach((child, index) => visit(child, `${id}.${index}`, depth + 1));
  };
  gltf.scene.children.forEach((object, index) => visit(object, `layer:${index}`, 0));
  const animations = gltf.animations.map((clip, index) => ({
    id: `animation:${index}`,
    name: clip.name,
    clip,
  }));
  return { layers, materials: [...materialGroups.values()], cameras, animations };
}

export async function createDesignModelRuntime(
  host: HTMLElement,
  assetId: string,
  signal: AbortSignal,
) {
  const asset = await readDesignAsset(assetId);
  signal.throwIfAborted();
  if (!asset) throw new DesignModelAssetError("invalid-model");
  if (asset.size > DESIGN_MODEL_MAX_BYTES) throw new DesignModelAssetError("too-large");
  const data = parseDesignModel(await asset.arrayBuffer());
  signal.throwIfAborted();

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    throw new DesignModelGraphicsError();
  }
  renderer.setClearAlpha(0);
  let gltf: GLTF | undefined;
  try {
    gltf = await loadModel(data, renderer);
    signal.throwIfAborted();
  } catch (error) {
    if (gltf) disposeModel(gltf.scenes);
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }

  const parts = getModelParts(gltf);
  const box = new Box3().setFromObject(gltf.scene);
  const sphere = box.getBoundingSphere(new Sphere());
  const validBounds =
    sphere.radius > 0 &&
    Number.isFinite(sphere.radius) &&
    [sphere.center.x, sphere.center.y, sphere.center.z].every(Number.isFinite);
  const content = new Group();
  if (validBounds) {
    content.scale.setScalar(1 / sphere.radius);
    content.position.copy(sphere.center).multiplyScalar(-1 / sphere.radius);
  }
  content.add(gltf.scene);
  const scene = new Scene();
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(3, 5, 4);
  scene.add(content, new HemisphereLight(0xffffff, 0x61738c, 2), key);

  const canvas = renderer.domElement;
  canvas.className = "block size-full";
  canvas.setAttribute("aria-label", host.getAttribute("aria-label") ?? "3D");
  host.append(canvas);
  const camera = new PerspectiveCamera(42, 1, 0.02, 200);
  camera.position.set(2.4, 1.6, 3.3);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minDistance = 0.1;
  controls.maxDistance = 50;
  const up = new Vector3(0, 1, 0);
  const orientation = new Quaternion();
  const mixer = new AnimationMixer(gltf.scene);
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let animation: AnimationAction | undefined;
  let animationId: string | null = null;
  let importedCamera: (typeof parts.cameras)[number] | undefined;
  let frame: number | undefined;
  let previousFrame: number | undefined;
  let viewportAspect = 1;
  let orientationDegrees = 0;
  let zoom = 1;
  let visible = true;
  let contextLost = false;

  function invalidate() {
    if (frame === undefined && visible && !contextLost && !document.hidden)
      frame = requestAnimationFrame(render);
  }

  function render(time: number) {
    frame = undefined;
    const animate = animation !== undefined && !motion.matches;
    if (animate && previousFrame !== undefined)
      mixer.update(Math.min((time - previousFrame) / 1000, 0.1));
    previousFrame = animate ? time : undefined;
    if (importedCamera) {
      const { object, preview } = importedCamera;
      object.getWorldPosition(preview.position);
      object.getWorldQuaternion(preview.quaternion);
      orientation.setFromAxisAngle(up, (orientationDegrees * Math.PI) / 180);
      preview.position.applyQuaternion(orientation);
      preview.quaternion.premultiply(orientation);
      preview.zoom = object.zoom * zoom;
      const scale = validBounds ? content.scale.x : 1;
      if (object instanceof PerspectiveCamera && preview instanceof PerspectiveCamera) {
        preview.aspect = viewportAspect;
        preview.fov = object.fov;
      } else if (object instanceof OrthographicCamera && preview instanceof OrthographicCamera) {
        const center = ((object.left + object.right) * scale) / 2;
        preview.top = object.top * scale;
        preview.bottom = object.bottom * scale;
        const halfWidth = ((preview.top - preview.bottom) * viewportAspect) / 2;
        preview.left = center - halfWidth;
        preview.right = center + halfWidth;
      }
      preview.near = object.near * scale;
      preview.far = object.far * scale;
      preview.updateProjectionMatrix();
    }
    renderer.render(scene, importedCamera?.preview ?? camera);
    if (animate) invalidate();
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    viewportAspect = width / height;
    const aspectScale = Math.min(1, camera.aspect) / Math.min(1, viewportAspect);
    camera.position.multiplyScalar(aspectScale);
    camera.aspect = viewportAspect;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5, 2048 / width, 2048 / height));
    renderer.setSize(width, height, false);
    invalidate();
  }

  const stopResize = observeResize(host, resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting === true;
    previousFrame = undefined;
    if (visible) invalidate();
  });
  visibilityObserver.observe(host);
  const resetFrame = () => {
    previousFrame = undefined;
    invalidate();
  };
  const onLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
  };
  const onRestored = () => {
    contextLost = false;
    resetFrame();
  };
  const onKey = (event: KeyboardEvent) => {
    if (!controls.enabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const orbit = new Spherical().setFromVector3(camera.position);
    if (event.key === "ArrowLeft") orbit.theta -= 0.12;
    else if (event.key === "ArrowRight") orbit.theta += 0.12;
    else if (event.key === "ArrowUp") orbit.phi -= 0.12;
    else if (event.key === "ArrowDown") orbit.phi += 0.12;
    else return;
    event.preventDefault();
    event.stopPropagation();
    camera.position.setFromSpherical(orbit.makeSafe());
    controls.update();
    invalidate();
  };
  controls.addEventListener("change", invalidate);
  document.addEventListener("visibilitychange", resetFrame);
  motion.addEventListener("change", resetFrame);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  canvas.addEventListener("keydown", onKey);
  resize();

  return {
    details: {
      layers: parts.layers.map(({ id, name, depth }) => ({ id, name, depth })),
      materials: parts.materials.map(({ id, name, color }) => ({ id, name, color })),
      animations: parts.animations.map(({ id, name }) => ({ id, name })),
      cameras: parts.cameras.map(({ id, name }) => ({ id, name })),
    } satisfies DesignModelDetails,
    update(settings: DesignModelSettings, interactive: boolean) {
      const hidden = new Set(settings.hiddenLayers ?? []);
      for (const { id, object } of parts.layers) object.visible = !hidden.has(id);
      for (const group of parts.materials) {
        const replacement = settings.materialColors?.[group.id];
        const validColor = replacement !== undefined && /^#[\da-f]{6}$/iu.test(replacement);
        for (const { material, original } of group.entries) {
          if (validColor) material.color.set(replacement);
          else material.color.copy(original);
        }
      }
      scene.background =
        settings.background && /^#[\da-f]{6}$/iu.test(settings.background)
          ? new Color(settings.background)
          : null;
      const rotation = settings.rotation ?? 0;
      camera.position.applyAxisAngle(up, ((rotation - orientationDegrees) * Math.PI) / 180);
      orientationDegrees = rotation;
      zoom = settings.zoom ?? 1;
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      importedCamera = parts.cameras.find(({ id }) => id === settings.camera);
      controls.enabled = interactive && !importedCamera;
      controls.update();
      canvas.style.touchAction = controls.enabled ? "none" : "auto";
      canvas.setAttribute("aria-hidden", String(!controls.enabled));
      if (controls.enabled) canvas.tabIndex = 0;
      else canvas.removeAttribute("tabindex");
      if ((settings.animation ?? null) !== animationId) {
        animation?.stop();
        animationId = settings.animation ?? null;
        const clip = parts.animations.find(({ id }) => id === animationId)?.clip;
        animation = clip ? mixer.clipAction(clip).reset().play() : undefined;
        previousFrame = undefined;
      }
      invalidate();
    },
    dispose() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      stopResize();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", resetFrame);
      motion.removeEventListener("change", resetFrame);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      canvas.removeEventListener("keydown", onKey);
      controls.dispose();
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
      disposeModel(gltf.scenes);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
