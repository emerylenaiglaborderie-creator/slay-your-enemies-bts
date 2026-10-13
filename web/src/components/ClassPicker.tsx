import { useEffect } from 'react'
import type { ClassSummary } from '../api/client'
import { t } from '../i18n'
import { SelectField } from './Field'

/** Choix de la classe courante ; sélectionne la première au chargement. */
export function ClassPicker({
  classes,
  value,
  onChange,
}: {
  classes: ClassSummary[]
  value: string | undefined
  onChange: (id: string) => void
}) {
  useEffect(() => {
    if (!value && classes.length > 0) onChange(classes[0].id)
  }, [classes, value, onChange])

  if (classes.length <= 1) return null
  return (
    <SelectField label={t.common.class} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </SelectField>
  )
}
