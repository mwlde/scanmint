'use client'

// Screens 05 / 05b — Review card, and the extraction-failed variant.
//
// Numeric fields are held as text while editing and only parsed on save.
// Parsing per keystroke makes decimals impossible to type: "18." parses to 18
// and the input snaps back before the user can reach the cents.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackIcon } from '@/components/icons'
import { draftStore } from '@/lib/receiptDraft'
import {
  CATEGORIES,
  saveReceipt,
  toNumber,
  updateReceipt,
  type Category,
  type ReceiptDraft,
} from '@/lib/receipts'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']

type ItemForm = {
  description: string
  quantity: string
  unit_price: string
  line_total: string
}

type Form = {
  vendor: string
  purchase_date: string
  total: string
  subtotal: string
  tax: string
  currency: string
  category: Category | null
  line_items: ItemForm[]
  image_url: string | null
}

const numText = (n: number | null) => (n === null ? '' : String(n))
const todayISO = () => new Date().toISOString().slice(0, 10)

function toForm(d: ReceiptDraft): Form {
  return {
    vendor: d.vendor ?? '',
    // A receipt with no date would fall outside every month bucket and never
    // appear in the list, so it defaults to today rather than staying empty.
    purchase_date: d.purchase_date ?? todayISO(),
    total: numText(d.total),
    subtotal: numText(d.subtotal),
    tax: numText(d.tax),
    currency: d.currency || 'USD',
    category: d.category,
    line_items: d.line_items.map(i => ({
      description: i.description,
      quantity: String(i.quantity ?? 1),
      unit_price: numText(i.unit_price),
      line_total: numText(i.line_total),
    })),
    image_url: d.image_url,
  }
}

function toDraft(f: Form, base: ReceiptDraft): ReceiptDraft {
  return {
    ...base,
    vendor: f.vendor.trim() || null,
    purchase_date: f.purchase_date || null,
    total: toNumber(f.total),
    subtotal: toNumber(f.subtotal),
    tax: toNumber(f.tax),
    currency: f.currency,
    category: f.category,
    line_items: f.line_items.map(i => ({
      description: i.description,
      quantity: toNumber(i.quantity) ?? 1,
      unit_price: toNumber(i.unit_price),
      line_total: toNumber(i.line_total),
    })),
    image_url: f.image_url,
  }
}

