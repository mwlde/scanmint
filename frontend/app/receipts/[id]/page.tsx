'use client'

// Screen 07 — Receipt detail

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BackIcon, ExpandIcon } from '@/components/icons'
import {
  deleteReceipt,
  formatMoney,
  getReceipt,
  receiptImageUrl,
  type Receipt,
} from '@/lib/receipts'
import { draftStore } from '@/lib/receiptDraft'

export default function ReceiptDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await getReceipt(params.id)
        if (!alive) return
        if (!r) {
          router.replace('/receipts')
          return
        }
        setReceipt(r)
        setImageUrl(await receiptImageUrl(r))
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load this receipt.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [params.id, router])

  // Reopens the review card against this receipt; Save then updates in place.
  function edit() {
    if (!receipt) return
    draftStore.setEditing(receipt.id, {
      vendor: receipt.vendor,
      purchase_date: receipt.purchase_date,
      subtotal: receipt.subtotal,
      tax: receipt.tax,
      total: receipt.total,
      currency: receipt.currency,
      category: receipt.category,
      line_items: receipt.line_items,
      image_url: imageUrl,
    })
    router.push('/results')
  }

  async function remove() {
    if (!receipt) return
    if (!confirm('Delete this receipt?')) return
    try {
      await deleteReceipt(receipt.id)
      router.push('/receipts')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this receipt.')
    }
  }

  if (loading) return <div className="screen" />

  if (error || !receipt) {
    return (
      <div className="screen" style={{ padding: 20 }}>
        <div role="alert" style={{ font: "400 13px/1.5 'Inter'" }}>{error ?? 'Receipt not found.'}</div>
      </div>
    )
  }

  const dateLabel = receipt.purchase_date
    ? new Date(`${receipt.purchase_date}T00:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

  return (
    <div className="screen">
      <div style={{ padding: '12px 20px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button aria-label="Back" onClick={() => router.push('/receipts')}
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}>
          <BackIcon />
        </button>
        <div style={{ font: "600 15px/1 'Inter'" }}>Receipt</div>
        <button
          onClick={edit}
          style={{
            background: 'none', border: 'none', font: "600 14px/1 'Inter'",
            color: 'var(--ink)', cursor: 'pointer', padding: 4,
          }}
        >
          Edit
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 30px' }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <button
            onClick={() => imageUrl && setLightbox(true)}
            aria-label="View full receipt image"
            className="placeholder-img"
            style={{
              width: 160, height: 216, borderRadius: 8, border: 'none',
              padding: 0, cursor: imageUrl ? 'zoom-in' : 'default',
            }}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="Receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <>Receipt<br />image</>
            )}
          </button>
          {imageUrl && (
            <div style={{
              position: 'absolute', top: 8, right: 'calc(50% - 88px)',
              background: 'rgba(0,0,0,0.7)', color: '#fff', padding: 6,
              borderRadius: 6, pointerEvents: 'none',
            }}>
              <ExpandIcon />
            </div>
          )}
        </div>

        <div className="label">Vendor</div>
        <div style={{ font: "600 17px/1.3 'Inter'" }}>{receipt.vendor ?? 'Untitled receipt'}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 18 }}>
          <div>
            <div className="label">Date</div>
            <div style={{ font: "500 15px/1.3 'Inter'" }}>{dateLabel}</div>
          </div>
          <div>
            <div className="label">Category</div>
            <div style={{ font: "500 15px/1.3 'Inter'" }}>{receipt.category ?? '—'}</div>
          </div>
        </div>

        <div style={{ marginTop: 22, padding: 14, border: '1.5px solid var(--ink)', borderRadius: 12 }}>
          <div className="label" style={{ margin: 0 }}>Total</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <div style={{ font: "400 14px/1 'Inter'", color: 'var(--muted)' }}>{receipt.currency}</div>
            <div style={{ font: "700 32px/1 'Inter'", letterSpacing: '-0.01em' }}>
              {formatMoney(receipt.total, receipt.currency)}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 18 }}>
          <div>
            <div className="label">Subtotal</div>
            <div style={{ font: "500 15px/1.3 'Inter'" }}>
              {receipt.subtotal === null ? '—' : formatMoney(receipt.subtotal, receipt.currency)}
            </div>
          </div>
          <div>
            <div className="label">Tax</div>
            <div style={{ font: "500 15px/1.3 'Inter'" }}>
              {receipt.tax === null ? '—' : formatMoney(receipt.tax, receipt.currency)}
            </div>
          </div>
        </div>

        {receipt.line_items.length > 0 && (
          <div style={{ marginTop: 22, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div style={{ font: "600 13px/1 'Inter'", marginBottom: 12 }}>Line items</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {receipt.line_items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', font: "400 13.5px/1.3 'Inter'" }}>
                  <div>
                    <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{item.description || 'Item'}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                      Qty {item.quantity}
                      {item.unit_price !== null && ` · ${formatMoney(item.unit_price, receipt.currency)}`}
                    </div>
                  </div>
                  <div style={{ color: 'var(--ink)', fontWeight: 500 }}>
                    {item.line_total === null ? '—' : formatMoney(item.line_total, receipt.currency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{
          marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--line)',
          textAlign: 'center', paddingBottom: 20,
        }}>
          <button
            onClick={remove}
            style={{
              background: 'none', border: 'none', font: "500 13.5px/1 'Inter'",
              color: 'var(--muted)', textDecoration: 'underline', textUnderlineOffset: 3,
              cursor: 'pointer', padding: '12px 16px',
            }}
          >
            Delete receipt
          </button>
        </div>
      </div>

      {lightbox && imageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Receipt image"
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <img src={imageUrl} alt="Receipt" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}
