'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function login() {
    if (!email || !password) {
      setMessage('Enter your email and password.')
      return
    }

    setLoading(true)
    setMessage('Logging in...')

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    router.push('/admin')
  }

  return (
    <main className="login-page">
      <style jsx>{`
        .login-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.12), transparent 28%),
            radial-gradient(circle at bottom right, rgba(168,85,247,.18), transparent 32%),
            radial-gradient(circle at top, #15157a 0%, #06063d 45%, #02021f 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .card {
          width: 100%;
          max-width: 430px;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          border-radius: 26px;
          padding: 28px;
          box-shadow: 0 24px 70px rgba(0,0,0,.38);
          backdrop-filter: blur(10px);
        }

        .eyebrow {
          opacity: .72;
          font-size: .74rem;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 950;
          margin-bottom: 8px;
        }

        h1 {
          margin: 0 0 8px;
          font-size: 2.2rem;
          font-weight: 950;
          letter-spacing: -1px;
        }

        p {
          opacity: .82;
          margin: 0 0 22px;
          line-height: 1.5;
        }

        label {
          display: block;
          margin-bottom: 7px;
          opacity: .72;
          font-size: .76rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 950;
        }

        input {
          width: 100%;
          box-sizing: border-box;
          padding: 14px;
          margin-bottom: 14px;
          border-radius: 15px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(0,0,0,.28);
          color: white;
          font-size: .96rem;
          font-weight: 800;
          outline: none;
        }

        input:focus {
          border-color: rgba(192,132,252,.75);
          box-shadow: 0 0 0 4px rgba(124,58,237,.18);
        }

        button {
          width: 100%;
          padding: 14px;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          color: white;
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 14px 30px rgba(124,58,237,.34);
        }

        button:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        .message {
          margin-top: 14px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 14px;
          padding: 12px;
          opacity: .9;
          font-size: .9rem;
          font-weight: 800;
        }

        .home {
          display: inline-flex;
          margin-top: 16px;
          color: rgba(255,255,255,.78);
          text-decoration: none;
          font-weight: 900;
        }
      `}</style>

      <div className="card">
        <div className="eyebrow">Collectiverse Admin</div>
        <h1>Admin Login</h1>
        <p>Sign in to manage imports, breaks, featured hits and Vault data.</p>

        <label>Email</label>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label>Password</label>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') login()
          }}
        />

        <button disabled={loading} onClick={login}>
          {loading ? 'Logging in...' : 'Login'}
        </button>

        {message && <div className="message">{message}</div>}

        <Link className="home" href="/">
          ← Back to Vault Home
        </Link>
      </div>
    </main>
  )
}
