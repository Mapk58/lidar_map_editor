import * as THREE from "three";

export type LocalOrientedBox = {
  center: [number, number, number];
  size: [number, number, number];
  yaw: number;
};

export type BboxCreateParams = {
  chunkId: string;
  apiBounding: LocalOrientedBox;
  parentObject?: THREE.Object3D | null;
  materialColor?: number;
};

type InternalApiBounding = {
  center: [number, number, number];
  size: [number, number, number];
  yaw: number;
};

const EDGES_CONTAINER_NAME = "bbox-edges";

const getEdgesContainer = (group: THREE.Group): THREE.Group => {
  let container = group.children.find(
    c => c.type === "Group" && (c as THREE.Group).name === EDGES_CONTAINER_NAME
  ) as THREE.Group | undefined;
  if (!container) {
    container = new THREE.Group();
    container.name = EDGES_CONTAINER_NAME;
    group.add(container);
  }
  return container;
};

const clearObjectChildren = (obj: THREE.Object3D) => {
  for (let i = obj.children.length - 1; i >= 0; i--) {
    const child = obj.children[i];
    disposeThreeObject(child);
  }
};

export const createBboxGroup = (params: BboxCreateParams): THREE.Group => {
  const {
    chunkId,
    apiBounding,
    parentObject,
    materialColor = 0x00ffff,
  } = params;
  const group = new THREE.Group();
  group.name = `bbox-${chunkId}`;
  (group.userData as Record<string, unknown>).apiBounding = {
    center: [...apiBounding.center] as [number, number, number],
    size: [...apiBounding.size] as [number, number, number],
    yaw: apiBounding.yaw ?? 0,
  } as InternalApiBounding;
  (group.userData as Record<string, unknown>).chunkId = chunkId;

  const [cx, cy, cz] = apiBounding.center;
  const [sx, sy, sz] = apiBounding.size;
  const yaw = apiBounding.yaw ?? 0;

  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const edgeRadius = Math.max(Math.min(sx, sy, sz) * 0.01, 0.01);
  const edgeSegments = 8;
  const cylinderGeometry = new THREE.CylinderGeometry(
    edgeRadius,
    edgeRadius,
    1,
    edgeSegments
  );
  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: materialColor,
    depthTest: true,
    depthWrite: true,
    transparent: false,
  });

  const addEdge = (a: THREE.Vector3, b: THREE.Vector3) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len <= 0) return;
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const mesh = new THREE.Mesh(cylinderGeometry.clone(), edgeMaterial.clone());
    mesh.scale.set(1, len, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    mesh.setRotationFromQuaternion(quat);
    mesh.position.copy(mid);
    (mesh as THREE.Object3D).raycast = () => undefined;
    edgesContainer.add(mesh);
  };

  const edgesContainer = getEdgesContainer(group);

  const corners = [
    new THREE.Vector3(-hx, -hy, -hz),
    new THREE.Vector3(hx, -hy, -hz),
    new THREE.Vector3(hx, hy, -hz),
    new THREE.Vector3(-hx, hy, -hz),
    new THREE.Vector3(-hx, -hy, hz),
    new THREE.Vector3(hx, -hy, hz),
    new THREE.Vector3(hx, hy, hz),
    new THREE.Vector3(-hx, hy, hz),
  ];

  const edgeIndices: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];

  edgeIndices.forEach(([i, j]) => addEdge(corners[i], corners[j]));

  const localCenter = new THREE.Vector3(cx, cy, cz);
  let worldCenter = localCenter.clone();
  if (parentObject) {
    parentObject.updateMatrixWorld(true);
    worldCenter = localCenter.clone();
    parentObject.localToWorld(worldCenter);
  }
  group.position.copy(worldCenter);

  const parentQuat = new THREE.Quaternion();
  if (parentObject) {
    parentObject.getWorldQuaternion(parentQuat);
  } else {
    parentQuat.identity();
  }
  const localQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, yaw)
  );
  const worldQuat = parentQuat.clone().multiply(localQuat);
  group.setRotationFromQuaternion(worldQuat);

  group.traverse(obj => {
    (obj as THREE.Object3D).raycast = () => undefined;
  });

  return group;
};

