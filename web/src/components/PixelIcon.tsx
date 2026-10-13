import { PIXEL_ICONS, type PixelIconName } from '../assets/pixel/icons'

type Props = {
  name: PixelIconName
  /** Taille d'un pixel de l'icône, en px. */
  scale?: number
  className?: string
  label?: string
  /** Couleur des pixels `o`. */
  highlight?: string
}

export function PixelIcon({ name, scale = 2, className, label, highlight = 'var(--color-accent-soft)' }: Props) {
  const rows = PIXEL_ICONS[name]
  const width = rows[0].length
  const height = rows.length
  const rects = rows.flatMap((row, y) =>
    [...row].flatMap((cell, x) =>
      cell === '.' ? [] : [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={cell === 'o' ? highlight : 'currentColor'} />],
    ),
  )
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      shapeRendering="crispEdges"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {rects}
    </svg>
  )
}
