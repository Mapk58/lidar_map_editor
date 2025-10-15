import { TransformControls } from "@react-three/drei";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

type Mode = "scale" | "rotate" | "translate";
const MODES: Mode[] = ["scale", "rotate", "translate"];

function nextMode(current: Mode) {
  const idx = MODES.indexOf(current);
  return MODES[(idx + 1) % MODES.length];
}

function getBoundingBoxData(target: THREE.Group | null) {
  if (!target) return null;
  let bboxObj = target;
  if (!target.userData?.apiBounding) {
    const bboxChild = target.children.find(
      child => child.userData?.apiBounding
    ) as THREE.Group | undefined;
    if (bboxChild) bboxObj = bboxChild;
    else return null;
  }
  const apiBounding = bboxObj.userData.apiBounding;
  const baseSize = new THREE.Vector3(
    apiBounding.size[0],
    apiBounding.size[1],
    apiBounding.size[2]
  );
  const worldScale = new THREE.Vector3();
  bboxObj.getWorldScale(worldScale);
  const worldQuaternion = new THREE.Quaternion();
  bboxObj.getWorldQuaternion(worldQuaternion);
  const scaledSize = baseSize.clone().multiply(worldScale);
  const bboxCenter = bboxObj.position.clone();
  bboxObj.localToWorld(bboxCenter);

  return {
    bbox: bboxObj,
    size: scaledSize,
    center: bboxCenter,
    rotation: worldQuaternion,
  };
}

type Props = {
  visible?: boolean;
  objectRef?: React.RefObject<THREE.Group | null>;
  size?: number;
  onModeChange?: (mode: Mode) => void;
  hideInTranslateMode?: boolean;
};

export const TransformController: React.FC<Props> = ({
  visible = true,
  objectRef,
  size = 1.8,
  onModeChange,
  hideInTranslateMode = false,
}) => {
  const [currentMode, setCurrentMode] = useState<Mode>("scale");

  // Реагируем на Shift для смены режима
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      setCurrentMode(prev => nextMode(prev));
    };
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Уведомляем родителя о смене режима
  useEffect(() => {
    onModeChange?.(currentMode);
  }, [currentMode, onModeChange]);

  const shouldShow = useMemo(
    () => !!visible && !(hideInTranslateMode && currentMode === "translate"),
    [visible, currentMode, hideInTranslateMode]
  );

  const onTcMouseUp = useCallback(() => {
    if (!objectRef?.current) return;
    const bboxData = getBoundingBoxData(objectRef.current);
    if (!bboxData) return;
    let eventType: string | null = null;
    if (currentMode === "scale") eventType = "bbox-size-changed";
    else if (currentMode === "rotate") eventType = "bbox-rotation-changed";
    else if (currentMode === "translate") eventType = "bbox-center-changed";
    if (eventType)
      window.dispatchEvent(new CustomEvent(eventType, { detail: bboxData }));
  }, [objectRef, currentMode]);

  return (
    <>
      {shouldShow ? (
        <TransformControls
          mode={currentMode}
          object={objectRef?.current || undefined}
          size={size}
          onMouseUp={onTcMouseUp}
          showX={currentMode !== "rotate"}
          showZ={currentMode !== "rotate"}
        />
      ) : null}
    </>
  );
};
