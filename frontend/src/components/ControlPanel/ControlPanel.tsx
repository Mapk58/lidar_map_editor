import { CameraControls } from "@react-three/drei";
import React, { useMemo, useState } from "react";
import * as THREE from "three";

import type { BboxData, ChunkData } from "../../types/chunks";
import type { PointCloudManager } from "../../types/pointCloud";
import type { TabType } from "./tabs/types";

import styles from "./ControlPanel.module.css";
import { ChunksTab } from "./tabs/ChunksTab";
import { DynamicsTab } from "./tabs/DynamicsTab";
import { PerformanceTab } from "./tabs/PerformanceTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { UploadTab } from "./tabs/UploadTab";

const TABS: ReadonlyArray<{ id: TabType; label: string }> = [
  { id: "upload", label: "Файлы" },
  { id: "performance", label: "Производительность" },
  { id: "chunks", label: "Чанки" },
  { id: "dynamics", label: "Дин.объекты" },
  { id: "settings", label: "Настройки" },
];

const DEFAULT_TAB: TabType = "upload";

export type ControlPanelProps = {
  onProcessChunks: (chunks: ChunkData[]) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  pointCloudManager: PointCloudManager;
  cameraControlsRef?: React.RefObject<CameraControls | null>;
  transformControllerRef?: React.RefObject<THREE.Group | null>;
  density: number;
  onDensityChange: (value: number) => void;
  confidenceThreshold: number;
  onConfidenceThresholdChange: (value: number) => void;
  transformControlsSize: number;
  onTransformControlsSizeChange: (value: number) => void;
  pointSize: number;
  onPointSizeChange: (value: number) => void;
  bboxManager?: {
    deletedBboxes: BboxData[];
  };
  lastJobId: string | null;
  setLastJobId: (jobId: string | null) => void;
};

export const ControlPanel: React.FC<ControlPanelProps> = ({
  onProcessChunks,
  isLoading,
  error,
  pointCloudManager,
  cameraControlsRef,
  transformControllerRef,
  density,
  onDensityChange,
  confidenceThreshold,
  onConfidenceThresholdChange,
  transformControlsSize,
  onTransformControlsSizeChange,
  pointSize,
  onPointSizeChange,
  bboxManager,
  lastJobId,
  setLastJobId,
}: ControlPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabType>(DEFAULT_TAB);
  const [collapsed, setCollapsed] = useState(false);

  const content = useMemo(() => {
    switch (activeTab) {
      case "upload":
        return (
          <UploadTab
            onProcessChunks={onProcessChunks}
            isLoading={isLoading}
            error={error}
            bboxManager={bboxManager}
            lastJobId={lastJobId}
            setLastJobId={setLastJobId}
          />
        );
      case "performance":
        return (
          <PerformanceTab density={density} onDensityChange={onDensityChange} />
        );
      case "chunks":
        return (
          <ChunksTab
            pointCloudManager={pointCloudManager}
            cameraControlsRef={cameraControlsRef ?? null}
            transformControllerRef={transformControllerRef ?? null}
            confidenceThreshold={confidenceThreshold}
          />
        );
      case "settings":
        return (
          <SettingsTab
            confidenceThreshold={confidenceThreshold}
            onConfidenceThresholdChange={onConfidenceThresholdChange}
            transformControlsSize={transformControlsSize}
            onTransformControlsSizeChange={onTransformControlsSizeChange}
            pointSize={pointSize}
            onPointSizeChange={onPointSizeChange}
          />
        );
      case "dynamics":
        return (
          <DynamicsTab
            pointCloudManager={pointCloudManager}
            cameraControlsRef={cameraControlsRef ?? null}
            transformControllerRef={transformControllerRef ?? null}
            confidenceThreshold={confidenceThreshold}
          />
        );
      default:
        return null;
    }
  }, [
    activeTab,
    onProcessChunks,
    isLoading,
    error,
    bboxManager,
    density,
    onDensityChange,
    pointCloudManager,
    cameraControlsRef,
    transformControllerRef,
    confidenceThreshold,
    transformControlsSize,
    onConfidenceThresholdChange,
    onTransformControlsSizeChange,
    pointSize,
    onPointSizeChange,
    lastJobId,
    setLastJobId,
  ]);

  return (
    <>
      {!collapsed && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <h2 className={styles.title}>Панель управления</h2>
          </div>

          <div className={styles.tabs}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${styles.tab} ${
                  activeTab === tab.id ? styles.tabActive : ""
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.content}>{content}</div>

          {/* Ручка-стрелка справа сверху от панели */}
          <button
            type="button"
            className={`${styles.actionButton} ${styles.collapseHandle}`}
            onClick={() => setCollapsed(true)}
            title="Скрыть панель"
          >
            ◀
          </button>
        </div>
      )}

      {collapsed && (
        <button
          className={`${styles.actionButton} ${styles.revealButton}`}
          type="button"
          onClick={() => setCollapsed(false)}
          title="Показать панель"
        >
          ▶
        </button>
      )}
    </>
  );
};
