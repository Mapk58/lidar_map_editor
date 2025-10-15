import { CameraControls } from "@react-three/drei";
import { useRef, useEffect, useState } from "react";
import * as THREE from "three";

type UseTransformControllerProps = {
  cameraControlsRef: React.RefObject<CameraControls | null>;
  onControllerReady?: (
    controllerRef: React.RefObject<THREE.Group | null>,
  ) => void;
};

export const useTransformController = ({
  cameraControlsRef,
  onControllerReady,
}: UseTransformControllerProps) => {
  const targetRef = useRef<THREE.Group>(null);
  const [target, setTarget] = useState<THREE.Group | null>(null);

  useEffect(() => {
    if (targetRef.current) {
      setTarget(targetRef.current);
      onControllerReady?.(targetRef);
    }
  }, [onControllerReady]);

  const handleMouseDown = () => {};
  const handleMouseUp = () => {
    const controls = cameraControlsRef.current;
    if (!target || !controls) return;

    const newPosition = target.position.clone();
    const currentTarget = controls.getTarget(new THREE.Vector3());
    const offset = controls.camera.position.clone().sub(currentTarget);

    controls.setLookAt(
      newPosition.x + offset.x,
      newPosition.y + offset.y,
      newPosition.z + offset.z,
      newPosition.x,
      newPosition.y,
      newPosition.z,
      true,
    );
  };

  return {
    targetRef,
    target,
    handleMouseDown,
    handleMouseUp,
  };
};
