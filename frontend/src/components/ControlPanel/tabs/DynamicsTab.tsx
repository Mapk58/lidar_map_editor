import { CameraControls } from "@react-three/drei";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import type { PointChunk, PointCloudManager } from "../../../types/pointCloud";

import styles from "../ControlPanel.module.css";

type DynamicsTabProps = {
  pointCloudManager: PointCloudManager;
  cameraControlsRef: React.RefObject<CameraControls | null> | null;
  transformControllerRef: React.RefObject<THREE.Group | null> | null;
  confidenceThreshold: number;
};

export const DynamicsTab: React.FC<DynamicsTabProps> = ({
  pointCloudManager,
  cameraControlsRef,
  transformControllerRef,
  confidenceThreshold,
}) => {
  const { setChunkVisibility } = pointCloudManager;

  const [selectedDynamicId, setSelectedDynamicId] = useState<string | null>(
    null,
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollIdRef = useRef<string | null>(null);

  const dynamicChunks = useMemo<PointChunk[]>(
    () => pointCloudManager.chunks.filter((c) => c.id.includes("_dynamic_")),
    [pointCloudManager.chunks],
  );

  const getChunkCenter = useCallback((chunk: PointChunk) => {
    if (!chunk.mesh) return null;
    chunk.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(chunk.mesh);
    return box.getCenter(new THREE.Vector3());
  }, []);

  const focusOnChunk = useCallback(
    (chunkId: string) => {
      if (!cameraControlsRef?.current || !transformControllerRef?.current) {
        return;
      }
      const chunk = pointCloudManager.chunks.find((c) => c.id === chunkId);
      if (!chunk || !chunk.mesh) return;

      window.dispatchEvent(
        new CustomEvent("pcd-pulse-chunk", {
          detail: { id: chunkId, color: 0xffffff },
        }),
      );

      const center = getChunkCenter(chunk);
      if (!center) return;

      const controls = cameraControlsRef.current;
      const camera = controls.camera;
      const currentTarget = controls.getTarget(new THREE.Vector3());
      const cameraOffset = camera.position.clone().sub(currentTarget);
      const newCameraPosition = center.clone().add(cameraOffset);

      transformControllerRef.current.position.copy(center);

      controls.setLookAt(
        newCameraPosition.x,
        newCameraPosition.y,
        newCameraPosition.z,
        center.x,
        center.y,
        center.z,
        true,
      );
    },
    [
      cameraControlsRef,
      transformControllerRef,
      pointCloudManager.chunks,
      getChunkCenter,
    ],
  );

  useEffect(() => {
    const onPulseChunk = (evt: Event) => {
      const e = evt as CustomEvent<{ id: string }>;
      const id = e?.detail?.id;
      if (!id || !id.includes("_dynamic_")) return;
      setSelectedDynamicId(id);
      pendingScrollIdRef.current = id;
    };
    window.addEventListener("pcd-pulse-chunk", onPulseChunk as EventListener);
    return () =>
      window.removeEventListener(
        "pcd-pulse-chunk",
        onPulseChunk as EventListener,
      );
  }, []);

  useEffect(() => {
    if (!pendingScrollIdRef.current) return;
    const container = listRef.current;
    if (!container) return;

    let raf: number | null = null;
    let observer: MutationObserver | null = null;

    const scrollToPending = () => {
      const id = pendingScrollIdRef.current;
      if (!id) return;
      const item = container.querySelector(
        `[data-chunk-id="${id}"]`,
      ) as HTMLElement | null;
      if (item && item.scrollIntoView) {
        item.scrollIntoView({ behavior: "smooth", block: "center" });
        pendingScrollIdRef.current = null;
        if (observer) observer.disconnect();
      }
    };

    raf = requestAnimationFrame(scrollToPending);
    observer = new MutationObserver(() => scrollToPending());
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
    };
  }, [selectedDynamicId]);

  if (dynamicChunks.length === 0) {
    return (
      <div>
        <h3 className={styles.tabTitle}>Динамика</h3>
        <div className={styles.placeholderText}>
          Динамические чанки отсутствуют
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chunksContainer}>
      <h3 className={styles.tabTitle}>Динамика</h3>
      <div ref={listRef} className={styles.chunksList}>
        {dynamicChunks.map((chunk, index) => {
          const isVisible = chunk.visible;
          const pointCount = chunk.pointCount ?? chunk.points?.length ?? 0;
          const confidence = chunk.confidence;
          let confidenceColor: string | undefined;
          if (
            typeof confidence === "number" &&
            typeof confidenceThreshold === "number"
          ) {
            confidenceColor =
              confidence > confidenceThreshold ? "#ff4d4f" : "#ffff00";
          }
          return (
            <div
              key={chunk.id}
              className={`${styles.chunkItem} ${
                selectedDynamicId === chunk.id ? styles.selectedDynamicItem : ""
              }`}
              data-chunk-id={chunk.id}
              onClick={() => {
                setSelectedDynamicId(chunk.id);
                focusOnChunk(chunk.id);
              }}
              style={{ cursor: "pointer" }}
            >
              <div className={styles.chunkInfo}>
                <span
                  className={styles.chunkType}
                >{`Динамика ${index + 1}`}</span>
                <span className={styles.chunkId}>{chunk.id}</span>
                <span className={styles.chunkPoints}>{pointCount} точек</span>
                <span
                  className={styles.chunkPoints}
                  style={{ color: confidenceColor }}
                >
                  conf: {chunk.confidence}
                </span>
              </div>
              <div className={styles.chunkActions}>
                <button
                  className={`${styles.actionButton} ${
                    isVisible ? styles.visible : styles.hidden
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setChunkVisibility(chunk.id, !isVisible);
                  }}
                  title={isVisible ? "Скрыть" : "Показать"}
                  type="button"
                >
                  {isVisible ? "👁️" : "🙈"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
