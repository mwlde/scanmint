'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  FileText,
  HardDrive,
  Info,
  Lock,
  LogIn,
  LogOut,
  Shield,
  Sliders,
  UserCircle2,
} from 'lucide-react'
import { BottomNav } from '@/components/BottomNav'
import { getHistory, clearHistory } from '@/lib/history'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

// ── Storage helpers ───────────────────────────────────────────────────────────

const QUOTA_BYTES = 5 * 1024 * 1024

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low quality',    color: '#2DC653' },
  medium: { label: 'Medium quality', color: '#5684BC' },
  high:   { label: 'High quality',   color: '#7B2D8B' },
}

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function getStorageBreakdown() {
  try {
    let totalBytes = 0
    for (const key of Object.keys(localStorage)) {
      totalBytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2
    }
    const history = getHistory()
    const byCategory: Record<string, number> = {}
    for (const item of history) {
      const bytes = JSON.stringify(item).length * 2
      const bucket = item.quality ?? 'medium'
      byCategory[bucket] = (byCategory[bucket] ?? 0) + bytes
    }
    return { totalBytes, byCategory }
  } catch {
    return { totalBytes: 0, byCategory: {} }
  }
}

function getStorageUsed(): string {
  try {
    let bytes = 0
    for (const key of Object.keys(localStorage)) {
      bytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2
    }
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1_048_576).toFixed(1)} MB`
  } catch {
    return '—'
  }
}

// ── Static page content ───────────────────────────────────────────────────────

type Section = 'privacy' | 'terms' | 'permissions' | 'licenses' | 'storage' | 'version'

// 'storage' is excluded: it renders through StorageScreen, not this map.
const PAGES: Record<Exclude<Section, 'storage'>, { title: string; content: React.ReactNode }> = {
  privacy: {
    title: 'Privacy Policy',
    content: (
      <div className="flex flex-col gap-5 text-sm" style={{ color: '#1A1A1A' }}>
        <div>
          <p className="font-bold text-base">ScanMint Privacy Policy</p>
          <p className="text-xs mt-0.5" style={{ color: '#888' }}>Demo Version, Last updated: June 2026</p>
        </div>

        <p style={{ color: '#444', lineHeight: 1.65 }}>
          ScanMint is early-stage software under active development. It does not collect data for
          any purpose beyond delivering the features described here.
        </p>

        <div>
          <p className="font-semibold mb-2">What we store</p>
          <ul className="flex flex-col gap-2" style={{ color: '#444' }}>
            {[
              'Scanned documents and their results stay entirely on your device. Scan history is kept in your browser\'s local storage and never leaves it.',
              'Images you scan are sent to the processing service only for the duration of the request. Nothing is retained server-side once a response is returned.',
              'Signing in is optional. When you do, an account identifier is stored so your data can persist across devices.',
              'We do not use cookies, trackers, or third-party analytics.',
            ].map((item, i) => (
              <li key={i} className="flex gap-2" style={{ lineHeight: 1.6 }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#5684BC' }} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-semibold mb-2">What we don't do</p>
          <ul className="flex flex-col gap-2" style={{ color: '#444' }}>
            {[
              'We do not sell, share, or monetise any data.',
              'We do not retain the documents you scan after processing them.',
              'We do not require account creation to use any core feature.',
            ].map((item, i) => (
              <li key={i} className="flex gap-2" style={{ lineHeight: 1.6 }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#5684BC' }} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs p-3 rounded-xl" style={{ color: '#888', backgroundColor: '#F5F5F5', lineHeight: 1.6 }}>
          Since this is a student project, this policy is provided for demonstration purposes and
          does not constitute a legally binding agreement.
        </p>
      </div>
    ),
  },

  terms: {
    title: 'Terms of Service',
    content: (
      <div className="flex flex-col gap-5 text-sm" style={{ color: '#1A1A1A' }}>
        <div>
          <p className="font-bold text-base">ScanMint Terms of Service</p>
          <p className="text-xs mt-0.5" style={{ color: '#888' }}>Demo Version, Last updated: June 2026</p>
        </div>

        <p style={{ color: '#444', lineHeight: 1.65 }}>
          By using this application, you acknowledge that:
        </p>

        <ol className="flex flex-col gap-3">
          {[
            'ScanMint is early-stage software under active development.',
            'The document scanning and extraction features are experimental and may not perform reliably under all conditions.',
            'You should not upload sensitive or confidential documents, as this app has not undergone formal security review.',
            'The developers make no warranties regarding accuracy, availability, or fitness for any particular purpose.',
            'This software is provided "as is", without warranty of any kind.',
          ].map((item, i) => (
            <li key={i} className="flex gap-3" style={{ color: '#444', lineHeight: 1.6 }}>
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: '#5684BC' }}
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{item}</span>
            </li>
          ))}
        </ol>

        <p className="text-xs p-3 rounded-xl" style={{ color: '#888', backgroundColor: '#F5F5F5', lineHeight: 1.6 }}>
          Continued use of the app constitutes acceptance of these terms.
        </p>
      </div>
    ),
  },

  permissions: {
    title: 'Data & Permissions',
    content: (
      <div className="flex flex-col gap-4 text-sm" style={{ color: '#1A1A1A' }}>
        <p className="font-bold text-base">Data & Permissions</p>

        {[
          {
            title: 'Camera Access',
            body: 'Used only to capture document images for scanning. Images are processed and discarded — nothing is uploaded without your action.',
          },
          {
            title: 'Storage Access',
            body: 'Used to save scan history and results locally on your device using localStorage. You can clear this at any time from Settings.',
          },
          {
            title: 'Network Access',
            body: 'Used to send document images to the scanning service for processing. No data is retained server-side after a response is returned.',
          },
        ].map(({ title, body }) => (
          <div key={title} className="p-4 rounded-2xl" style={{ backgroundColor: '#F8F8F8' }}>
            <p className="font-semibold mb-1.5">{title}</p>
            <p style={{ color: '#555', lineHeight: 1.65 }}>{body}</p>
          </div>
        ))}

        <p className="text-xs p-3 rounded-xl" style={{ color: '#888', backgroundColor: '#F5F5F5', lineHeight: 1.6 }}>
          You can revoke any of these permissions at any time through your device or browser settings.
        </p>
      </div>
    ),
  },

  version: {
    title: 'Version History',
    content: (
      <div className="flex flex-col gap-1 text-sm" style={{ color: '#1A1A1A' }}>
        <div className="mb-4">
          <p className="font-bold text-base">ScanMint</p>
        </div>

        {([
          {
            version: 'v0.1',
            title: 'ScanMint MVP',
            current: true,
            body: 'Fresh start as a receipt scanner. Capture or upload a photo, the OpenCV pipeline detects the receipt boundary and warps it to a clean top-down view, and the flattened image goes to a vision model for structured extraction. Evolved from SmartScan, which paired the same preprocessing pipeline with a MobileNetV2 document classifier.',
          },
        ] as { version: string; title: string; body: string; current?: boolean }[]).map((entry, i, arr) => (
          <div key={entry.version} className="flex gap-3">
            {/* Timeline spine */}
            <div className="flex flex-col items-center" style={{ width: 28, flexShrink: 0 }}>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                style={{ backgroundColor: entry.current ? '#5684BC' : '#F0F0F0' }}
              >
                <span className="text-[9px] font-bold" style={{ color: entry.current ? 'white' : '#888' }}>
                  {entry.version.replace('v', '')}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div className="flex-1 w-px mt-1" style={{ backgroundColor: '#E8E8E8', minHeight: 24 }} />
              )}
            </div>

            {/* Content */}
            <div className="pb-5 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-sm" style={{ color: '#1A1A1A' }}>{entry.title}</p>
                {entry.current && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: '#EBF0F7', color: '#5684BC' }}
                  >
                    current
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#555' }}>{entry.body}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },

  licenses: {
    title: 'Open Source & Licences',
    content: (
      <div className="flex flex-col gap-5 text-sm" style={{ color: '#1A1A1A' }}>
        <p className="font-bold text-base">Open Source & Acknowledgements</p>

        {[
          {
            heading: 'Computer Vision',
            items: [
              { name: 'OpenCV', licence: 'Apache 2.0', note: 'image processing, edge detection, perspective transforms' },
            ],
          },
          {
            heading: 'Backend',
            items: [
              { name: 'FastAPI', licence: 'MIT', note: 'API framework' },
              { name: 'Uvicorn', licence: 'BSD', note: 'ASGI server' },
            ],
          },
          {
            heading: 'Frontend',
            items: [
              { name: 'Next.js', licence: 'MIT', note: 'React framework' },
              { name: 'Tailwind CSS', licence: 'MIT', note: 'utility-first styling' },
              { name: 'Lucide React', licence: 'ISC', note: 'icon library' },
            ],
          },
        ].map(({ heading, items }) => (
          <div key={heading}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#AAAAAA' }}>
              {heading}
            </p>
            <div className="flex flex-col gap-2">
              {items.map(({ name, licence, note }) => (
                <div key={name} className="flex items-start justify-between gap-3 p-3 rounded-xl" style={{ backgroundColor: '#F8F8F8' }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{name}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#888' }}>{note}</p>
                  </div>
                  <span
                    className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#EBF0F7', color: '#5684BC' }}
                  >
                    {licence}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
  },
}

// ── Quality selector ─────────────────────────────────────────────────────────

type Quality = 'low' | 'medium' | 'high'

function QualitySelector({ quality, onChange }: { quality: Quality; onChange: (q: Quality) => void }) {
  return (
    <div className="px-4 py-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-3.5">
        <span style={{ color: '#888' }}><Sliders size={18} /></span>
        <span className="flex-1 text-sm font-medium" style={{ color: '#1A1A1A' }}>Default Scan Quality</span>
      </div>
      <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: '#F0F0F0' }}>
        {(['low', 'medium', 'high'] as const).map(q => (
          <button
            key={q}
            onClick={() => onChange(q)}
            className="flex-1 py-2 rounded-[10px] text-xs font-semibold capitalize transition-all"
            style={{
              backgroundColor: quality === q ? 'white' : 'transparent',
              color: quality === q ? '#1A1A1A' : '#888888',
              boxShadow: quality === q ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {q.charAt(0).toUpperCase() + q.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Storage breakdown screen ──────────────────────────────────────────────────

function StorageScreen({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState(() => getStorageBreakdown())
  const [confirmClear, setConfirmClear] = useState(false)
  const [cleared, setCleared] = useState(false)

  function handleClearAll() {
    clearHistory()
    setData(getStorageBreakdown())
    setCleared(true)
    setConfirmClear(false)
  }

  const usedPct = Math.min(100, (data.totalBytes / QUOTA_BYTES) * 100)
  const freePct = 100 - usedPct
  const segments = Object.entries(data.byCategory).map(([key, bytes]) => ({
    key,
    bytes,
    pct: (bytes / QUOTA_BYTES) * 100,
    meta: CATEGORY_META[key] ?? { label: key, color: '#888888' },
  }))

  return (
    <div className="flex flex-col bg-white" style={{ minHeight: '100dvh' }}>
      <div className="h-11 flex-shrink-0" />

      <div className="flex items-center gap-3 px-4 pt-3 pb-4 border-b" style={{ borderColor: '#F0F0F0' }}>
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#F5F5F5' }}
        >
          <ArrowLeft size={18} style={{ color: '#1A1A1A' }} />
        </button>
        <h2 className="text-base font-bold" style={{ color: '#1A1A1A' }}>Storage Used</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-6">
        {/* Usage summary */}
        <div className="text-center">
          <p className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>{fmtBytes(data.totalBytes)}</p>
          <p className="text-sm mt-1" style={{ color: '#888' }}>of {fmtBytes(QUOTA_BYTES)} used</p>
        </div>

        {/* Segmented bar */}
        <div className="rounded-2xl overflow-hidden flex h-8" style={{ backgroundColor: '#E8E8E8' }}>
          {segments.map(s => (
            <div
              key={s.key}
              style={{ width: `${s.pct}%`, backgroundColor: s.meta.color, minWidth: s.pct > 0.5 ? 4 : 0 }}
            />
          ))}
          <div style={{ flex: 1, backgroundColor: '#E8E8E8' }} />
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-3">
          {segments.map(s => (
            <div key={s.key} className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.meta.color }} />
              <span className="flex-1 text-sm font-medium" style={{ color: '#1A1A1A' }}>{s.meta.label}</span>
              <span className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>{s.pct.toFixed(1)}%</span>
              <span className="text-xs w-16 text-right" style={{ color: '#888' }}>{fmtBytes(s.bytes)}</span>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: '#E8E8E8', border: '1px solid #D0D0D0' }}
            />
            <span className="flex-1 text-sm font-medium" style={{ color: '#1A1A1A' }}>Free</span>
            <span className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>{freePct.toFixed(1)}%</span>
            <span className="text-xs w-16 text-right" style={{ color: '#888' }}>{fmtBytes(QUOTA_BYTES - data.totalBytes)}</span>
          </div>
        </div>

        {cleared && (
          <div className="p-3 rounded-xl text-sm text-center" style={{ backgroundColor: '#F0FFF4', color: '#1A8A3C' }}>
            History cleared successfully
          </div>
        )}

        {/* Clear all */}
        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-95"
            style={{ backgroundColor: '#FDF2F2', color: '#D4183D' }}
          >
            Clear All Scans
          </button>
        ) : (
          <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ backgroundColor: '#FDF2F2' }}>
            <p className="text-sm font-semibold text-center" style={{ color: '#D4183D' }}>
              Delete all scan history?
            </p>
            <p className="text-xs text-center" style={{ color: '#D4183D', opacity: 0.7 }}>
              This cannot be undone.
            </p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-3 rounded-xl font-semibold text-sm"
                style={{ backgroundColor: 'white', color: '#1A1A1A' }}
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white"
                style={{ backgroundColor: '#D4183D' }}
              >
                Delete All
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ title }: { title: ReactNode }) {
  return (
    <p className="px-5 pb-2 pt-1 text-xs font-semibold uppercase tracking-widest" style={{ color: '#AAAAAA' }}>
      {title}
    </p>
  )
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <div className="mx-4 rounded-2xl overflow-hidden bg-white mb-4">{children}</div>
}

function Divider() {
  return <div className="h-px mx-4" style={{ backgroundColor: '#F2F2F2' }} />
}

function Row({
  icon, label, value, onPress,
}: {
  icon: React.ReactNode; label: string; value?: string; onPress?: () => void
}) {
  return (
    <button
      onClick={onPress}
      className="flex items-center gap-3.5 w-full px-4 py-3.5 text-left transition-all active:bg-gray-50"
    >
      <span style={{ color: '#888' }}>{icon}</span>
      <span className="flex-1 text-sm font-medium" style={{ color: '#1A1A1A' }}>{label}</span>
      {value && <span className="text-xs mr-1" style={{ color: '#BBBBBB' }}>{value}</span>}
      <ChevronRight size={15} style={{ color: '#DDDDDD' }} />
    </button>
  )
}

function Toggle({ icon, label, enabled, onToggle }: {
  icon: React.ReactNode; label: string; enabled: boolean; onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <span style={{ color: '#888' }}>{icon}</span>
      <span className="flex-1 text-sm font-medium" style={{ color: '#1A1A1A' }}>{label}</span>
      <button
        onClick={onToggle}
        style={{
          width: 44, height: 26, borderRadius: 13,
          backgroundColor: enabled ? '#5684BC' : '#D8D8D8',
          position: 'relative', flexShrink: 0,
          transition: 'background-color 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: enabled ? 20 : 2,
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [notificationsOn, setNotificationsOn] = useState(true)
  const [storageUsed, setStorageUsed] = useState('—')
  const [scanQuality, setScanQuality] = useState<Quality>('medium')
  const [dogeMode, setDogeMode] = useState(false)
  const [selected, setSelected] = useState<Section | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    setSigningOut(false)
  }

  useEffect(() => {
    setStorageUsed(getStorageUsed())
    const stored = localStorage.getItem('ss_scan_quality')
    if (stored === 'low' || stored === 'medium' || stored === 'high') setScanQuality(stored)
    setDogeMode(localStorage.getItem('ss_doge_mode') === 'true')
    // open a specific sub-page if navigated here with ?section=xxx
    const sec = new URLSearchParams(window.location.search).get('section')
    if (sec && ['privacy', 'terms', 'permissions', 'licenses', 'storage', 'version'].includes(sec)) {
      setSelected(sec as Section)
    }
  }, [])

  function handleDogeMode(v: boolean) {
    setDogeMode(v)
    localStorage.setItem('ss_doge_mode', String(v))
    // broadcast to home page if it's open in the same tab
    window.dispatchEvent(new StorageEvent('storage', { key: 'ss_doge_mode', newValue: String(v) }))
  }

  function handleQualityChange(q: Quality) {
    setScanQuality(q)
    localStorage.setItem('ss_scan_quality', q)
  }

  // ── Storage detail view ────────────────────────────────────────────────────
  if (selected === 'storage') {
    return <StorageScreen onBack={() => setSelected(null)} />
  }

  // ── Other detail views ─────────────────────────────────────────────────────
  if (selected) {
    const page = PAGES[selected]
    return (
      <div className="flex flex-col bg-white" style={{ minHeight: '100dvh' }}>
        <div className="h-11 flex-shrink-0" />

        <div className="flex items-center gap-3 px-4 pt-3 pb-4 border-b" style={{ borderColor: '#F0F0F0' }}>
          <button
            onClick={() => setSelected(null)}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#F5F5F5' }}
          >
            <ArrowLeft size={18} style={{ color: '#1A1A1A' }} />
          </button>
          <h2 className="text-base font-bold" style={{ color: '#1A1A1A' }}>{page.title}</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {page.content}
          <div className="pb-6" />
        </div>

        <BottomNav />
      </div>
    )
  }

  // ── Settings list ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ minHeight: '100dvh', backgroundColor: '#F5F5F5' }}>
      <div className="h-11 flex-shrink-0" />

      <div className="px-5 pt-4 pb-4 bg-white mb-3">
        <h1 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {/* Account card */}
        <div className="mx-4 mb-4 rounded-2xl p-4 flex items-center gap-4 bg-white">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: user ? '#EBF0F7' : '#F5F5F5' }}
          >
            <UserCircle2 size={32} style={{ color: user ? '#5684BC' : '#BBBBBB' }} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            {authLoading ? (
              <div className="h-3 w-24 rounded-full animate-pulse" style={{ backgroundColor: '#E8E8E8' }} />
            ) : user ? (
              <>
                <p className="font-bold text-sm truncate" style={{ color: '#1A1A1A' }}>{user.email}</p>
                <p className="text-xs mt-0.5" style={{ color: '#3BB273' }}>Signed in</p>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="mt-1.5 text-xs font-semibold flex items-center gap-1"
                  style={{ color: '#D4183D' }}
                >
                  <LogOut size={11} />
                  {signingOut ? 'Signing out…' : 'Log Out'}
                </button>
              </>
            ) : (
              <>
                <p className="font-bold text-sm" style={{ color: '#1A1A1A' }}>Guest</p>
                <p className="text-xs mt-0.5" style={{ color: '#888' }}>Browsing as guest</p>
                <button
                  onClick={() => router.push('/auth')}
                  className="mt-1.5 text-xs font-semibold flex items-center gap-1"
                  style={{ color: '#5684BC' }}
                >
                  <LogIn size={11} />
                  Log In / Sign Up
                </button>
              </>
            )}
          </div>
        </div>

        {/* Preferences */}
        <SectionLabel title="Preferences" />
        <SettingsCard>
          <Toggle icon={<Bell size={18} />} label="Notifications" enabled={notificationsOn} onToggle={() => setNotificationsOn(v => !v)} />
          <Divider />
          <Row icon={<HardDrive size={18} />} label="Storage Used" value={storageUsed} onPress={() => setSelected('storage')} />
          <Divider />
          <QualitySelector quality={scanQuality} onChange={handleQualityChange} />
        </SettingsCard>

        {/* Privacy & Legal */}
        <SectionLabel title="Privacy & Legal" />
        <SettingsCard>
          <Row icon={<Lock size={18} />}     label="Privacy Policy"     onPress={() => setSelected('privacy')} />
          <Divider />
          <Row icon={<FileText size={18} />} label="Terms of Service"   onPress={() => setSelected('terms')} />
          <Divider />
          <Row icon={<Shield size={18} />}   label="Data & Permissions" onPress={() => setSelected('permissions')} />
        </SettingsCard>

        {/* Fun */}
        <SectionLabel title={<><img src="/sidedog.png" alt="dog" style={{ width: 14, height: 14, display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />Fun</>} />
        <SettingsCard>
          <Toggle
            icon={<img src="/sidedog.png" alt="dog" style={{ width: 18, height: 18 }} />}
            label="Doge Mode"
            enabled={dogeMode}
            onToggle={() => handleDogeMode(!dogeMode)}
          />
        </SettingsCard>

        {/* About */}
        <SectionLabel title="About" />
        <SettingsCard>
          <Row icon={<Info size={18} />}     label="App Version"           value="v0.15" onPress={() => setSelected('version')} />
          <Divider />
          <Row icon={<FileText size={18} />} label="Open Source & Licences" onPress={() => setSelected('licenses')} />
        </SettingsCard>

        {/* Sign in CTA — only shown when guest */}
        <div className="px-4 pt-1 pb-6">
          {!user && !authLoading && (
            <button
              onClick={() => router.push('/auth')}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm text-white transition-all active:scale-95 mb-3"
              style={{ backgroundColor: '#5684BC' }}
            >
              <LogIn size={18} />
              Log In / Create Account
            </button>
          )}
          <p className="text-center text-xs" style={{ color: '#BBBBBB' }}>
            ScanMint v0.1
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
