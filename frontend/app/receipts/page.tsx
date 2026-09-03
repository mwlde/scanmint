'use client'

// Screens 06 / 06b — Receipts list, and its empty state

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'
import { CalendarIcon, EmptyLinesIcon } from '@/components/icons'
import {
  CATEGORIES,
  formatMoney,
  listReceipts,
  receiptImageUrl,
  sumTotal,
  type Category,
  type Receipt,
} from '@/lib/receipts'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function RowThumb({ receipt }: { receipt: Receipt }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    receiptImageUrl(receipt).then(u => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [receipt])

  return (
    <div className="placeholder-img" style={{ width: 40, height: 52, borderRadius: 6, fontSize: 8, flex: 'none' }}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  )
}

export default function ReceiptsPage() {
  const router = useRouter()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-indexed
  const [filter, setFilter] = useState<Category | 'All'>('All')
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReceipts(await listReceipts(year, month))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load receipts.')
      setReceipts([])
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  // The month chip steps backwards, as it does in the design.
  function prevMonth() {
    setMonth(m => (m === 1 ? 12 : m - 1))
    setYear(y => (month === 1 ? y - 1 : y))
  }

  const visible = filter === 'All' ? receipts : receipts.filter(r => r.category === filter)
  // The headline total is the month's, not the filtered subset's.
  const total = sumTotal(receipts)
  const currency = receipts[0]?.currency ?? 'USD'
  const isEmpty = !loading && receipts.length === 0

  return (
    <div className="screen">
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--line)' }}>
        <div style={{
          font: "500 12px/1 'Inter'", color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          This month
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{
            font: "700 32px/1 'Inter'", letterSpacing: '-0.01em',
            color: isEmpty ? 'var(--disabled)' : 'var(--ink)',
          }}>
            {formatMoney(total, currency)}
          </div>
          <button className="chip" onClick={prevMonth} aria-label="Show the previous month">
            <CalendarIcon />
            {MONTHS[month - 1]} {year}
          </button>
        </div>

        <div style={{
          display: 'flex', gap: 8, marginTop: 14, overflowX: 'auto',
          marginRight: -20, paddingRight: 20,
        }}>
          {(['All', ...CATEGORIES] as const).map(c => {
            if (isEmpty) return <span key={c} className="chip chip-muted">{c}</span>
            return (
              <button
                key={c}
                className={filter === c ? 'chip chip-active' : 'chip'}
                aria-pressed={filter === c}
                onClick={() => setFilter(c)}
              >
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {isEmpty ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '40px 40px 120px', textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 68, border: '1.5px dashed #c8c6c1', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
          }}>
            <EmptyLinesIcon />
          </div>
          <div style={{ font: "600 16px/1.4 'Inter'" }}>No receipts yet.</div>
          <div style={{
            font: "400 13.5px/1.5 'Inter'", color: 'var(--muted)',
            marginTop: 6, maxWidth: 240,
          }}>
            Your saved receipts for the month show up here.
            <button
              onClick={() => router.push('/camera')}
              style={{
                background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer',
                textDecoration: 'underline', textUnderlineOffset: 3, marginLeft: 4,
                font: "400 13.5px/1.5 'Inter'", padding: 0,
              }}
            >
              Scan one now
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div role="alert" style={{ padding: '14px 20px', font: "400 13px/1.5 'Inter'", color: 'var(--ink)' }}>
              {error}
            </div>
          )}
          {visible.map((r, i) => (
            <button
              key={r.id}
              onClick={() => router.push(`/receipts/${r.id}`)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', cursor: 'pointer',
                padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14,
                border: 'none',
                borderBottom: i === visible.length - 1 ? 'none' : '1px solid var(--line-3)',
              }}
            >
              <RowThumb receipt={r} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  font: "600 14.5px/1.2 'Inter'", color: 'var(--ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.vendor ?? 'Untitled receipt'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ font: "400 12px/1 'Inter'", color: 'var(--muted)' }}>
                    {r.purchase_date
                      ? new Date(`${r.purchase_date}T00:00:00`).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </span>
                  {r.category && (
                    <>
                      <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#ccc' }} />
                      <span style={{
                        font: "500 11px/1 'Inter'", color: 'var(--ink-2)',
                        border: '1px solid #e4e2dd', borderRadius: 4, padding: '3px 6px',
                      }}>
                        {r.category}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div style={{ font: "600 15px/1 'Inter'" }}>{formatMoney(r.total, r.currency)}</div>
            </button>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
