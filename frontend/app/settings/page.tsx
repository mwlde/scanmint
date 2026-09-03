'use client'

// Screen 09 — Settings

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackIcon } from '@/components/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']
const CURRENCY_KEY = 'sm_default_currency'
const APP_VERSION = '1.0.0'

function Row({
  label,
  value,
  onClick,
  emphasis = false,
  last = false,
}: {
  label: string
  value?: string
  onClick?: () => void
  emphasis?: boolean
  last?: boolean
}) {
  const interactive = Boolean(onClick)
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick!()
        }
      }}
      style={{
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: last ? 'none' : '1px solid var(--line-3)',
        cursor: interactive ? 'pointer' : 'default',
      }}
    >
      <div style={{ font: "500 14px/1 'Inter'", color: emphasis || (interactive && !value) ? 'var(--ink)' : 'var(--muted)' }}>
        {label}
      </div>
      {value && (
        <div style={{ font: "500 14px/1 'Inter'", color: label === 'App version' ? 'var(--disabled)' : 'var(--ink)' }}>
          {value}
        </div>
      )}
    </div>
  )
}

const GROUP_STYLE: React.CSSProperties = {
  borderTop: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
}

export default function SettingsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [currency, setCurrency] = useState('USD')

  useEffect(() => {
    setCurrency(localStorage.getItem(CURRENCY_KEY) ?? 'USD')
  }, [])

  // Tapping cycles through the supported codes, as in the design.
  function cycleCurrency() {
    const next = CURRENCIES[(CURRENCIES.indexOf(currency) + 1) % CURRENCIES.length]
    setCurrency(next)
    try {
      localStorage.setItem(CURRENCY_KEY, next)
    } catch {
      /* private mode — the choice lasts for this session only */
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="screen">
      <div style={{ padding: '12px 20px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button aria-label="Back" onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}>
          <BackIcon />
        </button>
        <div style={{ font: "600 16px/1 'Inter'" }}>Settings</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="section-head">Account</div>
        <div style={GROUP_STYLE}>
          {user ? (
            <>
              <Row label="Email" value={user.email ?? '—'} />
              <Row label="Sign out" onClick={signOut} last />
            </>
          ) : (
            <Row label="Sign in" onClick={() => router.push('/auth')} last />
          )}
        </div>

        <div className="section-head">Preferences</div>
        <div style={GROUP_STYLE}>
          <Row label="Default currency" value={currency} onClick={cycleCurrency} last />
        </div>

        <div className="section-head">About</div>
        <div style={GROUP_STYLE}>
          <Row label="App version" value={APP_VERSION} />
          {/* The design shows these as rows; there are no pages behind them
              yet, so they render without a destination rather than 404ing. */}
          <Row label="Privacy policy" emphasis />
          <Row label="Terms of service" emphasis last />
        </div>
      </div>
    </div>
  )
}
