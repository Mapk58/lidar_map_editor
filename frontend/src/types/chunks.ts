import type { Point3D } from './pointCloud';

export type BboxData = {
  bounding_box: {
    center: [number, number, number];
    size: [number, number, number];
    yaw: number;
    fill_surface: boolean;
  };
};

export type DynamicChunkData = {
  url: string;
  confidence: number;
  inference: number;
  points: number;
  bounding_box: {
    center: [number, number, number];
    size: [number, number, number];
    yaw: number;
  };
};

export type ChunkData = {
  chunk_id: number;
  ground: string;
  static: string;
  dynamic: DynamicChunkData[];
};

export type ProcessedChunkData = {
  chunk_id: number;
  ground: Point3D[];
  static: Point3D[];
  dynamic: Point3D[][];
  originalData?: ChunkData;
};

export type ApiJobResponse = {
  job_id: string;
  status: string;
  results: ChunkData[];
};

export type ExportPcdRequest = {
  job_id: string;
  bounding_box: {
    center: [number, number, number];
    size: [number, number, number];
    yaw: number;
    fill_surface: boolean;
  }[];
};

export type ExportPcdResponse = {
  success: boolean;
  download_url?: string;
  error?: string;
};
