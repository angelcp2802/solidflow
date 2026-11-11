import { validateAssemblyDocument, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { assemblyStepStructureFixture, type AssemblyStepStructureFixtureOptions } from './kernel.assembly-step-structure-fixture.test-utils'

/** Original disjoint extension: P remains ONE part with two explicit bodies.
 * Added local box [10,0,0]..[11,2,5] has V10/A34. P totals V34/A86;
 * the reused root has eight solids, V136/A344. Additional placed boxes:
 * left/a [98,0,9]..[100,5,10], right/a [0,90,0]..[5,91,2].
 * These literal bounds follow the quarter-turn recipe in the base fixture;
 * no export/import helper supplies an expected value.
 */
export function assemblyStepMultibodyFixture(options: AssemblyStepStructureFixtureOptions = {}) {
  const document = assemblyStepStructureFixture(options)
  const p = document.definitions.find((definition): definition is EmbeddedPartDefinition => definition.kind === 'part' && definition.id === 'structure-part-P')!
  p.document.features.push(
    { id: 'second-profile', name: 'Original offset rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [10.5, 1], width: 1, height: 2 } },
    { id: 'second-solid', name: 'Original disjoint prism', type: 'extrude', sketchId: 'second-profile', depth: 5, symmetric: false,
      suppressed: false, bodyOperation: { mode: 'new', bodyId: 'second-box' } },
  )
  return validateAssemblyDocument(document)
}
