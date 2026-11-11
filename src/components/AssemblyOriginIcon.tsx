/** Project-authored principal plane/axis symbols. */
export default function AssemblyOriginIcon({ plane }: { plane: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true" data-origin-icon={plane ? 'plane' : 'axis'}>
    {plane ? <path d="M2 6 10 2 14 10 6 14Z M2 6 14 10 M10 2 6 14" /> : <><path d="M3 13 13 3 M9 3h4v4" /><path d="m2 8 6 6" strokeDasharray="2 2" /></>}
  </svg>
}
