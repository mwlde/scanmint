// Receipt storage. Two backends behind one interface:
//
//   signed in -> Supabase (receipts + receipt_line_items, images in the
//                private receipt-images bucket)
//   guest     -> localStorage
//
// The RLS policies in the initial migration are all `to authenticated`, so a
// guest genuinely cannot write to Postgres. Guest-first is a product
// requirement though, hence the local mirror. Both paths return the same
// Receipt shape so no screen has to know which one it is talking to.

import { supabase } from './supabase'

export const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]

export interface LineItem {
  description: string
  quantity: number
  unit_price: number | null
  line_total: number | null
}

// What the review card edits, before anything is persisted.
export interface ReceiptDraft {
  vendor: string | null
  purchase_date: string | null // YYYY-MM-DD
  subtotal: number | null
  tax: number | null
  total: number | null // null until the user supplies one; required to save
  currency: string
  category: Category | null
  line_items: LineItem[]
  image_url: string | null // served by the scan API, pre-save
  raw_extraction?: unknown
  extraction_provider?: string | null
  extraction_model?: string | null
}

export interface Receipt extends Omit<ReceiptDraft, 'total'> {
  id: string
  total: number
  image_path: string
  created_at: string
}

const GUEST_KEY = 'sm_receipts'
const BUCKET = 'receipt-images'

// ── Helpers ──────────────────────────────────────────────────────────────────

// The extractor is free to return any category string (the current stub says
// "Dining"). Map onto the five the design offers rather than showing a chip
// that does not exist.
const CATEGORY_ALIASES: Record<string, Category> = {
  dining: 'Food',
  restaurant: 'Food',
  restaurants: 'Food',
  groceries: 'Food',
  grocery: 'Food',
  food: 'Food',
  cafe: 'Food',
  coffee: 'Food',
  transport: 'Transport',
  transportation: 'Transport',
  travel: 'Transport',
  rideshare: 'Transport',
  fuel: 'Transport',
  gas: 'Transport',
  shopping: 'Shopping',
  retail: 'Shopping',
  clothing: 'Shopping',
  bills: 'Bills',
  utilities: 'Bills',
  utility: 'Bills',
  subscription: 'Bills',
}

export function normalizeCategory(raw: unknown): Category | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const key = raw.trim().toLowerCase()
  const exact = CATEGORIES.find(c => c.toLowerCase() === key)
  if (exact) return exact
  return CATEGORY_ALIASES[key] ?? 'Other'
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    // Unknown currency code — fall back rather than throwing mid-render.
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return { from: `${year}-${pad(month)}-01`, to: `${nextYear}-${pad(nextMonth)}-01` }
}

// The month total is summed from the rows the list already fetched rather than
// read from the monthly_totals view: one round trip instead of two, and it
// behaves identically for guests, who have no view to read.
export function sumTotal(receipts: Receipt[]): number {
  return receipts.reduce((acc, r) => acc + (r.total ?? 0), 0)
}

// Shrink a captured photo before it goes into localStorage. Full-resolution
// data URLs blow the ~5MB quota after a handful of receipts.
async function downscale(src: string, maxDim = 700): Promise<string> {
  if (typeof window === 'undefined') return ''
  return new Promise(resolve => {
    const img = new Image()
    // The flattened image is served by the scan API on another origin. Without
    // this the canvas is tainted and toDataURL throws; with it we at least get
    // a usable bitmap when the API sends CORS headers.
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        // Tainted canvas (no CORS headers). The receipt saves without its
        // thumbnail rather than the save hanging on an unresolved promise.
        resolve('')
      }
    }
    img.onerror = () => resolve('')
    img.src = src
  })
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  } catch {
    // No Supabase configured (or offline) — treat as guest rather than failing
    // the whole screen.
    return null
  }
}

// ── Guest store ──────────────────────────────────────────────────────────────

