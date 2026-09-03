'use client'

// Screen 08 — Auth. Magic link only, per the design ("One link, no password").

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AuthMark, BackIcon } from '@/components/icons'
import { supabase } from '@/lib/supabase'

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendMagicLink() {
    const address = email.trim()
    if (!address) return

    setSending(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/` },
      })
      if (error) throw error
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the link. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="screen">
      <div style={{ padding: '12px 20px 0' }}>
        <button aria-label="Back" onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}>
          <BackIcon />
        </button>
      </div>

      <div style={{ padding: '40px 24px 0' }}>
        <div style={{
          width: 48, height: 48, border: '1.5px solid var(--ink)', borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        }}>
          <AuthMark />
        </div>
        <h1 style={{ font: "700 26px/1.2 'Inter'", letterSpacing: '-0.01em', margin: 0 }}>
          Sign in or create an account
        </h1>
        <p style={{ font: "400 14px/1.5 'Inter'", color: 'var(--muted)', marginTop: 10 }}>
          Sync receipts across your phone and other devices. One link, no password.
        </p>
      </div>

      <div style={{ padding: '32px 24px 0' }}>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMagicLink()}
        />

        {sent && (
          <div role="status" style={{ font: "400 12.5px/1.5 'Inter'", color: 'var(--ink)', marginTop: 12 }}>
            Check your inbox — we sent a sign-in link to {email.trim()}.
          </div>
        )}
        {error && (
          <div role="alert" style={{ font: "400 12.5px/1.5 'Inter'", color: 'var(--ink)', marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 'auto', padding: '0 24px 32px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <button className="btn-primary" onClick={sendMagicLink} disabled={sending || !email.trim()}>
          {sending ? 'Sending…' : 'Send magic link'}
        </button>
        <button className="btn-link" onClick={() => router.push('/')}>Continue as guest</button>
        <p style={{
          font: "400 11.5px/1.5 'Inter'", color: 'var(--disabled)', textAlign: 'center',
          marginTop: 8, maxWidth: 300, marginLeft: 'auto', marginRight: 'auto',
        }}>
          We use your email only to sign you in. We never sell your data.
        </p>
      </div>
    </div>
  )
}
