import { CameraControls, Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';

import type { PointCloudManager } from '../types/pointCloud';

import { useWebGLContext } from '../hooks/useWebGLContext';
import { createBboxGroup, disposeThreeObject } from '../utils/bbox';
import { PcdLoader } from './PcdLoader';
import styles from './PointCloudViewer.module.css';
import { TransformController } from './TransformController';

type PointCloudViewerProps = {
  pointCloudManager: PointCloudManager;
  pointSize?: number;
  backgroundColor?: string;
  transformControlsVisible?: boolean;
  transformControllerRef?: React.RefObject<THREE.Group | null>;
  cameraControlsRef?: React.RefObject<CameraControls | null>;
  onAllChunksRendered?: () => void;
  density?: number;
  confidenceThreshold?: number;
  transformControlsSize?: number;
  onHasActiveBboxChange?: (hasActive: boolean) => void;
  onBboxCreated?: (bbox: {
    center: THREE.Vector3;
    size: THREE.Vector3;
    rotation: THREE.Quaternion;
    chunkId?: string;
  }) => void;
};

export const PointCloudViewer: React.FC<PointCloudViewerProps> = ({
  pointCloudManager,
  pointSize = 0.1,
  backgroundColor = '#000000',
  transformControlsVisible,
  transformControllerRef,
  cameraControlsRef: externalCameraControlsRef,
  onAllChunksRendered,
  density = 100,
  confidenceThreshold = 0,
  transformControlsSize = 1,
  onHasActiveBboxChange,
  onBboxCreated,
}) => {
  const internalCameraControlsRef = useRef<CameraControls>(null);
  const cameraControlsRef =
    externalCameraControlsRef || internalCameraControlsRef;
  const controllerRef = useRef<THREE.Group>(null);
  const overlayGroupRef = useRef<THREE.Group>(null);
  const overlayTransformRef = useRef<THREE.Group>(null);
  const [allChunksLoaded, setAllChunksLoaded] = useState(false);
  const [hasPositionedCamera, setHasPositionedCamera] = useState(false);
  const [hasActiveBboxState, setHasActiveBboxState] = useState(false);

  useWebGLContext();

  useEffect(() => {
    if (overlayTransformRef.current && controllerRef.current) {
      controllerRef.current.position.copy(overlayTransformRef.current.position);
      controllerRef.current.quaternion.copy(
        overlayTransformRef.current.quaternion
      );
    }
  }, [
    overlayTransformRef.current?.position,
    overlayTransformRef.current?.quaternion,
  ]);

  useEffect(() => {
    if (transformControllerRef && controllerRef.current) {
      transformControllerRef.current = controllerRef.current;
    }
  });

  const chunksToRender = useMemo(() => {
    const filtered = pointCloudManager.chunks.filter(chunk => chunk.visible);
    return filtered;
  }, [pointCloudManager.chunks]);

  const computeBoundingBox = useCallback((meshes: THREE.Object3D[]) => {
    const box = new THREE.Box3();
    meshes.forEach(mesh => box.expandByObject(mesh));
    return box;
  }, []);

  const clearAllBboxes = useCallback(() => {
    const overlay = overlayGroupRef.current;
    const overlayTransform = overlayTransformRef.current;
    if (!overlay || !overlayTransform) return;

    while (overlay.children.length > 0) {
      const child = overlay.children[0];
      disposeThreeObject(child);
    }
    overlayTransform.clear();

    setHasActiveBboxState(false);
  }, []);

  useEffect(() => {
    onHasActiveBboxChange?.(hasActiveBboxState);
  }, [hasActiveBboxState, onHasActiveBboxChange]);

  const createAndFocusBbox = useCallback(
    (bbox: THREE.Group, worldPos?: THREE.Vector3) => {
      const overlay = overlayGroupRef.current;
      const overlayTransform = overlayTransformRef.current;
      if (!overlay || !overlayTransform) return;

      const isAlreadyActive =
        overlayTransform.children.length > 0 &&
        overlayTransform.children[0].userData?.chunkId ===
          bbox.userData?.chunkId;

      if (isAlreadyActive) {
        return;
      }

      clearAllBboxes();

      overlayTransform.position.copy(bbox.position);
      overlayTransform.quaternion.copy(bbox.quaternion);
      overlayTransform.scale.set(1, 1, 1);
      overlayTransform.attach(bbox);

      setHasActiveBboxState(true);

      const bboxCenter = worldPos ? worldPos.clone() : bbox.position.clone();
      if (controllerRef.current) {
        controllerRef.current.position.copy(bboxCenter);
      }

      if (onBboxCreated && bbox.userData?.apiBounding) {
        const apiBounding = bbox.userData.apiBounding;
        const bboxSize = new THREE.Vector3(
          apiBounding.size[0],
          apiBounding.size[1],
          apiBounding.size[2]
        );

        onBboxCreated({
          center: bboxCenter,
          size: bboxSize,
          rotation: bbox.quaternion.clone(),
          chunkId: bbox.userData.chunkId,
        });
      }
    },
    [clearAllBboxes, onBboxCreated]
  );

  useEffect(() => {
    const loadedChunks = chunksToRender.filter(chunk => chunk.mesh);
    const allLoaded =
      chunksToRender.length > 0 &&
      loadedChunks.length === chunksToRender.length;

    setAllChunksLoaded(allLoaded);
  }, [chunksToRender]);

  useEffect(() => {
    if (allChunksLoaded && cameraControlsRef.current && !hasPositionedCamera) {
      const loadedMeshes = chunksToRender
        .map(chunk => chunk.mesh)
        .filter((mesh): mesh is THREE.Points => Boolean(mesh));

      if (loadedMeshes.length === 0) return;

      const box = computeBoundingBox(loadedMeshes);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z);
      const distance = maxSize * 1.0;

      const newPosition = new THREE.Vector3(
        center.x + distance,
        center.y + distance * 0.5,
        center.z + distance
      );

      cameraControlsRef.current.setLookAt(
        newPosition.x,
        newPosition.y,
        newPosition.z,
        center.x,
        center.y,
        center.z,
        true
      );

      if (controllerRef.current) {
        controllerRef.current.position.copy(center);
      }

      setHasPositionedCamera(true);
    }
    if (allChunksLoaded && onAllChunksRendered) {
      onAllChunksRendered();
    }
  }, [
    allChunksLoaded,
    chunksToRender,
    hasPositionedCamera,
    computeBoundingBox,
    onAllChunksRendered,
    cameraControlsRef,
  ]);

  useEffect(() => {
    const onCreateBboxAt = (evt: Event) => {
      const e = evt as CustomEvent<{ position?: THREE.Vector3 }>;
      const pos = e?.detail?.position;
      if (!pos) return;

      const bbox = createBboxGroup({
        chunkId: 'manual',
        apiBounding: {
          center: [pos.x, pos.y, pos.z],
          size: [3, 3, 3],
          yaw: 0,
        },
        parentObject: null,
        materialColor: 0x00ffff,
      });

      createAndFocusBbox(bbox, pos);

      window.dispatchEvent(new CustomEvent('pcd-edit-bbox-start'));
    };
    window.addEventListener(
      'pcd-create-bbox-at',
      onCreateBboxAt as EventListener
    );
    return () =>
      window.removeEventListener(
        'pcd-create-bbox-at',
        onCreateBboxAt as EventListener
      );
  }, [createAndFocusBbox]);

  useEffect(() => {
    const onDynamicFocus = (evt: Event) => {
      const e = evt as CustomEvent<{ id?: string }>;
      const id = e?.detail?.id;
      const overlayTransform = overlayTransformRef.current;
      if (!overlayTransform) return;
      if (!id) return;
      const onBboxRef = (ev: Event) => {
        const ce = ev as CustomEvent<{ id: string; object: THREE.Group }>;
        if (!ce.detail || ce.detail.id !== id) return;
        const bbox = ce.detail.object;
        bbox.updateMatrixWorld(true);
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        bbox.getWorldPosition(worldPos);
        bbox.getWorldQuaternion(worldQuat);

        const bboxCopy = bbox.clone();
        bboxCopy.position.copy(worldPos);
        bboxCopy.setRotationFromQuaternion(worldQuat);
        bboxCopy.userData = bbox.userData;

        createAndFocusBbox(bboxCopy, worldPos);

        window.removeEventListener('pcd-bbox-ref', onBboxRef as EventListener);
      };
      window.addEventListener('pcd-bbox-ref', onBboxRef as EventListener);
      window.dispatchEvent(
        new CustomEvent('pcd-bind-bbox', { detail: { id } })
      );
    };
    window.addEventListener('pcd-pulse-chunk', onDynamicFocus as EventListener);
    return () =>
      window.removeEventListener(
        'pcd-pulse-chunk',
        onDynamicFocus as EventListener
      );
  }, [createAndFocusBbox]);

  useEffect(() => {
    const hasChildren = (overlayTransformRef.current?.children.length || 0) > 0;

    if (!hasChildren) {
      setHasActiveBboxState(false);
    }
  }, [overlayTransformRef.current?.children.length]);

  useEffect(() => {
    const onBboxDelete = () => {
      clearAllBboxes();
    };

    window.addEventListener('bbox-delete', onBboxDelete);
    return () => window.removeEventListener('bbox-delete', onBboxDelete);
  }, [clearAllBboxes]);

  useEffect(() => {
    const onNonDynamicDoubleClick = (evt: Event) => {
      const e = evt as CustomEvent<{ baseId: string; point?: THREE.Vector3 }>;

      clearAllBboxes();

      if (e.detail?.point && controllerRef.current) {
        controllerRef.current.position.copy(e.detail.point);
      }
    };

    window.addEventListener(
      'pcd-pulse',
      onNonDynamicDoubleClick as EventListener
    );
    return () => {
      window.removeEventListener(
        'pcd-pulse',
        onNonDynamicDoubleClick as EventListener
      );
    };
  }, [clearAllBboxes]);

  return (
    <div
      style={{ width: '100%', height: '100vh', background: backgroundColor }}
    >
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60, near: 0.1, far: 10000 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

        {chunksToRender.map(chunk => {
          let color = '#ffffff';
          if (chunk.id.includes('ground')) {
            color = '#8B4513';
          } else if (chunk.id.includes('static')) {
            color = '#00ff00';
          } else if (chunk.id.includes('dynamic')) {
            const conf =
              typeof chunk.confidence === 'number' ? chunk.confidence : 0;
            const thr = Math.max(0, Math.min(1, confidenceThreshold));
            color = conf > thr ? '#ff0000' : '#ffff00';
          }

          const fileUrl = chunk.fileUrl || '';

          return (
            <Suspense key={chunk.id} fallback={null}>
              <PcdLoader
                url={fileUrl}
                pointSize={pointSize}
                color={color}
                visible={chunk.visible}
                pointCloudManager={pointCloudManager}
                chunkId={chunk.id}
                cameraControlsRef={cameraControlsRef}
                transformControllerRef={controllerRef}
                density={density}
              />
            </Suspense>
          );
        })}

        {(overlayTransformRef.current?.children.length || 0) > 0 && (
          <TransformController
            objectRef={overlayTransformRef}
            hideInTranslateMode={!transformControlsVisible}
            size={transformControlsSize}
          />
        )}

        <group ref={overlayGroupRef} />
        <group ref={overlayTransformRef} />
        <group ref={controllerRef} />

        <CameraControls ref={cameraControlsRef} makeDefault />

        <Stats className={styles.stats} />
      </Canvas>
    </div>
  );
};
