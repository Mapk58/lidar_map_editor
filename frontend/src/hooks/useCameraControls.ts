import { CameraControls } from "@react-three/drei";
import { useCallback } from "react";
import * as THREE from "three";

type UseCameraControlsProps = {
  cameraControlsRef: React.RefObject<CameraControls | null>;
  transformControllerRef: React.RefObject<THREE.Group | null>;
};

export const useCameraControls = ({
  cameraControlsRef,
  transformControllerRef,
}: UseCameraControlsProps) => {
  const smoothMoveToPoint = useCallback(
    (point: THREE.Vector3) => {
      const controlsInstance = cameraControlsRef.current;
      const transformRef = transformControllerRef.current;
      if (!controlsInstance) return;

      const camera = controlsInstance.camera;

      if (transformRef) {
        transformRef.position.copy(point);
      }

      const currentTarget = controlsInstance.getTarget(new THREE.Vector3());
      const offset = camera.position.clone().sub(currentTarget);
      const newCameraPosition = point.clone().add(offset);

      controlsInstance.setLookAt(
        newCameraPosition.x,
        newCameraPosition.y,
        newCameraPosition.z,
        point.x,
        point.y,
        point.z,
        true
      );
    },
    [cameraControlsRef, transformControllerRef]
  );

  return {
    smoothMoveToPoint,
  };
};
