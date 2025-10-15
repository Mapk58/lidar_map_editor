import React, { useCallback, useState } from "react";
import * as THREE from "three";

import type { BboxData } from "../types/chunks";
import type { PointCloudManager } from "../types/pointCloud";

import { getBboxSize } from "../utils/bbox";

type BoundingBox = {
  center: THREE.Vector3;
  size: THREE.Vector3;
  rotation: THREE.Quaternion;
  chunkId?: string;
  fillSurface?: boolean;
};

export const useBboxManager = (
  pointCloudManager: PointCloudManager,
  objectRef?: React.RefObject<THREE.Object3D | null>,
  fillSurface?: boolean,
) => {
  const [deletedBboxes, setDeletedBboxes] = useState<BboxData[]>([]);
  const [currentBbox, setCurrentBbox] = useState<BoundingBox | null>(null);
  const [isBboxResized, setIsBboxResized] = useState(false);

  const convertToBboxData = useCallback((bbox: BoundingBox): BboxData => {
    const euler = new THREE.Euler().setFromQuaternion(bbox.rotation);
    const yaw = euler.y;

    return {
      bounding_box: {
        center: [bbox.center.x, bbox.center.y, bbox.center.z],
        size: [bbox.size.x, bbox.size.y, bbox.size.z],
        yaw: yaw,
        fill_surface: bbox.fillSurface || false,
      },
    };
  }, []);

  const isPointInBbox = useCallback(
    (point: THREE.Vector3, bbox: BoundingBox): boolean => {
      const matrix = new THREE.Matrix4();
      matrix.compose(bbox.center, bbox.rotation, new THREE.Vector3(1, 1, 1));

      const inverseMatrix = matrix.clone().invert();
      const localPoint = point.clone().applyMatrix4(inverseMatrix);

      const halfSize = bbox.size.clone().multiplyScalar(0.5);
      return (
        Math.abs(localPoint.x) <= halfSize.x &&
        Math.abs(localPoint.y) <= halfSize.y &&
        Math.abs(localPoint.z) <= halfSize.z
      );
    },
    [],
  );

  const removePointsInBbox = useCallback(
    (bbox: BoundingBox) => {
      pointCloudManager.chunks.forEach((chunk) => {
        if (chunk.mesh && chunk.mesh.geometry) {
          const geometry = chunk.mesh.geometry;
          const positionAttribute = geometry.getAttribute("position");

          if (positionAttribute) {
            const positions = positionAttribute.array as Float32Array;
            const originalCount = positions.length / 3;

            const filteredPositions: number[] = [];

            const mesh = chunk.mesh;
            const worldMatrix = new THREE.Matrix4();
            mesh.updateMatrixWorld();
            worldMatrix.copy(mesh.matrixWorld);

            for (let i = 0; i < originalCount; i++) {
              const x = positions[i * 3];
              const y = positions[i * 3 + 1];
              const z = positions[i * 3 + 2];
              const localPoint = new THREE.Vector3(x, y, z);

              const worldPoint = localPoint.clone().applyMatrix4(worldMatrix);

              if (!isPointInBbox(worldPoint, bbox)) {
                filteredPositions.push(x, y, z);
              }
            }

            const newCount = filteredPositions.length / 3;

            if (newCount > 0) {
              const newPositions = new Float32Array(filteredPositions);
              geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(newPositions, 3),
              );
              geometry.computeBoundingSphere();
            } else {
              chunk.mesh.visible = false;
            }
          }
        }
      });
    },
    [pointCloudManager, isPointInBbox],
  );

  const removeChunk = useCallback(
    (bbox: BoundingBox) => {
      if (bbox.chunkId) {
        const targetChunk = pointCloudManager.chunks.find(
          (chunk) => chunk.id === bbox.chunkId,
        );

        if (targetChunk) {
          pointCloudManager.removeChunk(targetChunk.id);
        }
      }
    },
    [pointCloudManager],
  );

  const setBbox = useCallback((bbox: BoundingBox | null) => {
    setCurrentBbox(bbox);
  }, []);

  const deleteBbox = useCallback(() => {
    if (currentBbox) {
      if (objectRef?.current) {
        const target = objectRef.current;

        let bboxObj = target;
        if (!target.userData?.apiBounding) {
          const bboxChild = target.children.find(
            (child) => child.userData?.apiBounding,
          ) as THREE.Object3D | undefined;
          if (bboxChild) {
            bboxObj = bboxChild;
          }
        }

        if (bboxObj.userData?.apiBounding) {
          const bboxSize = getBboxSize(bboxObj as THREE.Group);
          const bboxCenter = bboxObj.position.clone();
          bboxObj.localToWorld(bboxCenter);

          const actualBbox = {
            center: bboxCenter,
            size: bboxSize,
            rotation: bboxObj.quaternion.clone(),
            chunkId: currentBbox.chunkId,
            fillSurface: fillSurface || false,
          };

          if (isBboxResized) {
            removePointsInBbox(actualBbox);
            removeChunk(actualBbox);
          } else {
            removeChunk(actualBbox);
          }

          setDeletedBboxes((prev) => [...prev, convertToBboxData(actualBbox)]);
        } else {
          if (isBboxResized) {
            removePointsInBbox(currentBbox);
            removeChunk(currentBbox);
          } else {
            removeChunk(currentBbox);
          }

          setDeletedBboxes((prev) => [
            ...prev,
            convertToBboxData({
              ...currentBbox,
              fillSurface: fillSurface || false,
            }),
          ]);
        }
      } else {
        if (isBboxResized) {
          removePointsInBbox(currentBbox);
          removeChunk(currentBbox);
        } else {
          removeChunk(currentBbox);
        }

        setDeletedBboxes((prev) => [
          ...prev,
          convertToBboxData({
            ...currentBbox,
            fillSurface: fillSurface || false,
          }),
        ]);
      }

      setCurrentBbox(null);
      setIsBboxResized(false);

      window.dispatchEvent(new CustomEvent("bbox-delete"));
    }
  }, [
    currentBbox,
    isBboxResized,
    removePointsInBbox,
    removeChunk,
    objectRef,
    fillSurface,
    convertToBboxData,
  ]);

  const cancelBbox = useCallback(() => {
    setCurrentBbox(null);
    setIsBboxResized(false);
  }, []);

  const clearAllBboxes = useCallback(() => {
    setCurrentBbox(null);
    setIsBboxResized(false);
    window.dispatchEvent(new CustomEvent("bbox-delete"));
  }, []);

  const clearDeletedBboxes = useCallback(() => {
    setDeletedBboxes([]);
  }, []);

  const markBboxAsResized = useCallback(() => {
    setIsBboxResized(true);
  }, []);

  return {
    currentBbox,
    deletedBboxes,
    setBbox,
    deleteBbox,
    cancelBbox,
    clearAllBboxes,
    clearDeletedBboxes,
    removePointsInBbox,
    markBboxAsResized,
  };
};
