'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function AdminPage() {
  const router = useRouter()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <AdminGuard>
      <main className="page">
        <style jsx>{`
          .page {
            min-height: 100vh;
            background: radial-gradient(circle at top, #15157a 0%, #06063d 45%, #02021f 100%);
            color: white;
            padding: 24px;
          }

          .wrap {
            max-width: 900px;
            margin: 0 auto;
          }

          .top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 28px;
          }

          h1 {
            margin: 0;
            font-size: clamp(2rem, 5vw, 3rem);
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
          }

          .card {
            display: block;
            border: 1px solid rgba(255,255,255,.16);
            background: rgba(255,255,255,.07);
            border-radius: 22px;
            padding: 22px;
            color: white;
            text-decoration: none;
            box-shadow: 0 18px 56px rgba(0,0,0,.28);
          }

          .card:hover {
            transform: translateY(-2px);
          }

          .emoji {
            font-size: 2rem;
            margin-bottom: 10px;
          }

          .title {
            font-size: 1.2rem;
            font-weight: 950;
          }

          .desc {
            margin-top: 6px;
            opacity: .78;
            font-size: .9rem;
          }

          button,
          .home {
            border: 1px solid rgba(255,255,255,.18);
            background: rgba(255,255,255,.08);
            color: white;
            border-radius: 999px;
            padding: 10px 14px;
            font-weight: 900;
            cursor: pointer;
            text-decoration: none;
          }

          .actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
          }
        `}</style>

        <div className="wrap">
          <div className="top">
            <div>
              <h1>⚙️ Collectiverse Admin</h1>
              <p>Manage imports, breaks and Vault data.</p>
            </div>

            <div className="actions">
              <Link className="home" href="/">
                🏠 Vault Home
              </Link>

              <button onClick={logout}>Sign Out</button>
            </div>
          </div>

          <div className="grid">
            <Link className="card" href="/admin/import">
              <div className="emoji">📥</div>
              <div className="title">Import CSV</div>
              <div className="desc">Upload Whatnot exports and create new breaks.</div>
            </Link>

            <Link className="card" href="/admin/breaks">
              <div className="emoji">📦</div>
              <div className="title">Breaks</div>
              <div className="desc">Manage breaks, hits, featured pulls and entries.</div>
            </Link>

            <a className="card" href="https://vercel.com/dashboard" target="_blank">
              <div className="emoji">📊</div>
              <div className="title">Analytics</div>
              <div className="desc">View traffic and beta usage in Vercel.</div>
            </a>
          </div>
        </div>
      </main>
    </AdminGuard>
  )
}