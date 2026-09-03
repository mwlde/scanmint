// Icons transcribed from the v1 wireframes. They are inline SVG rather than an
// icon library so the stroke weights and geometry match the design exactly.

type IconProps = {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export function ReceiptMark({ size = 34, color = 'var(--ink)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden>
      <path
        d="M8 6h14l4 4v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M11 14h12M11 18h12M11 22h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function CameraIcon({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1.5" y="4.5" width="15" height="10" rx="1.5" stroke={color} strokeWidth="1.5" />
      <circle cx="9" cy="9.5" r="3" stroke={color} strokeWidth="1.5" />
      <path d="M6 4.5l1-2h4l1 2" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function ScanTabIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="2.5" y="5.5" width="17" height="12" rx="1.5" stroke={color} strokeWidth="1.5" />
      <circle cx="11" cy="11.5" r="3.5" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

export function ReceiptsTabIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path
        d="M6 2.5h8l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth="1.5"
      />
      <path d="M8 9h6M8 12h6M8 15h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function BackIcon({ size = 24, color = 'var(--ink)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 5l-7 7 7 7"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CloseIcon({ size = 14, color = '#666' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 2L12 12M12 2L2 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function CheckIcon({ size = 12, color = 'var(--on-ink)' }: IconProps) {
  return (
    <svg width={size} height={size * (10 / 12)} viewBox="0 0 12 10" fill="none" aria-hidden>
      <path
        d="M1.5 5l3 3 6-7"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CalendarIcon({ size = 14, color = 'var(--ink)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2" y="3" width="10" height="9" rx="1.5" stroke={color} strokeWidth="1.4" />
      <path d="M2 6h10M5 1.5v2M9 1.5v2" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function GalleryIcon({ size = 22, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="3" y="4" width="16" height="14" rx="1.5" stroke={color} strokeWidth="1.5" />
      <path d="M3 14l4-4 4 4 3-3 5 5" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="14" cy="9" r="1.5" fill={color} />
    </svg>
  )
}

export function AutoIcon({ size = 16, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 4v3a3 3 0 0 0 3 3h1M13 12V9a3 3 0 0 0-3-3H9M9 2l3 2-3 2M7 10l-3 2 3 2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ExpandIcon({ size = 14, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function EmptyLinesIcon({ size = 24, color = '#c8c6c1' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 8h8M8 12h8M8 16h5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function AuthMark({ size = 22, color = 'var(--ink)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path
        d="M6 5h10l3 3v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 11h8M8 14h6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
