import type { ReactNode } from 'react'
import { DragonSprite, type DragonMood } from './DragonSprite'

export function EmptyState({ mood, stage, title, children }: { mood?: DragonMood; stage?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-box px-box-lg px-3 py-5 text-center">
      <DragonSprite mood={mood} stage={stage} scale={6} />
      <h2 className="text-xl">{title}</h2>
      {children}
    </div>
  )
}
