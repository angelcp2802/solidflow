import { useState, useSyncExternalStore } from 'react'
import { createViewHistory } from './viewNavigation'

export function useViewHistory() {
  const [history] = useState(createViewHistory)
  useSyncExternalStore(history.subscribe, history.snapshot, history.snapshot)
  return history
}
