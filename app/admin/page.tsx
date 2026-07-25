'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import AdminGuard from './guard'

export default function AdminPage() {
  const router = useRouter()

  const [displayName, setDisplayName] = useState('Admin')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')

  useEffect(() => {
    async function loadAdminProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.email) return

      setEmail(user.email)

      const { data: profile } = await supabase
        .from('admin_profiles')
        .select('display_name, role')
        .eq('email', user.email)
        .maybeSingle()

      setDisplayName(profile?.display_name || user.email.split('@')[0] || 'Admin')
      setRole(profile?.role || '')
    }

    loadAdminProfile()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const isOwner = email.trim().toLowerCase() === 'collectiversetcg@gmail.com'

  const sections = [
    {
      title: 'Operations',
      cards: [
        ...(isOwner ? [{
          href: '/admin/performance',
          emoji: '👑',
          title: 'Business Performance',
          desc: 'Owner-only combined dashboard for Breaks, Singles, payruns, calendar and profit.',
          status: 'Owner Only',
        }] : []),
        {
          href: '/admin/import',
          emoji: '📥',
          title: 'Import CSV',
          desc: 'Upload Whatnot exports, preview breaks and import safely.',
          status: 'Live',
        },
        {
          href: '/admin/breaks',
          emoji: '📦',
          title: 'Breaks',
          desc: 'Manage breaks, mark hits, feature pulls and delete/duplicate breaks.',
          status: 'Live',
        },
        {
          href: '/admin/streams',
          emoji: '🎛️',
          title: 'Breaks Centre',
          desc: 'Break stock, purchases and stream entry.',
          status: 'Live',
        },
        {
          href: '/admin/singles',
          emoji: '🛒',
          title: 'Singles Centre',
          desc: 'Collections, tracked cards, sealed stock, giveaways and sales entry.',
          status: 'Live',
        },
      ],
    },
    {
      title: 'Community',
      cards: [
        {
          href: '/admin/collectors',
          emoji: '👥',
          title: 'Collectors',
          desc: 'Search collector profiles, vault history, spots and hits.',
          status: 'Coming Soon',
        },
        {
          href: '/admin/featured',
          emoji: '⭐',
          title: 'Featured Hits',
          desc: 'Manage homepage featured hits and future highlight carousels.',
          status: 'Coming Soon',
        },
        {
          href: 'https://vercel.com/dashboard',
          emoji: '📊',
          title: 'Analytics',
          desc: 'View traffic, beta usage, visitors and performance.',
          status: 'External',
          external: true,
        },
      ],
    },
    {
      title: 'Future Collectiverse',
      cards: [
        {
          href: '/admin/buy-cards',
          emoji: '💰',
          title: 'Buy Cards',
          desc: 'Future buylist/appraisal system for collectors selling cards.',
          status: 'Coming Soon',
        },
        {
          href: '/admin/singles',
          emoji: '🛒',
          title: 'Singles Store',
          desc: 'Future singles storefront and stock management tools.',
          status: 'Coming Soon',
        },
        {
          href: '/admin/settings',
          emoji: '⚙️',
          title: 'Settings',
          desc: 'Manage banners, demo settings, site messages and platform controls.',
          status: 'Coming Soon',
        },
      ],
    },
  ]

  return (
    <AdminGuard>
      <main className="admin-page">
        <style jsx global>{`
          .admin-page {
            min-height: 100vh;
            background: radial-gradient(circle at top, #15157a 0%, #06063d 45%, #02021f 100%);
            color: white;
            padding: 24px;
          }

          .wrap {
            max-width: 1120px;
            margin: 0 auto;
          }

          .top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 18px;
            margin-bottom: 24px;
          }

          .eyebrow {
            opacity: .7;
            font-size: .74rem;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 950;
            margin-bottom: 8px;
          }

          h1 {
            margin: 0;
            font-size: clamp(2.1rem, 5vw, 3.5rem);
            font-weight: 950;
            letter-spacing: -1px;
          }

          .welcome {
            margin-top: 8px;
            opacity: .85;
            font-weight: 800;
          }

          .email {
            margin-top: 5px;
            opacity: .62;
            font-size: .86rem;
            font-weight: 750;
          }

          .role {
            display: inline-block;
            margin-top: 10px;
            padding: 7px 11px;
            border-radius: 999px;
            background: rgba(250, 204, 21, .13);
            border: 1px solid rgba(250, 204, 21, .28);
            color: #fde68a;
            font-size: .75rem;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: .7px;
          }

          .actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            justify-content: flex-end;
          }

          .button {
            border: 1px solid rgba(255,255,255,.18);
            background: rgba(255,255,255,.08);
            color: white;
            border-radius: 999px;
            padding: 10px 14px;
            font-weight: 900;
            cursor: pointer;
            text-decoration: none;
          }

          .hero {
            border: 1px solid rgba(255,255,255,.14);
            background:
              radial-gradient(circle at top left, rgba(250,204,21,.14), transparent 30%),
              linear-gradient(135deg, rgba(124,58,237,.22), rgba(255,255,255,.06));
            border-radius: 26px;
            padding: 22px;
            margin-bottom: 28px;
            box-shadow: 0 18px 56px rgba(0,0,0,.30);
          }

          .hero-title {
            font-size: 1.35rem;
            font-weight: 950;
            margin-bottom: 7px;
          }

          .hero-copy {
            opacity: .82;
            font-weight: 750;
            line-height: 1.5;
            max-width: 760px;
          }

          .section {
            margin-top: 28px;
          }

          .section h2 {
            margin: 0 0 12px;
            font-size: 1.15rem;
            font-weight: 950;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
          }

          .card {
            min-height: 170px;
            display: block;
            color: white;
            text-decoration: none;
            border: 1px solid rgba(255,255,255,.14);
            background: rgba(255,255,255,.06);
            border-radius: 22px;
            padding: 18px;
            box-shadow: 0 16px 46px rgba(0,0,0,.24);
          }

          .card:hover {
            border-color: rgba(192,132,252,.55);
            background: rgba(124,58,237,.13);
          }

          .card-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin-bottom: 14px;
          }

          .emoji {
            font-size: 2rem;
          }

          .status {
            border: 1px solid rgba(255,255,255,.16);
            background: rgba(255,255,255,.08);
            border-radius: 999px;
            padding: 6px 9px;
            font-size: .68rem;
            font-weight: 950;
            color: rgba(255,255,255,.78);
          }

          .status.live {
            color: #bbf7d0;
            background: rgba(34,197,94,.14);
            border-color: rgba(74,222,128,.28);
          }

          .card-title {
            font-size: 1.08rem;
            font-weight: 950;
            margin-bottom: 7px;
          }

          .card-desc {
            color: rgba(255,255,255,.72);
            font-size: .88rem;
            line-height: 1.45;
            font-weight: 750;
          }

          @media (max-width: 860px) {
            .top {
              flex-direction: column;
            }

            .actions {
              justify-content: flex-start;
            }

            .grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>

        <div className="wrap">
          <div className="top">
            <div>
              <div className="eyebrow">Collectiverse Control Centre</div>
              <h1>Hello {displayName} 👋</h1>
              <div className="welcome">What would you like to manage today?</div>
              {email && <div className="email">{email}</div>}
              {role && <div className="role">{role}</div>}
            </div>

            <div className="actions">
              <Link className="button" href="/">
                🏠 Vault Home
              </Link>
              <button className="button" onClick={logout}>
                Sign Out
              </button>
            </div>
          </div>

          <section className="hero">
            <div className="hero-title">⚙️ Collectiverse Admin</div>
            <div className="hero-copy">
              Manage Break Vault operations now, with inventory, singles, buylist tools,
              collector profiles and platform settings ready to expand as Collectiverse grows.
            </div>
          </section>

          {sections.map((section) => (
            <section className="section" key={section.title}>
              <h2>{section.title}</h2>

              <div className="grid">
                {section.cards.map((card) =>
                  card.external ? (
                    <a
                      className="card"
                      key={card.title}
                      href={card.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="card-top">
                        <div className="emoji">{card.emoji}</div>
                        <div className="status">{card.status}</div>
                      </div>
                      <div className="card-title">{card.title}</div>
                      <div className="card-desc">{card.desc}</div>
                    </a>
                  ) : (
                    <Link className="card" key={card.title} href={card.href}>
                      <div className="card-top">
                        <div className="emoji">{card.emoji}</div>
                        <div className={`status ${card.status === 'Live' ? 'live' : ''}`}>
                          {card.status}
                        </div>
                      </div>
                      <div className="card-title">{card.title}</div>
                      <div className="card-desc">{card.desc}</div>
                    </Link>
                  )
                )}
              </div>
            </section>
          ))}
        </div>
      </main>
    </AdminGuard>
  )
}