function readGuest(): Receipt[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeGuest(rows: Receipt[]): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(rows))
  } catch {
    /* quota exceeded — the receipt stays in memory for this session only */
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listReceipts(year: number, month: number): Promise<Receipt[]> {
  const userId = await currentUserId()
  const { from, to } = monthRange(year, month)

  if (!userId) {
    return readGuest()
      .filter(r => r.purchase_date && r.purchase_date >= from && r.purchase_date < to)
      .sort((a, b) => (a.purchase_date! < b.purchase_date! ? 1 : -1))
  }

  const { data, error } = await supabase
    .from('receipts')
    .select('*, receipt_line_items(*)')
    .eq('status', 'confirmed')
    .gte('purchase_date', from)
    .lt('purchase_date', to)
    .order('purchase_date', { ascending: false })

  if (error) throw error
  return (data ?? []).map(rowToReceipt)
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const userId = await currentUserId()

  if (!userId) return readGuest().find(r => r.id === id) ?? null

  const { data, error } = await supabase
    .from('receipts')
    .select('*, receipt_line_items(*)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ? rowToReceipt(data) : null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToReceipt(row: any): Receipt {
  const items: LineItem[] = (row.receipt_line_items ?? [])
    .slice()
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map((i: any) => ({
      description: i.description ?? '',
      quantity: Number(i.quantity ?? 1),
      unit_price: toNumber(i.unit_price),
      line_total: toNumber(i.line_total),
    }))

  return {
    id: row.id,
    vendor: row.vendor,
    purchase_date: row.purchase_date,
    subtotal: toNumber(row.subtotal),
    tax: toNumber(row.tax),
    total: Number(row.total),
    currency: row.currency ?? 'USD',
    category: normalizeCategory(row.category),
    line_items: items,
    image_path: row.image_path,
    image_url: null, // resolved lazily; the bucket is private
    created_at: row.created_at,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Guest images are stored inline as data URLs. Supabase images live in a
// private bucket and need a short-lived signed URL.
export async function receiptImageUrl(receipt: Receipt): Promise<string | null> {
  if (!receipt.image_path) return null
  if (receipt.image_path.startsWith('data:')) return receipt.image_path

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(receipt.image_path, 60 * 60)

  if (error) return null
  return data?.signedUrl ?? null
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function saveReceipt(draft: ReceiptDraft): Promise<Receipt> {
  if (draft.total === null) throw new Error('A total is required to save a receipt.')

  const userId = await currentUserId()
  const items = draft.line_items.filter(i => i.description.trim() || i.line_total !== null)

  if (!userId) {
    const receipt: Receipt = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      vendor: draft.vendor,
      purchase_date: draft.purchase_date,
      subtotal: draft.subtotal,
      tax: draft.tax,
      total: draft.total,
      currency: draft.currency,
      category: draft.category,
      line_items: items,
      image_path: draft.image_url ? await downscale(draft.image_url) : '',
      image_url: null,
      created_at: new Date().toISOString(),
    }
    writeGuest([receipt, ...readGuest()])
    return receipt
  }

  // Signed in: push the flattened image into the private bucket, then insert.
  let imagePath = ''
  if (draft.image_url) {
    try {
      const blob = await (await fetch(draft.image_url)).blob()
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type || 'image/png',
        upsert: false,
      })
      if (!error) imagePath = path
    } catch {
      // Image upload is best-effort: a receipt without its photo is still
      // worth keeping, and image_path is the only NOT NULL text column here.
    }
  }

  const { data, error } = await supabase
    .from('receipts')
    .insert({
      user_id: userId,
      image_path: imagePath,
      vendor: draft.vendor,
      purchase_date: draft.purchase_date,
      subtotal: draft.subtotal,
      tax: draft.tax,
      total: draft.total,
      currency: draft.currency,
      category: draft.category,
      raw_extraction: draft.raw_extraction ?? null,
      extraction_provider: draft.extraction_provider ?? null,
      extraction_model: draft.extraction_model ?? null,
      status: 'confirmed',
    })
    .select()
    .single()

  if (error) throw error

  if (items.length) {
    const { error: itemsError } = await supabase.from('receipt_line_items').insert(
      items.map((i, position) => ({
        receipt_id: data.id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        line_total: i.line_total,
        position,
      })),
    )
    if (itemsError) throw itemsError
  }

  return { ...rowToReceipt(data), line_items: items }
}

export async function deleteReceipt(id: string): Promise<void> {
  const userId = await currentUserId()

  if (!userId) {
    writeGuest(readGuest().filter(r => r.id !== id))
    return
  }

  // receipt_line_items cascades on delete, but storage objects do not -- a Postgres
  // cascade cannot reach the bucket. Read the path before deleting the row, or it is
  // gone and the image is orphaned in a private bucket forever.
  const { data: row } = await supabase
    .from('receipts')
    .select('image_path')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('receipts').delete().eq('id', id)
  if (error) throw error

  // Best-effort, and only after the row is gone: the user asked for the receipt to
  // be deleted, and a failure to tidy the bucket should not resurrect it in the UI.
  //
  // Failures are log-only for MVP -- we accept the drift rather than blocking a
  // delete on it. The tag below is the grep handle: if someone ever reports "I
  // deleted this and the image is still somewhere", search RECEIPT_IMAGE_ORPHANED
  // for the receipt id. Note this runs in the browser, so the line lands in the
  // user's console, not a server log -- knowing the real failure RATE needs
  // telemetry, and reconciling the bucket against receipts.image_path needs a
  // background job. Both are deliberate non-goals right now.
  if (row?.image_path && !row.image_path.startsWith('data:')) {
    const { data: removed, error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([row.image_path])

    if (storageError) {
      console.warn(
        `RECEIPT_IMAGE_ORPHANED receipt=${id} path=${row.image_path} reason=${storageError.message}`,
      )
    } else if (!removed || removed.length === 0) {
      // remove() reports no error for a path that was not there; the row is still
      // deleted, but nothing was cleaned up and we should not pretend otherwise.
      console.warn(
        `RECEIPT_IMAGE_ORPHANED receipt=${id} path=${row.image_path} reason=no-object-removed`,
      )
    }
  }
}

export async function updateReceipt(id: string, draft: ReceiptDraft): Promise<Receipt> {
  if (draft.total === null) throw new Error('A total is required to save a receipt.')

  const userId = await currentUserId()
  const items = draft.line_items.filter(i => i.description.trim() || i.line_total !== null)

  if (!userId) {
    const rows = readGuest()
    const index = rows.findIndex(r => r.id === id)
    if (index === -1) throw new Error('Receipt not found.')
    const updated: Receipt = {
      ...rows[index],
      vendor: draft.vendor,
      purchase_date: draft.purchase_date,
      subtotal: draft.subtotal,
      tax: draft.tax,
      total: draft.total,
      currency: draft.currency,
      category: draft.category,
      line_items: items,
    }
    rows[index] = updated
    writeGuest(rows)
    return updated
  }

  const { data, error } = await supabase
    .from('receipts')
    .update({
      vendor: draft.vendor,
      purchase_date: draft.purchase_date,
      subtotal: draft.subtotal,
      tax: draft.tax,
      total: draft.total,
      currency: draft.currency,
      category: draft.category,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  // Line items have no stable client-side identity, so the edit replaces the
  // set rather than diffing it.
  const { error: clearError } = await supabase.from('receipt_line_items').delete().eq('receipt_id', id)
  if (clearError) throw clearError

  if (items.length) {
    const { error: insertError } = await supabase.from('receipt_line_items').insert(
      items.map((i, position) => ({
        receipt_id: id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        line_total: i.line_total,
        position,
      })),
    )
    if (insertError) throw insertError
  }

  return { ...rowToReceipt(data), line_items: items }
}
