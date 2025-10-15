import * as THREE from "three";

export type Point3D = {
  x: number;
  y: number;
  z: number;
  r?: number;
  g?: number;
  b?: number;
  intensity?: number;
};

export type PointChunk = {
  id: string;
  points: Point3D[];
  pointCount?: number;
  visible: boolean;
  fileUrl?: string;
  confidence?: number;
  mesh?: THREE.Points;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material;
  boundingBox?: THREE.Box3;
  apiBounding?: {
    center: [number, number, number];
    size: [number, number, number];
    yaw: number;
  };
};

export type PointCloudManager = {
  chunks: PointChunk[];
  transformControlsVisible: boolean;
  setTransformControlsVisible: (value: boolean) => void;
  addChunk: (
    id: string,
    points: Point3D[],
    fileUrl?: string,
    confidence?: number,
    apiBounding?: {
      center: [number, number, number];
      size: [number, number, number];
      yaw: number;
    },
  ) => void;
  removeChunk: (id: string) => void;
  removeChunks: (ids: string[]) => void;
  clearAllChunks: () => void;
  setChunkVisibility: (id: string, visible: boolean) => void;
  updateChunkPoints: (id: string, points: Point3D[]) => void;
  setChunkMesh: (id: string, mesh: THREE.Points) => void;
  activeHighlightBaseId: string | null;
  setActiveHighlightBaseId: (baseId: string | null) => void;
  startRenderSession: (expectedCount: number) => Promise<void>;
};
