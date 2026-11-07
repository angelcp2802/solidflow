import CadContextMenu, { type CadContextAction, type CadContextMenuProps } from './CadContextMenu'

export { clampCadContextMenu as clampPartContextMenu } from './CadContextMenu'
export type PartFeatureContextAction = CadContextAction

export interface PartFeatureContextMenuProps extends Omit<CadContextMenuProps, 'targetName' | 'namespace'> {
  featureName: string
}

/** Preserve the part menu API and renderer selectors while sharing presentation. */
export default function PartFeatureContextMenu({ featureName, ...props }: PartFeatureContextMenuProps) {
  return <CadContextMenu {...props} targetName={featureName} namespace="part" />
}
