export interface AssemblyActivity {
  readonly operation: { current: boolean }
  readonly commandActive: boolean
  setRebuilding(value: boolean): void
}

/**
 * Commands and automatic scene reconstruction own separate activity flags.
 * Existing mutable-ref consumers read their union, but their writes acquire or
 * release only the command flag. Completing either owner cannot release the
 * other. The workspace still owns state updates and stale-response checks.
 */
export function createAssemblyActivity(): AssemblyActivity {
  let command = false
  let rebuilding = true
  const operation = {
    get current() { return command || rebuilding },
    set current(value: boolean) { command = value },
  }
  return {
    operation,
    get commandActive() { return command },
    setRebuilding(value: boolean) { rebuilding = value },
  }
}