export default function ReviewPage() {
  const router = useRouter()
  const [base, setBase] = useState<ReceiptDraft | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [failed, setFailed] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const d = draftStore.get()
    if (!d) {
      router.replace('/')
      return
    }
    setBase(d)
    setForm(toForm(d))
    setFailed(draftStore.didFail())
    setEditingId(draftStore.editingId())
  }, [router])

  if (!form || !base) return null

  const set = (next: Partial<Form>) => setForm(f => (f ? { ...f, ...next } : f))

  const setItem = (index: number, next: Partial<ItemForm>) =>
    setForm(f =>
      f ? { ...f, line_items: f.line_items.map((it, i) => (i === index ? { ...it, ...next } : it)) } : f,
    )

  const addItem = () =>
    setForm(f =>
      f
        ? { ...f, line_items: [...f.line_items, { description: '', quantity: '1', unit_price: '', line_total: '' }] }
        : f,
    )

  const removeItem = (index: number) =>
    setForm(f => (f ? { ...f, line_items: f.line_items.filter((_, i) => i !== index) } : f))

  async function save() {
    if (!form || !base) return
    const draft = toDraft(form, base)
    if (draft.total === null) return

    setSaving(true)
    setSaveError(null)
    try {
      const saved = editingId ? await updateReceipt(editingId, draft) : await saveReceipt(draft)
      draftStore.clear()
      router.push(`/receipts/${saved.id}`)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save this receipt.')
      setSaving(false)
    }
  }

  function discard() {
    draftStore.clear()
    router.push('/')
  }

  const totalValue = toNumber(form.total)
  const missingTotal = totalValue === null
  const showErrorBanner = failed && !manualEntry
  const bareInput: React.CSSProperties = {
    border: 'none',
    outline: 'none',
    padding: 0,
    background: 'transparent',
  }

  return (
    <div className="screen">
      <div style={{ padding: '12px 20px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button aria-label="Back" onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}>
          <BackIcon />
        </button>
        <div style={{ font: "600 15px/1 'Inter'" }}>{editingId ? 'Edit' : 'Review'}</div>
        <div style={{ width: 24 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 140px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div className="placeholder-img" style={{ width: 84, height: 112, borderRadius: 8 }}>
            {form.image_url ? (
              <img src={form.image_url} alt="Flattened receipt"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              'Flattened'
            )}
          </div>
        </div>

        {showErrorBanner && (
          <div style={{ border: '1px solid var(--ink)', borderRadius: 12, padding: 14, marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 22, height: 22, border: '1.5px solid var(--ink)', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 1,
              }}>
                <div style={{ width: 2, height: 8, background: 'var(--ink)', borderRadius: 1 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: "600 14px/1.3 'Inter'" }}>We couldn&apos;t read this receipt.</div>
                <div style={{ font: "400 12.5px/1.5 'Inter'", color: 'var(--ink-2)', marginTop: 4 }}>
                  The image was too blurry or dark to extract fields. Retake the photo, or enter the details by hand.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => router.push('/camera')}
                style={{
                  flex: 1, background: 'var(--ink)', color: 'var(--on-ink)', border: 'none',
                  borderRadius: 8, height: 40, font: "600 13px/1 'Inter'", cursor: 'pointer',
                }}
              >
                Retry scan
              </button>
              <button
                onClick={() => setManualEntry(true)}
                style={{
                  flex: 1, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--ink)',
                  borderRadius: 8, height: 40, font: "600 13px/1 'Inter'", cursor: 'pointer',
                }}
              >
                Enter manually
              </button>
            </div>
          </div>
        )}

        <label className="label" htmlFor="vendor">Vendor</label>
        <input
          id="vendor"
          className="input"
          placeholder="Add vendor"
          value={form.vendor}
          onChange={e => set({ vendor: e.target.value })}
        />

        <label className="label" htmlFor="date" style={{ marginTop: 14 }}>Date</label>
        <input
          id="date"
          className="input"
          type="date"
          value={form.purchase_date}
          onChange={e => set({ purchase_date: e.target.value })}
        />

        <div style={{ marginTop: 18, padding: 14, border: '1.5px solid var(--ink)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="label" htmlFor="total" style={{ margin: 0 }}>Total · Required</label>
            {missingTotal && <div style={{ font: "500 11px/1 'Inter'", color: 'var(--ink)' }}>Missing</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <div style={{ font: "400 14px/1 'Inter'", color: missingTotal ? 'var(--disabled)' : 'var(--muted)' }}>$</div>
            <input
              id="total"
              inputMode="decimal"
              placeholder="0.00"
              value={form.total}
              onChange={e => set({ total: e.target.value })}
              style={{
                ...bareInput,
                font: "700 32px/1 'Inter'",
                letterSpacing: '-0.01em',
                width: '100%',
                color: missingTotal ? 'var(--disabled)' : 'var(--ink)',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
          <div>
            <label className="label" htmlFor="currency">Currency</label>
            <select
              id="currency"
              className="input"
              style={{ padding: '0 10px', appearance: 'none' }}
              value={form.currency}
              onChange={e => set({ currency: e.target.value })}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="subtotal">Subtotal</label>
            <input
              id="subtotal" className="input" inputMode="decimal" placeholder="0.00"
              style={{ padding: '0 10px' }}
              value={form.subtotal}
              onChange={e => set({ subtotal: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="tax">Tax</label>
            <input
              id="tax" className="input" inputMode="decimal" placeholder="0.00"
              style={{ padding: '0 10px' }}
              value={form.tax}
              onChange={e => set({ tax: e.target.value })}
            />
          </div>
        </div>

        <div className="label" style={{ marginTop: 18 }}>Category</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              type="button"
              aria-pressed={form.category === c}
              className={form.category === c ? 'chip chip-active' : 'chip'}
              onClick={() => set({ category: form.category === c ? null : c })}
            >
              {c}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 22, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ font: "600 13px/1 'Inter'" }}>
              Line items{' '}
              <span style={{ color: 'var(--disabled)', fontWeight: 500 }}>{form.line_items.length}</span>
            </div>
            <button
              onClick={addItem}
              style={{
                background: 'none', border: 'none', font: "500 12px/1 'Inter'", color: 'var(--ink-2)',
                textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', padding: 4,
              }}
            >
              Add item
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {form.line_items.map((item, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    aria-label={`Line item ${i + 1} description`}
                    placeholder="Item"
                    value={item.description}
                    onChange={e => setItem(i, { description: e.target.value })}
                    style={{ ...bareInput, font: "500 13.5px/1.3 'Inter'", flex: 1, color: 'var(--ink)' }}
                  />
                  <button
                    aria-label={`Remove line item ${i + 1}`}
                    onClick={() => removeItem(i)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      font: "500 12px/1 'Inter'", color: 'var(--muted)',
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, gap: 8 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    font: "400 12px/1 'Inter'", color: 'var(--muted)',
                  }}>
                    <span>Qty</span>
                    <input
                      aria-label={`Line item ${i + 1} quantity`}
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={e => setItem(i, { quantity: e.target.value })}
                      style={{ ...bareInput, width: 34, font: "400 12px/1 'Inter'", color: 'var(--muted)' }}
                    />
                    <span>·</span>
                    <span>$</span>
                    <input
                      aria-label={`Line item ${i + 1} unit price`}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={item.unit_price}
                      onChange={e => setItem(i, { unit_price: e.target.value })}
                      style={{ ...bareInput, width: 52, font: "400 12px/1 'Inter'", color: 'var(--muted)' }}
                    />
                  </div>
                  <input
                    aria-label={`Line item ${i + 1} total`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={item.line_total}
                    onChange={e => setItem(i, { line_total: e.target.value })}
                    style={{
                      ...bareInput, width: 64, textAlign: 'right',
                      font: "500 12px/1 'Inter'", color: 'var(--ink)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {saveError && (
          <div role="alert" style={{ font: "400 12.5px/1.5 'Inter'", color: 'var(--ink)', marginTop: 16 }}>
            {saveError}
          </div>
        )}
      </div>

      <div style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 0,
        width: '100%', maxWidth: 430, background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        padding: '14px 20px calc(30px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', gap: 10,
      }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={discard}>Discard</button>
        <button className="btn-primary" style={{ flex: 1.6 }} onClick={save} disabled={missingTotal || saving}>
          {saving ? 'Saving…' : 'Save receipt'}
        </button>
      </div>
    </div>
  )
}
