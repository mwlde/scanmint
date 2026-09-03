'use client'

// Screen 03 — Processing

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon } from '@/components/icons'
import { draftStore, emptyDraft } from '@/lib/receiptDraft'
import { normalizeCategory, toNumber, type LineItem } from '@/lib/receipts'

const SCAN_API = process.env.NEXT_PUBLIC_SCAN_API

const STEPS = ['Flattening image', 'Reading receipt', 'Structuring data'] as const
type Step = (typeof STEPS)[number]
type Status = 'pending' | 'active' | 'done'

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

export default function ProcessingPage() {
  const router = useRouter()
  const hasRun = useRef(false)
  const [thumb, setThumb] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const imageUrl = sessionStorage.getItem('sm_image')
    if (!imageUrl) {
      router.replace('/')
      return
    }
    setThumb(imageUrl)

    async function run() {
      const quality = localStorage.getItem('sm_scan_quality') ?? 'medium'

      try {
        setStep(0)
        const blob = await (await fetch(imageUrl!)).blob()
        const fd = new FormData()
        fd.append('file', blob, 'receipt.jpg')
        fd.append('quality', quality)

        const corners = sessionStorage.getItem('sm_corners')
        if (corners) fd.append('corners', corners)

        setStep(1)
        const resp = await fetch(`${SCAN_API}/extract`, { method: 'POST', body: fd })
        if (!resp.ok) throw new Error(`Extract returned ${resp.status}`)
        const data = await resp.json()

        setStep(2)

        const lineItems: LineItem[] = Array.isArray(data.line_items)
          ? data.line_items.map((i: Record<string, unknown>) => ({
              description: String(i.description ?? ''),
              quantity: toNumber(i.quantity) ?? 1,
              unit_price: toNumber(i.unit_price),
              line_total: toNumber(i.line_total),
            }))
          : []

        draftStore.set({
          vendor: data.vendor ?? null,
          purchase_date: data.purchase_date ?? null,
          subtotal: toNumber(data.subtotal),
          tax: toNumber(data.tax),
          total: toNumber(data.total),
          currency: data.currency ?? 'USD',
          category: normalizeCategory(data.category),
          line_items: lineItems,
          image_url: data.image_url ? `${SCAN_API}${data.image_url}` : imageUrl,
          raw_extraction: data,
          extraction_provider: data.extraction_provider ?? null,
          extraction_model: data.extraction_model ?? null,
        })

        await delay(320)
        router.push('/results')
      } catch {
        // The photo is not lost: screen 05b opens so the user can key the
        // receipt in by hand or retry.
        draftStore.setFailed(emptyDraft(imageUrl))
        await delay(200)
        router.push('/results')
      } finally {
        sessionStorage.removeItem('sm_corners')
      }
    }

    run()
  }, [router])

  function statusOf(index: number): Status {
    if (index < step) return 'done'
    if (index === step) return 'active'
    return 'pending'
  }

  return (
    <div className="screen" style={{ alignItems: 'center' }}>
      <div className="placeholder-img" style={{ width: 96, height: 128, borderRadius: 8, marginTop: 48 }}>
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <>Receipt<br />photo</>
        )}
      </div>

      <div style={{ font: "600 18px/1.3 'Inter'", marginTop: 40 }}>Preparing your receipt</div>
      <div style={{ font: "400 13px/1.4 'Inter'", color: 'var(--muted)', marginTop: 6 }}>
        This usually takes a few seconds.
      </div>

      <div
        role="status"
        aria-live="polite"
        style={{ width: '100%', padding: '48px 32px 0', display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        {STEPS.map((label: Step, i) => {
          const status = statusOf(i)
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {status === 'done' && (
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', background: 'var(--ink)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
                }}>
                  <CheckIcon />
                </div>
              )}
              {status === 'active' && (
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--ink)',
                  borderRightColor: 'transparent', animation: 'spin 1s linear infinite', flex: 'none',
                }} />
              )}
              {status === 'pending' && (
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  border: '1.5px solid var(--line-2)', flex: 'none',
                }} />
              )}
              <div style={{
                font: `${status === 'active' ? 600 : 500} 15px/1.3 'Inter'`,
                color: status === 'pending' ? 'var(--disabled)' : 'var(--ink)',
              }}>
                {label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
