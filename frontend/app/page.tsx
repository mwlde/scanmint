'use client'

// Screen 01 — Home

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'
import { CameraIcon, CloseIcon, ReceiptMark } from '@/components/icons'
import { useAuth } from '@/lib/useAuth'

const BANNER_DISMISSED = 'sm_signin_banner_dismissed'

export default function HomePage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [bannerDismissed, setBannerDismissed] = useState(true)

  useEffect(() => {
    setBannerDismissed(localStorage.getItem(BANNER_DISMISSED) === 'true')
  }, [])

  function dismissBanner() {
    setBannerDismissed(true)
    try {
      localStorage.setItem(BANNER_DISMISSED, 'true')
    } catch {
      /* private mode — the banner simply returns next launch */
    }
  }

  const showBanner = !loading && !user && !bannerDismissed

  return (
    <div className="screen">
      {showBanner && (
        <div style={{ padding: '12px 20px 0' }}>
          <div
            style={{
              border: '1px solid var(--line-2)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ flex: 1, font: "400 12.5px/1.4 'Inter'", color: '#333' }}>
              Sign in to sync across devices.
            </div>
            <button
              onClick={() => router.push('/auth')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ink)',
                font: "500 13px/1 'Inter'",
                padding: '4px 6px',
                cursor: 'pointer',
              }}
            >
              Sign in
            </button>
            <button
              aria-label="Dismiss"
              onClick={dismissBanner}
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}

      {/* The design has no entry point for Settings; this is the least
          disruptive one that keeps the hero centred. */}
      <div style={{ padding: '12px 20px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => router.push('/settings')}
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            font: "500 13px/1 'Inter'",
            color: 'var(--muted)',
          }}
        >
          Settings
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 64,
        }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            border: '1.5px solid var(--ink)',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ReceiptMark />
        </div>
        <h1 style={{ font: "700 22px/1.2 'Inter'", marginTop: 18, letterSpacing: '-0.01em' }}>
          ScanMint
        </h1>
        <p style={{ font: "400 13px/1.4 'Inter'", color: 'var(--muted)', marginTop: 6 }}>
          Photo to expense log.
        </p>
      </div>

      <div
        style={{
          padding: '0 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <button className="btn-primary" onClick={() => router.push('/camera')}>
          <CameraIcon color="var(--on-ink)" />
          Scan a receipt
        </button>
        <button className="btn-link" onClick={() => router.push('/receipts')}>
          View saved receipts
        </button>
      </div>

      <BottomNav />
    </div>
  )
}
