// In-memory hand-off between /processing and /results.
// Module-level state survives client-side navigation but clears on a hard
// refresh, which is what we want: the review screen redirects home if it wakes
// up with nothing to review.

import type { ReceiptDraft } from './receipts'

let _draft: ReceiptDraft | null = null
let _failed = false
// Set when the review card is editing an already-saved receipt rather than a
// fresh scan, so Save updates in place instead of inserting a duplicate.
let _editingId: string | null = null

export const draftStore = {
  get: () => _draft,
  set: (d: ReceiptDraft) => {
    _draft = d
    _failed = false
    _editingId = null
  },
  setEditing: (id: string, d: ReceiptDraft) => {
    _draft = d
    _failed = false
    _editingId = id
  },
  editingId: () => _editingId,
  // Extraction failed: the review card still opens (screen 05b) so the user can
  // key the receipt in by hand instead of losing the photo.
  setFailed: (d: ReceiptDraft) => {
    _draft = d
    _failed = true
  },
  didFail: () => _failed,
  clear: () => {
    _draft = null
    _failed = false
    _editingId = null
  },
}

export function emptyDraft(imageUrl: string | null = null): ReceiptDraft {
  return {
    vendor: null,
    purchase_date: null,
    subtotal: null,
    tax: null,
    total: null,
    currency: 'USD',
    category: null,
    line_items: [],
    image_url: imageUrl,
  }
}
