import { solveSketch } from "./solver";
import type { MirrorPlan } from "./mirror";
import type { SketchSolveResult } from "./types";

/** Validate the whole preview through one normal solve; the caller owns the single history commit. */
export function solveMirrorApplication(current: SketchSolveResult | null, plan: MirrorPlan, solver: typeof solveSketch = solveSketch):
  { accepted: true; solution: SketchSolveResult } | { accepted: false; message: string } {
  if (!current || !["underdefined", "fullyDefined"].includes(current.status) ||
    !plan.changed || !plan.imageEntityIds.length || plan.sourceProfile !== current.profile)
    return { accepted: false, message: "El croquis ha cambiado. Revisa la vista previa de simetría." };
  const solution = solver(plan.profile);
  if (!["underdefined", "fullyDefined"].includes(solution.status))
    return { accepted: false, message: `No se puede aplicar la simetría: ${solution.message}` };
  return { accepted: true, solution };
}
