import React, { useCallback } from "react";
import * as THREE from "three";

import styles from "./ToolsPanel.module.css";

type ToolsPanelProps = {
  transformControllerRef?: React.RefObject<THREE.Group | null>;
  clearBboxes?: (() => void) | null;
  hasActiveBbox: boolean;
  onBboxCreated?: (bbox: {
    center: THREE.Vector3;
    size: THREE.Vector3;
    rotation: THREE.Quaternion;
  }) => void;
};

export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  transformControllerRef,
  clearBboxes,
  hasActiveBbox,
  onBboxCreated,
}) => {
  const handleCreateBboxAtFocus = useCallback(() => {
    const center = transformControllerRef?.current?.position;
    if (!center) return;

    const bbox = {
      center: center.clone(),
      size: new THREE.Vector3(3, 3, 3),
      rotation: new THREE.Quaternion(),
    };

    if (onBboxCreated) {
      onBboxCreated(bbox);
    }

    window.dispatchEvent(
      new CustomEvent("pcd-create-bbox-at", {
        detail: { position: center.clone() },
      }),
    );
  }, [transformControllerRef, onBboxCreated]);

  const handleClearBboxes = useCallback(() => {
    if (clearBboxes) {
      clearBboxes();
    }
  }, [clearBboxes]);

  return (
    <div className={styles.panel}>
      <button
        className={styles.button}
        onClick={handleCreateBboxAtFocus}
        title="Создать bbox в центре фокуса"
        type="button"
      >
        ◻︎
      </button>
      <button
        className={styles.button}
        onClick={handleClearBboxes}
        disabled={!hasActiveBbox}
        title="Удалить все bbox'ы"
        type="button"
      >
        ✕
      </button>
      <div className={styles.separator} />
    </div>
  );
};
