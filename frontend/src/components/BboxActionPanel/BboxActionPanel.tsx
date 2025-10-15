import React from "react";

import styles from "./BboxActionPanel.module.css";

type BboxActionPanelProps = {
  isVisible: boolean;
  onDelete: () => void;
  onCancel: () => void;
  fillSurface: boolean;
  onFillSurfaceChange: (checked: boolean) => void;
};

export const BboxActionPanel: React.FC<BboxActionPanelProps> = ({
  isVisible,
  onDelete,
  onCancel,
  fillSurface,
  onFillSurfaceChange,
}) => {
  if (!isVisible) return null;

  return (
    <div className={styles.panel}>
      <button className={styles.cancelButton} onClick={onCancel} type="button">
        Отмена
      </button>
      <button className={styles.deleteButton} onClick={onDelete} type="button">
        Подтвердить
      </button>
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={fillSurface}
          onChange={(e) => onFillSurfaceChange(e.target.checked)}
        />
        Заполнить поверхность
      </label>
    </div>
  );
};
