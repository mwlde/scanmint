'use client'

import { useRouter, usePathname } from 'next/navigation'
import { ScanTabIcon, ReceiptsTabIcon } from './icons'

// Two tabs, per the v1 design. The legacy History and Saved screens are no
// longer reachable from the nav; their routes still exist.
const NAV_ITEMS = [
  { path: '/', Icon: ScanTabIcon, label: 'Scan' },
  { path: '/receipts', Icon: ReceiptsTabIcon, label: 'Receipts' },
] as const

export function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <>
      {/* Reserves the nav's height so the last row of content clears it. */}
      <div
        aria-hidden
        style={{ height: 'calc(82px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }}
      />

      <nav className="bottom-nav">
        {NAV_ITEMS.map(({ path, Icon, label }) => {
          const active = path === '/' ? pathname === '/' : pathname.startsWith(path)
          return (
            <button
              key={path}
              onClick={() => router.push(path)}
              className={active ? 'item active' : 'item'}
              aria-current={active ? 'page' : undefined}
            >
              <Icon />
              {label}
            </button>
          )
        })}
      </nav>
    </>
  )
}
