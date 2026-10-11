import { validateSketchFilletBatchResult, type FilletPlan, type FilletBatchPlan } from "./fillet";
import { solveSketch } from "./solver";
import type { SketchSolveResult } from "./types";

type ApplicationResult =
  | { accepted: true; solution: SketchSolveResult }
  | { accepted: false; message: string };

/** Prepare the single commit boundary; this function never writes editor history. */
export function solveFilletApplication(
  current: SketchSolveResult | null,
  plan: FilletPlan | FilletBatchPlan,
  solver: typeof solveSketch = solveSketch,
): ApplicationResult {
  if (!current || !["underdefined", "fullyDefined"].includes(current.status) ||
    !plan.changed || !plan.filletEntityId || plan.sourceProfile !== current.profile)
    return { accepted: false, message: "El croquis ha cambiado. Revisa la vista previa del redondeo." };
  const solution = solver(plan.profile);
  if (!["underdefined", "fullyDefined"].includes(solution.status))
    return { accepted: false, message: `No se puede aplicar el redondeo: ${solution.message}` };
  if ("filletEntityIds" in plan) {
    const message = validateSketchFilletBatchResult(plan, solution.profile);
    if (message) return { accepted: false, message };
  }
  return { accepted: true, solution };
}
