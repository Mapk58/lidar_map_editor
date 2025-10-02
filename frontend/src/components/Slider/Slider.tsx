import React from 'react';

import styles from './Slider.module.css';

type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  disabled?: boolean;
  unit?: string;
  showValue?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  onChangeEnd,
  min = 0,
  max = 100,
  step = 1,
  label,
  disabled = false,
  unit = '',
  showValue = true,
  className,
  style,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(event.target.value);
    onChange(newValue);
  };

  const handleCommit = () => {
    if (onChangeEnd) {
      onChangeEnd(value);
    }
  };

  const formatValue = (val: number) => {
    if (unit === '%') {
      return `${val}%`;
    }
    if (unit) {
      return `${val} ${unit}`;
    }
    return val.toString();
  };

  return (
    <div className={`${styles.slider} ${className || ''}`} style={style}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.container}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          disabled={disabled}
          className={`${styles.input} ${disabled ? styles.inputDisabled : ''}`}
        />
        {showValue && (
          <span
            className={`${styles.value} ${disabled ? styles.valueDisabled : ''}`}
          >
            {formatValue(value)}
          </span>
        )}
      </div>
    </div>
  );
};
