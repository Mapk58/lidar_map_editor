import { useEffect } from "react";

export const useWebGLContext = (
  canvasRef?: React.RefObject<HTMLCanvasElement>,
) => {
  useEffect(() => {
    const canvas = canvasRef?.current ?? document.querySelector("canvas");
    if (!canvas) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };

    const handleContextRestored = () => {
      canvas.dispatchEvent(new Event("webglcontextrestored-custom"));
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [canvasRef]);
};
