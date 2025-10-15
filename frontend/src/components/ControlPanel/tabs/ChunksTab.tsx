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

const MOVE_DELAY_MS = 150;

type ChunksTabProps = {
  pointCloudManager: PointCloudManager;
  cameraControlsRef: React.RefObject<CameraControls | null> | null;
  transformControllerRef: React.RefObject<THREE.Group | null> | null;
  confidenceThreshold?: number;
};

type ChunkGroup = {
  ground: PointChunk | null;
  static: PointChunk | null;
  dynamic: PointChunk[];
};

type ChunkGroupRecord = Record<string, ChunkGroup>;

type ChunkGroupEntry = [string, ChunkGroup];

export const ChunksTab: React.FC<ChunksTabProps> = ({
  pointCloudManager,
  cameraControlsRef,
  transformControllerRef,
  confidenceThreshold,
}) => {
  const { setChunkVisibility, activeHighlightBaseId } = pointCloudManager;

  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const [expandedDynamic, setExpandedDynamic] = useState<Set<string>>(
    new Set()
  );
  const [highlightedBaseIdLocal, setHighlightedBaseIdLocal] = useState<
    string | null
  >(activeHighlightBaseId);
  const [selectedDynamicId, setSelectedDynamicId] = useState<string | null>(
    null
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingScrollIdRef = useRef<string | null>(null);

  useEffect(() => {
    setHighlightedBaseIdLocal(activeHighlightBaseId ?? null);
    if (!activeHighlightBaseId) return;

    setExpandedChunks(prev => new Set(prev).add(activeHighlightBaseId));

    rafRef.current = requestAnimationFrame(() => {
      const container = listRef.current;
      if (!container) return;
      const header = container.querySelector(
        `[data-base-id="${activeHighlightBaseId}"]`
      ) as HTMLElement | null;
      if (header?.scrollIntoView) {
        header.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [activeHighlightBaseId]);

  useEffect(() => {
    const onPulse = (evt: Event) => {
      const e = evt as CustomEvent<{ baseId?: string; id?: string }>;
      const baseId = e?.detail?.baseId;
      const id = e?.detail?.id;
      if (!baseId && !id) return;

      if (id && id.includes("_dynamic_")) {
        const dynBase = id.replace(/_dynamic_\d+$/, "");
        setHighlightedBaseIdLocal(dynBase);
        setExpandedChunks(prev => new Set(prev).add(dynBase));
        setExpandedDynamic(prev => new Set(prev).add(dynBase));
        setSelectedDynamicId(id);
        pendingScrollIdRef.current = id;
        return;
      }

      if (baseId) {
        setHighlightedBaseIdLocal(baseId);
        setExpandedChunks(prev => new Set(prev).add(baseId));
        rafRef.current = requestAnimationFrame(() => {
          const container = listRef.current;
          if (!container) return;
          const header = container.querySelector(
            `[data-base-id="${baseId}"]`
          ) as HTMLElement | null;
          if (header?.scrollIntoView) {
            header.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }
    };
    window.addEventListener("pcd-pulse", onPulse as EventListener);
    return () => {
      window.removeEventListener("pcd-pulse", onPulse as EventListener);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
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
        `[data-chunk-id="${id}"]`
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
  }, [expandedChunks, expandedDynamic, selectedDynamicId]);

  useEffect(() => {
    const onPulseChunk = (evt: Event) => {
      const e = evt as CustomEvent<{ id: string }>;
      const id = e?.detail?.id;
      if (!id || !id.includes("_dynamic_")) return;
      const dynBase = id.replace(/_dynamic_\d+$/, "");
      setHighlightedBaseIdLocal(dynBase);
      setExpandedChunks(prev => new Set(prev).add(dynBase));
      setExpandedDynamic(prev => new Set(prev).add(dynBase));
      setSelectedDynamicId(id);
      pendingScrollIdRef.current = id;
    };
    window.addEventListener("pcd-pulse-chunk", onPulseChunk as EventListener);
    return () => {
      window.removeEventListener(
        "pcd-pulse-chunk",
        onPulseChunk as EventListener
      );
    };
  }, []);

  const highlightedBaseIds = useMemo(
    () => new Set(highlightedBaseIdLocal ? [highlightedBaseIdLocal] : []),
    [highlightedBaseIdLocal]
  );

  const isChunkHighlighted = useCallback(
    (id: string) => {
      const baseId = id.replace(/(_ground|_static|_dynamic_\d+)$/, "");
      return highlightedBaseIdLocal === baseId;
    },
    [highlightedBaseIdLocal]
  );

  const isCameraOnChunk = useCallback(
    (chunk: PointChunk): boolean => {
      if (!cameraControlsRef?.current || !chunk.mesh) return false;

      const controls = cameraControlsRef.current;
      const camera = controls.camera;
      const cameraPosition = camera.position;
      const cameraTarget = controls.getTarget(new THREE.Vector3());

      const boundingBox = chunk.boundingBox ?? chunk.mesh.geometry?.boundingBox;
      if (!boundingBox) return false;

      const center = boundingBox.getCenter(new THREE.Vector3());
      const size = boundingBox.getSize(new THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z);
      const radius = maxSize * 1.5;

      const distanceToCenter = cameraPosition.distanceTo(center);
      const targetDistanceToCenter = cameraTarget.distanceTo(center);

      return distanceToCenter <= radius && targetDistanceToCenter <= radius;
    },
    [cameraControlsRef]
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

      const chunk = pointCloudManager.chunks.find(c => c.id === chunkId);
      if (!chunk || !chunk.mesh) return;

      const baseId = chunkId.replace(/(_ground|_static|_dynamic_\d+)$/, "");
      setHighlightedBaseIdLocal(baseId);
      if (chunkId.includes("_dynamic_")) {
        window.dispatchEvent(
          new CustomEvent("pcd-pulse-chunk", {
            detail: { id: chunkId, color: 0xffffff },
          })
        );
      } else {
        window.dispatchEvent(
          new CustomEvent("pcd-pulse", { detail: { baseId } })
        );
      }

      window.setTimeout(() => {
        if (!cameraControlsRef.current || !transformControllerRef.current) {
          return;
        }

        if (isCameraOnChunk(chunk)) {
          return;
        }

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
          true
        );
      }, MOVE_DELAY_MS);
    },
    [
      cameraControlsRef,
      transformControllerRef,
      getChunkCenter,
      isCameraOnChunk,
      pointCloudManager.chunks,
    ]
  );

  const focusOnChunkGroup = useCallback(
    (baseId: string) => {
      if (!cameraControlsRef?.current || !transformControllerRef?.current) {
        return;
      }

      setHighlightedBaseIdLocal(baseId);
      window.dispatchEvent(
        new CustomEvent("pcd-pulse", { detail: { baseId } })
      );

      const chunksForGroup = pointCloudManager.chunks.filter(
        chunk =>
          chunk.id === `${baseId}_ground` ||
          chunk.id === `${baseId}_static` ||
          chunk.id.startsWith(`${baseId}_dynamic_`)
      );

      const centers = chunksForGroup
        .map(getChunkCenter)
        .filter((center): center is THREE.Vector3 => center !== null);

      if (centers.length === 0) return;

      const boundingBox = centers.reduce(
        (acc, center) => acc.expandByPoint(center),
        new THREE.Box3()
      );
      const center = boundingBox.getCenter(new THREE.Vector3());

      const controls = cameraControlsRef.current;
      const camera = controls.camera;
      const currentTarget = controls.getTarget(new THREE.Vector3());
      const cameraOffset = camera.position.clone().sub(currentTarget);
      const newCameraPosition = center.clone().add(cameraOffset);

      transformControllerRef.current.position.copy(center);

      window.setTimeout(() => {
        if (!cameraControlsRef.current || !transformControllerRef.current) {
          return;
        }

        controls.setLookAt(
          newCameraPosition.x,
          newCameraPosition.y,
          newCameraPosition.z,
          center.x,
          center.y,
          center.z,
          true
        );
      }, MOVE_DELAY_MS);
    },
    [
      cameraControlsRef,
      transformControllerRef,
      getChunkCenter,
      pointCloudManager.chunks,
    ]
  );

  const toggleChunk = useCallback((chunkId: string) => {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  }, []);

  const toggleDynamicGroup = useCallback((baseId: string) => {
    setExpandedDynamic(prev => {
      const next = new Set(prev);
      if (next.has(baseId)) {
        next.delete(baseId);
      } else {
        next.add(baseId);
      }
      return next;
    });
  }, []);

  const toggleVisibility = useCallback(
    (chunkId: string) => {
      const chunk = pointCloudManager.chunks.find(c => c.id === chunkId);
      if (!chunk) return;
      setChunkVisibility(chunkId, !chunk.visible);
    },
    [pointCloudManager, setChunkVisibility]
  );

  const toggleDynamicVisibility = useCallback(
    (baseId: string, visible: boolean) => {
      pointCloudManager.chunks.forEach(chunk => {
        if (!chunk.id.includes("_dynamic_")) return;
        const chunkBaseId = chunk.id.replace(/_dynamic_\d+$/, "");
        if (chunkBaseId === baseId) {
          setChunkVisibility(chunk.id, visible);
        }
      });
    },
    [pointCloudManager, setChunkVisibility]
  );

  const groupedChunks = useMemo(() => {
    return pointCloudManager.chunks.reduce<ChunkGroupRecord>((acc, chunk) => {
      let baseId: string;

      if (chunk.id.endsWith("_ground")) {
        baseId = chunk.id.replace("_ground", "");
      } else if (chunk.id.endsWith("_static")) {
        baseId = chunk.id.replace("_static", "");
      } else if (chunk.id.includes("_dynamic_")) {
        baseId = chunk.id.replace(/_dynamic_\d+$/, "");
      } else {
        return acc;
      }

      if (!acc[baseId]) {
        acc[baseId] = { ground: null, static: null, dynamic: [] };
      }

      if (chunk.id.endsWith("_ground")) {
        acc[baseId].ground = chunk;
      } else if (chunk.id.endsWith("_static")) {
        acc[baseId].static = chunk;
      } else if (chunk.id.includes("_dynamic_")) {
        acc[baseId].dynamic.push(chunk);
      }

      return acc;
    }, {});
  }, [pointCloudManager.chunks]);

  const chunkEntries = useMemo<ChunkGroupEntry[]>(
    () => Object.entries(groupedChunks),
    [groupedChunks]
  );

  if (chunkEntries.length === 0) {
    return (
      <div>
        <h3 className={styles.tabTitle}>Чанки</h3>
        <div className={styles.placeholderText}>Чанки не загружены</div>
      </div>
    );
  }

  return (
    <div className={styles.chunksContainer}>
      <h3 className={styles.tabTitle}>Чанки</h3>
      <div ref={listRef} className={styles.chunksList}>
        {chunkEntries.map(([baseId, chunks]) => (
          <div
            key={baseId}
            className={`${styles.chunkGroup} ${
              highlightedBaseIds.has(baseId) ? styles.highlightedGroup : ""
            }`}
            data-base-id={baseId}
          >
            <ChunkGroupHeader
              baseId={baseId}
              expanded={expandedChunks.has(baseId)}
              dynamicChunksCount={chunks.dynamic.length}
              onToggle={toggleChunk}
              onFocus={focusOnChunkGroup}
            />

            {expandedChunks.has(baseId) && (
              <div
                className={`${styles.chunkContent} ${chunks.dynamic.length > 0 ? styles.hasDynamic : ""}`}
              >
                {chunks.ground && chunks.static ? (
                  <div className={styles.inlineRow}>
                    <ChunkItem
                      chunk={chunks.ground}
                      onToggleVisibility={toggleVisibility}
                      onFocus={focusOnChunk}
                      type="Ground"
                      isHighlighted={isChunkHighlighted(chunks.ground.id)}
                      compact
                      confidenceThreshold={confidenceThreshold}
                    />
                    <ChunkItem
                      chunk={chunks.static}
                      onToggleVisibility={toggleVisibility}
                      onFocus={focusOnChunk}
                      type="Static"
                      isHighlighted={isChunkHighlighted(chunks.static.id)}
                      compact
                      confidenceThreshold={confidenceThreshold}
                    />
                  </div>
                ) : (
                  <>
                    {chunks.ground && (
                      <ChunkItem
                        chunk={chunks.ground}
                        onToggleVisibility={toggleVisibility}
                        onFocus={focusOnChunk}
                        type="Ground"
                        isHighlighted={isChunkHighlighted(chunks.ground.id)}
                        confidenceThreshold={confidenceThreshold}
                      />
                    )}
                    {chunks.static && (
                      <ChunkItem
                        chunk={chunks.static}
                        onToggleVisibility={toggleVisibility}
                        onFocus={focusOnChunk}
                        type="Static"
                        isHighlighted={isChunkHighlighted(chunks.static.id)}
                        confidenceThreshold={confidenceThreshold}
                      />
                    )}
                  </>
                )}

                {chunks.dynamic.length > 0 && (
                  <DynamicChunkGroup
                    baseId={baseId}
                    chunks={chunks.dynamic}
                    expanded={expandedDynamic.has(baseId)}
                    onToggle={() => toggleDynamicGroup(baseId)}
                    onToggleVisibility={toggleDynamicVisibility}
                    onToggleChunkVisibility={toggleVisibility}
                    onFocusChunk={focusOnChunk}
                    selectedDynamicId={selectedDynamicId}
                    setSelectedDynamicId={setSelectedDynamicId}
                    confidenceThreshold={confidenceThreshold}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
type ChunkGroupHeaderProps = {
  baseId: string;
  expanded: boolean;
  dynamicChunksCount: number;
  onToggle: (baseId: string) => void;
  onFocus: (baseId: string) => void;
};

const ChunkGroupHeader: React.FC<ChunkGroupHeaderProps> = ({
  baseId,
  expanded,
  dynamicChunksCount,
  onToggle,
  onFocus,
}) => (
  <div className={styles.chunkHeader}>
    <button
      className={styles.chunkTitleButton}
      onClick={() => onToggle(baseId)}
    >
      <span>
        {expanded ? "▼" : "▶"} Чанк {baseId} ({dynamicChunksCount})
      </span>
    </button>
    <div className={styles.chunkGroupActions}>
      <button
        className={`${styles.actionButton} ${styles.focusButton} ${styles.groupActionButton}`}
        onClick={event => {
          event.stopPropagation();
          onFocus(baseId);
        }}
        title="Сфокусироваться на всей группе чанков"
        type="button"
      >
        🎯
      </button>
    </div>
  </div>
);
type ChunkItemProps = {
  chunk: PointChunk;
  onToggleVisibility: (id: string) => void;
  onFocus: (id: string) => void;
  type: string;
  isNested?: boolean;
  isHighlighted: boolean;
  compact?: boolean;
  isDynamic?: boolean;
  confidenceThreshold?: number;
};

const ChunkItem: React.FC<ChunkItemProps> = ({
  chunk,
  onToggleVisibility,
  onFocus,
  type,
  isNested = false,
  isHighlighted,
  compact = false,
  isDynamic = false,
  confidenceThreshold,
}) => {
  const isVisible = chunk.visible;
  const pointCount = chunk.pointCount ?? chunk.points?.length ?? 0;
  const confidence = chunk.confidence;
  let confidenceColor: string | undefined;
  if (
    isDynamic &&
    typeof confidence === "number" &&
    typeof confidenceThreshold === "number"
  ) {
    const thr = Math.max(0, Math.min(1, confidenceThreshold));
    confidenceColor = confidence > thr ? "#ff4d4f" : "#ffff00";
  }

  return (
    <div
      className={`${styles.chunkItem} ${isNested ? styles.nested : ""} ${
        isHighlighted
          ? `${styles.highlightedItem} ${isDynamic ? styles.selectedDynamicItem : ""}`
          : ""
      } ${compact ? styles.compact : ""}`}
      data-chunk-id={chunk.id}
    >
      <div className={styles.chunkInfo}>
        <span className={styles.chunkType}>{type}</span>
        <span className={styles.chunkId}>{chunk.id}</span>
        <span className={styles.chunkPoints}>{pointCount} точек</span>
        {isDynamic && typeof confidence === "number" && (
          <span
            className={styles.chunkPoints}
            style={{ color: confidenceColor }}
            title="Уверенность"
          >
            conf: {confidence}
          </span>
        )}
      </div>
      <div className={styles.chunkActions}>
        {isDynamic && (
          <button
            className={`${styles.actionButton} ${styles.focusButton}`}
            onClick={() => onFocus(chunk.id)}
            title="Сфокусироваться на чанке"
            type="button"
          >
            🎯
          </button>
        )}
        <button
          className={`${styles.actionButton} ${
            isVisible ? styles.visible : styles.hidden
          }`}
          onClick={() => onToggleVisibility(chunk.id)}
          title={isVisible ? "Скрыть" : "Показать"}
          type="button"
        >
          {isVisible ? "👁️" : "🙈"}
        </button>
      </div>
    </div>
  );
};
type DynamicChunkGroupProps = {
  baseId: string;
  chunks: PointChunk[];
  expanded: boolean;
  onToggle: () => void;
  onToggleVisibility: (baseId: string, visible: boolean) => void;
  onToggleChunkVisibility: (chunkId: string) => void;
  onFocusChunk: (id: string) => void;
  selectedDynamicId: string | null;
  setSelectedDynamicId: (id: string | null) => void;
  confidenceThreshold?: number;
};

const DynamicChunkGroup: React.FC<DynamicChunkGroupProps> = ({
  baseId,
  chunks,
  expanded,
  onToggle,
  onToggleVisibility,
  onToggleChunkVisibility,
  onFocusChunk,
  selectedDynamicId,
  setSelectedDynamicId,
  confidenceThreshold,
}) => {
  const isVisible = chunks.every(chunk => chunk.visible);
  return (
    <div className={styles.dynamicGroup}>
      <div className={styles.dynamicHeader}>
        <button className={styles.dynamicTitleButton} onClick={onToggle}>
          <span>
            {expanded ? "▼" : "▶"} Динамика ({chunks.length})
          </span>
        </button>
        <div className={styles.dynamicActions}>
          <button
            className={`${styles.actionButton} ${
              isVisible ? styles.visible : styles.hidden
            }`}
            onClick={() => onToggleVisibility(baseId, !isVisible)}
            title={isVisible ? "Скрыть" : "Показать"}
          >
            {isVisible ? "👁️" : "🙈"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className={styles.dynamicContent}>
          {chunks.map((chunk, index) => (
            <ChunkItem
              key={chunk.id}
              chunk={chunk}
              onToggleVisibility={onToggleChunkVisibility}
              onFocus={id => {
                onFocusChunk(id);
                setSelectedDynamicId(id);
              }}
              type={`Динамика ${index + 1}`}
              isHighlighted={selectedDynamicId === chunk.id}
              isDynamic
              confidenceThreshold={confidenceThreshold}
            />
          ))}
        </div>
      )}
    </div>
  );
};
