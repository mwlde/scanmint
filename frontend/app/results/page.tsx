'use client'


import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bookmark, BookmarkCheck, Download, FolderOpen, RotateCcw, Save, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { BottomNav } from '@/components/BottomNav'
import { scanStore, type ScanResult } from '@/lib/scanStore'
import { toggleSaved, getHistory } from '@/lib/history'
import { getFolders, addItemToFolder, type Folder } from '@/lib/folders'
import { useDogeMode } from '@/lib/useDogeMode'

const SLIDES = [
  { key: 'scan',             label: 'Final',     sub: 'Binarized scan'     },
  { key: 'warped',           label: 'Warped',    sub: 'Cropped & levelled' },
  { key: 'original',         label: 'Original',  sub: 'Input image'        },
  { key: 'detected_overlay', label: 'Detected',  sub: 'Document edge'      },
  { key: 'region_overlay',   label: 'Regions',   sub: 'Text segments'      },
] as const

function b64Src(b64: string) {
  return `data:image/png;base64,${b64}`
}

export default function ResultsPage() {
  const router = useRouter()
  const dogeMode = useDogeMode()
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [showSaveSheet, setShowSaveSheet] = useState(false)
  const [folderStep, setFolderStep] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  function handleCarouselScroll() {
    const el = carouselRef.current
    if (!el) return
    setActiveSlide(Math.round(el.scrollLeft / el.clientWidth))
  }

  useEffect(() => {
    const result = scanStore.getScan()
    if (!result) { router.replace('/'); return }
    setScan(result)
    // Reflect saved state if user navigated back to this screen
    const id = scanStore.getCurrentId()
    if (id) {
      const item = getHistory().find(i => i.id === id)
      setIsSaved(item?.saved ?? false)
    }
    setFolders(getFolders())
  }, [router])

  if (!scan) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#5684BC', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ minHeight: '100dvh', backgroundColor: '#F5F5F5' }}>
      <div className="h-11 flex-shrink-0" />

      {/* Header */}
      <div className="px-5 pt-3 pb-4 bg-white">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#888' }}>
          {dogeMode ? 'Sniff Result' : 'Scan Result'}
        </p>
        <h2 className="text-xl font-bold mt-0.5" style={{ color: '#1A1A1A' }}>
          {dogeMode ? 'Document Sniffed' : 'Document Analysis'}
        </h2>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 flex flex-col gap-4">

        {/* No-document warning */}
        {!scan.document_found && (
          <div className="flex gap-3 p-4 rounded-2xl" style={{ backgroundColor: '#FEF3E2' }}>
            <AlertTriangle size={18} style={{ color: '#F5A623', flexShrink: 0, marginTop: 1 }} />
            <p className="text-sm" style={{ color: '#F5A623' }}>
              No document boundary detected — full frame used as fallback.
            </p>
          </div>
        )}

        {/* Swipeable image carousel */}
        <div className="rounded-2xl overflow-hidden shadow-sm bg-white">
          {/* Scroll track */}
          <div
            ref={carouselRef}
            className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', height: '52vh' }}
            onScroll={handleCarouselScroll}
          >
            {SLIDES.map(({ key, label }) => {
              const src = scan[key as keyof ScanResult] as string | undefined
              return (
                <div
                  key={key}
                  className="flex-none w-full h-full flex items-center justify-center"
                  style={{ scrollSnapAlign: 'start', backgroundColor: '#F8F8F8' }}
                >
                  {src ? (
                    <img src={b64Src(src)} alt={label} className="w-full h-full object-contain" />
                  ) : (
                    <p className="text-xs" style={{ color: '#BBBBBB' }}>—</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Slide label + dot indicators */}
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: '#F0F0F0' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: '#1A1A1A' }}>
                {SLIDES[activeSlide].label}
              </p>
              <p className="text-xs" style={{ color: '#888' }}>
                {SLIDES[activeSlide].sub}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {SLIDES.map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 6,
                    width: i === activeSlide ? 18 : 6,
                    borderRadius: 3,
                    backgroundColor: i === activeSlide ? '#5684BC' : '#D8D8D8',
                    transition: 'all 0.2s',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Stat chips */}
        <div className="flex gap-2">
          {[
            { label: dogeMode ? 'Sniff Time' : 'Latency',  value: `${Math.round(scan.total_ms)} ms` },
            { label: 'Regions',  value: String(scan.regions.length) },
            {
              label: dogeMode ? 'Found it!' : 'Found',
              value: scan.document_found ? 'Yes' : 'No',
              icon: scan.document_found
                ? <CheckCircle2 size={12} style={{ color: '#3BB273' }} />
                : <XCircle size={12} style={{ color: '#D4183D' }} />,
            },
          ].map(({ label, value, icon }) => (
            <div
              key={label}
              className="flex-1 flex flex-col items-center py-3 rounded-2xl"
              style={{ backgroundColor: 'white' }}
            >
              <span className="text-xs" style={{ color: '#888' }}>{label}</span>
              <div className="flex items-center gap-1 mt-0.5">
                {icon}
                <span className="text-sm font-bold" style={{ color: '#1A1A1A' }}>{value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-2">
          <button
            onClick={() => router.push('/')}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-full font-semibold text-sm transition-all active:scale-95 border-2"
            style={{ borderColor: '#5684BC', color: '#5684BC' }}
          >
            <RotateCcw size={16} />
            {dogeMode ? 'Sniff Again' : 'Scan Again'}
          </button>
          <button
            onClick={() => setShowSaveSheet(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-full font-semibold text-sm text-white transition-all active:scale-95"
            style={{ backgroundColor: isSaved ? '#3BB273' : '#5684BC' }}
          >
            {isSaved ? <BookmarkCheck size={16} /> : <Save size={16} />}
            {isSaved
              ? (dogeMode ? <>Buried! <img src="/bone.png" alt="bone" style={{ width: 16, height: 16, display: 'inline-block', verticalAlign: 'middle' }} /></> : 'Saved!')
              : (dogeMode ? <>Bury Result <img src="/bone.png" alt="bone" style={{ width: 16, height: 16, display: 'inline-block', verticalAlign: 'middle' }} /></> : 'Save Result')}
          </button>
        </div>
      </div>

      {/* Save options sheet */}
      {showSaveSheet && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => { setShowSaveSheet(false); setFolderStep(false) }}
        >
          <div
            className="bg-white rounded-t-3xl px-5 pt-5 pb-10"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: '#E0E0E0' }} />

            {!folderStep ? (
              <>
                <h3 className="text-base font-bold mb-1" style={{ color: '#1A1A1A' }}>
                  {dogeMode ? <>Bury This Sniff <img src="/bone.png" alt="bone" style={{ width: 16, height: 16, display: 'inline-block', verticalAlign: 'middle' }} /></> : 'Save Scan'}
                </h3>
                <p className="text-sm mb-5" style={{ color: '#888' }}>
                  {dogeMode ? 'Where should this sniff go?' : 'Choose where to save this result.'}
                </p>

                <div className="flex flex-col gap-3">
                  {/* Save to App */}
                  <button
                    onClick={() => {
                      const id = scanStore.getCurrentId()
                      if (id && !isSaved) { toggleSaved(id); setIsSaved(true) }
                      if (folders.length > 0) {
                        setFolderStep(true)
                      } else {
                        setShowSaveSheet(false)
                        setToast(isSaved ? 'Already saved to app' : 'Saved to app')
                      }
                    }}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                    style={{ backgroundColor: '#EBF0F7' }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#5684BC' }}
                    >
                      {isSaved ? <BookmarkCheck size={20} color="white" /> : <Bookmark size={20} color="white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>
                        {dogeMode ? `Bury in App${isSaved ? ' ✓' : ''}` : `Save to App${isSaved ? ' ✓' : ''}`}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#8AA7CE' }}>
                        {dogeMode ? 'Hide the bone in your sniff log' : 'Bookmark in your scan history'}
                      </p>
                    </div>
                  </button>

                  {/* Save to Device */}
                  <button
                    onClick={() => {
                      if (!scan) return
                      const a = document.createElement('a')
                      a.href = `data:image/png;base64,${scan.scan}`
                      a.download = `scanmint_scan_${Date.now()}.png`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      setShowSaveSheet(false)
                      setToast('Saved to device')
                    }}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                    style={{ backgroundColor: '#F5F5F5' }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#1A1A1A' }}
                    >
                      <Download size={20} color="white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>Save to Device</p>
                      <p className="text-xs mt-0.5" style={{ color: '#888' }}>Download final scan as PNG</p>
                    </div>
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Folder assignment step */}
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={18} style={{ color: '#3BB273' }} />
                  <p className="text-base font-bold" style={{ color: '#1A1A1A' }}>Saved to app!</p>
                </div>
                <p className="text-sm mb-4" style={{ color: '#888' }}>Add to a folder? (optional)</p>

                <div className="flex flex-col gap-2 mb-4">
                  {folders.map(f => (
                    <button
                      key={f.id}
                      onClick={() => {
                        const id = scanStore.getCurrentId()
                        if (id) addItemToFolder(f.id, id)
                        setShowSaveSheet(false)
                        setFolderStep(false)
                        setToast(`Added to ${f.name}`)
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all active:scale-[0.98]"
                      style={{ backgroundColor: f.bg }}
                    >
                      <FolderOpen size={18} style={{ color: f.color }} />
                      <span className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>{f.name}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => { setShowSaveSheet(false); setFolderStep(false); setToast('Saved to app') }}
                  className="w-full py-2 text-sm font-semibold"
                  style={{ color: '#888' }}
                >
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <ToastBanner message={toast} onDone={() => setToast(null)} />
      )}

      <BottomNav />
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function ToastBanner({ message, onDone }: { message: string; onDone: () => void }) {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), 2500)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 flex justify-center pointer-events-none">
      <div
        className="px-5 py-3 rounded-2xl shadow-lg flex items-center gap-2"
        style={{ backgroundColor: '#1A1A1A', color: 'white' }}
      >
        <CheckCircle2 size={15} style={{ color: '#3BB273', flexShrink: 0 }} />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  )
}
