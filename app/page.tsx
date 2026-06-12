'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

function getTierStyle(tier: string | null) {
  const cleanTier = String(tier || '').toLowerCase().trim()

  switch (cleanTier) {
    case 'sir':
      return { label: 'SIR', className: 'tier-sir', color: '#facc15' }
    case 'gold':
      return { label: 'GOLD', className: 'tier-gold', color: '#facc15' }
    case 'mar':
      return { label: 'MAR', className: 'tier-mar', color: '#38bdf8' }
    case 'ir':
      return { label: 'IR', className: 'tier-ir', color: '#fb7185' }
    case 'sr':
      return { label: 'SR', className: 'tier-sr', color: '#c084fc' }
    case 'ex':
      return { label: 'EX', className: 'tier-ex', color: '#60a5fa' }
    default:
      return {
        label: cleanTier ? cleanTier.toUpperCase().replaceAll('_', ' ') : '',
        className: 'tier-default',
        color: '#facc15',
      }
  }
}

export default function HomePage() {
  const [username, setUsername] = useState('')
  const [featuredHit, setFeaturedHit] = useState<any>(null)
  const router = useRouter()

  function searchVault() {
    if (!username.trim()) return
    router.push(`/collector/${username.trim()}`)
  }

  async function loadFeaturedHit() {
    const { data } = await supabase
      .from('entries')
      .select('*')
      .eq('featured_hit', true)
      .eq('is_hit', true)
      .order('revealed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) {
      setFeaturedHit(null)
      return
    }

    const { data: collector } = await supabase
      .from('collectors')
      .select('whatnot_name')
      .eq('id', data.collector_id)
      .single()

    const { data: breakData } = await supabase
      .from('breaks')
      .select('stream_datetime')
      .eq('id', data.break_id)
      .single()

    setFeaturedHit({
      ...data,
      collector_name: collector?.whatnot_name,
      stream_datetime: breakData?.stream_datetime,
    })
  }

  useEffect(() => {
    loadFeaturedHit()
  }, [])

  const tier = getTierStyle(featuredHit?.hit_tier || null)
  const showCosmic = ['ir', 'mar', 'gold', 'sir'].includes(
    String(featuredHit?.hit_tier || '').toLowerCase()
  )

  return (
    <main className="page">
      <style jsx>{`
        .page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top, rgba(68,68,190,.95) 0%, rgba(7,7,66,.98) 42%, #02021f 100%);
          color: white;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 18px 18px 28px;
          overflow-x: hidden;
        }

        .wrap {
  width: 100%;
  max-width: 620px;
  text-align: center;
  transform: translateY(-180px);
}

        .logo {
          width: 100%;
          max-width: 300px;
          height: auto;
          margin: 0 auto -74px;
          display: block;
          filter: drop-shadow(0 14px 32px rgba(0,0,0,.42));
        }

        .featured {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          border-radius: 22px;
          padding: 16px;
          margin: 0 0 12px;
          width: 100%;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.07);
          box-shadow: 0 14px 46px rgba(0,0,0,.32);
        }

        .featured::before {
          content: '';
          position: absolute;
          inset: -3px;
          z-index: -2;
          border-radius: 26px;
          opacity: .9;
        }

        .featured::after {
          content: '';
          position: absolute;
          top: -10%;
          left: -85%;
          width: 65%;
          height: 120%;
          transform: skewX(-18deg);
          z-index: -1;
          opacity: .45;
        }

        .featured-content {
          position: relative;
          z-index: 2;
        }

        .featured-label {
          color: #facc15;
          font-size: .72rem;
          font-weight: 950;
          letter-spacing: 2px;
          margin-bottom: 8px;
          text-shadow: 0 0 18px rgba(250,204,21,.45);
        }

        .hit-name {
          margin: 0;
          font-size: clamp(1.45rem, 3.2vw, 2.35rem);
          font-weight: 950;
          line-height: 1.08;
          text-transform: uppercase;
          text-shadow: 0 8px 28px rgba(0,0,0,.45);
        }

        .tier-badge {
          display: inline-block;
          margin-top: 10px;
          padding: 7px 18px;
          border-radius: 999px;
          font-size: .78rem;
          font-weight: 950;
          letter-spacing: 1.6px;
          color: #050505;
          background: white;
          box-shadow:
            0 8px 30px rgba(0,0,0,.3),
            inset 0 1px 0 rgba(255,255,255,.65);
        }

        .featured-text {
          opacity: .94;
          font-size: .82rem;
          margin-top: 10px;
          line-height: 1.45;
        }

        .search-card {
          border: 1px solid rgba(255,255,255,.15);
          background: rgba(255,255,255,.06);
          border-radius: 20px;
          padding: 18px;
          box-shadow: 0 18px 60px rgba(0,0,0,.3);
          backdrop-filter: blur(12px);
        }

        .search-card h1 {
          font-size: 1.8rem;
          margin: 0 0 6px;
          letter-spacing: 2px;
          font-weight: 900;
        }

        .search-card p {
          opacity: .85;
          margin: 0 0 18px;
          font-size: .9rem;
          line-height: 1.5;
        }

        .input {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.2);
          background: rgba(0,0,0,.35);
          color: white;
          margin-bottom: 12px;
          font-size: .92rem;
          outline: none;
        }

        .button {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          color: white;
          font-weight: 900;
          cursor: pointer;
          font-size: .92rem;
          letter-spacing: 1px;
          box-shadow: 0 12px 30px rgba(124,58,237,.45);
        }

        .cosmic-stars,
        .planet-field,
        .rocket-field {
          pointer-events: none;
          position: absolute;
          inset: 0;
          overflow: hidden;
          z-index: 1;
        }

        .cosmic-stars span {
          position: absolute;
          color: rgba(255,255,255,.9);
          text-shadow: 0 0 14px rgba(125,211,252,.95);
          animation: starDrift 4s infinite ease-in-out;
        }

        .cosmic-stars span:nth-child(1) { top: 15%; left: 10%; animation-delay: 0s; }
        .cosmic-stars span:nth-child(2) { top: 72%; left: 18%; animation-delay: .7s; }
        .cosmic-stars span:nth-child(3) { top: 20%; right: 14%; animation-delay: 1.2s; }
        .cosmic-stars span:nth-child(4) { bottom: 16%; right: 18%; animation-delay: 1.8s; }

        .planet-field span {
          position: absolute;
          font-size: 1.25rem;
          filter: drop-shadow(0 0 12px rgba(250,204,21,.8));
          opacity: .8;
        }

        .planet-field span:nth-child(1) {
          top: 18%;
          left: -10%;
          animation: planetFlyOne 6s infinite linear;
        }

        .planet-field span:nth-child(2) {
          top: 62%;
          right: -10%;
          animation: planetFlyTwo 7s infinite linear;
        }

        .planet-field span:nth-child(3) {
          bottom: 18%;
          left: -12%;
          animation: planetFlyThree 8s infinite linear;
        }

        .rocket-field span {
          position: absolute;
          font-size: 1.35rem;
          filter: drop-shadow(0 0 12px rgba(255,255,255,.8));
        }

        .rocket-field span:nth-child(1) {
          top: 22%;
          left: -15%;
          animation: rocketFlyOne 3.2s infinite ease-in-out;
        }

        .rocket-field span:nth-child(2) {
          bottom: 24%;
          right: -15%;
          transform: rotate(180deg);
          animation: rocketFlyTwo 3.8s infinite ease-in-out;
        }

        .rocket-field span:nth-child(3) {
          top: 58%;
          left: -15%;
          animation: cometFly 4.5s infinite ease-in-out;
        }

        .tier-default::before {
          background: linear-gradient(135deg, rgba(250,204,21,.25), rgba(168,85,247,.12));
        }

        .tier-ex {
          border: 1px solid rgba(96,165,250,.5);
          box-shadow:
            0 0 26px rgba(96,165,250,.45),
            0 0 52px rgba(96,165,250,.18);
          animation: exPulse 2.8s ease-in-out infinite;
        }

        .tier-ex::before {
          background: linear-gradient(135deg, rgba(96,165,250,.38), rgba(255,255,255,.07));
        }

        .tier-ex::after {
          background: linear-gradient(90deg, transparent, rgba(147,197,253,.5), transparent);
          animation: slowSweep 4.2s infinite;
        }

        .tier-sr {
          border: 1px solid rgba(192,132,252,.55);
          box-shadow:
            0 0 32px rgba(192,132,252,.5),
            0 0 70px rgba(168,85,247,.22);
          animation: srPulse 2.5s ease-in-out infinite;
        }

        .tier-sr::before {
          background: linear-gradient(135deg, rgba(192,132,252,.42), rgba(59,130,246,.12));
        }

        .tier-sr::after {
          background: linear-gradient(90deg, transparent, rgba(216,180,254,.6), transparent);
          animation: slowSweep 3.8s infinite;
        }

        .tier-ir {
          border: 1px solid rgba(251,113,133,.68);
          box-shadow:
            0 0 36px rgba(251,113,133,.55),
            0 0 75px rgba(244,63,94,.28),
            inset 0 0 30px rgba(251,113,133,.08);
          animation: irOrbit 2.8s ease-in-out infinite;
        }

        .tier-ir::before {
          background:
            radial-gradient(circle at 20% 20%, rgba(255,255,255,.14), transparent 22%),
            linear-gradient(135deg, rgba(251,113,133,.5), rgba(168,85,247,.16));
        }

        .tier-ir::after {
          background: linear-gradient(90deg, transparent, rgba(251,113,133,.75), rgba(255,255,255,.45), transparent);
          animation: fastSweep 2.9s infinite;
        }

        .tier-mar {
          border: 2px solid rgba(56,189,248,.78);
          background:
            radial-gradient(circle at 18% 28%, rgba(255,255,255,.18), transparent 24%),
            radial-gradient(circle at 82% 72%, rgba(56,189,248,.16), transparent 28%),
            rgba(255,255,255,.08);
          box-shadow:
            0 0 42px rgba(56,189,248,.58),
            0 0 90px rgba(14,165,233,.3),
            inset 0 0 42px rgba(56,189,248,.12);
          animation: marCosmicFloat 2.4s ease-in-out infinite;
        }

        .tier-mar::before {
          background:
            radial-gradient(circle at 25% 35%, rgba(255,255,255,.8) 0 1px, transparent 2px),
            radial-gradient(circle at 70% 25%, rgba(255,255,255,.7) 0 1px, transparent 2px),
            radial-gradient(circle at 82% 78%, rgba(255,255,255,.65) 0 1px, transparent 2px),
            linear-gradient(135deg, rgba(56,189,248,.5), rgba(168,85,247,.2));
          animation: starTwinkle 2.1s ease-in-out infinite;
        }

        .tier-mar::after {
          background: linear-gradient(90deg, transparent, rgba(125,211,252,.85), rgba(255,255,255,.55), transparent);
          animation: fastSweep 2.5s infinite;
        }

        .tier-gold {
          border: 2px solid rgba(250,204,21,.86);
          background:
            radial-gradient(circle at top left, rgba(255,255,255,.14), transparent 30%),
            linear-gradient(135deg, rgba(250,204,21,.16), rgba(168,85,247,.14), rgba(255,255,255,.06));
          box-shadow:
            0 0 38px rgba(250,204,21,.48),
            0 0 82px rgba(168,85,247,.28),
            inset 0 0 38px rgba(250,204,21,.12);
          animation: goldPremiumFloat 2.2s ease-in-out infinite;
        }

        .tier-gold::before {
          background:
            radial-gradient(circle at 18% 24%, rgba(255,255,255,.2), transparent 20%),
            linear-gradient(135deg, rgba(250,204,21,.4), rgba(168,85,247,.24), rgba(255,255,255,.08));
        }

        .tier-gold::after {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.85), rgba(250,204,21,.72), transparent);
          animation: goldSweep 2.3s infinite;
        }

        .tier-sir {
          border: 2px solid rgba(255,255,255,.32);
          background:
            radial-gradient(circle at top left, rgba(255,255,255,.14), transparent 28%),
            linear-gradient(135deg, rgba(255,0,76,.10), rgba(255,176,0,.10), rgba(0,240,255,.08), rgba(139,92,246,.12));
          box-shadow:
            0 0 28px rgba(255,176,0,.35),
            0 0 58px rgba(168,85,247,.25),
            0 0 80px rgba(34,211,238,.18),
            inset 0 0 36px rgba(255,255,255,.06);
          animation: sirLegendaryFloat 2.2s ease-in-out infinite;
        }

        .tier-sir::before {
          background: linear-gradient(
            120deg,
            rgba(255,0,76,.35),
            rgba(255,176,0,.35),
            rgba(255,247,0,.28),
            rgba(0,240,255,.28),
            rgba(139,92,246,.35),
            rgba(255,0,76,.35)
          );
          animation: rainbowBorder 4.5s linear infinite;
        }

        .tier-sir::after {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.86), rgba(255,176,0,.55), transparent);
          animation: sirSweep 2.4s infinite;
        }

        .tier-gold .tier-badge {
          background: linear-gradient(135deg, #fff7ad, #facc15, #b45309) !important;
          color: #1f1300;
        }

        .tier-sir .tier-badge {
          background: linear-gradient(135deg, #ff004c, #ffb000, #fff700, #00f0ff, #8b5cf6) !important;
          color: #160018;
        }

        .tier-mar .tier-badge {
          background: linear-gradient(135deg, #e0f2fe, #38bdf8, #8b5cf6) !important;
          color: #02111f;
        }

        @keyframes starDrift {
          0%, 100% { transform: translateY(0) scale(.9); opacity: .35; }
          50% { transform: translateY(-8px) scale(1.25); opacity: 1; }
        }

        @keyframes slowSweep {
          0% { left: -85%; }
          60% { left: 130%; }
          100% { left: 130%; }
        }

        @keyframes fastSweep {
          0% { left: -85%; opacity: 0; }
          18% { opacity: .75; }
          50% { left: 130%; opacity: 0; }
          100% { left: 130%; opacity: 0; }
        }

        @keyframes goldSweep {
          0% { left: -90%; opacity: 0; }
          18% { opacity: .95; }
          54% { left: 135%; opacity: 0; }
          100% { left: 135%; opacity: 0; }
        }

        @keyframes sirSweep {
          0% { left: -95%; opacity: 0; }
          16% { opacity: .85; }
          52% { left: 135%; opacity: 0; }
          100% { left: 135%; opacity: 0; }
        }

        @keyframes exPulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.005); filter: brightness(1.15); }
        }

        @keyframes srPulse {
          0%, 100% { transform: scale(1); filter: saturate(1); }
          50% { transform: scale(1.008); filter: saturate(1.35); }
        }

        @keyframes irOrbit {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1); }
          50% { transform: translateY(-2px) scale(1.01); filter: brightness(1.15); }
        }

        @keyframes marCosmicFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.05); }
          50% { transform: translateY(-3px) scale(1.014); filter: brightness(1.2) saturate(1.25); }
        }

        @keyframes starTwinkle {
          0%, 100% { opacity: .55; filter: brightness(1); }
          50% { opacity: .95; filter: brightness(1.45); }
        }

        @keyframes goldPremiumFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.05); }
          50% { transform: translateY(-4px) scale(1.016); filter: brightness(1.28) saturate(1.3); }
        }

        @keyframes sirLegendaryFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.12); }
          50% { transform: translateY(-5px) scale(1.022); filter: brightness(1.25) saturate(1.45); }
        }

        @keyframes rainbowBorder {
          0% { filter: hue-rotate(0deg) saturate(1.25); }
          100% { filter: hue-rotate(360deg) saturate(1.25); }
        }

        @keyframes planetFlyOne {
          0% { left: -12%; transform: translateY(0) rotate(0deg) scale(.8); opacity: 0; }
          15% { opacity: .9; }
          100% { left: 110%; transform: translateY(26px) rotate(360deg) scale(1.1); opacity: 0; }
        }

        @keyframes planetFlyTwo {
          0% { right: -12%; transform: translateY(0) rotate(0deg) scale(.9); opacity: 0; }
          15% { opacity: .8; }
          100% { right: 110%; transform: translateY(-30px) rotate(-360deg) scale(1.15); opacity: 0; }
        }

        @keyframes planetFlyThree {
          0% { left: -14%; transform: translateY(0) rotate(0deg) scale(.7); opacity: 0; }
          20% { opacity: .75; }
          100% { left: 105%; transform: translateY(-20px) rotate(260deg) scale(1); opacity: 0; }
        }

        @keyframes rocketFlyOne {
          0% { left: -18%; transform: translateY(0) rotate(25deg) scale(.9); opacity: 0; }
          15% { opacity: 1; }
          100% { left: 115%; transform: translateY(-45px) rotate(25deg) scale(1.2); opacity: 0; }
        }

        @keyframes rocketFlyTwo {
          0% { right: -18%; transform: translateY(0) rotate(205deg) scale(.9); opacity: 0; }
          15% { opacity: 1; }
          100% { right: 115%; transform: translateY(-35px) rotate(205deg) scale(1.2); opacity: 0; }
        }

        @keyframes cometFly {
          0% { left: -18%; transform: translateY(0) rotate(-12deg) scale(.8); opacity: 0; }
          20% { opacity: .9; }
          100% { left: 115%; transform: translateY(22px) rotate(-12deg) scale(1.1); opacity: 0; }
        }

        @media (max-width: 600px) {
          .page {
            padding: 12px;
          }

          .wrap {
            max-width: 100%;
          }

          .logo {
  max-width: 250px;
  margin: -50px auto -48px;
}

          .featured {
            padding: 15px;
            border-radius: 20px;
          }

          .hit-name {
            font-size: 1.35rem;
          }

          .featured-text {
            font-size: .78rem;
          }

          .search-card {
            padding: 16px;
          }

          .search-card h1 {
            font-size: 1.55rem;
          }

          .search-card p {
            font-size: .82rem;
            margin-bottom: 14px;
          }

          .input,
          .button {
            padding: 13px;
            font-size: .86rem;
          }
        }
		
		@media (max-width: 600px) {
  .page {
    padding: 10px 12px 20px;
    align-items: flex-start;
  }

  .wrap {
    width: 100%;
    max-width: 100%;
    transform: translateY(-35px);
  }

  .logo {
    max-width: 250px;
    margin: 0 auto -48px;
  }

  .featured {
    width: 100%;
    padding: 14px;
    margin-bottom: 10px;
  }

  .search-card {
    padding: 16px;
  }
}
      `}</style>

      <div className="wrap">
        <Image
          className="logo"
          src="/logo.png"
          alt="Collectiverse"
          width={700}
          height={700}
          priority
        />

        <section className={`featured ${tier.className}`}>
          {showCosmic && (
            <>
              <div className="cosmic-stars">
                <span>✦</span>
                <span>✧</span>
                <span>✦</span>
                <span>✧</span>
              </div>

              {featuredHit?.hit_tier === 'gold' && (
                <div className="planet-field">
                  <span>🪐</span>
                  <span>🌕</span>
                  <span>🪐</span>
                </div>
              )}

              {featuredHit?.hit_tier === 'sir' && (
                <div className="rocket-field">
                  <span>🚀</span>
                  <span>🚀</span>
                  <span>☄️</span>
                </div>
              )}
            </>
          )}

          <div className="featured-content">
            <div className="featured-label">🔥 FEATURED HIT</div>

            <h2 className="hit-name">
              {featuredHit ? featuredHit.spot_name : 'Coming Soon'}
            </h2>

            {featuredHit?.hit_tier && tier.label && (
              <div className="tier-badge" style={{ background: tier.color }}>
                {tier.label}
              </div>
            )}

            {featuredHit ? (
              <p className="featured-text">
                Hit by <strong>{featuredHit.collector_name}</strong>
                <br />
                in the Collectiverse Breaks on{' '}
                {featuredHit.stream_datetime
                  ? new Date(featuredHit.stream_datetime).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : 'a recent stream'}
              </p>
            ) : (
              <p className="featured-text">The next huge pull will appear here.</p>
            )}
          </div>
        </section>

        <section className="search-card">
          <h1>BREAK VAULT</h1>

          <p>
            Every hit you've ever pulled.
            <br />
            One place to relive every break.
          </p>

          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') searchVault()
            }}
            placeholder="Enter your Whatnot username"
          />

          <button className="button" onClick={searchVault}>
            VIEW MY VAULT
          </button>
        </section>
      </div>
    </main>
  )
}