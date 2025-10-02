import { CameraControls } from '@react-three/drei';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import type { ChunkData } from './types/chunks';

import styles from './App.module.css';
import { BboxActionPanel } from './components/BboxActionPanel/BboxActionPanel';
import { ControlPanel } from './components/ControlPanel';
import { PointCloudViewer } from './components/PointCloudViewer';
import { ToolsPanel } from './components/ToolsPanel';
import { useBboxManager } from './hooks/useBboxManager';
import { useChunkProcessor } from './hooks/useChunkProcessor';
import { usePointCloudManager } from './hooks/usePointCloudManager';

export const App = () => {
  const pointCloudManager = usePointCloudManager();
  const {
    processedChunks,
    processChunks,
    clearProcessedChunks,
    isLoading,
    error,
    endLoading,
  } = useChunkProcessor();
  const [fillSurface, setFillSurface] = useState<boolean>(false);

  const transformControllerRef = useRef<THREE.Group | null>(null);
  const cameraControlsRef = useRef<CameraControls | null>(null);
  const bboxManager = useBboxManager(
    pointCloudManager,
    transformControllerRef,
    fillSurface
  );

  const [density, setDensity] = useState<number>(100);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.4);
  const [transformControlsSize, setTransformControlsSize] = useState<number>(1);
  const [pointSize, setPointSize] = useState<number>(0.1);
  const [hasActiveBbox, setHasActiveBbox] = useState<boolean>(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);

  const [isBboxPanelVisible, setIsBboxPanelVisible] = useState<boolean>(false);

  const handleDelete = useCallback(() => {
    bboxManager.deleteBbox();
    setIsBboxPanelVisible(false);
  }, [bboxManager]);

  const handleCancel = useCallback(() => {
    bboxManager.clearAllBboxes();
    setIsBboxPanelVisible(false);
  }, [bboxManager]);

  const handleFillSurfaceChange = useCallback((checked: boolean) => {
    setFillSurface(checked);
  }, []);

  const clearAllData = useCallback(() => {
    clearProcessedChunks();
    pointCloudManager.clearAllChunks();
    bboxManager.cancelBbox();
    bboxManager.clearDeletedBboxes();
    setIsBboxPanelVisible(false);
  }, [clearProcessedChunks, pointCloudManager, bboxManager]);

  const handleProcessChunks = useCallback(
    async (chunks: ChunkData[]) => {
      clearAllData();
      await processChunks(chunks);
    },
    [clearAllData, processChunks]
  );

  const handleBboxCreated = useCallback(
    (bbox: {
      center: THREE.Vector3;
      size: THREE.Vector3;
      rotation: THREE.Quaternion;
    }) => {
      bboxManager.setBbox(bbox);
    },
    [bboxManager]
  );

  const handleBboxSizeChanged = useCallback(
    (bbox: {
      center: THREE.Vector3;
      size: THREE.Vector3;
      rotation: THREE.Quaternion;
    }) => {
      const currentBbox = bboxManager.currentBbox;

      const updatedBbox = {
        ...bbox,
        chunkId: currentBbox?.chunkId,
      };

      bboxManager.setBbox(updatedBbox);
      bboxManager.markBboxAsResized();
    },
    [bboxManager]
  );

  const handleBboxRotationChanged = useCallback(
    (bbox: {
      center: THREE.Vector3;
      size: THREE.Vector3;
      rotation: THREE.Quaternion;
    }) => {
      const currentBbox = bboxManager.currentBbox;

      const updatedBbox = {
        ...bbox,
        chunkId: currentBbox?.chunkId,
      };

      bboxManager.setBbox(updatedBbox);
      bboxManager.markBboxAsResized();
    },
    [bboxManager]
  );

  const handleBboxCenterChanged = useCallback(
    (bbox: {
      center: THREE.Vector3;
      size: THREE.Vector3;
      rotation: THREE.Quaternion;
    }) => {
      const currentBbox = bboxManager.currentBbox;

      const updatedBbox = {
        ...bbox,
        chunkId: currentBbox?.chunkId,
      };

      bboxManager.setBbox(updatedBbox);
      bboxManager.markBboxAsResized();
    },
    [bboxManager]
  );

  useEffect(() => {
    const onBboxSizeChanged = (evt: Event) => {
      const e = evt as CustomEvent<{
        bbox: THREE.Group;
        size: THREE.Vector3;
        center: THREE.Vector3;
        rotation: THREE.Quaternion;
      }>;
      const { size, center, rotation } = e.detail;
      handleBboxSizeChanged({ center, size, rotation });
    };

    window.addEventListener(
      'bbox-size-changed',
      onBboxSizeChanged as EventListener
    );
    return () => {
      window.removeEventListener(
        'bbox-size-changed',
        onBboxSizeChanged as EventListener
      );
    };
  }, [handleBboxSizeChanged]);

  useEffect(() => {
    const onBboxRotationChanged = (evt: Event) => {
      const e = evt as CustomEvent<{
        bbox: THREE.Group;
        size: THREE.Vector3;
        center: THREE.Vector3;
        rotation: THREE.Quaternion;
      }>;
      const { size, center, rotation } = e.detail;
      handleBboxRotationChanged({ center, size, rotation });
    };

    window.addEventListener(
      'bbox-rotation-changed',
      onBboxRotationChanged as EventListener
    );
    return () => {
      window.removeEventListener(
        'bbox-rotation-changed',
        onBboxRotationChanged as EventListener
      );
    };
  }, [handleBboxRotationChanged]);

  useEffect(() => {
    const onBboxCenterChanged = (evt: Event) => {
      const e = evt as CustomEvent<{
        bbox: THREE.Group;
        size: THREE.Vector3;
        center: THREE.Vector3;
        rotation: THREE.Quaternion;
      }>;
      const { size, center, rotation } = e.detail;
      handleBboxCenterChanged({ center, size, rotation });
    };

    window.addEventListener(
      'bbox-center-changed',
      onBboxCenterChanged as EventListener
    );
    return () => {
      window.removeEventListener(
        'bbox-center-changed',
        onBboxCenterChanged as EventListener
      );
    };
  }, [handleBboxCenterChanged]);

  useEffect(() => {
    pointCloudManager.chunks.forEach(chunk => {
      pointCloudManager.removeChunk(chunk.id);
    });

    processedChunks.forEach(chunk => {
      if (chunk.originalData?.static) {
        pointCloudManager.addChunk(
          `chunk_${chunk.chunk_id}_static`,
          [],
          `http://localhost:8000${chunk.originalData.static}`
        );
      }

      if (chunk.originalData?.dynamic) {
        chunk.originalData.dynamic.forEach((dynamic, index) => {
          pointCloudManager.addChunk(
            `chunk_${chunk.chunk_id}_dynamic_${index}`,
            [],
            `http://localhost:8000${dynamic.url}`,
            dynamic.confidence,
            dynamic.bounding_box
          );
        });
      }

      if (chunk.originalData?.ground) {
        pointCloudManager.addChunk(
          `chunk_${chunk.chunk_id}_ground`,
          [],
          `http://localhost:8000${chunk.originalData.ground}`
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedChunks]);

  const handleHasActiveBboxChange = useCallback((hasActive: boolean) => {
    setHasActiveBbox(hasActive);
    setIsBboxPanelVisible(hasActive);
  }, []);

  return (
    <div className={styles.app}>
      <PointCloudViewer
        pointCloudManager={pointCloudManager}
        pointSize={pointSize}
        backgroundColor="#111111"
        transformControlsVisible={pointCloudManager.transformControlsVisible}
        density={density}
        confidenceThreshold={confidenceThreshold}
        transformControlsSize={transformControlsSize}
        transformControllerRef={transformControllerRef}
        cameraControlsRef={cameraControlsRef}
        onHasActiveBboxChange={handleHasActiveBboxChange}
        onBboxCreated={bboxManager.setBbox}
        onAllChunksRendered={endLoading}
      />
      <ToolsPanel
        transformControllerRef={transformControllerRef}
        hasActiveBbox={hasActiveBbox}
        onBboxCreated={handleBboxCreated}
      />
      <ControlPanel
        onProcessChunks={handleProcessChunks}
        isLoading={isLoading}
        error={error}
        pointCloudManager={pointCloudManager}
        cameraControlsRef={cameraControlsRef}
        transformControllerRef={transformControllerRef}
        density={density}
        onDensityChange={setDensity}
        confidenceThreshold={confidenceThreshold}
        onConfidenceThresholdChange={setConfidenceThreshold}
        transformControlsSize={transformControlsSize}
        onTransformControlsSizeChange={setTransformControlsSize}
        pointSize={pointSize}
        onPointSizeChange={setPointSize}
        bboxManager={bboxManager}
        lastJobId={lastJobId}
        setLastJobId={setLastJobId}
      />
      <BboxActionPanel
        isVisible={isBboxPanelVisible}
        onDelete={handleDelete}
        onCancel={handleCancel}
        fillSurface={fillSurface}
        onFillSurfaceChange={handleFillSurfaceChange}
      />
    </div>
  );
};
