import type { OffsetPlan } from "./offset";
import { solveSketch } from "./solver";
import type { SketchSolveResult } from "./types";

/** The entire detached proposal is solved once, before the caller's one history commit. */
export function solveOffsetApplication(current: SketchSolveResult | null, plan: OffsetPlan, solver: typeof solveSketch = solveSketch):
  { accepted: true; solution: SketchSolveResult } | { accepted: false; message: string } {
  if (!current || !["underdefined", "fullyDefined"].includes(current.status) || !plan.changed || !plan.imageEntityIds.length || plan.sourceProfile !== current.profile)
    return { accepted: false, message: "El croquis ha cambiado. Revisa la vista previa de equidistancia." };
  const solution = solver(plan.profile);
  if (!["underdefined", "fullyDefined"].includes(solution.status)) return { accepted: false, message: `No se puede aplicar la equidistancia: ${solution.message}` };
  return { accepted: true, solution };
}
