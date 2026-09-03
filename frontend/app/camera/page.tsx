'use client'

// Screen 02 — Camera

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AutoIcon, GalleryIcon } from '@/components/icons'

export default function CameraPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const captureRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const hasStarted = useRef(false)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // "Auto" goes straight to processing; "Manual" detours through the corner
  // adjustment screen first.
  const [auto, setAuto] = useState(true)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            videoRef.current!.play()
            setReady(true)
          }
        }
      })
      .catch(() => setError('Camera access denied. Allow camera permission, or upload a photo instead.'))

    return () => stop()
  }, [stop])

  function handOff(dataUrl: string) {
    sessionStorage.setItem('sm_image', dataUrl)
    stop()
    router.push(auto ? '/processing' : '/crop')
  }

  function capture() {
    const video = videoRef.current
    const canvas = captureRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    handOff(canvas.toDataURL('image/jpeg', 0.92))
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => handOff(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="screen screen-dark" style={{ position: 'relative', overflow: 'hidden' }}>
      <video ref={videoRef} playsInline muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Viewfinder texture stands in until the stream is live (and when the
          camera is unavailable), matching the design's dark field. */}
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'repeating-linear-gradient(45deg, #1a1a1a 0 20px, #1e1e1e 20px 21px)',
        }} />
      )}
      <canvas ref={captureRef} style={{ display: 'none' }} />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            aria-label="Cancel"
            onClick={() => { stop(); router.push('/') }}
            style={{
              background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff',
              font: "500 14px/1 'Inter'", padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => setAuto(a => !a)}
            aria-pressed={auto}
            style={{
              background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', padding: 8,
              borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center',
              gap: 6, font: "500 13px/1 'Inter'",
            }}
          >
            <AutoIcon />
            {auto ? 'Auto' : 'Manual'}
          </button>
        </div>

        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -55%)', width: 220, height: 340, zIndex: 2,
        }}>
          <div style={{
            width: '100%', height: '100%',
            border: '1.5px dashed rgba(255,255,255,0.55)', borderRadius: 4, position: 'relative',
          }}>
            {([
              { top: -1, left: -1, borderTop: '2px solid #fff', borderLeft: '2px solid #fff' },
              { top: -1, right: -1, borderTop: '2px solid #fff', borderRight: '2px solid #fff' },
              { bottom: -1, left: -1, borderBottom: '2px solid #fff', borderLeft: '2px solid #fff' },
              { bottom: -1, right: -1, borderBottom: '2px solid #fff', borderRight: '2px solid #fff' },
            ] as const).map((s, i) => (
              <div key={i} style={{ position: 'absolute', width: 22, height: 22, ...s }} />
            ))}
          </div>
          <div style={{
            textAlign: 'center', font: "400 12px/1.4 'Inter'",
            color: 'rgba(255,255,255,0.75)', marginTop: 14,
          }}>
            {error ?? 'Align receipt within the frame'}
          </div>
        </div>

        <div style={{
          marginTop: 'auto', padding: '0 32px 40px', position: 'relative', zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button
            aria-label="Upload from library"
            onClick={() => fileRef.current?.click()}
            style={{
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
              width: 48, height: 48, borderRadius: 12, display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <GalleryIcon />
          </button>
          <button
            aria-label="Capture"
            onClick={capture}
            disabled={!ready}
            style={{
              width: 76, height: 76, borderRadius: '50%', border: '3px solid #fff',
              background: 'transparent', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: ready ? 'pointer' : 'not-allowed',
              padding: 0, opacity: ready ? 1 : 0.4, transition: 'transform .12s',
            }}
          >
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fff' }} />
          </button>
          <div style={{ width: 48 }} />
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  )
}
