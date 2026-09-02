// scan history stored in localstorage
// only keeps a compressed thumbnail of the final scan, not all 6 pipeline stages
// storing full res images for every stage would blow the ~5mb localstorage quota pretty fast

export interface HistoryItem {
  id: string
  timestamp: number
  document_found: boolean
  thumbnail: string   // data:image/jpeg;base64,... at ≤600px, '' on failure
  saved: boolean
  quality?: string    // undefined for entries saved before v0.8
}

const KEY = 'ss_history'
const MAX_ITEMS = 50

// 𓆝 𓆟 𓆞 𓆟 𓆝 thumbnail

// takes the warped png from the scan result and encodes it as a tiny jpeg data url for display
// browser only bc it uses canvas, call inside useEffect or after a mount check
// returns an empty string on any failure so callers dont have to check for null
export async function createThumbnail(b64: string, maxDim = 600): Promise<string> {
  if (typeof window === 'undefined') return ''
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => resolve('')
    img.src = `data:image/png;base64,${b64}`
  })
}

// 𓆝 𓆟 𓆞 𓆟 𓆝 crud

export function getHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

// writes to localstorage, if we hit the storage quota we drop the oldest half and retry
// avoids crashing on devices with full storage
function persist(items: HistoryItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    const trimmed = items.slice(0, Math.floor(items.length / 2))
    try { localStorage.setItem(KEY, JSON.stringify(trimmed)) } catch { /* give up */ }
  }
}

// adds a new item to the front and trims to MAX_ITEMS
export function addHistoryItem(item: HistoryItem): void {
  persist([item, ...getHistory()].slice(0, MAX_ITEMS))
}

// flips the saved flag and returns the new value
export function toggleSaved(id: string): boolean {
  const items = getHistory()
  const idx = items.findIndex(i => i.id === id)
  if (idx < 0) return false
  items[idx].saved = !items[idx].saved
  persist(items)
  return items[idx].saved
}

export function deleteItem(id: string): void {
  persist(getHistory().filter(i => i.id !== id))
}

export function clearHistory(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
