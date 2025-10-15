import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type {
  Point3D,
  PointChunk,
  PointCloudManager,
} from "../types/pointCloud";

const CHUNK_ID_SUFFIX_REGEX = /(_ground|_static|_dynamic_\d+)$/;

const ensurePointChunk = (chunkId: string, map: Map<string, PointChunk>) => {
  const chunk = map.get(chunkId);
  if (!chunk) {
    throw new Error(`Chunk with id "${chunkId}" does not exist.`);
  }
  return chunk;
};

const normalizeBaseId = (id: string) => id.replace(CHUNK_ID_SUFFIX_REGEX, "");

const createChunk = (
  id: string,
  points: Point3D[],
  fileUrl?: string,
  confidence?: number,
  apiBounding?: {
    center: [number, number, number];
    size: [number, number, number];
    yaw: number;
  },
): PointChunk => ({
  id,
  points,
  pointCount: points.length,
  visible: true,
  fileUrl,
  confidence,
  apiBounding,
});

const disposeChunkResources = (chunk: PointChunk) => {
  chunk.geometry?.dispose();
  if (chunk.material && "dispose" in chunk.material) {
    (chunk.material as THREE.Material).dispose();
  }
};

export const usePointCloudManager = (): PointCloudManager => {
  const chunksMapRef = useRef<Map<string, PointChunk>>(new Map());
  const [chunks, setChunks] = useState<PointChunk[]>([]);
  const [transformControlsVisible, setTransformControlsVisible] =
    useState(true);
  const [activeHighlightBaseId, setActiveHighlightBaseId] = useState<
    string | null
  >(null);
  const renderSessionRef = useRef<{
    expected: number;
    resolved: number;
    resolver: (() => void) | null;
    promise: Promise<void> | null;
  }>({ expected: 0, resolved: 0, resolver: null, promise: null });

  const sortedChunks = useMemo(() => chunks, [chunks]);

  const syncChunksState = useCallback(() => {
    setChunks(Array.from(chunksMapRef.current.values()));
  }, [setChunks]);

  const addChunk = useCallback(
    (
      id: string,
      points: Point3D[],
      fileUrl?: string,
      confidence?: number,
      apiBounding?: {
        center: [number, number, number];
        size: [number, number, number];
        yaw: number;
      },
    ) => {
      if (chunksMapRef.current.has(id)) {
        return;
      }
      const newChunk = createChunk(
        id,
        points,
        fileUrl,
        confidence,
        apiBounding,
      );
      chunksMapRef.current.set(id, newChunk);
      syncChunksState();
    },
    [syncChunksState],
  );

  const removeChunk = useCallback(
    (id: string) => {
      const chunk = chunksMapRef.current.get(id);
      if (!chunk) return;

      disposeChunkResources(chunk);
      chunksMapRef.current.delete(id);
      const baseId = normalizeBaseId(id);
      if (activeHighlightBaseId && baseId === activeHighlightBaseId) {
        let hasAnyWithBase = false;
        chunksMapRef.current.forEach((_c, cid) => {
          if (normalizeBaseId(cid) === baseId) {
            hasAnyWithBase = true;
          }
        });
        if (!hasAnyWithBase) {
          setActiveHighlightBaseId(null);
        }
      }
      syncChunksState();
    },
    [activeHighlightBaseId, syncChunksState],
  );

  const removeChunks = useCallback(
    (ids: string[]) => {
      ids.forEach((id) => {
        const chunk = chunksMapRef.current.get(id);
        if (!chunk) return;
        disposeChunkResources(chunk);
        chunksMapRef.current.delete(id);
      });
      if (activeHighlightBaseId) {
        let hasAnyWithBase = false;
        chunksMapRef.current.forEach((_c, cid) => {
          if (normalizeBaseId(cid) === activeHighlightBaseId) {
            hasAnyWithBase = true;
          }
        });
        if (!hasAnyWithBase) {
          setActiveHighlightBaseId(null);
        }
      }
      syncChunksState();
    },
    [activeHighlightBaseId, syncChunksState],
  );

  const clearAllChunks = useCallback(() => {
    chunksMapRef.current.forEach((chunk) => {
      disposeChunkResources(chunk);
    });
    chunksMapRef.current.clear();
    setActiveHighlightBaseId(null);
    syncChunksState();
  }, [syncChunksState]);

  const setChunkVisibility = useCallback(
    (id: string, visible: boolean) => {
      const chunk = ensurePointChunk(id, chunksMapRef.current);
      chunk.visible = visible;
      if (chunk.mesh) {
        chunk.mesh.visible = visible;
      }
      syncChunksState();
    },
    [syncChunksState],
  );

  const updateChunkPoints = useCallback(
    (id: string, points: Point3D[]) => {
      const chunk = ensurePointChunk(id, chunksMapRef.current);
      chunk.points = points;
      chunk.pointCount = points.length;
      syncChunksState();
    },
    [syncChunksState],
  );

  const setChunkMesh = useCallback(
    (id: string, mesh: THREE.Points) => {
      const chunk = ensurePointChunk(id, chunksMapRef.current);

      if (chunk.mesh === mesh) {
        return;
      }

      chunk.mesh = mesh;
      chunk.geometry = mesh.geometry;
      chunk.material = mesh.material as THREE.Material;

      if (mesh.geometry?.attributes.position) {
        const positions = mesh.geometry.attributes.position;
        chunk.pointCount = positions.count;
      }

      if (mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        chunk.boundingBox = mesh.geometry.boundingBox?.clone();
      }

      if (renderSessionRef.current.promise) {
        renderSessionRef.current.resolved += 1;
        if (
          renderSessionRef.current.resolved >=
            renderSessionRef.current.expected &&
          renderSessionRef.current.resolver
        ) {
          const resolve = renderSessionRef.current.resolver;
          renderSessionRef.current.resolver = null;
          const clear = () => {
            renderSessionRef.current.expected = 0;
            renderSessionRef.current.resolved = 0;
            renderSessionRef.current.promise = null;
          };
          resolve();
          clear();
        }
      }

      syncChunksState();
    },
    [syncChunksState],
  );

  const setActiveBase = useCallback((baseId: string | null) => {
    setActiveHighlightBaseId(baseId);
  }, []);

  const startRenderSession = useCallback((expectedCount: number) => {
    if (renderSessionRef.current.promise) {
      renderSessionRef.current.expected = expectedCount;
      renderSessionRef.current.resolved = 0;
      return renderSessionRef.current.promise;
    }
    renderSessionRef.current.expected = expectedCount;
    renderSessionRef.current.resolved = 0;
    renderSessionRef.current.promise = new Promise<void>((resolve) => {
      renderSessionRef.current.resolver = resolve;
      if (expectedCount === 0) {
        resolve();
        renderSessionRef.current.promise = null;
      }
    });
    return renderSessionRef.current.promise;
  }, []);

  return {
    chunks: sortedChunks,
    transformControlsVisible,
    setTransformControlsVisible,
    addChunk,
    removeChunk,
    removeChunks,
    clearAllChunks,
    setChunkVisibility,
    updateChunkPoints,
    setChunkMesh,
    activeHighlightBaseId,
    setActiveHighlightBaseId: setActiveBase,
    startRenderSession,
  };
};
