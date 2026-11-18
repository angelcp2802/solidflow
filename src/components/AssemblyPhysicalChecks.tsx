import { useMemo } from 'react'
import type { AssemblyDocument } from '../model/assemblyDocument'
import type { RigidMateEvaluation } from '../model/assemblySolveTypes'
import { assemblyPhysicalCheckContext } from './assemblyMateReportContext'

export default function AssemblyPhysicalChecks({ document, checks }: { document: AssemblyDocument; checks: readonly RigidMateEvaluation['checks'][number][] }) {
  const rows = useMemo(() => checks.map(check => {
    const context = assemblyPhysicalCheckContext(document, check.constraintId)
    const label = context ? `${context.scopePath.length ? context.scopeLabel + ' · ' : ''}${context.mate.name}` : 'Relación no disponible en este ámbito'
    return { check, label }
  }), [document, checks])
  return <section className="assembly-section"><h3>Comprobaciones físicas</h3>{rows.map(({ check, label }) => <p key={check.constraintId}>{check.satisfied ? '✓' : '⚠'} {label}<small>{check.lengthResidual.toExponential(2)} / {check.lengthTolerance.toExponential(2)} mm · {check.angleResidual.toExponential(2)} / {check.angleTolerance.toExponential(2)} rad</small></p>)}</section>
}
