// in memory store for the current scan results
// we cant use sessionStorage bc 6 base64 images at full res would blow the 5mb quota
// module level vars survive client side navigation but clear on hard refresh
// thats fine bc the results page checks if the store is empty and redirects home if so
export interface ScanResult {
  document_found: boolean
  original: string
  enhanced: string
  detected_overlay: string
  warped: string
  scan: string
  region_overlay: string
  regions: Array<{ x: number; y: number; w: number; h: number }>
  timings_ms: Record<string, number>
  total_ms: number
}

let _scan: ScanResult | null = null
let _currentId: string | null = null

// simple object with getters/setters so any page can read or update the scan result
export const scanStore = {
  getScan:      ()              => _scan,
  getCurrentId: ()              => _currentId,
  setScan:      (r: ScanResult) => { _scan = r },
  setCurrentId: (id: string)    => { _currentId = id },
  clear:        ()              => { _scan = null; _currentId = null },
}
