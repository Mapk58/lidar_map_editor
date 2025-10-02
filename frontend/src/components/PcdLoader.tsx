import { CameraControls } from '@react-three/drei';
import { type ThreeEvent, useFrame, useLoader } from '@react-three/fiber';
import React, {
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { PCDLoader } from 'three/addons/loaders/PCDLoader.js';

import type { PointCloudManager } from '../types/pointCloud';

import { useCameraControls } from '../hooks/useCameraControls';
import { createBboxGroup, disposeThreeObject } from '../utils/bbox';

const MOVE_DELAY_MS = 150;

const normalizeChunkId = (chunkId: string) =>
  chunkId.replace(/(_ground|_static|_dynamic_\d+)$/, '');

type PcdLoaderProps = {
  url: string;
  pointSize?: number;
  color?: string;
  visible?: boolean;
  pointCloudManager: PointCloudManager;
  chunkId: string;
  cameraControlsRef: React.RefObject<CameraControls | null>;
  transformControllerRef: React.RefObject<THREE.Group | null>;
  density?: number;
};

export const PcdLoader: React.FC<PcdLoaderProps> = ({
  url,
  pointSize = 0.1,
  color = '#ffffff',
  visible = true,
  pointCloudManager,
  chunkId,
  cameraControlsRef,
  transformControllerRef,
  density = 100,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const points = useLoader(PCDLoader, url);
  const { setChunkMesh } = pointCloudManager;

  useEffect(() => {
    setIsLoaded(false);
  }, [url]);

  useEffect(() => {
    if (points) {
      setIsLoaded(true);
    }
  }, [points, chunkId]);

  const { smoothMoveToPoint } = useCameraControls({
    cameraControlsRef,
    transformControllerRef,
  });

  const baseId = normalizeChunkId(chunkId);
  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disposeTimeout = useCallback(() => {
    if (moveTimeoutRef.current) {
      clearTimeout(moveTimeoutRef.current);
      moveTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => disposeTimeout, [disposeTimeout]);

  const pointsObject = useMemo(() => {
    if (!isLoaded || !points || !points.geometry) {
      return null;
    }

    const material = new THREE.PointsMaterial({
      size: pointSize,
      color,
      sizeAttenuation: true,
    });

    const targetPercent = THREE.MathUtils.clamp(density, 0, 100) / 100;
    let geometry: THREE.BufferGeometry = points.geometry;
    if (targetPercent < 0.999) {
      const pos = points.geometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      const count = pos.count;
      const indices = new Uint32Array(count);
      for (let i = 0; i < count; i++) indices[i] = i;
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = indices[i];
        indices[i] = indices[j];
        indices[j] = tmp;
      }
      const targetCount = Math.max(1, Math.floor(count * targetPercent));
      const chosen = indices.subarray(0, targetCount);
      const newPositions = new Float32Array(targetCount * 3);
      for (let i = 0; i < targetCount; i++) {
        const idx = chosen[i];
        newPositions[i * 3 + 0] = pos.getX(idx);
        newPositions[i * 3 + 1] = pos.getY(idx);
        newPositions[i * 3 + 2] = pos.getZ(idx);
      }
      const newGeom = new THREE.BufferGeometry();
      newGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(newPositions, 3)
      );
      geometry = newGeom;
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const newPoints = new THREE.Points(geometry, material);
    newPoints.visible = visible;
    newPoints.frustumCulled = false;
    newPoints.rotation.x = -Math.PI / 2;

    setChunkMesh(chunkId, newPoints);

    return newPoints;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, pointSize, visible, chunkId, setChunkMesh, isLoaded, density]);

  useEffect(() => {
    if (!pointsObject) return;
    const mat = pointsObject.material as THREE.PointsMaterial | undefined;
    if (mat) {
      mat.color.set(color);
      mat.needsUpdate = true;
    }
  }, [pointsObject, color]);

  useEffect(() => {
    if (!pointsObject) return;
    pointsObject.visible = visible;
  }, [pointsObject, visible]);

  const baseColorRef = useRef(new THREE.Color(color));
  const flashColorRef = useRef(new THREE.Color(0xffffff));
  const baseSizeRef = useRef(pointSize);
  const fadeStartRef = useRef<number>(0);
  const fadeDurationMsRef = useRef<number>(2000);

  const bboxGroupRef = useRef<THREE.Group | null>(null);

  const currentChunk = useMemo(
    () => pointCloudManager.chunks.find(c => c.id === chunkId),
    [pointCloudManager.chunks, chunkId]
  );

  const disposeBbox = useCallback(() => {
    const group = bboxGroupRef.current;
    if (!group) return;
    disposeThreeObject(group);
    bboxGroupRef.current = null;
  }, []);

  const attachOrUpdateBboxFromApi = useCallback(() => {
    const api = currentChunk?.apiBounding;
    if (!api || !pointsObject) return;

    const scaledApi = api;

    let group = bboxGroupRef.current;
    if (!group) {
      group = createBboxGroup({
        chunkId,
        apiBounding: scaledApi,
        parentObject: pointsObject,
      });
      bboxGroupRef.current = group;
    } else {
      disposeThreeObject(group);
      group = createBboxGroup({
        chunkId,
        apiBounding: scaledApi,
        parentObject: pointsObject,
      });
      bboxGroupRef.current = group;
    }
  }, [currentChunk, chunkId, pointsObject]);

  useEffect(() => {
    const onBindBbox = (evt: Event) => {
      const e = evt as CustomEvent<{ id?: string }>;
      const id = e?.detail?.id;
      if (!id || id !== chunkId) return;
      if (!currentChunk?.apiBounding) return;
      if (!bboxGroupRef.current) {
        attachOrUpdateBboxFromApi();
      }
      if (bboxGroupRef.current) {
        if (pointsObject && bboxGroupRef.current.parent !== pointsObject) {
          pointsObject.attach(bboxGroupRef.current);
        }
        requestAnimationFrame(() => {
          window.dispatchEvent(
            new CustomEvent('pcd-bbox-ref', {
              detail: { id: chunkId, object: bboxGroupRef.current! },
            })
          );
        });
      }
    };
    window.addEventListener('pcd-bind-bbox', onBindBbox as EventListener);
    return () =>
      window.removeEventListener('pcd-bind-bbox', onBindBbox as EventListener);
  }, [chunkId, currentChunk, attachOrUpdateBboxFromApi, pointsObject]);

  useEffect(() => {
    baseColorRef.current.set(color);
  }, [color]);

  useEffect(() => {
    baseSizeRef.current = pointSize;
  }, [pointSize]);

  useEffect(() => {
    const onPulse = (evt: Event) => {
      const e = evt as CustomEvent<{ baseId: string }>;
      if (!e?.detail) return;
      if (e.detail.baseId !== baseId) return;
      flashColorRef.current.set(0xffffff);
      fadeStartRef.current = performance.now();
      const mat = pointsObject?.material as THREE.PointsMaterial | undefined;
      if (mat) {
        mat.color.set(0xffffff);
        const highlightSize = Math.max(
          baseSizeRef.current * 1.5,
          baseSizeRef.current + 0.8
        );
        mat.size = highlightSize;
        mat.vertexColors = false;
        mat.needsUpdate = true;
      }
    };
    window.addEventListener('pcd-pulse', onPulse as EventListener);
    return () =>
      window.removeEventListener('pcd-pulse', onPulse as EventListener);
  }, [baseId, pointsObject]);

  useEffect(() => {
    const onPulseChunk = (evt: Event) => {
      const e = evt as CustomEvent<{ id: string; color?: number | string }>;
      const id = e?.detail?.id;
      if (!id) return;
      if (!pointsObject) return;

      if (id === chunkId) {
        const mat = pointsObject.material as THREE.PointsMaterial | undefined;
        if (mat) {
          const colorDetail = e.detail.color ?? 0xffffff;
          flashColorRef.current.set(
            colorDetail as unknown as THREE.ColorRepresentation
          );
          mat.color.set(flashColorRef.current);
          const highlightSize = Math.max(
            baseSizeRef.current * 1.5,
            baseSizeRef.current + 0.8
          );
          mat.size = highlightSize;
          mat.vertexColors = false;
          mat.needsUpdate = true;
          fadeStartRef.current = performance.now();
        }
      }

      if (!currentChunk) return;
      const isDynamic = currentChunk.id.includes('_dynamic_');
      if (!isDynamic) return;
      if (id === chunkId) {
        attachOrUpdateBboxFromApi();
      } else if (bboxGroupRef.current) {
        disposeBbox();
      }
    };
    window.addEventListener('pcd-pulse-chunk', onPulseChunk as EventListener);
    return () =>
      window.removeEventListener(
        'pcd-pulse-chunk',
        onPulseChunk as EventListener
      );
  }, [
    chunkId,
    pointsObject,
    currentChunk,
    attachOrUpdateBboxFromApi,
    disposeBbox,
  ]);

  useFrame(() => {
    if (!pointsObject) return;
    const mat = pointsObject.material as THREE.PointsMaterial | undefined;
    if (!mat) return;
    const now = performance.now();

    if (fadeStartRef.current > 0) {
      const t = THREE.MathUtils.clamp(
        (now - fadeStartRef.current) / fadeDurationMsRef.current,
        0,
        1
      );
      const fromColor = flashColorRef.current;
      const toColor = baseColorRef.current;
      const tempColor = fromColor.clone().lerp(toColor, t);
      mat.color.copy(tempColor);
      const highlightSize = Math.max(
        baseSizeRef.current * 1.5,
        baseSizeRef.current + 0.8
      );
      mat.size = THREE.MathUtils.lerp(highlightSize, baseSizeRef.current, t);
      if (t >= 1) {
        fadeStartRef.current = 0;
      }
    }

    mat.vertexColors = false;
    mat.needsUpdate = true;
  });

  useEffect(() => {
    return () => {
      disposeTimeout();
      disposeBbox();
      if (pointsObject) {
        pointsObject.geometry?.dispose();
        if (pointsObject.material instanceof THREE.Material) {
          pointsObject.material.dispose();
        }
      }
    };
  }, [disposeTimeout, pointsObject, disposeBbox]);

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();

      if (!pointsObject?.geometry) return;

      const targetPoint = event.point?.clone();
      if (!targetPoint) return;

      if (chunkId.includes('_dynamic_')) {
        window.dispatchEvent(
          new CustomEvent('pcd-pulse-chunk', {
            detail: { id: chunkId, color: 0xffffff },
          })
        );
      } else {
        window.dispatchEvent(
          new CustomEvent('pcd-pulse', {
            detail: {
              baseId,
              point: targetPoint,
            },
          })
        );
      }

      disposeTimeout();
      moveTimeoutRef.current = setTimeout(() => {
        smoothMoveToPoint(targetPoint!);
        moveTimeoutRef.current = null;
      }, MOVE_DELAY_MS);
    },
    [pointsObject, chunkId, disposeTimeout, baseId, smoothMoveToPoint]
  );

  if (!pointsObject) {
    return null;
  }

  return (
    <>
      <primitive
        key={`${chunkId}-${density}-${pointSize}`}
        object={pointsObject}
        onDoubleClick={handleDoubleClick}
      />
    </>
  );
};
