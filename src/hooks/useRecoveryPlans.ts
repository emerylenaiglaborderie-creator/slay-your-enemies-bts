import { useMemo } from 'react'
import { activeRecoveryPlans, type RecoveryPlan } from '../domain/grades'
import { useGradesStore } from '../stores'
import { useNow } from './useNow'

export function useRecoveryPlans(): RecoveryPlan[] {
  const grades = useGradesStore((s) => s.grades)
  const now = useNow()
  return useMemo(() => activeRecoveryPlans(grades, now), [grades, now])
}
