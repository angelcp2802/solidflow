/** A reference click belongs to the scene, role and camera actually presented at pointer-down. */
export function referencePickingPresentationCurrent(input: {
  frame: unknown; downPresentedFrame: unknown; presentedFrame: unknown;
  model: unknown; presentedModel: unknown;
  camera: string; downCamera: string; downPresentedCamera: string | undefined; presentedCamera: string | undefined;
  navigating: boolean;
  width: number; height: number; clientWidth: number; clientHeight: number;
}): boolean {
  return !!input.frame && input.frame === input.downPresentedFrame && input.frame === input.presentedFrame && input.model === input.presentedModel
    && !input.navigating && input.camera === input.downCamera && input.downPresentedCamera === input.downCamera && input.presentedCamera === input.downCamera
    && Math.abs(input.width - input.clientWidth) < 1 && Math.abs(input.height - input.clientHeight) < 1;
}