export const disposeThreeObject = (obj: THREE.Object3D) => {
  obj.traverse(child => {
    const mesh = child as unknown as {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (Array.isArray(material)) material.forEach(m => m.dispose());
    else if (material) material.dispose();
  });
  if (obj.parent) obj.parent.remove(obj);
};

export type BboxResizeHandle = {
  name: string;
  object: THREE.Object3D;
};

export const addResizeHandles = (): BboxResizeHandle[] => {
  return [];
};

export type BboxAxis = "x" | "y" | "z";

const getApiBounding = (group: THREE.Group): InternalApiBounding | null => {
  const data = (group.userData as Record<string, unknown>).apiBounding as
    | InternalApiBounding
    | undefined;
  return data ?? null;
};

export const getBboxSize = (group: THREE.Group): THREE.Vector3 => {
  const api = getApiBounding(group);
  if (api) {
    const [sx, sy, sz] = api.size;
    return new THREE.Vector3(sx, sy, sz);
  }
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  return size;
};

export const rebuildEdges = (group: THREE.Group, size: THREE.Vector3) => {
  const color = 0x00ffff;
  const edgeRadius = Math.max(Math.min(size.x, size.y, size.z) * 0.01, 0.01);
  const edgeSegments = 8;
  const cylinderGeometry = new THREE.CylinderGeometry(
    edgeRadius,
    edgeRadius,
    1,
    edgeSegments
  );
  const edgeMaterial = new THREE.MeshBasicMaterial({
    color,
    depthTest: true,
    depthWrite: true,
    transparent: false,
  });
  const edgesContainer = getEdgesContainer(group);
  clearObjectChildren(edgesContainer);

  const hx = size.x / 2;
  const hy = size.y / 2;
  const hz = size.z / 2;
  const corners = [
    new THREE.Vector3(-hx, -hy, -hz),
    new THREE.Vector3(hx, -hy, -hz),
    new THREE.Vector3(hx, hy, -hz),
    new THREE.Vector3(-hx, hy, -hz),
    new THREE.Vector3(-hx, -hy, hz),
    new THREE.Vector3(hx, -hy, hz),
    new THREE.Vector3(hx, hy, hz),
    new THREE.Vector3(-hx, hy, hz),
  ];
  const addEdge = (a: THREE.Vector3, b: THREE.Vector3) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len <= 0) return;
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const mesh = new THREE.Mesh(cylinderGeometry.clone(), edgeMaterial.clone());
    mesh.scale.set(1, len, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    mesh.setRotationFromQuaternion(quat);
    mesh.position.copy(mid);
    (mesh as THREE.Object3D).raycast = () => undefined;
    edgesContainer.add(mesh);
  };
  const edgeIndices: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  edgeIndices.forEach(([i, j]) => addEdge(corners[i], corners[j]));
};
export const applyOneSidedResize = (
  group: THREE.Group,
  axis: BboxAxis,
  delta: number
) => {
  const minSize = 0.05;
  const size = getBboxSize(group);
  const worldQuat = new THREE.Quaternion();
  group.getWorldQuaternion(worldQuat);
  const axisLocal =
    axis === "x"
      ? new THREE.Vector3(1, 0, 0)
      : axis === "y"
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
  const axisWorld = axisLocal.clone().applyQuaternion(worldQuat).normalize();

  const currentAxisSize =
    axis === "x" ? size.x : axis === "y" ? size.y : size.z;
  const newAxisSize = Math.max(minSize, currentAxisSize + delta);

  const halfShift = axisWorld.clone().multiplyScalar(delta / 2);
  group.position.add(halfShift);

  if (axis === "x") size.x = newAxisSize;
  if (axis === "y") size.y = newAxisSize;
  if (axis === "z") size.z = newAxisSize;

  rebuildEdges(group, size);
};
