import React from 'react';

import styles from '../ControlPanel.module.css';

export const HelpTab: React.FC = () => {
  return (
    <div>
      <h3 className={styles.tabTitle}>Справка</h3>
      <p className={styles.placeholderText}>Справка будет добавлена позже</p>
    </div>
  );
};
