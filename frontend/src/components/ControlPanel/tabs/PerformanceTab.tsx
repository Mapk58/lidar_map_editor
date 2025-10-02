import React, { useState } from 'react';

import { Slider } from '../../Slider';
import styles from '../ControlPanel.module.css';

type PerformanceTabProps = {
  density: number;
  onDensityChange: (value: number) => void;
};

export const PerformanceTab: React.FC<PerformanceTabProps> = ({
  density,
  onDensityChange,
}) => {
  const [localDensity, setLocalDensity] = useState<number>(density);
  return (
    <div>
      <h3 className={styles.tabTitle}>Настройки производительности</h3>

      <Slider
        value={localDensity}
        onChange={setLocalDensity}
        onChangeEnd={onDensityChange}
        label="Плотность облака точек"
        unit="%"
      />

      {/* Visibility Range удалён */}
    </div>
  );
};
