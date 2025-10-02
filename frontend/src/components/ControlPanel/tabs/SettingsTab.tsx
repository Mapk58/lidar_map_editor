import React from 'react';

import { Slider } from '../../Slider/Slider';
import styles from '../ControlPanel.module.css';

type SettingsTabProps = {
  confidenceThreshold: number;
  onConfidenceThresholdChange: (value: number) => void;
  transformControlsSize: number;
  onTransformControlsSizeChange: (value: number) => void;
  pointSize: number;
  onPointSizeChange: (value: number) => void;
};

export const SettingsTab: React.FC<SettingsTabProps> = ({
  confidenceThreshold,
  onConfidenceThresholdChange,
  transformControlsSize,
  onTransformControlsSizeChange,
  pointSize,
  onPointSizeChange,
}) => {
  return (
    <div>
      <h3 className={styles.tabTitle}>Настройки</h3>

      <div className={styles.sliderGroup}>
        <Slider
          label="Подсветка неточных детекций"
          value={confidenceThreshold}
          onChange={onConfidenceThresholdChange}
          min={0}
          max={1}
          step={0.01}
        />
        <Slider
          label="Размер элементов управления трансформацией"
          value={transformControlsSize}
          onChange={onTransformControlsSizeChange}
          min={1}
          max={4}
          step={0.1}
        />
        <Slider
          label="Размер точек"
          value={pointSize}
          onChange={onPointSizeChange}
          min={0.01}
          max={1}
          step={0.01}
        />
      </div>
    </div>
  );
};
