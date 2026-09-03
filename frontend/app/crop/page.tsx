'use client'

// Screen 04 — Manual corner adjustment

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Point = { x: number; y: number }
// Corner order is tl, tr, br, bl — the polygon is drawn in this order and the
// backend expects the same winding.
type Quad = [Point, Point, Point, Point]

const LOUPE = 92 // diameter of the magnifier
const ZOOM = 2.2

export default function CropPage() {
  const router = useRouter()
  const stageRef = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<string | null>(null)
  // Natural pixel dimensions of the photo. The stage is sized to this aspect
  // ratio so the rendered image fills it exactly — otherwise `contain`
  // letterboxes it and every corner we normalise against the stage is offset.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [quad, setQuad] = useState<Quad | null>(null)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('sm_image')
    if (!stored) {
      router.replace('/')
      return
    }
    setImage(stored)
  }, [router])

  // Seed the quad as an inset rectangle once we know the stage's real size.
  useEffect(() => {
    if (!image || !natural) return
    const el = stageRef.current
    if (!el) return

    function measure() {
      const r = el!.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
      setQuad(prev => {
        if (prev) return prev
        const ix = r.width * 0.14
        const iy = r.height * 0.1
        return [
          { x: ix, y: iy },
          { x: r.width - ix, y: iy },
          { x: r.width - ix, y: r.height - iy },
          { x: ix, y: r.height - iy },
        ]
      })
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [image, natural])

  function movePoint(index: number, clientX: number, clientY: number) {
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - r.left, 0), r.width)
    const y = Math.min(Math.max(clientY - r.top, 0), r.height)
    setQuad(prev => {
      if (!prev) return prev
      const next = [...prev] as Quad
      next[index] = { x, y }
      return next
    })
  }

  function onPointerDown(index: number) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      setActive(index)
      movePoint(index, e.clientX, e.clientY)
    }
  }

  function onPointerMove(index: number) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      if (active !== index) return
      movePoint(index, e.clientX, e.clientY)
    }
  }

  function confirm() {
    if (quad && size.w && size.h) {
      // Normalised so the backend can map the quad onto the full-resolution
      // image regardless of how large the stage rendered.
      sessionStorage.setItem(
        'sm_corners',
        JSON.stringify(quad.map(p => ({ x: p.x / size.w, y: p.y / size.h }))),
      )
    }
    router.push('/processing')
  }

  const points = quad ? quad.map(p => `${p.x},${p.y}`).join(' ') : ''
  const activePoint = active !== null && quad ? quad[active] : null

  return (
    <div className="screen screen-dark" style={{ background: '#232323', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px 0', textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <div style={{ font: "500 14px/1.4 'Inter'", color: '#fff' }}>
          Drag the corners to match the receipt edges.
        </div>
      </div>

      <div style={{
        flex: 1, margin: '20px 0', display: 'flex',
        alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '0 12px',
      }}>
        {/* Hidden probe: reads the photo's natural size before the stage renders. */}
        {image && !natural && (
          <img
            src={image}
            alt=""
            onLoad={e => setNatural({
              w: e.currentTarget.naturalWidth || 1,
              h: e.currentTarget.naturalHeight || 1,
            })}
            style={{ display: 'none' }}
          />
        )}

        <div
          ref={stageRef}
          style={{
            position: 'relative',
            touchAction: 'none',
            aspectRatio: natural ? `${natural.w} / ${natural.h}` : '3 / 4',
            maxWidth: '100%',
            maxHeight: '100%',
            width: natural && natural.w >= natural.h ? '100%' : undefined,
            height: natural && natural.h > natural.w ? '100%' : undefined,
          }}
        >
        {image && natural && (
          <img
            src={image}
            alt="Captured receipt"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
          />
        )}

        {quad && (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${size.w} ${size.h}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            <polygon points={points} fill="rgba(255,255,255,0.06)" stroke="#fff" strokeWidth="1.5" />
          </svg>
        )}

        {quad?.map((p, i) => {
          const isActive = active === i
          const d = isActive ? 28 : 22
          return (
            <div
              key={i}
              className="hit-44"
              role="slider"
              aria-label={['Top left', 'Top right', 'Bottom right', 'Bottom left'][i] + ' corner'}
              aria-valuenow={Math.round(p.x)}
              tabIndex={0}
              onPointerDown={onPointerDown(i)}
              onPointerMove={onPointerMove(i)}
              onPointerUp={() => setActive(null)}
              onPointerCancel={() => setActive(null)}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                width: d,
                height: d,
                border: `${isActive ? 2.5 : 2}px solid #fff`,
                background: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.35)',
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                cursor: 'grab',
                touchAction: 'none',
              }}
            />
          )
        })}

        {/* Loupe: shows the pixels under the finger, offset so the hand does
            not cover it. */}
        {activePoint && image && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(Math.max(activePoint.x - LOUPE / 2, 8), Math.max(size.w - LOUPE - 8, 8)),
              top: Math.max(activePoint.y - LOUPE - 28, 8),
              width: LOUPE,
              height: LOUPE,
              borderRadius: '50%',
              border: '2px solid #fff',
              background: '#2a2a2a',
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${image})`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: `${size.w * ZOOM}px ${size.h * ZOOM}px`,
                backgroundPosition: `${LOUPE / 2 - activePoint.x * ZOOM}px ${LOUPE / 2 - activePoint.y * ZOOM}px`,
              }}
            />
            <div style={{
              position: 'absolute', top: '50%', left: '50%', width: 1, height: 20,
              background: 'rgba(255,255,255,0.6)', transform: 'translate(-50%, -50%)',
            }} />
            <div style={{
              position: 'absolute', top: '50%', left: '50%', width: 20, height: 1,
              background: 'rgba(255,255,255,0.6)', transform: 'translate(-50%, -50%)',
            }} />
          </div>
        )}
        </div>
      </div>

      <div style={{ padding: '0 20px 32px', display: 'flex', gap: 12 }}>
        <button
          className="btn-secondary"
          onClick={() => router.push('/camera')}
          style={{ flex: 1, background: 'transparent', color: '#fff', borderColor: '#fff' }}
        >
          Retake
        </button>
        <button
          className="btn-primary"
          onClick={confirm}
          style={{ flex: 1.4, background: '#fff', color: 'var(--ink)' }}
        >
          Use this crop
        </button>
      </div>
    </div>
  )
}
