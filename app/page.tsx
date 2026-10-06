'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

function getTierClass(tier: string | null) {
  switch (String(tier || '').toLowerCase().trim()) {
    case 'clc': return 'hit-clc'
    case 'sir': return 'hit-sir'
    case 'gold': return 'hit-gold'
    case 'mar': return 'hit-mar'
    case 'ir': return 'hit-ir'
    case 'sr': return 'hit-sr'
    case 'ex': return 'hit-ex'
    default: return 'hit-default'
  }
}

function getTierStyle(tier: string | null) {
  const cleanTier = String(tier || '').toLowerCase().trim()

  switch (cleanTier) {
    case 'clc':
      return { label: 'CLC', className: 'tier-clc', color: '#8b6b2f' }
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

const CANONICAL_SET_NAMES = [
  '30th Celebration',
  'English 151',
  'Ascended Heroes',
  'Chaos Rising',
  'Pitch Black',
  'Crown Zenith',
] as const

function canonicalSetName(name: string | null) {
  const cleaned = String(name || '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/Break\s+\d+/i, '')
    .trim()

  const lower = cleaned.toLowerCase()
  const match = [...CANONICAL_SET_NAMES]
    .sort((a, b) => b.length - a.length)
    .find((setName) => lower.includes(setName.toLowerCase()))

  return match || cleaned
}

function getBreakInfo(name: string | null) {
  const cleaned = String(name || '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const breakMatch = cleaned.match(/Break\s+(\d+)/i)
  return {
    setName: canonicalSetName(cleaned),
    breakNumber: breakMatch?.[1] || '',
  }
}

function normaliseImageKey(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

// Canonical image matching: old entries can contain emojis, bracketed spot metadata,
// "Extra Hit" suffixes, punctuation, or a rarity already embedded in the name.
// None of those should stop the same card image resolving across the Vault.
function canonicalImageName(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/gu, '')
    .replace(/\s*·?\s*Extra Hit\s*\d*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function resolveHitImage(
  hitImages: Record<string, string>,
  setName: string,
  rawName: string,
  tier: string | null
) {
  const setKey = normaliseImageKey(setName)
  const tierLabel = getTierStyle(tier).label
  const cleanBase = canonicalImageName(rawName)
    .replace(/\s+(sir|gold|mar|ir|sr|ex|clc)$/i, '')
    .trim()
  let cleanTier = canonicalImageName(tierLabel)

  // 30th compatibility: legacy Umbreon / Espeon rows may still carry IR,
  // but their actual cards/images are EX.
  if (
    cleanTier === 'ir' &&
    (cleanBase === 'umbreon' || cleanBase === 'espeon')
  ) {
    cleanTier = 'ex'
  }

  // Always resolve the image from the card name + the CURRENT hit tier.
  // This prevents legacy names such as "Mew EX" from forcing the EX image
  // when the actual hit is Mew SR or Mew GOLD.
  const wanted = cleanTier ? `${cleanBase} ${cleanTier}`.trim() : cleanBase

  // Fast path for already-perfect rows.
  const exact = hitImages[`${setKey}::${wanted}`]
  if (exact) return exact

  // Compatibility path for legacy / emoji / bracketed rows.
  for (const [key, url] of Object.entries(hitImages)) {
    const separator = key.indexOf('::')
    if (separator === -1) continue
    const rowSet = key.slice(0, separator)
    const rowCard = key.slice(separator + 2)
    if (normaliseImageKey(rowSet) !== setKey) continue

    const canonicalRow = canonicalImageName(rowCard)
    const canonicalRowVariant = canonicalRow
      .replace(/\s+ex\s+(sir|gold|mar|ir|sr|clc)$/i, ' $1')
      .trim()

    if (canonicalRow === wanted || canonicalRowVariant === wanted) return url

    // Legacy split-card images were uploaded as e.g. "Salazzle (IR)".
    // canonicalImageName intentionally strips "(IR)", so explicitly recognise
    // that old format ONLY when the bracketed tier matches the current hit tier.
    const legacyBracketTier = String(rowCard).match(/\((SIR|GOLD|MAR|IR|SR|EX|CLC)\)\s*$/i)?.[1] || ''
    if (
      cleanTier &&
      canonicalImageName(legacyBracketTier) === cleanTier &&
      canonicalRow === cleanBase
    ) return url

    // A tiered hit must never fall back to another variant's image.
    // Bare-name fallback is only safe when the hit itself has no tier.
    if (!cleanTier && canonicalRow === cleanBase) return url
  }

  return ''
}


function baseCardName(value: string) {
  return String(value || '')
    .replace(/ · Extra Hit \d+$/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}

function cardVariantName(value: string, tier: string | null) {
  const labels: Record<string, string> = { sir: 'SIR', gold: 'GOLD', mar: 'MAR', ir: 'IR', sr: 'SR', ex: 'EX' }
  const base = baseCardName(value)
  const label = labels[String(tier || '').toLowerCase()] || String(tier || '').replace(/_/g, ' ').toUpperCase()
  return tier ? `${base} ${label}`.trim() : base
}

function visibleCardName(value: string, tier?: string | null) {
  const cleaned = baseCardName(value)
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s*·\s*Extra Hit\s*\d*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim()

  // The rarity is already shown by the badge below the card title.
  // Remove the Pokémon-card suffix "EX" from the visible title for every tier:
  // Mew EX + SIR badge -> Mew
  // Venusaur EX + SIR badge -> Venusaur
  // Zapdos EX + EX badge -> Zapdos
  // The stored hit_name is NOT changed, so image matching remains intact.
  return cleaned.replace(/\s+EX$/i, '').trim()
}

function formatShortDate(value: string | null) {
  if (!value) return 'Recent break'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function RarityEffects({ tier }: { tier: string }) {
    return (
      <div className="rarity-fx rarity-fx-v4" aria-hidden="true">
        <span className="fx-ambient" />
        <span className="fx-primary" />
        <span className="fx-secondary" />
        <span className="fx-detail" />
        <span className="fx-extra" />
        <span className="fx-flare" />
      
        {tier === 'ir' && (
          <svg className="ir-spectral-field" viewBox="0 0 1000 260" preserveAspectRatio="none">
            <defs>
              <linearGradient id="irRibbonA" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fb7185" stopOpacity="0" />
                <stop offset="24%" stopColor="#f472b6" stopOpacity=".72" />
                <stop offset="48%" stopColor="#c4b5fd" stopOpacity=".95" />
                <stop offset="72%" stopColor="#67e8f9" stopOpacity=".78" />
                <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="irRibbonB" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                <stop offset="30%" stopColor="#67e8f9" stopOpacity=".68" />
                <stop offset="58%" stopColor="#f0abfc" stopOpacity=".90" />
                <stop offset="82%" stopColor="#fb7185" stopOpacity=".62" />
                <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
              </linearGradient>
              <filter id="irSpectralGlow" x="-30%" y="-80%" width="160%" height="260%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g filter="url(#irSpectralGlow)">
              <path className="ir-ribbon ir-ribbon-a" stroke="url(#irRibbonA)" d="M-80 185 C70 50 180 238 330 105 S590 34 720 145 S910 230 1080 75" />
              <path className="ir-ribbon ir-ribbon-b" stroke="url(#irRibbonB)" d="M-70 70 C90 205 220 8 375 145 S630 238 765 102 S935 20 1070 175" />
              <path className="ir-ribbon ir-ribbon-c" stroke="url(#irRibbonA)" d="M-90 132 C80 18 240 210 410 82 S680 45 820 164 S960 212 1090 118" />
            </g>
          </svg>
        )}
      
        {tier === 'gold' && (
          <div className="gold-molten-system">
            <span className="gold-top-pool" />
            <span className="gold-drip gold-drip-1" />
            <span className="gold-drip gold-drip-2" />
            <span className="gold-drip gold-drip-3" />
            <span className="gold-drip gold-drip-4" />
            <span className="gold-drip gold-drip-5" />
            <span className="gold-drip gold-drip-6" />
            <span className="gold-drip gold-drip-7" />
            <span className="gold-drip gold-drip-8" />
            <span className="gold-drop gold-drop-1" />
            <span className="gold-drop gold-drop-2" />
            <span className="gold-drop gold-drop-3" />
          </div>
        )}
      
        {tier === 'sir' && (
          <>
            <div className="sir-flash-system">
              <span className="sir-starburst sir-starburst-1" />
              <span className="sir-starburst sir-starburst-2" />
              <span className="sir-rainbow-ring" />
            </div>
      
            <svg className="sir-fracture-system" viewBox="0 0 1000 260" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sirFractureGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="24%" stopColor="#67e8f9" />
                  <stop offset="52%" stopColor="#c4b5fd" />
                  <stop offset="76%" stopColor="#f0abfc" />
                  <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>
                <filter id="sirFractureGlow" x="-40%" y="-80%" width="180%" height="260%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
      
              <g className="sir-fracture-glow" filter="url(#sirFractureGlow)">
                <path className="sir-crack sir-crack-main" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M505 126 L458 96 L421 108 L374 74 L330 88 L284 48 L238 61 L191 30" />
                <path className="sir-crack sir-crack-main sir-crack-right" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M505 126 L554 103 L598 117 L646 80 L692 96 L738 55 L786 69 L837 36" />
                <path className="sir-crack sir-crack-down" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M505 126 L482 158 L501 181 L470 207 L486 232 L458 269" />
                <path className="sir-crack sir-crack-up" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M505 126 L524 92 L510 67 L539 41 L525 17 L548 -10" />
      
                <path className="sir-crack sir-crack-branch branch-one" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M374 74 L385 42 L367 20" />
                <path className="sir-crack sir-crack-branch branch-two" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M284 48 L267 83 L239 103" />
                <path className="sir-crack sir-crack-branch branch-three" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M646 80 L630 47 L650 23" />
                <path className="sir-crack sir-crack-branch branch-four" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M738 55 L758 92 L790 109" />
                <path className="sir-crack sir-crack-branch branch-five" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M470 207 L433 196 L408 216" />
                <path className="sir-crack sir-crack-branch branch-six" pathLength="1" stroke="url(#sirFractureGradient)"
                  d="M539 41 L574 54 L601 35" />
              </g>
      
              <circle className="sir-fracture-core" cx="505" cy="126" r="5" />
            </svg>
          </>
        )}
      
        {tier === 'mar' && (
          <svg className="mar-electric-field" viewBox="0 0 1000 260" preserveAspectRatio="none">
            <defs>
              <filter id="marElectricGlow" x="-40%" y="-80%" width="180%" height="260%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g filter="url(#marElectricGlow)">
              <path className="electric-arc arc-a" d="M-20 52 L55 43 L91 61 L137 31 L185 55 L231 42 L278 66 L329 34 L377 54 L423 28 L469 51 L518 37 L566 62 L616 39 L662 55 L713 30 L760 52 L810 38 L857 60 L906 34 L1020 51" />
              <path className="electric-arc arc-b" d="M18 211 L77 191 L121 213 L168 184 L213 205 L260 178 L307 207 L352 187 L398 214 L445 181 L492 203 L539 179 L586 208 L634 185 L681 211 L728 181 L775 204 L824 180 L873 207 L922 185 L1018 210" />
              <path className="electric-arc arc-c" d="M55 -12 L76 29 L62 55 L91 79 L73 108 L101 133 L79 160 L108 188 L87 214 L113 272" />
              <path className="electric-arc arc-d" d="M913 -12 L888 27 L906 54 L879 81 L899 109 L870 136 L892 164 L864 191 L886 219 L858 272" />
              <path className="electric-branch branch-a" d="M278 66 L255 92 L268 109 L244 132" />
              <path className="electric-branch branch-b" d="M713 30 L733 63 L719 81 L744 105" />
              <path className="electric-branch branch-c" d="M398 214 L420 190 L411 171 L437 148" />
              <path className="electric-branch branch-d" d="M870 136 L835 124 L817 143 L788 132" />
            </g>
          </svg>
        )}
      </div>
    )
  }


function ArchiveFeaturedHitCard({ hit, imageUrl }: { hit: any; imageUrl: string }) {
  const tierClass = getTierClass(hit?.hit_tier || null)
  const breakInfo = getBreakInfo(hit?.break_name || null)
  const resolvedCardName = cardVariantName(hit?.hit_name || hit?.spot_name || '', hit?.hit_tier || null)
  const displayCardName = visibleCardName(hit?.hit_name || hit?.spot_name || '', hit?.hit_tier)

  return (
    <div className="archive-featured-exact">
      <div className={`hit-card ${tierClass}`}>
        {String(hit.hit_tier || '').toLowerCase() === 'clc' && (
          <div className="clc-vintage-film" aria-hidden="true">
            <span className="clc-paper-texture" />
            <span className="clc-film-grain" />
            <span className="clc-film-vignette" />
            <span className="clc-film-line clc-film-line-a" />
            <span className="clc-film-line clc-film-line-b" />
          </div>
        )}
        <RarityEffects tier={hit.hit_tier} />
        <div className={`hit-layout ${imageUrl ? 'has-image' : ''}`}>
          {imageUrl && (
            <div className="hit-card-art-wrap">
              <img className="hit-card-art" src={imageUrl} alt={resolvedCardName} />
            </div>
          )}
          <div className="hit-content featured-home-copy">
            <div className="featured-home-label">Featured Hit</div>
            <h3>{displayCardName}</h3>
            <div className="featured-home-pulled">
              Pulled on {formatShortDate(hit.stream_datetime)} by {hit.collector_name || 'Collector'}
            </div>
            <div className="featured-home-set">{breakInfo.setName}</div>
            <div className={`hit-badge badge-${hit.hit_tier}`}>
              {String(hit.hit_tier || '').toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}



function ArchiveFeaturedStyles() {
  return (
    <style jsx global>{`

        
.archive-featured-exact .page{
          min-height: 100vh;
          background: radial-gradient(circle at top, #15157a 0%, #06063d 45%, #02021f 100%);
          color: white;
          padding: 18px;
          font-size: 0.9rem;
        }


        
.archive-featured-exact .wrap{
          max-width: 920px;
          margin: 0 auto;
        }


        
.archive-featured-exact .header{
          margin-bottom: 22px;
        }


        
.archive-featured-exact .header h1{
          margin: 0 0 6px;
          font-size: clamp(1.8rem, 4.4vw, 2.8rem);
          font-weight: 950;
          letter-spacing: -1px;
        }


        
.archive-featured-exact .header p{
          opacity: 0.86;
          margin: 0;
          font-size: .95rem;
          line-height: 1.5;
          max-width: 650px;
          color: rgba(255,255,255,0.85);
        }


        
.archive-featured-exact .tabs{
          display: flex;
          gap: 8px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }


        
.archive-featured-exact .tab-button{
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.07);
          color: white;
          padding: 10px 14px;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 850;
          font-size: .88rem;
        }


        
.archive-featured-exact .tab-button.active{
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          box-shadow: 0 10px 24px rgba(124,58,237,0.35);
        }


        
.archive-featured-exact .section-title{
          font-size: 1.55rem;
          font-weight: 950;
          letter-spacing: 1px;
          margin-bottom: 16px;
          text-transform: uppercase;
          background: linear-gradient(90deg, #ffffff, #d8b4fe);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }


        
.archive-featured-exact .subsection-title{
          font-size: 1rem;
          font-weight: 850;
          letter-spacing: 0.5px;
          margin: 22px 0 14px;
          color: rgba(255,255,255,.92);
        }


        
.archive-featured-exact .section-divider{
          width: 100%;
          height: 1px;
          margin: 18px 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.2), transparent);
        }


        
.archive-featured-exact .break-date-card{
          max-width: 640px;
          margin: 0 auto 24px;
          padding: 22px;
          text-align: center;
          border-radius: 22px;
          background: linear-gradient(135deg, rgba(124,58,237,.15), rgba(255,255,255,.04));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 18px 48px rgba(0,0,0,.32), 0 0 24px rgba(168,85,247,.12);
        }


        
.archive-featured-exact .calendar-header{
          display: grid;
          grid-template-columns: 40px 1fr 40px;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }


        
.archive-featured-exact .calendar-month{
          text-align: center;
          font-size: clamp(1.15rem, 4.4vw, 1.55rem);
          font-weight: 950;
        }


        
.archive-featured-exact .calendar-nav{
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.08);
          color: white;
          font-size: 1.55rem;
          font-weight: 950;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          padding: 0 0 3px;
        }


        
.archive-featured-exact .calendar-grid{
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
        }


        
.archive-featured-exact .calendar-day-label{
          text-align: center;
          opacity: 0.65;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
        }


        
.archive-featured-exact .calendar-day{
          height: 44px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.05);
          color: white;
          font-weight: 950;
          cursor: pointer;
          font-size: .9rem;
        }


        
.archive-featured-exact .calendar-day.has-break{
          border: 1px solid rgba(250,204,21,.8);
          background: rgba(250,204,21,.16);
          box-shadow: 0 0 14px rgba(250,204,21,.24);
        }


        
.archive-featured-exact .calendar-day.selected{
          border: 2px solid #c084fc;
          background: linear-gradient(135deg, #7c3aed, #c084fc);
        }


        
.archive-featured-exact .collector-showcase{
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.18);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.16), transparent 30%),
            radial-gradient(circle at bottom right, rgba(56,189,248,.16), transparent 32%),
            linear-gradient(135deg, rgba(124,58,237,.24), rgba(255,255,255,.05));
          border-radius: 24px;
          padding: 18px;
          margin-bottom: 22px;
          box-shadow: 0 18px 56px rgba(0,0,0,.34), 0 0 28px rgba(168,85,247,.14);
        }


        
.archive-featured-exact .showcase-header{
          display: grid;
          grid-template-columns: 1fr 180px;
          gap: 12px;
          align-items: stretch;
          margin-bottom: 14px;
        }


        
.archive-featured-exact .showcase-topline{
          opacity: .78;
          font-size: .72rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 7px;
        }


        
.archive-featured-exact .showcase-title{
          font-size: clamp(1.55rem, 4.4vw, 2.55rem);
          font-weight: 950;
          line-height: 1;
        }


        
.archive-featured-exact .showcase-rank-card{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          border-radius: 18px;
          padding: 13px;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }


        
.archive-featured-exact .showcase-rank-value{
          font-size: 1.7rem;
          font-weight: 950;
          line-height: 1;
        }


        
.archive-featured-exact .showcase-best-pull{
          text-align: center;
        }


        
.archive-featured-exact .showcase-hit-card, .archive-featured-exact .hit-card{
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border-radius: 22px;
          padding: 18px;
          min-height: 150px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.07);
          box-shadow: 0 18px 56px rgba(0,0,0,0.30);
        }


        
.archive-featured-exact .showcase-hit-card{
          min-height: 210px;
          margin-top: 8px;
        }


        
.archive-featured-exact .showcase-hit-card::before, .archive-featured-exact .hit-card::before{
          content: "";
          position: absolute;
          inset: -3px;
          z-index: -2;
          opacity: 0.9;
        }


        
.archive-featured-exact .showcase-hit-card::after, .archive-featured-exact .hit-card::after{
          content: "";
          position: absolute;
          top: -10%;
          left: -85%;
          width: 65%;
          height: 120%;
          transform: skewX(-18deg);
          z-index: -1;
          opacity: 0.42;
        }


        
.archive-featured-exact .hit-layout{
          position: relative;
          z-index: 2;
          min-height: 114px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 22px;
        }


        
.archive-featured-exact .hit-layout.has-image{
          display: grid;
          grid-template-columns: 122px minmax(0, 1fr);
        }


        
.archive-featured-exact .hit-card-art-wrap{
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }


        
.archive-featured-exact .hit-card-art{
          display: block;
          width: 112px;
          max-height: 156px;
          object-fit: contain;
          border-radius: 7px;
          filter: drop-shadow(0 12px 18px rgba(0,0,0,.48));
        }

        /* Subtle face-forward 3D movement ONLY on the homepage Featured Hit.
           The recent-hits carousel is intentionally excluded. */
        .featured-exact-shell .archive-featured-exact .hit-card-art {
          transform-origin: 50% 50%;
          backface-visibility: hidden;
          will-change: transform;
          animation: featuredCardFaceFloat3D 7.5s ease-in-out infinite;
        }

        @keyframes featuredCardFaceFloat3D {
          0%, 100% { transform: perspective(900px) translate3d(0,-1px,0) rotateX(1deg) rotateY(-1deg) scale(1.004); }
          20% { transform: perspective(900px) translate3d(-2px,-3px,0) rotateX(3.2deg) rotateY(-4.5deg) scale(1.008); }
          45% { transform: perspective(900px) translate3d(2px,-2px,0) rotateX(-2.8deg) rotateY(4deg) scale(1.01); }
          70% { transform: perspective(900px) translate3d(1px,-4px,0) rotateX(4deg) rotateY(2.8deg) scale(1.008); }
          88% { transform: perspective(900px) translate3d(-1px,-2px,0) rotateX(-2deg) rotateY(-3deg) scale(1.006); }
        }

        @media (prefers-reduced-motion: reduce) {
          .featured-exact-shell .archive-featured-exact .hit-card-art {
            animation: none !important;
          }
        }


        
.archive-featured-exact .hit-layout.has-image .hit-content{
          width: 100%;
        }


        
.archive-featured-exact .hit-content{
          position: relative;
          z-index: 2;
          text-align: center;
        }


        
.archive-featured-exact .hit-break{
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          opacity: 0.9;
          font-size: 1rem;
          margin-bottom: 9px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
        }


        
.archive-featured-exact .break-number{
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          display: inline-block;
          margin-bottom: 14px;
          padding: 8px 20px;
          border-radius: 11px;
          background: rgba(20,20,80,0.45);
          border: 2px solid rgba(255,255,255,0.75);
          color: white;
          font-size: 1rem;
          font-weight: 950;
          letter-spacing: 1px;
          box-shadow: 0 0 16px rgba(255,255,255,0.16);
        }


        
.archive-featured-exact .hit-card h3, .archive-featured-exact .showcase-hit-card h3{
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          text-align: center;
          margin: 0;
          font-size: clamp(1.35rem, 3.5vw, 2.05rem);
          line-height: 1.05;
          text-transform: uppercase;
          font-weight: 950;
          text-shadow: 0 7px 24px rgba(0,0,0,0.45);
        }


        
.archive-featured-exact .showcase-hit-card h3{
          margin-top: 14px;
        }


        
.archive-featured-exact .showcase-hit-date{
          margin-top: 12px;
          opacity: .85;
          font-size: .9rem;
          font-weight: 900;
        }


        
.archive-featured-exact .showcase-hit-break{
          margin-top: 8px;
          opacity: .8;
          font-size: .86rem;
          font-weight: 950;
          text-transform: uppercase;
        }


        
.archive-featured-exact .hit-badge{
          display: inline-block;
          margin-top: 14px;
          padding: 10px 28px;
          border-radius: 999px;
          color: #050505;
          font-weight: 950;
          letter-spacing: 1.5px;
          font-size: .98rem;
          box-shadow: 0 8px 26px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.65);
        }


        
.archive-featured-exact .showcase-hit-card .hit-badge{
          margin-top: 0;
        }


        
.archive-featured-exact .best-hit-controls{
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          margin-top: 14px;
        }


        
.archive-featured-exact .best-hit-button{
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.08);
          color: white;
          font-size: 1.1rem;
          font-weight: 950;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 0 2px;
        }


        
.archive-featured-exact .best-hit-count{
          opacity: .7;
          font-size: .76rem;
          font-weight: 900;
        }

		
		
.archive-featured-exact .demo-notice{
  margin-top: 14px;
  border: 1px solid rgba(250, 204, 21, .35);
  background: linear-gradient(135deg, rgba(250, 204, 21, .15), rgba(168, 85, 247, .12));
  border-radius: 16px;
  padding: 12px 14px;
  font-weight: 950;
  box-shadow: 0 14px 34px rgba(0,0,0,.22);
}



.archive-featured-exact .demo-notice span{
  display: block;
  margin-top: 5px;
  opacity: .85;
  font-size: .82rem;
  font-weight: 700;
}



.archive-featured-exact .vault-message{
  white-space: pre-line;
  text-align: center;
  padding: 28px;
  border-radius: 22px;
  margin: 20px 0;
  border: 1px solid rgba(255,255,255,.15);
  background: linear-gradient(
    135deg,
    rgba(124,58,237,.18),
    rgba(255,255,255,.05)
  );
  box-shadow:
    0 18px 48px rgba(0,0,0,.28),
    0 0 24px rgba(168,85,247,.12);
  font-weight: 800;
  line-height: 1.7;
}


        
.archive-featured-exact .empty-state-card{
          margin: 22px 0;
          border: 1px solid rgba(255,255,255,.16);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.14), transparent 28%),
            linear-gradient(135deg, rgba(124,58,237,.22), rgba(255,255,255,.06));
          border-radius: 22px;
          padding: 24px;
          max-width: 680px;
          box-shadow: 0 18px 56px rgba(0,0,0,.28), 0 0 28px rgba(168,85,247,.12);
        }


        
.archive-featured-exact .pack-gods-card{
          border-color: rgba(250,204,21,.32);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.18), transparent 30%),
            radial-gradient(circle at bottom right, rgba(168,85,247,.18), transparent 32%),
            linear-gradient(135deg, rgba(124,58,237,.24), rgba(255,255,255,.06));
        }


        
.archive-featured-exact .empty-state-icon{
          font-size: 2rem;
          margin-bottom: 10px;
        }


        
.archive-featured-exact .empty-state-card h2{
          margin: 0 0 10px;
          font-size: clamp(1.3rem, 4vw, 2rem);
          font-weight: 950;
          letter-spacing: .4px;
        }


        
.archive-featured-exact .empty-state-card p{
          margin: 0;
          max-width: 560px;
          opacity: .86;
          line-height: 1.55;
          font-size: .95rem;
        }


        
.archive-featured-exact .empty-state-pill{
          display: inline-block;
          margin-top: 16px;
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.08);
          font-size: .82rem;
          font-weight: 900;
        }


        
.archive-featured-exact .milestone-card{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.06);
          border-radius: 20px;
          padding: 16px;
          margin-bottom: 22px;
          box-shadow: 0 14px 38px rgba(0,0,0,.22);
        }


        
.archive-featured-exact .milestone-row{
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 11px;
        }


        
.archive-featured-exact .milestone-label{
          font-weight: 950;
        }


        
.archive-featured-exact .milestone-remaining{
          opacity: .75;
          font-weight: 900;
          white-space: nowrap;
        }


        
.archive-featured-exact .milestone-bar{
          overflow: hidden;
          height: 10px;
          border-radius: 999px;
          background: rgba(255,255,255,.12);
          border: 1px solid rgba(255,255,255,.1);
        }


        
.archive-featured-exact .milestone-fill{
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #7c3aed, #c084fc, #facc15);
          box-shadow: 0 0 16px rgba(192,132,252,.45);
        }


        
.archive-featured-exact .showcase-stat-label{
          opacity: .66;
          font-size: .68rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }


        
.archive-featured-exact .badge-grid{
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 9px;
          margin-bottom: 24px;
        }


        
.archive-featured-exact .collector-badge{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          border-radius: 16px;
          padding: 12px;
          text-align: center;
          font-weight: 900;
          box-shadow: 0 12px 34px rgba(0,0,0,.20);
        }


        
.archive-featured-exact .collector-badge.locked{
          opacity: .35;
          filter: grayscale(1);
        }


        
.archive-featured-exact .badge-icon{
          font-size: 1.3rem;
          margin-bottom: 5px;
        }


        
.archive-featured-exact .badge-label{
          font-size: .76rem;
        }


        
.archive-featured-exact .stats-grid{
          display: flex;
          flex-direction: column;
          gap: 9px;
          margin-bottom: 24px;
        }


        
.archive-featured-exact .stat-box{
          position: relative;
          isolation: isolate;
          overflow: hidden;
          min-height: 72px;
          border-radius: 18px;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          font-weight: 900;
        }


        
.archive-featured-exact .stat-box::before{
          content: "";
          position: absolute;
          inset: -3px;
          z-index: -2;
          opacity: 0.9;
        }


        
.archive-featured-exact .stat-box::after{
          content: "";
          position: absolute;
          top: -10%;
          left: -85%;
          width: 65%;
          height: 120%;
          transform: skewX(-18deg);
          z-index: -1;
          opacity: 0.42;
        }


        
.archive-featured-exact .stat-label, .archive-featured-exact .stat-number, .archive-featured-exact .rank-pill{
          position: relative;
          z-index: 2;
        }


        
.archive-featured-exact .stat-number{
          font-size: 1.45rem;
          font-weight: 950;
          line-height: 1;
        }


        
.archive-featured-exact .rank-pill{
          display: inline-block;
          margin-top: 8px;
          padding: 6px 14px;
          border-radius: 999px;
          background: rgba(20,20,80,0.45);
          border: 1px solid rgba(255,255,255,0.65);
          color: white;
          font-size: 0.7rem;
          font-weight: 950;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          box-shadow: 0 0 16px rgba(255,255,255,0.12);
        }


        
.archive-featured-exact .stat-total{
          border: 2px solid rgba(255,255,255,.35);
          background: linear-gradient(135deg, rgba(124,58,237,.2), rgba(255,255,255,.07));
          box-shadow: 0 0 24px rgba(168,85,247,.2);
        }


        
.archive-featured-exact .hof-hero{
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.18);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.24), transparent 30%),
            linear-gradient(135deg, rgba(124,58,237,.28), rgba(255,255,255,.06));
          border-radius: 24px;
          padding: 24px;
          margin-bottom: 24px;
          text-align: center;
          box-shadow: 0 18px 56px rgba(0,0,0,.34), 0 0 28px rgba(168,85,247,.16);
        }


        
.archive-featured-exact .hof-hero-label{
          opacity: .78;
          font-size: .75rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 9px;
        }


        
.archive-featured-exact .hof-hero-rank{
          display: inline-block;
          padding: 10px 28px;
          border-radius: 999px;
          background: rgba(20,20,80,.48);
          border: 2px solid rgba(255,255,255,.7);
          font-size: 1.75rem;
          font-weight: 950;
          box-shadow: 0 0 22px rgba(255,255,255,.16);
        }


        
.archive-featured-exact .hof-title{
          margin-top: 10px;
          font-size: .92rem;
          font-weight: 950;
          opacity: .9;
          letter-spacing: .4px;
        }


        
.archive-featured-exact .hof-podium{
          display: grid;
          grid-template-columns: 1fr 1.2fr 1fr;
          gap: 12px;
          align-items: start;
          margin-bottom: 36px;
        }


        
.archive-featured-exact .podium-card{
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          padding: 18px 12px;
          text-align: center;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.07);
          box-shadow: 0 16px 44px rgba(0,0,0,.28);
        }


        
.archive-featured-exact .podium-1{
          min-height: 230px;
          border-color: rgba(250,204,21,.85);
          background: linear-gradient(135deg, rgba(250,204,21,.22), rgba(168,85,247,.16));
          box-shadow: 0 0 28px rgba(250,204,21,.28), 0 16px 44px rgba(0,0,0,.32);
        }


        
.archive-featured-exact .podium-2{
          min-height: 200px;
          border-color: rgba(226,232,240,.75);
          background: linear-gradient(135deg, rgba(226,232,240,.18), rgba(96,165,250,.1));
        }


        
.archive-featured-exact .podium-3{
          min-height: 185px;
          border-color: rgba(251,146,60,.75);
          background: linear-gradient(135deg, rgba(251,146,60,.18), rgba(168,85,247,.1));
        }


        
.archive-featured-exact .podium-medal{
          font-size: 1.75rem;
          margin-bottom: 7px;
        }


        
.archive-featured-exact .podium-rank{
          font-size: .76rem;
          font-weight: 950;
          opacity: .7;
          margin-bottom: 5px;
        }


        
.archive-featured-exact .podium-name{
          font-size: .98rem;
          font-weight: 950;
          word-break: break-word;
        }


        
.archive-featured-exact .podium-title{
          margin-top: 8px;
          opacity: .9;
          font-size: .76rem;
          font-weight: 900;
        }


        
.archive-featured-exact .podium-stat-label{
          margin-top: 12px;
          opacity: .6;
          font-size: .64rem;
          font-weight: 900;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }


        
.archive-featured-exact .podium-stat{
          font-size: 1.7rem;
          font-weight: 950;
          line-height: 1;
          margin-top: 4px;
        }


        
.archive-featured-exact .hof-list{
          display: flex;
          flex-direction: column;
          gap: 9px;
        }


        
.archive-featured-exact .hof-row{
          display: flex;
          justify-content: space-between;
          gap: 14px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 16px;
          padding: 12px 14px;
          font-weight: 900;
        }


        
.archive-featured-exact .hof-name{
          opacity: .95;
        }


        
.archive-featured-exact .hof-meta{
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }


        
.archive-featured-exact .hof-tier-name{
          padding: 4px 9px;
          border-radius: 999px;
          background: rgba(20,20,80,.45);
          border: 1px solid rgba(255,255,255,.24);
          font-size: .66rem;
          font-weight: 950;
          opacity: .9;
        }


        
.archive-featured-exact .hof-hits{
          opacity: .78;
          white-space: nowrap;
        }


        
.archive-featured-exact .hit-grid{
          display: flex;
          flex-direction: column;
          gap: 14px;
        }


        
.archive-featured-exact .badge-gold{
          background: linear-gradient(135deg, #fff7ad, #facc15, #b45309);
          color: #1f1300;
          border: 1px solid rgba(255,255,255,.65);
          box-shadow: 0 0 22px rgba(250,204,21,.8), inset 0 1px 0 rgba(255,255,255,.75);
        }


        
.archive-featured-exact .badge-sir{
          background: linear-gradient(135deg, #ff004c, #ffb000, #fff700, #00f0ff, #8b5cf6);
          color: #160018;
          border: 1px solid rgba(255,255,255,.65);
          box-shadow: 0 0 24px rgba(255,176,0,.75), 0 0 38px rgba(168,85,247,.4);
        }


        
.archive-featured-exact .badge-mar{
          background: linear-gradient(135deg, #e0f2fe, #38bdf8, #8b5cf6);
          color: #02111f;
          border: 1px solid rgba(255,255,255,.55);
          box-shadow: 0 0 20px rgba(56,189,248,.7), inset 0 1px 0 rgba(255,255,255,.75);
        }


        
.archive-featured-exact .badge-ir{
          background: linear-gradient(135deg, #fecdd3, #fb7185, #be123c);
          color: #210006;
        }


        
.archive-featured-exact .badge-sr{
          background: linear-gradient(135deg, #f3e8ff, #c084fc, #7e22ce);
          color: #190026;
        }


        
.archive-featured-exact .badge-ex{
          background: linear-gradient(135deg, #dbeafe, #60a5fa, #1d4ed8);
          color: #061327;
        }


        
.archive-featured-exact .hit-ex{
          border: 1px solid rgba(96,165,250,.5);
          box-shadow: 0 0 24px rgba(96,165,250,.34), 0 0 46px rgba(96,165,250,.14);
          animation: exPulse 2.8s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-ex::before{
          background: linear-gradient(135deg, rgba(96,165,250,.34), rgba(255,255,255,.07));
        }


        
.archive-featured-exact .hit-ex::after{
          background: linear-gradient(90deg, transparent, rgba(147,197,253,.45), transparent);
          animation: slowSweep 4.2s infinite;
        }


        
.archive-featured-exact .hit-sr{
          border: 1px solid rgba(192,132,252,.55);
          box-shadow: 0 0 28px rgba(192,132,252,.38), 0 0 58px rgba(168,85,247,.18);
          animation: srPulse 2.5s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-sr::before{
          background: linear-gradient(135deg, rgba(192,132,252,.38), rgba(59,130,246,.12));
        }


        
.archive-featured-exact .hit-sr::after{
          background: linear-gradient(90deg, transparent, rgba(216,180,254,.55), transparent);
          animation: slowSweep 3.8s infinite;
        }


        
.archive-featured-exact .hit-ir{
          border: 1px solid rgba(251,113,133,.68);
          box-shadow: 0 0 32px rgba(251,113,133,.43), 0 0 64px rgba(244,63,94,.20), inset 0 0 26px rgba(251,113,133,.08);
          animation: irOrbit 2.8s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-ir::before{
          background: radial-gradient(circle at 20% 20%, rgba(255,255,255,.14), transparent 22%), linear-gradient(135deg, rgba(251,113,133,.45), rgba(168,85,247,.16));
        }


        
.archive-featured-exact .hit-ir::after{
          background: linear-gradient(90deg, transparent, rgba(251,113,133,.68), rgba(255,255,255,.4), transparent);
          animation: fastSweep 2.9s infinite;
        }


        
.archive-featured-exact .hit-mar{
          border: 2px solid rgba(56,189,248,.78);
          background: radial-gradient(circle at 18% 28%, rgba(255,255,255,.18), transparent 24%), radial-gradient(circle at 82% 72%, rgba(56,189,248,.16), transparent 28%), rgba(255,255,255,.08);
          box-shadow: 0 0 36px rgba(56,189,248,.46), 0 0 74px rgba(14,165,233,.22), inset 0 0 34px rgba(56,189,248,.10);
          animation: marCosmicFloat 2.4s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-mar::before{
          background: radial-gradient(circle at 25% 35%, rgba(255,255,255,.8) 0 1px, transparent 2px), radial-gradient(circle at 70% 25%, rgba(255,255,255,.7) 0 1px, transparent 2px), radial-gradient(circle at 82% 78%, rgba(255,255,255,.65) 0 1px, transparent 2px), linear-gradient(135deg, rgba(56,189,248,.45), rgba(168,85,247,.18));
          animation: starTwinkle 2.1s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-mar::after{
          background: linear-gradient(90deg, transparent, rgba(125,211,252,.78), rgba(255,255,255,.5), transparent);
          animation: fastSweep 2.5s infinite;
        }


        
.archive-featured-exact .hit-gold{
          border: 2px solid rgba(250,204,21,.86);
          background: radial-gradient(circle at top left, rgba(255,255,255,.14), transparent 30%), linear-gradient(135deg, rgba(250,204,21,.16), rgba(168,85,247,.14), rgba(255,255,255,.06));
          box-shadow: 0 0 34px rgba(250,204,21,.38), 0 0 70px rgba(168,85,247,.22), inset 0 0 32px rgba(250,204,21,.10);
          animation: goldPremiumFloat 2.2s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-gold::before{
          background: radial-gradient(circle at 18% 24%, rgba(255,255,255,.2), transparent 20%), linear-gradient(135deg, rgba(250,204,21,.36), rgba(168,85,247,.22), rgba(255,255,255,.08));
        }


        
.archive-featured-exact .hit-gold::after{
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.78), rgba(250,204,21,.66), transparent);
          animation: goldSweep 2.3s infinite;
        }


        
.archive-featured-exact .hit-sir{
          border: 2px solid rgba(255,255,255,.42);
          background: radial-gradient(circle at top left, rgba(255,255,255,.18), transparent 28%), linear-gradient(135deg, rgba(255,0,76,.15), rgba(255,176,0,.12), rgba(0,240,255,.1), rgba(139,92,246,.16));
          box-shadow: 0 0 32px rgba(255,176,0,.38), 0 0 62px rgba(168,85,247,.26), 0 0 84px rgba(34,211,238,.18), inset 0 0 36px rgba(255,255,255,.07);
          animation: sirLegendaryFloat 1.8s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-sir::before{
          background: linear-gradient(120deg, rgba(255,0,76,.48), rgba(255,176,0,.48), rgba(255,247,0,.36), rgba(0,240,255,.36), rgba(139,92,246,.48), rgba(255,0,76,.48));
          animation: rainbowBorder 3.2s linear infinite;
        }


        
.archive-featured-exact .hit-sir::after{
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.78), rgba(255,176,0,.48), transparent);
          animation: sirSweep 2.4s infinite;
        }


        
.archive-featured-exact .cosmic-stars, .archive-featured-exact .planet-field, .archive-featured-exact .rocket-field{
          pointer-events: none;
          position: absolute;
          inset: 0;
          overflow: hidden;
          z-index: 1;
        }


        
.archive-featured-exact .cosmic-stars span{
          position: absolute;
          color: rgba(255,255,255,.9);
          text-shadow: 0 0 14px rgba(125,211,252,.95);
          animation: starDrift 4s infinite ease-in-out;
        }


        
.archive-featured-exact .cosmic-stars span:nth-child(1){ top: 15%; left: 10%; animation-delay: 0s; }

        
.archive-featured-exact .cosmic-stars span:nth-child(2){ top: 72%; left: 18%; animation-delay: .7s; }

        
.archive-featured-exact .cosmic-stars span:nth-child(3){ top: 20%; right: 14%; animation-delay: 1.2s; }

        
.archive-featured-exact .cosmic-stars span:nth-child(4){ bottom: 16%; right: 18%; animation-delay: 1.8s; }


        
.archive-featured-exact .planet-field span{
          position: absolute;
          font-size: 1.1rem;
          filter: drop-shadow(0 0 12px rgba(250,204,21,.75));
          opacity: .82;
        }


        
.archive-featured-exact .planet-field span:nth-child(1){
          top: 18%;
          left: -10%;
          animation: planetFlyOne 6s infinite linear;
        }


        
.archive-featured-exact .planet-field span:nth-child(2){
          bottom: 18%;
          left: -12%;
          animation: planetFlyThree 8s infinite linear;
        }


        
.archive-featured-exact .rocket-field span{
          position: absolute;
          font-size: 1.15rem;
          filter: drop-shadow(0 0 12px rgba(255,255,255,.75));
        }


        
.archive-featured-exact .rocket-field span:nth-child(1){
          top: 22%;
          left: -15%;
          animation: rocketFlyOne 3.2s infinite ease-in-out;
        }


        
.archive-featured-exact .rocket-field span:nth-child(2){
          top: 58%;
          left: -15%;
          animation: cometFly 4.5s infinite ease-in-out;
        }


        
@keyframes slowSweep{
          0% { left: -85%; }
          60% { left: 130%; }
          100% { left: 130%; }
        }


        
@keyframes fastSweep{
          0% { left: -85%; opacity: 0; }
          18% { opacity: .75; }
          50% { left: 130%; opacity: 0; }
          100% { left: 130%; opacity: 0; }
        }


        
@keyframes goldSweep{
          0% { left: -90%; opacity: 0; }
          18% { opacity: .9; }
          54% { left: 135%; opacity: 0; }
          100% { left: 135%; opacity: 0; }
        }


        
@keyframes sirSweep{
          0% { left: -95%; opacity: 0; }
          16% { opacity: .8; }
          52% { left: 135%; opacity: 0; }
          100% { left: 135%; opacity: 0; }
        }


        
@keyframes exPulse{
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.004); filter: brightness(1.12); }
        }


        
@keyframes srPulse{
          0%, 100% { transform: scale(1); filter: saturate(1); }
          50% { transform: scale(1.006); filter: saturate(1.3); }
        }


        
@keyframes irOrbit{
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1); }
          50% { transform: translateY(-2px) scale(1.008); filter: brightness(1.12); }
        }


        
@keyframes marCosmicFloat{
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.05); }
          50% { transform: translateY(-3px) scale(1.012); filter: brightness(1.17) saturate(1.2); }
        }


        
@keyframes starTwinkle{
          0%, 100% { opacity: .55; filter: brightness(1); }
          50% { opacity: .95; filter: brightness(1.45); }
        }


        
@keyframes goldPremiumFloat{
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.05); }
          50% { transform: translateY(-3px) scale(1.012); filter: brightness(1.22) saturate(1.24); }
        }


        
@keyframes sirLegendaryFloat{
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.12); }
          50% { transform: translateY(-4px) scale(1.016); filter: brightness(1.22) saturate(1.35); }
        }


        
@keyframes rainbowBorder{
          0% { filter: hue-rotate(0deg) saturate(1.25); }
          100% { filter: hue-rotate(360deg) saturate(1.25); }
        }


        
@keyframes starDrift{
          0%, 100% { transform: translateY(0) scale(.9); opacity: .35; }
          50% { transform: translateY(-8px) scale(1.2); opacity: 1; }
        }


        
@keyframes planetFlyOne{
          0% { left: -12%; transform: translateY(0) rotate(0deg) scale(.8); opacity: 0; }
          15% { opacity: .9; }
          100% { left: 110%; transform: translateY(26px) rotate(360deg) scale(1.1); opacity: 0; }
        }


        
@keyframes planetFlyThree{
          0% { left: -14%; transform: translateY(0) rotate(0deg) scale(.7); opacity: 0; }
          20% { opacity: .75; }
          100% { left: 105%; transform: translateY(-20px) rotate(260deg) scale(1); opacity: 0; }
        }


        
@keyframes rocketFlyOne{
          0% { left: -18%; transform: translateY(0) rotate(25deg) scale(.9); opacity: 0; }
          15% { opacity: 1; }
          100% { left: 115%; transform: translateY(-45px) rotate(25deg) scale(1.2); opacity: 0; }
        }


        
@keyframes cometFly{
          0% { left: -18%; transform: translateY(0) rotate(-12deg) scale(.8); opacity: 0; }
          20% { opacity: .9; }
          100% { left: 115%; transform: translateY(22px) rotate(-12deg) scale(1.1); opacity: 0; }
        }


        
@media (max-width: 700px){
          
.archive-featured-exact .page{
            padding: 12px;
            font-size: .84rem;
          }


          
.archive-featured-exact .header h1{
            font-size: 1.85rem;
          }


          
.archive-featured-exact .tab-button{
            padding: 9px 11px;
            font-size: .8rem;
          }


          
.archive-featured-exact .break-date-card{
            padding: 14px;
            border-radius: 18px;
          }


          
.archive-featured-exact .calendar-grid{
            gap: 5px;
          }


          
.archive-featured-exact .calendar-day{
            height: 38px;
            border-radius: 11px;
            font-size: .8rem;
          }


          
.archive-featured-exact .calendar-day-label{
            font-size: .62rem;
          }


          
.archive-featured-exact .showcase-header{
            grid-template-columns: 1fr;
          }


          
.archive-featured-exact .showcase-rank-card{
            padding: 11px;
          }


          
.archive-featured-exact .showcase-hit-card{
            min-height: 195px;
            padding: 16px;
          }


          
.archive-featured-exact .hit-layout.has-image{
            grid-template-columns: 88px minmax(0, 1fr);
            gap: 12px;
          }


          
.archive-featured-exact .hit-card-art{
            width: 82px;
            max-height: 116px;
          }


          
.archive-featured-exact .hit-layout.has-image .hit-break{ font-size: .82rem; }

          
.archive-featured-exact .hit-layout.has-image .break-number{ padding: 6px 12px; font-size: .78rem; margin-bottom: 9px; }

          
.archive-featured-exact .hit-layout.has-image h3{ font-size: 1.08rem; }

          
.archive-featured-exact .hit-layout.has-image .hit-badge{ padding: 7px 18px; font-size: .8rem; margin-top: 10px; }


          
.archive-featured-exact .hof-podium{
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 7px;
          }


          
.archive-featured-exact .podium-card{
            padding: 14px 7px;
          }


          
.archive-featured-exact .podium-name{
            font-size: .82rem;
          }


          
.archive-featured-exact .podium-title{
            font-size: .66rem;
          }


          
.archive-featured-exact .podium-stat{
            font-size: 1.35rem;
          }

        }


        
@media (max-width: 600px){
          
.archive-featured-exact .hof-row{
            flex-direction: column;
            gap: 8px;
          }


          
.archive-featured-exact .hof-meta{
            justify-content: flex-start;
          }


          
.archive-featured-exact .milestone-row{
            flex-direction: column;
            align-items: flex-start;
          }

        }


        
/* Keep the original design; only trim a little vertical space from hit cards. */

        
.archive-featured-exact .hit-card{
          padding-top: 10px !important;
          padding-bottom: 10px !important;
        }



        
.archive-featured-exact .week-archive{
          max-width: 100%;
          padding: 14px 16px;
          margin-bottom: 16px;
        }


        
.archive-featured-exact .week-header{
          margin-bottom: 10px;
        }


        
.archive-featured-exact .week-range{
          margin-top: 3px;
          opacity: .68;
          font-size: .76rem;
          font-weight: 850;
        }


        
.archive-featured-exact .week-strip{
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 7px;
        }


        
.archive-featured-exact .week-day{
          min-width: 0;
          height: 62px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.05);
          color: white;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
        }


        
.archive-featured-exact .week-day-name{
          opacity: .68;
          font-size: .64rem;
          font-weight: 950;
          text-transform: uppercase;
        }


        
.archive-featured-exact .week-day-number{
          font-size: 1.02rem;
          line-height: 1.05;
          font-weight: 950;
        }


        
.archive-featured-exact .week-day-month{
          opacity: .55;
          font-size: .58rem;
          font-weight: 850;
          text-transform: uppercase;
        }


        
.archive-featured-exact .week-day.has-break{
          border-color: rgba(250,204,21,.8);
          background: rgba(250,204,21,.16);
          box-shadow: 0 0 14px rgba(250,204,21,.24);
        }


        
.archive-featured-exact .week-day.selected{
          border: 2px solid #c084fc;
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          box-shadow: 0 0 18px rgba(192,132,252,.28);
        }


        
@media (max-width: 620px){
          
.archive-featured-exact .week-archive{
            padding: 12px 10px;
          }


          
.archive-featured-exact .week-strip{
            gap: 4px;
          }


          
.archive-featured-exact .week-day{
            height: 56px;
            border-radius: 11px;
          }


          
.archive-featured-exact .week-day-name{
            font-size: .56rem;
          }


          
.archive-featured-exact .week-day-number{
            font-size: .92rem;
          }


          
.archive-featured-exact .week-day-month{
            display: none;
          }

        }



        
/* ===== Premium hit-card visual system =====
           Restrained dark surfaces; rarity is communicated through motion and light. */


        
.archive-featured-exact .hit-card, .archive-featured-exact .showcase-hit-card{
          --tier-accent: 148, 163, 184;
          --tier-accent-2: 71, 85, 105;
          border: 1px solid rgba(var(--tier-accent), .34) !important;
          background:
            radial-gradient(circle at 16% 18%, rgba(var(--tier-accent), .075), transparent 34%),
            linear-gradient(135deg, rgba(8, 13, 28, .985), rgba(13, 20, 39, .97)) !important;
          box-shadow:
            0 14px 34px rgba(0,0,0,.28),
            inset 0 1px 0 rgba(255,255,255,.045) !important;
          animation: none !important;
        }


        
.archive-featured-exact .hit-card::before, .archive-featured-exact .showcase-hit-card::before{
          inset: 0 !important;
          z-index: 0 !important;
          opacity: 1 !important;
          background:
            linear-gradient(115deg, transparent 0 34%, rgba(var(--tier-accent), .06) 45%, transparent 56%),
            radial-gradient(circle at 78% 30%, rgba(var(--tier-accent), .06), transparent 24%) !important;
          animation: premiumAmbient 8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-card::after, .archive-featured-exact .showcase-hit-card::after{
          top: 0 !important;
          bottom: 0 !important;
          left: -42% !important;
          width: 28% !important;
          height: auto !important;
          transform: skewX(-18deg) !important;
          z-index: 1 !important;
          opacity: 0 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(var(--tier-accent), .05),
            rgba(255,255,255,.22),
            rgba(var(--tier-accent), .08),
            transparent
          ) !important;
          animation: premiumSweep 7s ease-in-out infinite !important;
          pointer-events: none;
        }


        
.archive-featured-exact .hit-ex{ --tier-accent: 59, 130, 246; --tier-accent-2: 96, 165, 250; }

        
.archive-featured-exact .hit-sr{ --tier-accent: 139, 92, 246; --tier-accent-2: 192, 132, 252; }

        
.archive-featured-exact .hit-ir{ --tier-accent: 244, 114, 182; --tier-accent-2: 251, 146, 60; }

        
.archive-featured-exact .hit-mar{ --tier-accent: 34, 211, 238; --tier-accent-2: 96, 165, 250; }

        
.archive-featured-exact .hit-gold{ --tier-accent: 212, 175, 55; --tier-accent-2: 250, 204, 21; }

        
.archive-featured-exact .hit-sir{ --tier-accent: 167, 139, 250; --tier-accent-2: 34, 211, 238; }


        
/* EX: controlled electric edge */

        
.archive-featured-exact .hit-ex{
          box-shadow:
            0 14px 34px rgba(0,0,0,.28),
            inset 0 0 0 1px rgba(59,130,246,.04) !important;
          animation: exEdge 4.8s ease-in-out infinite !important;
        }


        
/* SR: low, slow violet pulse */

        
.archive-featured-exact .hit-sr::before{
          background:
            radial-gradient(circle at 72% 50%, rgba(139,92,246,.14), transparent 27%),
            radial-gradient(circle at 28% 50%, rgba(192,132,252,.06), transparent 22%) !important;
          animation: srBreath 5.4s ease-in-out infinite !important;
        }


        
/* IR: foil catching a moving warm light */

        
.archive-featured-exact .hit-ir::after{
          opacity: .32 !important;
          background: linear-gradient(
            100deg,
            transparent 0 34%,
            rgba(251,146,60,.08) 41%,
            rgba(244,114,182,.20) 48%,
            rgba(255,255,255,.20) 51%,
            rgba(96,165,250,.08) 57%,
            transparent 66%
          ) !important;
          animation: irFoil 6.2s ease-in-out infinite !important;
        }


        
/* MAR: dark storm surface with intermittent lightning */

        
.archive-featured-exact .hit-mar::before{
          background:
            linear-gradient(116deg,
              transparent 0 43%,
              rgba(125,211,252,0) 44%,
              rgba(224,242,254,.92) 44.6%,
              rgba(34,211,238,.58) 45.1%,
              transparent 45.8% 49%,
              rgba(186,230,253,.70) 49.4%,
              transparent 50.1%),
            radial-gradient(circle at 68% 48%, rgba(34,211,238,.10), transparent 27%) !important;
          background-size: 220% 100%, 100% 100% !important;
          animation: marLightning 5.6s steps(1,end) infinite !important;
        }


        
.archive-featured-exact .hit-mar::after{
          opacity: .18 !important;
          background: linear-gradient(90deg, transparent, rgba(34,211,238,.22), transparent) !important;
          animation: marCharge 5.6s ease-in-out infinite !important;
        }


        
/* Gold: black metal with a travelling specular highlight */

        
.archive-featured-exact .hit-gold{
          background:
            radial-gradient(circle at 18% 18%, rgba(212,175,55,.07), transparent 32%),
            linear-gradient(135deg, #090a0d, #15140f 52%, #090a0d) !important;
        }


        
.archive-featured-exact .hit-gold::after{
          opacity: .36 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.08),
            rgba(255,244,190,.42),
            rgba(212,175,55,.10),
            transparent
          ) !important;
          animation: goldSpecular 5.8s ease-in-out infinite !important;
        }


        
/* SIR: restrained holographic refraction, not a rainbow background */

        
.archive-featured-exact .hit-sir::before{
          background:
            linear-gradient(
              118deg,
              transparent 15%,
              rgba(244,114,182,.08) 28%,
              rgba(250,204,21,.07) 38%,
              rgba(34,211,238,.10) 50%,
              rgba(167,139,250,.11) 61%,
              transparent 76%
            ),
            radial-gradient(circle at 70% 35%, rgba(255,255,255,.07), transparent 25%) !important;
          background-size: 190% 100%, 100% 100% !important;
          animation: sirPrism 7.2s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sir::after{
          opacity: .30 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.06),
            rgba(34,211,238,.18),
            rgba(244,114,182,.16),
            rgba(255,255,255,.22),
            transparent
          ) !important;
          animation: sirGlint 6.4s ease-in-out infinite !important;
        }


        
/* Keep content and artwork crisp above the effects. */

        
.archive-featured-exact .hit-layout, .archive-featured-exact .hit-content, .archive-featured-exact .hit-card-art-wrap, .archive-featured-exact .showcase-hit-card > *{
          position: relative;
          z-index: 3;
        }


        
.archive-featured-exact .hit-card-art{
          filter: drop-shadow(0 12px 18px rgba(0,0,0,.52)) !important;
        }


        
.archive-featured-exact .hit-break{
          opacity: .68 !important;
          letter-spacing: 1.4px !important;
        }


        
.archive-featured-exact .break-number{
          background: rgba(255,255,255,.045) !important;
          border: 1px solid rgba(255,255,255,.20) !important;
          box-shadow: none !important;
          padding: 6px 14px !important;
        }


        
.archive-featured-exact .hit-card h3, .archive-featured-exact .showcase-hit-card h3{
          text-shadow: 0 3px 16px rgba(0,0,0,.52) !important;
        }


        
.archive-featured-exact .hit-badge{
          padding: 7px 18px !important;
          border: 1px solid rgba(var(--tier-accent), .46) !important;
          background: rgba(var(--tier-accent), .12) !important;
          color: rgb(var(--tier-accent)) !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06) !important;
        }


        
.archive-featured-exact .cosmic-stars, .archive-featured-exact .planet-field, .archive-featured-exact .rocket-field{
          display: none !important;
        }


        
@keyframes premiumAmbient{
          0%, 100% { opacity: .62; transform: translate3d(0,0,0); }
          50% { opacity: 1; transform: translate3d(-1%,0,0); }
        }


        
@keyframes premiumSweep{
          0%, 62% { left: -42%; opacity: 0; }
          68% { opacity: .26; }
          82% { left: 118%; opacity: .18; }
          88%, 100% { left: 118%; opacity: 0; }
        }


        
@keyframes exEdge{
          0%,100% { border-color: rgba(59,130,246,.28); }
          50% { border-color: rgba(96,165,250,.58); }
        }


        
@keyframes srBreath{
          0%,100% { opacity: .52; transform: scale(1); }
          50% { opacity: .92; transform: scale(1.018); }
        }


        
@keyframes irFoil{
          0%,18% { left: -42%; opacity: 0; }
          28% { opacity: .32; }
          62% { left: 118%; opacity: .28; }
          72%,100% { left: 118%; opacity: 0; }
        }


        
@keyframes marLightning{
          0%, 69%, 73%, 77%, 100% { background-position: -120% 0, 0 0; opacity: .10; }
          70% { background-position: 12% 0, 0 0; opacity: .95; }
          71% { background-position: 24% 0, 0 0; opacity: .22; }
          72% { background-position: 36% 0, 0 0; opacity: .78; }
          74% { background-position: 55% 0, 0 0; opacity: .14; }
          75% { background-position: 70% 0, 0 0; opacity: .62; }
          76% { background-position: 84% 0, 0 0; opacity: .16; }
        }


        
@keyframes marCharge{
          0%,66%,80%,100% { opacity: .04; }
          71%,75% { opacity: .24; }
        }


        
@keyframes goldSpecular{
          0%,24% { left: -42%; opacity: 0; }
          35% { opacity: .36; }
          68% { left: 118%; opacity: .28; }
          78%,100% { left: 118%; opacity: 0; }
        }


        
@keyframes sirPrism{
          0%,100% { background-position: 0% 50%, 0 0; opacity: .48; }
          50% { background-position: 100% 50%, 0 0; opacity: .82; }
        }


        
@keyframes sirGlint{
          0%,30% { left: -42%; opacity: 0; }
          42% { opacity: .30; }
          72% { left: 118%; opacity: .24; }
          82%,100% { left: 118%; opacity: 0; }
        }


        
@media (prefers-reduced-motion: reduce){
          
.archive-featured-exact .hit-card, .archive-featured-exact .showcase-hit-card, .archive-featured-exact .hit-card::before, .archive-featured-exact .hit-card::after, .archive-featured-exact .showcase-hit-card::before, .archive-featured-exact .showcase-hit-card::after{
            animation: none !important;
          }

        }



        
/* ===== Motion pass v2: effects are deliberately visible, but still contained ===== */


        
.archive-featured-exact .hit-card, .archive-featured-exact .showcase-hit-card{
          isolation: isolate;
          overflow: hidden !important;
        }


        
/* EX — a cool-blue charge travels around the card edge. */

        
.archive-featured-exact .hit-ex{
          animation: exCharge 3.6s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ex::before{
          background:
            radial-gradient(circle at 12% 50%, rgba(96,165,250,.20), transparent 26%),
            linear-gradient(90deg, transparent, rgba(59,130,246,.08), transparent) !important;
          animation: exEnergy 3.6s ease-in-out infinite !important;
        }


        
/* SR — a restrained violet energy bloom. */

        
.archive-featured-exact .hit-sr::before{
          background:
            radial-gradient(circle at 50% 120%, rgba(168,85,247,.28), transparent 42%),
            radial-gradient(circle at 82% 28%, rgba(192,132,252,.12), transparent 24%) !important;
          animation: srEnergy 3.8s ease-in-out infinite !important;
        }


        
/* IR — obvious foil sweep, but only for a moment each cycle. */

        
.archive-featured-exact .hit-ir::after{
          left: -35% !important;
          width: 22% !important;
          opacity: 0 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(251,146,60,.10),
            rgba(244,114,182,.38),
            rgba(255,255,255,.48),
            rgba(96,165,250,.14),
            transparent
          ) !important;
          filter: blur(1px);
          animation: irFoilVisible 4.8s ease-in-out infinite !important;
        }


        
/* MAR — actual lightning bolt flash rather than a generic light sweep. */

        
.archive-featured-exact .hit-mar::before{
          top: -18% !important;
          left: 58% !important;
          right: auto !important;
          bottom: auto !important;
          width: 18% !important;
          height: 145% !important;
          opacity: 0 !important;
          background: linear-gradient(
            180deg,
            rgba(255,255,255,.98),
            rgba(125,211,252,.96) 38%,
            rgba(34,211,238,.82) 70%,
            rgba(255,255,255,.94)
          ) !important;
          clip-path: polygon(
            48% 0,
            70% 0,
            57% 30%,
            78% 30%,
            43% 60%,
            62% 60%,
            20% 100%,
            35% 66%,
            14% 66%,
            43% 36%,
            27% 36%
          );
          filter:
            drop-shadow(0 0 4px rgba(255,255,255,.95))
            drop-shadow(0 0 12px rgba(34,211,238,.95))
            drop-shadow(0 0 22px rgba(14,165,233,.62));
          transform: rotate(9deg) scale(.82);
          animation: marBolt 4.6s steps(1,end) infinite !important;
        }


        
.archive-featured-exact .hit-mar::after{
          inset: 0 !important;
          width: auto !important;
          height: auto !important;
          left: 0 !important;
          opacity: 0 !important;
          transform: none !important;
          background:
            radial-gradient(circle at 68% 48%, rgba(224,242,254,.30), transparent 16%),
            linear-gradient(90deg, transparent, rgba(34,211,238,.10), transparent) !important;
          animation: marFlash 4.6s steps(1,end) infinite !important;
        }


        
/* Gold — polished black metal with a strong but infrequent gold reflection. */

        
.archive-featured-exact .hit-gold::after{
          left: -32% !important;
          width: 18% !important;
          opacity: 0 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.16),
            rgba(255,246,196,.70),
            rgba(250,204,21,.22),
            transparent
          ) !important;
          animation: goldGlintVisible 5s ease-in-out infinite !important;
        }


        
/* SIR — moving holographic film. The card stays dark underneath. */

        
.archive-featured-exact .hit-sir::before{
          inset: -55% !important;
          width: auto !important;
          height: auto !important;
          left: -55% !important;
          opacity: .34 !important;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(34,211,238,.28) 52deg,
            rgba(167,139,250,.32) 108deg,
            rgba(244,114,182,.26) 162deg,
            rgba(250,204,21,.18) 214deg,
            rgba(34,211,238,.24) 278deg,
            transparent 335deg
          ) !important;
          filter: blur(22px);
          transform: rotate(0deg);
          animation: sirHoloRotate 8s linear infinite !important;
        }


        
.archive-featured-exact .hit-sir::after{
          left: -30% !important;
          width: 16% !important;
          opacity: 0 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.10),
            rgba(255,255,255,.55),
            rgba(34,211,238,.18),
            rgba(244,114,182,.18),
            transparent
          ) !important;
          animation: sirHoloSweep 4.9s ease-in-out infinite !important;
        }


        
@keyframes exCharge{
          0%,100% {
            border-color: rgba(59,130,246,.28);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), inset 0 0 0 1px rgba(59,130,246,.02);
          }
          45%,55% {
            border-color: rgba(96,165,250,.72);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 16px rgba(59,130,246,.18), inset 0 0 20px rgba(59,130,246,.06);
          }
        }


        
@keyframes exEnergy{
          0%,100% { transform: translateX(-18%); opacity: .35; }
          50% { transform: translateX(18%); opacity: .9; }
        }


        
@keyframes srEnergy{
          0%,100% { opacity: .30; transform: scale(.96); }
          50% { opacity: .95; transform: scale(1.08); }
        }


        
@keyframes irFoilVisible{
          0%,22% { left: -35%; opacity: 0; }
          30% { opacity: .60; }
          58% { left: 118%; opacity: .48; }
          66%,100% { left: 118%; opacity: 0; }
        }


        
@keyframes marBolt{
          0%,68%,72%,76%,100% { opacity: 0; transform: rotate(9deg) scale(.82); }
          69% { opacity: 1; transform: rotate(9deg) scale(1); }
          70% { opacity: .12; }
          71% { opacity: .88; transform: rotate(7deg) scale(.96); }
          73% { opacity: .18; }
          74% { opacity: .72; transform: rotate(10deg) scale(1.02); }
          75% { opacity: .08; }
        }


        
@keyframes marFlash{
          0%,68%,72%,76%,100% { opacity: 0; }
          69%,71%,74% { opacity: 1; }
          70%,73%,75% { opacity: .10; }
        }


        
@keyframes goldGlintVisible{
          0%,28% { left: -32%; opacity: 0; }
          38% { opacity: .72; }
          66% { left: 116%; opacity: .48; }
          74%,100% { left: 116%; opacity: 0; }
        }


        
@keyframes sirHoloRotate{
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.08); }
          to { transform: rotate(360deg) scale(1); }
        }


        
@keyframes sirHoloSweep{
          0%,18% { left: -30%; opacity: 0; }
          28% { opacity: .58; }
          60% { left: 118%; opacity: .40; }
          70%,100% { left: 118%; opacity: 0; }
        }


        
/* FIX: animation layers were sitting behind the card background. */

        
.archive-featured-exact .hit-card::before, .archive-featured-exact .showcase-hit-card::before{
          z-index: 0 !important;
          pointer-events: none !important;
        }


        
.archive-featured-exact .hit-card::after, .archive-featured-exact .showcase-hit-card::after{
          z-index: 1 !important;
          pointer-events: none !important;
        }


        
.archive-featured-exact .hit-layout, .archive-featured-exact .hit-content, .archive-featured-exact .hit-card-art-wrap, .archive-featured-exact .showcase-hit-card > *{
          position: relative;
          z-index: 3 !important;
        }



        
/* =====================================================
           RARITY FX — real DOM layers (not pseudo-elements)
           ===================================================== */


        
.archive-featured-exact .hit-card{
          isolation: isolate;
          overflow: hidden !important;
        }


        
.archive-featured-exact .rarity-fx{
          position: absolute;
          inset: 0;
          z-index: 1;
          overflow: hidden;
          border-radius: inherit;
          pointer-events: none;
        }


        
.archive-featured-exact .rarity-fx > span{
          position: absolute;
          display: block;
          pointer-events: none;
        }


        
.archive-featured-exact .hit-card > .hit-layout{
          position: relative;
          z-index: 5 !important;
        }


        
/* Disable the old pseudo-element animation layers on actual hit cards.
           The new DOM layers below are now the sole animation system. */

        
.archive-featured-exact .hit-card::before, .archive-featured-exact .hit-card::after{
          display: none !important;
          animation: none !important;
        }


        
/* EX — electric blue energy moving across a dark card */

        
.archive-featured-exact .hit-ex .fx-ambient{
          inset: 0;
          background:
            radial-gradient(circle at 10% 50%, rgba(59,130,246,.30), transparent 25%),
            radial-gradient(circle at 90% 50%, rgba(96,165,250,.14), transparent 22%);
          animation: fxExAmbient 3.2s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-ex .fx-primary{
          top: 0;
          bottom: 0;
          left: -22%;
          width: 20%;
          transform: skewX(-18deg);
          background: linear-gradient(90deg, transparent, rgba(96,165,250,.38), transparent);
          filter: blur(8px);
          animation: fxTravel 3.2s ease-in-out infinite;
        }


        
/* SR — violet energy breathing from underneath */

        
.archive-featured-exact .hit-sr .fx-ambient{
          left: 18%;
          right: 18%;
          bottom: -80%;
          height: 150%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(168,85,247,.38), rgba(126,34,206,.12) 42%, transparent 68%);
          filter: blur(12px);
          animation: fxSrPulse 3.4s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-sr .fx-secondary{
          inset: 0;
          background: radial-gradient(circle at 78% 28%, rgba(216,180,254,.12), transparent 20%);
          animation: fxSrDrift 5s ease-in-out infinite;
        }


        
/* IR — iridescent foil reflection */

        
.archive-featured-exact .hit-ir .fx-primary{
          top: -20%;
          bottom: -20%;
          left: -28%;
          width: 24%;
          transform: rotate(12deg);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(251,146,60,.16),
            rgba(244,114,182,.52),
            rgba(255,255,255,.72),
            rgba(96,165,250,.22),
            transparent
          );
          filter: blur(2px);
          animation: fxIrFoil 4.3s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-ir .fx-ambient{
          inset: 0;
          background: radial-gradient(circle at 75% 50%, rgba(244,114,182,.12), transparent 30%);
        }


        
/* MAR — unmistakable lightning bolt + storm flash */

        
.archive-featured-exact .hit-mar .fx-ambient{
          inset: 0;
          opacity: 0;
          background:
            radial-gradient(circle at 70% 48%, rgba(224,242,254,.42), transparent 18%),
            radial-gradient(circle at 65% 48%, rgba(34,211,238,.20), transparent 35%);
          animation: fxMarFlash 4.2s steps(1,end) infinite;
        }


        
.archive-featured-exact .hit-mar .fx-primary{
          top: -16%;
          left: 65%;
          width: 14%;
          height: 140%;
          opacity: 0;
          background: linear-gradient(180deg, #fff, #bae6fd 34%, #22d3ee 72%, #fff);
          clip-path: polygon(
            46% 0, 68% 0, 56% 28%, 78% 28%,
            45% 57%, 64% 57%, 19% 100%,
            35% 65%, 14% 65%, 42% 35%, 27% 35%
          );
          filter:
            drop-shadow(0 0 4px #fff)
            drop-shadow(0 0 11px rgba(34,211,238,1))
            drop-shadow(0 0 25px rgba(14,165,233,.9));
          animation: fxMarBolt 4.2s steps(1,end) infinite;
        }


        
.archive-featured-exact .hit-mar .fx-secondary{
          top: 18%;
          left: 48%;
          width: 9%;
          height: 78%;
          opacity: 0;
          transform: rotate(-17deg);
          background: linear-gradient(180deg, #fff, #67e8f9, #fff);
          clip-path: polygon(45% 0, 68% 0, 55% 39%, 78% 39%, 23% 100%, 39% 55%, 18% 55%);
          filter: drop-shadow(0 0 9px rgba(34,211,238,.95));
          animation: fxMarBoltSmall 4.2s steps(1,end) infinite;
        }


        
/* GOLD — polished black metal with a gold specular reflection */

        
.archive-featured-exact .hit-gold .fx-ambient{
          inset: 0;
          background:
            radial-gradient(circle at 18% 20%, rgba(212,175,55,.12), transparent 25%),
            radial-gradient(circle at 82% 70%, rgba(250,204,21,.08), transparent 26%);
        }


        
.archive-featured-exact .hit-gold .fx-primary{
          top: -20%;
          bottom: -20%;
          left: -28%;
          width: 19%;
          transform: rotate(12deg);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.20),
            rgba(255,248,203,.88),
            rgba(250,204,21,.34),
            transparent
          );
          filter: blur(1px);
          animation: fxGoldSweep 4.6s ease-in-out infinite;
        }


        
/* SIR — rotating holographic film plus sharp foil glint */

        
.archive-featured-exact .hit-sir .fx-ambient{
          inset: -80%;
          opacity: .52;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(34,211,238,.34) 50deg,
            rgba(167,139,250,.42) 105deg,
            rgba(244,114,182,.34) 165deg,
            rgba(250,204,21,.22) 220deg,
            rgba(34,211,238,.32) 285deg,
            transparent 340deg
          );
          filter: blur(26px);
          animation: fxSirRotate 7s linear infinite;
        }


        
.archive-featured-exact .hit-sir .fx-primary{
          top: -20%;
          bottom: -20%;
          left: -28%;
          width: 18%;
          transform: rotate(12deg);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.08),
            rgba(255,255,255,.72),
            rgba(34,211,238,.28),
            rgba(244,114,182,.24),
            transparent
          );
          animation: fxSirSweep 4.5s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-sir .fx-secondary{
          inset: 0;
          background:
            linear-gradient(120deg,
              transparent 15%,
              rgba(34,211,238,.08) 35%,
              rgba(167,139,250,.10) 48%,
              rgba(244,114,182,.08) 62%,
              transparent 80%);
          background-size: 220% 100%;
          animation: fxSirFilm 5.5s ease-in-out infinite;
        }


        
@keyframes fxTravel{
          0%,18% { left: -22%; opacity: 0; }
          30% { opacity: 1; }
          65% { left: 112%; opacity: .7; }
          76%,100% { left: 112%; opacity: 0; }
        }


        
@keyframes fxExAmbient{
          0%,100% { opacity: .35; transform: translateX(-2%); }
          50% { opacity: .9; transform: translateX(2%); }
        }


        
@keyframes fxSrPulse{
          0%,100% { opacity: .25; transform: scale(.88); }
          50% { opacity: .9; transform: scale(1.12); }
        }


        
@keyframes fxSrDrift{
          0%,100% { transform: translateX(-4%); opacity: .35; }
          50% { transform: translateX(4%); opacity: .85; }
        }


        
@keyframes fxIrFoil{
          0%,18% { left: -28%; opacity: 0; }
          28% { opacity: .85; }
          62% { left: 115%; opacity: .58; }
          72%,100% { left: 115%; opacity: 0; }
        }


        
@keyframes fxMarBolt{
          0%,61%,65%,69%,100% { opacity: 0; transform: rotate(8deg) scale(.84); }
          62% { opacity: 1; transform: rotate(8deg) scale(1); }
          63% { opacity: .10; }
          64% { opacity: .94; transform: rotate(5deg) scale(.97); }
          66% { opacity: .12; }
          67% { opacity: .78; transform: rotate(10deg) scale(1.03); }
          68% { opacity: .06; }
        }


        
@keyframes fxMarBoltSmall{
          0%,63%,67%,100% { opacity: 0; }
          64% { opacity: .82; }
          65% { opacity: .08; }
          66% { opacity: .62; }
        }


        
@keyframes fxMarFlash{
          0%,61%,65%,69%,100% { opacity: 0; }
          62%,64%,67% { opacity: 1; }
          63%,66%,68% { opacity: .08; }
        }


        
@keyframes fxGoldSweep{
          0%,20% { left: -28%; opacity: 0; }
          30% { opacity: .9; }
          62% { left: 114%; opacity: .65; }
          72%,100% { left: 114%; opacity: 0; }
        }


        
@keyframes fxSirRotate{
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.08); }
          to { transform: rotate(360deg) scale(1); }
        }


        
@keyframes fxSirSweep{
          0%,16% { left: -28%; opacity: 0; }
          28% { opacity: .85; }
          62% { left: 114%; opacity: .62; }
          72%,100% { left: 114%; opacity: 0; }
        }


        
@keyframes fxSirFilm{
          0%,100% { background-position: 0% 50%; opacity: .45; }
          50% { background-position: 100% 50%; opacity: .9; }
        }


        
@media (prefers-reduced-motion: reduce){
          
.archive-featured-exact .rarity-fx > span{
            animation: none !important;
          }

        }



        
/* =====================================================
           PREMIUM FX V2 — stronger high-tier spectacle
           ===================================================== */


        
/* SR — faint drifting energy particles on top of the existing bloom */

        
.archive-featured-exact .hit-sr .fx-detail{
          inset: 0;
          opacity: .45;
          background-image:
            radial-gradient(circle, rgba(216,180,254,.72) 0 1px, transparent 1.6px),
            radial-gradient(circle, rgba(168,85,247,.55) 0 1.2px, transparent 1.8px);
          background-size: 42px 42px, 67px 67px;
          background-position: 8px 12px, 31px 4px;
          animation: fxSrParticles 7s linear infinite;
        }


        
/* IR — add a slow full-surface iridescent film behind the foil sweep */

        
.archive-featured-exact .hit-ir .fx-secondary{
          inset: -20%;
          opacity: .28;
          background:
            linear-gradient(
              115deg,
              rgba(251,146,60,.14),
              rgba(244,114,182,.18),
              rgba(167,139,250,.13),
              rgba(34,211,238,.12),
              rgba(251,146,60,.12)
            );
          background-size: 220% 220%;
          filter: blur(18px);
          animation: fxIrFilm 7s ease-in-out infinite;
        }


        
/* MAR — storm field, extra branching bolt and travelling electric border */

        
.archive-featured-exact .hit-mar{
          animation: fxMarBorder 3.4s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-mar .fx-ambient{
          background:
            radial-gradient(circle at 70% 48%, rgba(224,242,254,.48), transparent 17%),
            radial-gradient(circle at 65% 48%, rgba(34,211,238,.22), transparent 34%),
            linear-gradient(115deg, transparent 0 42%, rgba(34,211,238,.06) 50%, transparent 58%);
          background-size: 100% 100%, 100% 100%, 180% 100%;
          animation: fxMarStorm 4.2s steps(1,end) infinite;
        }


        
.archive-featured-exact .hit-mar .fx-detail{
          top: -10%;
          left: 34%;
          width: 8%;
          height: 115%;
          opacity: 0;
          transform: rotate(18deg);
          background: linear-gradient(180deg, #fff, #67e8f9 50%, #fff);
          clip-path: polygon(
            43% 0, 66% 0, 54% 25%, 77% 25%,
            45% 51%, 66% 51%, 18% 100%,
            36% 59%, 15% 59%, 41% 32%, 25% 32%
          );
          filter:
            drop-shadow(0 0 4px rgba(255,255,255,1))
            drop-shadow(0 0 10px rgba(34,211,238,.95));
          animation: fxMarBranch 4.2s steps(1,end) infinite;
        }


        
/* GOLD — animated metal surface, gold dust and a breathing edge */

        
.archive-featured-exact .hit-gold{
          animation: fxGoldBorder 4s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-ambient{
          inset: 0;
          background:
            radial-gradient(circle at 18% 20%, rgba(212,175,55,.16), transparent 24%),
            radial-gradient(circle at 82% 70%, rgba(250,204,21,.11), transparent 25%),
            linear-gradient(120deg, rgba(255,255,255,.015), rgba(212,175,55,.07), rgba(255,255,255,.01));
          background-size: 100% 100%, 100% 100%, 210% 100%;
          animation: fxGoldMetal 6s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-gold .fx-detail{
          inset: 0;
          opacity: .68;
          background-image:
            radial-gradient(circle, rgba(255,235,140,.90) 0 1px, transparent 1.7px),
            radial-gradient(circle, rgba(212,175,55,.72) 0 1.3px, transparent 2px),
            radial-gradient(circle, rgba(255,248,203,.56) 0 .8px, transparent 1.5px);
          background-size: 53px 53px, 79px 79px, 101px 101px;
          background-position: 4px 11px, 33px 7px, 16px 48px;
          animation: fxGoldDust 8s linear infinite;
        }


        
/* SIR — showpiece: layered prism field, spectral rays, particles and animated edge */

        
.archive-featured-exact .hit-sir{
          animation: fxSirBorder 3.6s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-ambient{
          inset: -65%;
          opacity: .68;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(34,211,238,.40) 46deg,
            rgba(99,102,241,.34) 86deg,
            rgba(167,139,250,.46) 125deg,
            rgba(244,114,182,.40) 168deg,
            rgba(250,204,21,.26) 214deg,
            rgba(52,211,153,.20) 254deg,
            rgba(34,211,238,.38) 302deg,
            transparent 344deg
          );
          filter: blur(24px);
          animation: fxSirRotateV2 6.5s linear infinite;
        }


        
.archive-featured-exact .hit-sir .fx-secondary{
          inset: 0;
          opacity: .64;
          background:
            linear-gradient(
              112deg,
              transparent 8%,
              rgba(34,211,238,.13) 28%,
              transparent 39%,
              rgba(167,139,250,.16) 51%,
              transparent 62%,
              rgba(244,114,182,.13) 76%,
              transparent 91%
            );
          background-size: 240% 100%;
          animation: fxSirRays 4.8s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-sir .fx-detail{
          inset: 0;
          opacity: .62;
          background-image:
            radial-gradient(circle, rgba(255,255,255,.88) 0 .9px, transparent 1.7px),
            radial-gradient(circle, rgba(103,232,249,.72) 0 1.1px, transparent 1.8px),
            radial-gradient(circle, rgba(244,114,182,.62) 0 .9px, transparent 1.6px);
          background-size: 49px 49px, 73px 73px, 97px 97px;
          background-position: 7px 13px, 38px 2px, 19px 39px;
          animation: fxSirParticles 7s linear infinite;
        }


        
@keyframes fxSrParticles{
          from { background-position: 8px 12px, 31px 4px; }
          to { background-position: 8px -72px, 31px -130px; }
        }


        
@keyframes fxIrFilm{
          0%,100% { background-position: 0% 50%; transform: scale(1); }
          50% { background-position: 100% 50%; transform: scale(1.05); }
        }


        
@keyframes fxMarBorder{
          0%,58%,72%,100% {
            border-color: rgba(34,211,238,.28);
            box-shadow: 0 14px 34px rgba(0,0,0,.28);
          }
          62%,66%,69% {
            border-color: rgba(186,230,253,.92);
            box-shadow:
              0 14px 34px rgba(0,0,0,.28),
              0 0 14px rgba(34,211,238,.30),
              inset 0 0 16px rgba(34,211,238,.08);
          }
        }


        
@keyframes fxMarStorm{
          0%,60%,64%,68%,72%,100% {
            opacity: .10;
            background-position: 0 0, 0 0, -60% 0;
          }
          61%,65%,69% {
            opacity: 1;
            background-position: 0 0, 0 0, 80% 0;
          }
          62%,66%,70% { opacity: .18; }
        }


        
@keyframes fxMarBranch{
          0%,64%,68%,100% { opacity: 0; }
          65% { opacity: .92; transform: rotate(18deg) scale(1); }
          66% { opacity: .08; }
          67% { opacity: .72; transform: rotate(15deg) scale(.96); }
        }


        
@keyframes fxGoldBorder{
          0%,100% {
            border-color: rgba(212,175,55,.34);
            box-shadow: 0 14px 34px rgba(0,0,0,.28);
          }
          50% {
            border-color: rgba(255,224,102,.78);
            box-shadow:
              0 14px 34px rgba(0,0,0,.28),
              0 0 14px rgba(212,175,55,.20),
              inset 0 0 14px rgba(212,175,55,.05);
          }
        }


        
@keyframes fxGoldMetal{
          0%,100% { background-position: 0 0, 0 0, 0% 50%; }
          50% { background-position: 0 0, 0 0, 100% 50%; }
        }


        
@keyframes fxGoldDust{
          from { background-position: 4px 11px, 33px 7px, 16px 48px; }
          to { background-position: 4px -95px, 33px -151px, 16px -154px; }
        }


        
@keyframes fxSirBorder{
          0%,100% {
            border-color: rgba(167,139,250,.38);
            box-shadow: 0 14px 34px rgba(0,0,0,.28);
          }
          33% {
            border-color: rgba(34,211,238,.72);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 15px rgba(34,211,238,.17);
          }
          66% {
            border-color: rgba(244,114,182,.68);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 15px rgba(244,114,182,.15);
          }
        }


        
@keyframes fxSirRotateV2{
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.12); }
          to { transform: rotate(360deg) scale(1); }
        }


        
@keyframes fxSirRays{
          0%,100% { background-position: 0% 50%; opacity: .38; }
          50% { background-position: 100% 50%; opacity: .78; }
        }


        
@keyframes fxSirParticles{
          from { background-position: 7px 13px, 38px 2px, 19px 39px; }
          to { background-position: 7px -85px, 38px -144px, 19px -155px; }
        }



        
/* =====================================================
           PREMIUM FX V3 — clear rarity hierarchy
           MAR = constant electrical storm
           GOLD = molten black/gold metal
           SIR = dimensional prismatic glass
           ===================================================== */


        
/* ---------- MAR: CONSTANT ELECTRICAL STORM ---------- */


        
.archive-featured-exact .hit-mar{
          border-color: rgba(103,232,249,.48) !important;
          animation: marChargedEdge 2.1s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-mar .fx-ambient{
          inset: 0;
          opacity: .72 !important;
          background:
            radial-gradient(circle at 18% 18%, rgba(34,211,238,.13), transparent 22%),
            radial-gradient(circle at 82% 78%, rgba(59,130,246,.12), transparent 25%),
            linear-gradient(115deg, transparent 0 40%, rgba(34,211,238,.045) 50%, transparent 60%);
          background-size: 100% 100%, 100% 100%, 190% 100%;
          animation: marStormDrift 4s linear infinite !important;
        }


        
/* long branching arc running diagonally behind content */

        
.archive-featured-exact .hit-mar .fx-primary{
          top: -12% !important;
          left: 6% !important;
          width: 92% !important;
          height: 122% !important;
          opacity: .78 !important;
          transform: none !important;
          background: none !important;
          filter: none !important;
          animation: marArcFlickerA 1.35s steps(1,end) infinite !important;
        }


        
.archive-featured-exact .hit-mar .fx-primary::before, .archive-featured-exact .hit-mar .fx-primary::after, .archive-featured-exact .hit-mar .fx-secondary::before, .archive-featured-exact .hit-mar .fx-secondary::after, .archive-featured-exact .hit-mar .fx-extra::before, .archive-featured-exact .hit-mar .fx-extra::after{
          content: "";
          position: absolute;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, #e0f2fe 12%, #67e8f9 50%, #ffffff 82%, transparent);
          height: 2px;
          border-radius: 999px;
          filter:
            drop-shadow(0 0 2px rgba(255,255,255,.95))
            drop-shadow(0 0 5px rgba(34,211,238,.95))
            drop-shadow(0 0 10px rgba(14,165,233,.65));
        }


        
.archive-featured-exact .hit-mar .fx-primary::before{
          width: 64%;
          top: 18%;
          left: 2%;
          transform: rotate(8deg);
          clip-path: polygon(0 40%, 14% 0, 25% 65%, 39% 18%, 52% 82%, 67% 24%, 82% 72%, 100% 30%, 100% 70%, 83% 100%, 67% 48%, 52% 100%, 39% 42%, 25% 90%, 14% 30%, 0 65%);
        }


        
.archive-featured-exact .hit-mar .fx-primary::after{
          width: 54%;
          right: 1%;
          bottom: 19%;
          transform: rotate(-10deg);
        }


        
.archive-featured-exact .hit-mar .fx-secondary{
          inset: 0 !important;
          width: auto !important;
          height: auto !important;
          left: 0 !important;
          opacity: .74 !important;
          transform: none !important;
          background: none !important;
          animation: marArcFlickerB 1.7s steps(1,end) infinite !important;
        }


        
.archive-featured-exact .hit-mar .fx-secondary::before{
          width: 48%;
          top: 48%;
          left: -3%;
          transform: rotate(-7deg);
        }


        
.archive-featured-exact .hit-mar .fx-secondary::after{
          width: 42%;
          top: 38%;
          right: -3%;
          transform: rotate(12deg);
        }


        
/* electric perimeter lines */

        
.archive-featured-exact .hit-mar .fx-detail{
          inset: 4px !important;
          opacity: .78 !important;
          border-radius: inherit;
          border-top: 1px solid rgba(186,230,253,.78);
          border-right: 1px solid rgba(34,211,238,.48);
          border-bottom: 1px solid rgba(96,165,250,.58);
          border-left: 1px solid rgba(103,232,249,.42);
          box-shadow:
            inset 0 0 10px rgba(34,211,238,.08),
            0 0 8px rgba(34,211,238,.12);
          background: none !important;
          animation: marPerimeter 1.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-mar .fx-extra{
          inset: 0;
          opacity: .8;
          animation: marArcFlickerC 1.1s steps(1,end) infinite;
        }


        
.archive-featured-exact .hit-mar .fx-extra::before{
          width: 36%;
          top: 8%;
          right: 8%;
          transform: rotate(-4deg);
        }


        
.archive-featured-exact .hit-mar .fx-extra::after{
          width: 31%;
          bottom: 8%;
          left: 12%;
          transform: rotate(5deg);
        }


        
.archive-featured-exact .hit-mar .fx-flare{
          inset: 0;
          opacity: .12;
          background: radial-gradient(circle at 60% 50%, rgba(224,242,254,.42), transparent 32%);
          animation: marChargeGlow 2.2s ease-in-out infinite;
        }


        
/* ---------- GOLD: MOLTEN BLACK METAL ---------- */


        
.archive-featured-exact .hit-gold{
          border-color: rgba(212,175,55,.55) !important;
          background:
            radial-gradient(circle at 20% 15%, rgba(212,175,55,.07), transparent 30%),
            linear-gradient(135deg, #060606, #15130b 52%, #070707) !important;
          animation: goldLivingEdge 3.2s ease-in-out infinite !important;
        }


        
/* slow molten veins */

        
.archive-featured-exact .hit-gold .fx-ambient{
          inset: -12% !important;
          opacity: .62 !important;
          background:
            repeating-linear-gradient(
              118deg,
              transparent 0 9%,
              rgba(212,175,55,.03) 10%,
              rgba(255,215,96,.24) 10.7%,
              rgba(212,175,55,.05) 11.4%,
              transparent 12.3% 22%
            );
          background-size: 180% 180%;
          filter: blur(.3px);
          animation: goldVeins 7s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-primary{
          top: -22% !important;
          bottom: -22% !important;
          left: -26% !important;
          width: 17% !important;
          transform: rotate(12deg) !important;
          opacity: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.16),
            rgba(255,248,203,.96),
            rgba(250,204,21,.38),
            transparent
          ) !important;
          filter: blur(.4px);
          animation: goldLuxurySweep 4.7s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-secondary{
          inset: 0 !important;
          opacity: .74 !important;
          background-image:
            radial-gradient(circle, rgba(255,238,155,.92) 0 1px, transparent 1.8px),
            radial-gradient(circle, rgba(212,175,55,.68) 0 1.2px, transparent 2px),
            radial-gradient(circle, rgba(255,248,203,.46) 0 .8px, transparent 1.5px) !important;
          background-size: 47px 47px, 73px 73px, 101px 101px !important;
          background-position: 5px 13px, 31px 4px, 18px 44px !important;
          animation: goldSparks 6.8s linear infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-detail{
          inset: 3px !important;
          border-radius: inherit;
          border: 1px solid rgba(255,222,112,.34);
          background: none !important;
          box-shadow:
            inset 0 0 16px rgba(212,175,55,.07),
            0 0 9px rgba(212,175,55,.08);
          animation: goldInnerEdge 2.8s ease-in-out infinite !important;
        }


        
/* molten glow pockets moving beneath the surface */

        
.archive-featured-exact .hit-gold .fx-extra{
          inset: 0;
          opacity: .48;
          background:
            radial-gradient(ellipse at 22% 72%, rgba(250,204,21,.18), transparent 16%),
            radial-gradient(ellipse at 62% 28%, rgba(212,175,55,.16), transparent 18%),
            radial-gradient(ellipse at 84% 66%, rgba(255,230,128,.13), transparent 15%);
          filter: blur(8px);
          animation: goldMoltenGlow 5.2s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-gold .fx-flare{
          inset: 0;
          opacity: 0;
          background: radial-gradient(circle at 50% 50%, rgba(255,238,160,.20), transparent 42%);
          animation: goldPowerPulse 6s ease-in-out infinite;
        }


        
/* ---------- SIR: DIMENSIONAL PRISM / HOLOGRAPHIC GLASS ---------- */


        
.archive-featured-exact .hit-sir{
          border-color: rgba(196,181,253,.58) !important;
          background:
            radial-gradient(circle at 18% 15%, rgba(34,211,238,.055), transparent 28%),
            radial-gradient(circle at 85% 80%, rgba(244,114,182,.055), transparent 30%),
            linear-gradient(135deg, #060913, #101326 52%, #070912) !important;
          animation: sirLivingBorder 3.8s linear infinite !important;
        }


        
/* deep rotating prism */

        
.archive-featured-exact .hit-sir .fx-ambient{
          inset: -68% !important;
          opacity: .72 !important;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(34,211,238,.42) 44deg,
            rgba(99,102,241,.38) 88deg,
            rgba(167,139,250,.50) 128deg,
            rgba(244,114,182,.44) 170deg,
            rgba(250,204,21,.28) 214deg,
            rgba(52,211,153,.24) 260deg,
            rgba(34,211,238,.40) 304deg,
            transparent 346deg
          ) !important;
          filter: blur(22px);
          animation: sirDimensionRotate 6s linear infinite !important;
        }


        
/* sharp spectral flare */

        
.archive-featured-exact .hit-sir .fx-primary{
          top: -25% !important;
          bottom: -25% !important;
          left: -28% !important;
          width: 19% !important;
          opacity: 0;
          transform: rotate(12deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.10),
            rgba(255,255,255,.92),
            rgba(103,232,249,.34),
            rgba(196,181,253,.36),
            rgba(244,114,182,.30),
            transparent
          ) !important;
          filter: blur(.3px);
          animation: sirSpectralFlare 4.2s ease-in-out infinite !important;
        }


        
/* moving refracted glass rays */

        
.archive-featured-exact .hit-sir .fx-secondary{
          inset: 0 !important;
          opacity: .72 !important;
          background:
            linear-gradient(
              112deg,
              transparent 4%,
              rgba(34,211,238,.13) 19%,
              transparent 31%,
              rgba(167,139,250,.17) 43%,
              transparent 56%,
              rgba(244,114,182,.15) 70%,
              transparent 84%,
              rgba(250,204,21,.08) 94%
            ) !important;
          background-size: 260% 100% !important;
          animation: sirGlassRays 4.5s ease-in-out infinite !important;
        }


        
/* prism dust */

        
.archive-featured-exact .hit-sir .fx-detail{
          inset: 0 !important;
          opacity: .72 !important;
          border: 0 !important;
          box-shadow: none !important;
          background-image:
            radial-gradient(circle, rgba(255,255,255,.96) 0 .9px, transparent 1.8px),
            radial-gradient(circle, rgba(103,232,249,.78) 0 1.1px, transparent 1.9px),
            radial-gradient(circle, rgba(244,114,182,.70) 0 .9px, transparent 1.7px),
            radial-gradient(circle, rgba(196,181,253,.72) 0 1px, transparent 1.8px) !important;
          background-size: 43px 43px, 67px 67px, 89px 89px, 113px 113px !important;
          background-position: 7px 12px, 31px 3px, 18px 41px, 51px 22px !important;
          animation: sirPrismDust 6.5s linear infinite !important;
        }


        
/* dimensional lens/refraction layer */

        
.archive-featured-exact .hit-sir .fx-extra{
          inset: -15%;
          opacity: .46;
          background:
            radial-gradient(ellipse at 28% 50%, transparent 0 15%, rgba(34,211,238,.13) 22%, transparent 34%),
            radial-gradient(ellipse at 68% 45%, transparent 0 13%, rgba(244,114,182,.13) 21%, transparent 35%),
            radial-gradient(ellipse at 50% 65%, transparent 0 12%, rgba(167,139,250,.14) 20%, transparent 34%);
          filter: blur(3px);
          animation: sirLensDrift 5.5s ease-in-out infinite;
        }


        
/* occasional jackpot-wide holographic bloom */

        
.archive-featured-exact .hit-sir .fx-flare{
          inset: 0;
          opacity: 0;
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.24), transparent 18%),
            radial-gradient(circle at 50% 50%, rgba(103,232,249,.18), transparent 38%),
            linear-gradient(90deg, transparent, rgba(196,181,253,.12), transparent);
          animation: sirJackpotBloom 6.4s ease-in-out infinite;
        }


        
@keyframes marChargedEdge{
          0%,100% {
            border-color: rgba(103,232,249,.42);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 8px rgba(34,211,238,.08);
          }
          50% {
            border-color: rgba(224,242,254,.74);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 15px rgba(34,211,238,.18);
          }
        }


        
@keyframes marStormDrift{
          from { background-position: 0 0, 0 0, -70% 0; }
          to { background-position: 0 0, 0 0, 120% 0; }
        }


        
@keyframes marArcFlickerA{
          0%,100% { opacity: .72; transform: translate(0,0); }
          14% { opacity: .28; transform: translate(1px,-1px); }
          17% { opacity: .92; }
          43% { opacity: .56; transform: translate(-1px,1px); }
          47% { opacity: .96; }
          71% { opacity: .38; }
          75% { opacity: .86; }
        }


        
@keyframes marArcFlickerB{
          0%,100% { opacity: .46; }
          20% { opacity: .88; }
          23% { opacity: .24; }
          52% { opacity: .72; }
          56% { opacity: .30; }
          82% { opacity: .94; }
        }


        
@keyframes marArcFlickerC{
          0%,100% { opacity: .34; }
          11% { opacity: .92; }
          15% { opacity: .18; }
          38% { opacity: .70; }
          44% { opacity: .26; }
          67% { opacity: .88; }
          73% { opacity: .22; }
        }


        
@keyframes marPerimeter{
          0%,100% { opacity: .55; filter: brightness(.9); }
          50% { opacity: 1; filter: brightness(1.35); }
        }


        
@keyframes marChargeGlow{
          0%,100% { opacity: .08; transform: scale(.96); }
          50% { opacity: .24; transform: scale(1.04); }
        }


        
@keyframes goldLivingEdge{
          0%,100% {
            border-color: rgba(212,175,55,.42);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 8px rgba(212,175,55,.07);
          }
          50% {
            border-color: rgba(255,224,112,.80);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 17px rgba(212,175,55,.19);
          }
        }


        
@keyframes goldVeins{
          0%,100% { background-position: 0% 20%; opacity: .40; }
          50% { background-position: 100% 80%; opacity: .78; }
        }


        
@keyframes goldLuxurySweep{
          0%,18% { left: -26%; opacity: 0; }
          28% { opacity: .94; }
          60% { left: 116%; opacity: .72; }
          70%,100% { left: 116%; opacity: 0; }
        }


        
@keyframes goldSparks{
          from { background-position: 5px 13px, 31px 4px, 18px 44px; }
          to { background-position: 5px -81px, 31px -142px, 18px -158px; }
        }


        
@keyframes goldInnerEdge{
          0%,100% { opacity: .46; }
          50% { opacity: .92; }
        }


        
@keyframes goldMoltenGlow{
          0%,100% { transform: translateX(-2%) scale(.96); opacity: .30; }
          50% { transform: translateX(2%) scale(1.06); opacity: .62; }
        }


        
@keyframes goldPowerPulse{
          0%,72%,100% { opacity: 0; }
          82% { opacity: .62; }
          90% { opacity: .10; }
        }


        
@keyframes sirLivingBorder{
          0%,100% {
            border-color: rgba(103,232,249,.58);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 12px rgba(34,211,238,.12);
          }
          25% {
            border-color: rgba(167,139,250,.72);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 15px rgba(167,139,250,.14);
          }
          50% {
            border-color: rgba(244,114,182,.70);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 15px rgba(244,114,182,.13);
          }
          75% {
            border-color: rgba(250,204,21,.52);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 13px rgba(250,204,21,.10);
          }
        }


        
@keyframes sirDimensionRotate{
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.13); }
          to { transform: rotate(360deg) scale(1); }
        }


        
@keyframes sirSpectralFlare{
          0%,14% { left: -28%; opacity: 0; }
          25% { opacity: .96; }
          58% { left: 116%; opacity: .72; }
          68%,100% { left: 116%; opacity: 0; }
        }


        
@keyframes sirGlassRays{
          0%,100% { background-position: 0% 50%; opacity: .48; }
          50% { background-position: 100% 50%; opacity: .86; }
        }


        
@keyframes sirPrismDust{
          from { background-position: 7px 12px, 31px 3px, 18px 41px, 51px 22px; }
          to { background-position: 7px -74px, 31px -131px, 18px -137px, 51px -204px; }
        }


        
@keyframes sirLensDrift{
          0%,100% { transform: translate(-2%,0) rotate(-2deg) scale(.96); }
          50% { transform: translate(2%,1%) rotate(2deg) scale(1.06); }
        }


        
@keyframes sirJackpotBloom{
          0%,68%,100% { opacity: 0; transform: scale(.92); }
          78% { opacity: .78; transform: scale(1.02); }
          84% { opacity: .26; }
          89% { opacity: .58; transform: scale(1.06); }
          94% { opacity: .08; }
        }



        
/* =====================================================
           RARITY FX V4 — professional escalating hierarchy
           EX -> SR -> IR -> MAR -> GOLD -> SIR
           ===================================================== */


        
/* Kill the previous V3 cartoon bolt pieces for MAR. */

        
.archive-featured-exact .rarity-fx-v4 .fx-primary::before, .archive-featured-exact .rarity-fx-v4 .fx-primary::after, .archive-featured-exact .rarity-fx-v4 .fx-secondary::before, .archive-featured-exact .rarity-fx-v4 .fx-secondary::after, .archive-featured-exact .rarity-fx-v4 .fx-extra::before, .archive-featured-exact .rarity-fx-v4 .fx-extra::after{
          content: none !important;
        }


        
/* Shared restraint: effects live inside the card and content stays crisp. */

        
.archive-featured-exact .rarity-fx-v4{
          mix-blend-mode: normal;
        }


        
/* EX — cool electric current / premium entry tier */

        
.archive-featured-exact .hit-ex .fx-ambient{
          inset: 0 !important;
          opacity: .62 !important;
          background:
            radial-gradient(ellipse at 12% 50%, rgba(59,130,246,.22), transparent 26%),
            radial-gradient(ellipse at 88% 50%, rgba(96,165,250,.12), transparent 24%) !important;
          animation: v4ExBreath 2.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ex .fx-primary{
          top: auto !important;
          left: -15% !important;
          bottom: 4px !important;
          width: 28% !important;
          height: 1px !important;
          opacity: .9 !important;
          transform: none !important;
          background: linear-gradient(90deg, transparent, #93c5fd, transparent) !important;
          box-shadow: 0 0 8px rgba(59,130,246,.55);
          animation: v4EdgeRun 3s linear infinite !important;
        }


        
/* SR — denser violet energy field + elegant drifting motes */

        
.archive-featured-exact .hit-sr .fx-ambient{
          inset: -12% !important;
          opacity: .56 !important;
          background:
            radial-gradient(circle at 28% 75%, rgba(126,34,206,.25), transparent 30%),
            radial-gradient(circle at 72% 30%, rgba(192,132,252,.18), transparent 28%) !important;
          filter: blur(10px);
          animation: v4SrField 3.2s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sr .fx-detail{
          inset: 0 !important;
          opacity: .52 !important;
          background-image:
            radial-gradient(circle, rgba(216,180,254,.78) 0 .8px, transparent 1.6px),
            radial-gradient(circle, rgba(167,139,250,.58) 0 1px, transparent 1.8px) !important;
          background-size: 46px 46px, 71px 71px !important;
          animation: v4Motes 7s linear infinite !important;
        }


        
/* IR — continuously shifting premium foil, like a card under light */

        
.archive-featured-exact .hit-ir .fx-ambient{
          inset: -25% !important;
          opacity: .34 !important;
          background: conic-gradient(
            from 40deg,
            rgba(251,146,60,.13),
            rgba(244,114,182,.20),
            rgba(167,139,250,.14),
            rgba(34,211,238,.12),
            rgba(251,146,60,.13)
          ) !important;
          filter: blur(22px);
          animation: v4IrRotate 8s linear infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-primary{
          top: -20% !important;
          bottom: -20% !important;
          left: -22% !important;
          width: 14% !important;
          opacity: 0 !important;
          transform: rotate(10deg) !important;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.52), rgba(244,114,182,.24), transparent) !important;
          animation: v4FoilSweep 4.4s ease-in-out infinite !important;
        }


        
/* MAR — constant realistic electrical field.
           Thin SVG arcs wrap all four sides and pulse asynchronously. */

        
.archive-featured-exact .hit-mar{
          border-color: rgba(103,232,249,.46) !important;
          animation: v4MarCardPulse 1.9s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-mar .fx-primary, .archive-featured-exact .hit-mar .fx-secondary, .archive-featured-exact .hit-mar .fx-detail, .archive-featured-exact .hit-mar .fx-extra{
          display: none !important;
        }


        
.archive-featured-exact .hit-mar .fx-ambient{
          inset: 0 !important;
          opacity: .48 !important;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(34,211,238,.13), transparent 34%),
            radial-gradient(ellipse at 50% 100%, rgba(59,130,246,.11), transparent 35%) !important;
          animation: v4MarAtmosphere 2s ease-in-out infinite !important;
        }


        
.archive-featured-exact .mar-electric-field{
          position: absolute;
          inset: 2px;
          width: calc(100% - 4px);
          height: calc(100% - 4px);
          z-index: 4;
          overflow: visible;
          pointer-events: none;
        }


        
.archive-featured-exact .electric-arc, .archive-featured-exact .electric-branch{
          fill: none;
          vector-effect: non-scaling-stroke;
          stroke-linecap: round;
          stroke-linejoin: round;
        }


        
.archive-featured-exact .electric-arc{
          stroke: rgba(224,242,254,.96);
          stroke-width: 1.35;
          stroke-dasharray: 5 3 18 4 3 7;
          filter: drop-shadow(0 0 2px rgba(255,255,255,.95)) drop-shadow(0 0 5px rgba(34,211,238,.85));
        }


        
.archive-featured-exact .electric-branch{
          stroke: rgba(103,232,249,.82);
          stroke-width: .85;
          stroke-dasharray: 3 3 8 4;
          filter: drop-shadow(0 0 3px rgba(34,211,238,.72));
        }


        
.archive-featured-exact .arc-a{ animation: v4ArcA .92s steps(2,end) infinite; }

        
.archive-featured-exact .arc-b{ animation: v4ArcB 1.17s steps(2,end) infinite; }

        
.archive-featured-exact .arc-c{ animation: v4ArcC .78s steps(2,end) infinite; }

        
.archive-featured-exact .arc-d{ animation: v4ArcD 1.04s steps(2,end) infinite; }

        
.archive-featured-exact .branch-a{ animation: v4Branch .63s steps(2,end) infinite; }

        
.archive-featured-exact .branch-b{ animation: v4Branch .81s steps(2,end) infinite reverse; }

        
.archive-featured-exact .branch-c{ animation: v4Branch .71s steps(2,end) infinite; }

        
.archive-featured-exact .branch-d{ animation: v4Branch .96s steps(2,end) infinite reverse; }


        
.archive-featured-exact .hit-mar .fx-flare{
          inset: 0 !important;
          opacity: .10 !important;
          background: radial-gradient(circle at 50% 50%, rgba(224,242,254,.20), transparent 55%) !important;
          animation: v4MarInnerPulse 1.45s ease-in-out infinite !important;
        }


        
/* GOLD — visibly above MAR: living molten metal rather than electricity */

        
.archive-featured-exact .hit-gold{
          border-color: rgba(226,190,74,.56) !important;
          background: linear-gradient(135deg, #050505, #141107 50%, #070604) !important;
          animation: v4GoldEdge 2.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-ambient{
          inset: -10% !important;
          opacity: .72 !important;
          background:
            repeating-linear-gradient(
              126deg,
              transparent 0 8%,
              rgba(255,220,110,.03) 8.6%,
              rgba(255,220,110,.30) 9.1%,
              rgba(180,126,22,.10) 9.8%,
              transparent 10.7% 19%
            ) !important;
          background-size: 190% 190% !important;
          filter: blur(.4px);
          animation: v4GoldVeins 5.5s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-primary{
          top: -25% !important;
          bottom: -25% !important;
          left: -20% !important;
          width: 13% !important;
          opacity: 0 !important;
          transform: rotate(10deg) !important;
          background: linear-gradient(90deg, transparent, rgba(255,247,198,.92), rgba(212,175,55,.32), transparent) !important;
          animation: v4GoldSweep 4s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-secondary{
          inset: 0 !important;
          opacity: .68 !important;
          background-image:
            radial-gradient(circle, rgba(255,238,155,.92) 0 .8px, transparent 1.7px),
            radial-gradient(circle, rgba(212,175,55,.68) 0 1px, transparent 1.8px) !important;
          background-size: 49px 49px, 77px 77px !important;
          animation: v4GoldEmbers 6s linear infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-detail{
          inset: 3px !important;
          border: 1px solid rgba(255,225,125,.42) !important;
          border-radius: inherit;
          background: none !important;
          box-shadow: inset 0 0 16px rgba(212,175,55,.08);
          animation: v4GoldInner 2.2s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-extra{
          inset: 0 !important;
          opacity: .58 !important;
          background:
            radial-gradient(ellipse at 18% 70%, rgba(250,204,21,.18), transparent 14%),
            radial-gradient(ellipse at 58% 28%, rgba(212,175,55,.20), transparent 16%),
            radial-gradient(ellipse at 86% 68%, rgba(255,228,128,.16), transparent 14%) !important;
          filter: blur(9px);
          animation: v4GoldPools 4.5s ease-in-out infinite !important;
        }


        
/* SIR — top tier: animated prismatic glass with depth and flare */

        
.archive-featured-exact .hit-sir{
          border-color: rgba(196,181,253,.62) !important;
          background: linear-gradient(135deg, #050712, #0e1225 50%, #070812) !important;
          animation: v4SirEdge 3s linear infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-ambient{
          inset: -72% !important;
          opacity: .76 !important;
          background: conic-gradient(
            from 0deg,
            rgba(34,211,238,.36),
            rgba(99,102,241,.34),
            rgba(167,139,250,.48),
            rgba(244,114,182,.40),
            rgba(250,204,21,.24),
            rgba(52,211,153,.22),
            rgba(34,211,238,.36)
          ) !important;
          filter: blur(24px);
          animation: v4SirPrism 5.8s linear infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-primary{
          top: -25% !important;
          bottom: -25% !important;
          left: -24% !important;
          width: 15% !important;
          opacity: 0 !important;
          transform: rotate(11deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.16),
            rgba(255,255,255,.96),
            rgba(103,232,249,.32),
            rgba(196,181,253,.36),
            rgba(244,114,182,.30),
            transparent
          ) !important;
          animation: v4SirFlare 3.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-secondary{
          inset: 0 !important;
          opacity: .78 !important;
          background:
            linear-gradient(112deg,
              transparent 4%,
              rgba(34,211,238,.14) 18%,
              transparent 30%,
              rgba(167,139,250,.18) 43%,
              transparent 56%,
              rgba(244,114,182,.16) 70%,
              transparent 83%,
              rgba(250,204,21,.09) 94%
            ) !important;
          background-size: 280% 100% !important;
          animation: v4SirRays 4s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-detail{
          inset: 0 !important;
          opacity: .72 !important;
          border: none !important;
          box-shadow: none !important;
          background-image:
            radial-gradient(circle, rgba(255,255,255,.96) 0 .8px, transparent 1.7px),
            radial-gradient(circle, rgba(103,232,249,.78) 0 1px, transparent 1.8px),
            radial-gradient(circle, rgba(244,114,182,.70) 0 .8px, transparent 1.6px),
            radial-gradient(circle, rgba(196,181,253,.72) 0 .9px, transparent 1.7px) !important;
          background-size: 41px 41px, 67px 67px, 91px 91px, 119px 119px !important;
          animation: v4SirDust 5.8s linear infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-extra{
          inset: -12% !important;
          opacity: .52 !important;
          background:
            radial-gradient(ellipse at 26% 50%, transparent 0 14%, rgba(34,211,238,.15) 21%, transparent 33%),
            radial-gradient(ellipse at 68% 44%, transparent 0 12%, rgba(244,114,182,.15) 20%, transparent 34%),
            radial-gradient(ellipse at 50% 68%, transparent 0 12%, rgba(167,139,250,.16) 20%, transparent 34%) !important;
          filter: blur(3px);
          animation: v4SirLens 4.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-flare{
          inset: 0 !important;
          opacity: 0 !important;
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.26), transparent 17%),
            radial-gradient(circle at 50% 50%, rgba(103,232,249,.18), transparent 38%),
            linear-gradient(90deg, transparent, rgba(196,181,253,.13), transparent) !important;
          animation: v4SirBloom 5.4s ease-in-out infinite !important;
        }


        
@keyframes v4ExBreath{
          0%,100% { opacity:.38; transform:scale(.98); }
          50% { opacity:.78; transform:scale(1.02); }
        }

        
@keyframes v4EdgeRun{
          from { left:-15%; }
          to { left:105%; }
        }

        
@keyframes v4SrField{
          0%,100% { transform:translate(-2%,1%) scale(.96); opacity:.38; }
          50% { transform:translate(2%,-1%) scale(1.07); opacity:.74; }
        }

        
@keyframes v4Motes{
          from { background-position:0 0, 20px 30px; }
          to { background-position:0 -92px, 20px -112px; }
        }

        
@keyframes v4IrRotate{
          from { transform:rotate(0deg) scale(1); }
          to { transform:rotate(360deg) scale(1.05); }
        }

        
@keyframes v4FoilSweep{
          0%,18% { left:-22%; opacity:0; }
          30% { opacity:.72; }
          62% { left:112%; opacity:.50; }
          72%,100% { left:112%; opacity:0; }
        }


        
@keyframes v4MarCardPulse{
          0%,100% { box-shadow:0 14px 34px rgba(0,0,0,.28),0 0 8px rgba(34,211,238,.10); }
          50% { box-shadow:0 14px 34px rgba(0,0,0,.28),0 0 16px rgba(34,211,238,.20); }
        }

        
@keyframes v4MarAtmosphere{
          0%,100% { opacity:.32; }
          50% { opacity:.62; }
        }

        
@keyframes v4ArcA{
          0% { opacity:.42; stroke-dashoffset:0; }
          24% { opacity:1; }
          27% { opacity:.30; }
          54% { opacity:.82; stroke-dashoffset:-13; }
          72% { opacity:.48; }
          100% { opacity:.76; stroke-dashoffset:-26; }
        }

        
@keyframes v4ArcB{
          0% { opacity:.72; stroke-dashoffset:0; }
          18% { opacity:.35; }
          21% { opacity:.94; }
          49% { opacity:.50; stroke-dashoffset:11; }
          77% { opacity:1; }
          100% { opacity:.52; stroke-dashoffset:24; }
        }

        
@keyframes v4ArcC{
          0% { opacity:.36; }
          16% { opacity:.96; }
          19% { opacity:.26; }
          46% { opacity:.80; }
          70% { opacity:.42; }
          73% { opacity:1; }
          100% { opacity:.58; }
        }

        
@keyframes v4ArcD{
          0% { opacity:.82; }
          31% { opacity:.30; }
          34% { opacity:.98; }
          63% { opacity:.48; }
          86% { opacity:.92; }
          100% { opacity:.54; }
        }

        
@keyframes v4Branch{
          0%,100% { opacity:.22; }
          35% { opacity:.92; }
          41% { opacity:.30; }
          72% { opacity:.74; }
        }

        
@keyframes v4MarInnerPulse{
          0%,100% { opacity:.06; transform:scale(.96); }
          50% { opacity:.20; transform:scale(1.04); }
        }


        
@keyframes v4GoldEdge{
          0%,100% { box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 9px rgba(212,175,55,.08); }
          50% { box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 18px rgba(212,175,55,.20); }
        }

        
@keyframes v4GoldVeins{
          0%,100% { background-position:0% 15%; opacity:.48; }
          50% { background-position:100% 85%; opacity:.82; }
        }

        
@keyframes v4GoldSweep{
          0%,16% { left:-20%; opacity:0; }
          27% { opacity:.96; }
          58% { left:112%; opacity:.68; }
          68%,100% { left:112%; opacity:0; }
        }

        
@keyframes v4GoldEmbers{
          from { background-position:5px 12px, 28px 5px; }
          to { background-position:5px -86px, 28px -149px; }
        }

        
@keyframes v4GoldInner{
          0%,100% { opacity:.44; }
          50% { opacity:.94; }
        }

        
@keyframes v4GoldPools{
          0%,100% { transform:translateX(-2%) scale(.96); opacity:.34; }
          50% { transform:translateX(2%) scale(1.07); opacity:.68; }
        }


        
@keyframes v4SirEdge{
          0%,100% { border-color:rgba(103,232,249,.58); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 12px rgba(34,211,238,.12); }
          25% { border-color:rgba(167,139,250,.76); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 16px rgba(167,139,250,.16); }
          50% { border-color:rgba(244,114,182,.72); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 16px rgba(244,114,182,.14); }
          75% { border-color:rgba(250,204,21,.52); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 14px rgba(250,204,21,.10); }
        }

        
@keyframes v4SirPrism{
          from { transform:rotate(0deg) scale(1); }
          50% { transform:rotate(180deg) scale(1.13); }
          to { transform:rotate(360deg) scale(1); }
        }

        
@keyframes v4SirFlare{
          0%,12% { left:-24%; opacity:0; }
          24% { opacity:.98; }
          56% { left:112%; opacity:.70; }
          66%,100% { left:112%; opacity:0; }
        }

        
@keyframes v4SirRays{
          0%,100% { background-position:0% 50%; opacity:.52; }
          50% { background-position:100% 50%; opacity:.90; }
        }

        
@keyframes v4SirDust{
          from { background-position:7px 12px,31px 3px,18px 41px,51px 22px; }
          to { background-position:7px -70px,31px -131px,18px -141px,51px -216px; }
        }

        
@keyframes v4SirLens{
          0%,100% { transform:translate(-2%,0) rotate(-2deg) scale(.96); }
          50% { transform:translate(2%,1%) rotate(2deg) scale(1.07); }
        }

        
@keyframes v4SirBloom{
          0%,65%,100% { opacity:0; transform:scale(.92); }
          76% { opacity:.82; transform:scale(1.02); }
          83% { opacity:.22; }
          89% { opacity:.58; transform:scale(1.07); }
          94% { opacity:.06; }
        }


        
/* =====================================================
           RARITY FX V5 — refinement pass
           Keeps SR + MAR direction, restores Gold motion,
           gives EX an identity, makes IR clearly > SR,
           and makes SIR the unmistakable top tier.
           ===================================================== */


        
/* EX — subtle but no longer empty:
           a restrained blue plasma ribbon + edge current. */

        
.archive-featured-exact .hit-ex{
          border-color: rgba(96,165,250,.32) !important;
        }


        
.archive-featured-exact .hit-ex .fx-ambient{
          inset: -8% !important;
          opacity: .58 !important;
          background:
            radial-gradient(ellipse at 16% 55%, rgba(59,130,246,.22), transparent 24%),
            radial-gradient(ellipse at 82% 42%, rgba(125,211,252,.12), transparent 24%),
            linear-gradient(110deg, transparent 25%, rgba(59,130,246,.07) 48%, transparent 70%) !important;
          background-size: 100% 100%, 100% 100%, 190% 100% !important;
          animation: v5ExField 3.4s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ex .fx-primary{
          display: block !important;
          top: auto !important;
          bottom: 3px !important;
          left: -18% !important;
          width: 25% !important;
          height: 1px !important;
          opacity: .9 !important;
          transform: none !important;
          background: linear-gradient(90deg, transparent, rgba(191,219,254,.95), rgba(59,130,246,.72), transparent) !important;
          box-shadow: 0 0 7px rgba(59,130,246,.48);
          animation: v5ExEdgeCurrent 2.9s linear infinite !important;
        }


        
.archive-featured-exact .hit-ex .fx-secondary{
          display: block !important;
          inset: 0 !important;
          opacity: .34 !important;
          background:
            linear-gradient(118deg, transparent 10%, rgba(96,165,250,.09) 42%, transparent 58%) !important;
          background-size: 210% 100% !important;
          animation: v5ExRibbon 4.4s ease-in-out infinite !important;
        }


        
/* IR — now a proper rarity jump over SR:
           living aurora foil + interference bands + bright foil glint. */

        
.archive-featured-exact .hit-ir{
          border-color: rgba(244,114,182,.38) !important;
          background:
            radial-gradient(circle at 16% 20%, rgba(244,114,182,.045), transparent 26%),
            radial-gradient(circle at 84% 78%, rgba(34,211,238,.045), transparent 28%),
            linear-gradient(135deg, #08090d, #101016 52%, #08090c) !important;
          animation: v5IrEdge 4.4s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-ambient{
          inset: -55% !important;
          opacity: .58 !important;
          background: conic-gradient(
            from 30deg,
            rgba(251,146,60,.16),
            rgba(244,114,182,.30),
            rgba(167,139,250,.24),
            rgba(34,211,238,.22),
            rgba(52,211,153,.13),
            rgba(251,146,60,.16)
          ) !important;
          filter: blur(25px);
          animation: v5IrAurora 8s linear infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-primary{
          display: block !important;
          top: -25% !important;
          bottom: -25% !important;
          left: -22% !important;
          width: 14% !important;
          opacity: 0 !important;
          transform: rotate(11deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.12),
            rgba(255,255,255,.72),
            rgba(244,114,182,.34),
            rgba(34,211,238,.24),
            transparent
          ) !important;
          filter: blur(.3px);
          animation: v5IrSweep 3.9s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-secondary{
          display: block !important;
          inset: 0 !important;
          opacity: .55 !important;
          background:
            repeating-linear-gradient(
              118deg,
              transparent 0 8%,
              rgba(244,114,182,.07) 9%,
              transparent 11% 18%,
              rgba(34,211,238,.06) 19%,
              transparent 21% 30%
            ) !important;
          background-size: 190% 160% !important;
          animation: v5IrInterference 6.2s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-detail{
          display: block !important;
          inset: 0 !important;
          opacity: .42 !important;
          border: none !important;
          background:
            radial-gradient(circle at 28% 35%, rgba(255,255,255,.30) 0 .7px, transparent 1.4px),
            radial-gradient(circle at 72% 65%, rgba(244,114,182,.34) 0 .8px, transparent 1.5px) !important;
          background-size: 54px 54px, 83px 83px !important;
          animation: v5IrDust 8s linear infinite !important;
        }


        
/* GOLD — restore obvious continuous movement.
           Keep the V4 black/melted-gold identity the user likes. */

        
.archive-featured-exact .hit-gold .fx-ambient{
          inset: -18% !important;
          opacity: .78 !important;
          background:
            repeating-linear-gradient(
              126deg,
              transparent 0 7%,
              rgba(255,220,110,.035) 7.8%,
              rgba(255,220,110,.34) 8.5%,
              rgba(180,126,22,.12) 9.2%,
              transparent 10.2% 18%
            ) !important;
          background-size: 220% 220% !important;
          filter: blur(.45px);
          animation: v5GoldVeins 4.6s linear infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-primary{
          display: block !important;
          top: -25% !important;
          bottom: -25% !important;
          left: -24% !important;
          width: 14% !important;
          opacity: 0 !important;
          transform: rotate(10deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.18),
            rgba(255,249,205,.96),
            rgba(250,204,21,.38),
            transparent
          ) !important;
          filter: blur(.35px);
          animation: v5GoldSweep 3.7s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-secondary{
          display: block !important;
          inset: 0 !important;
          opacity: .72 !important;
          background-image:
            radial-gradient(circle, rgba(255,239,158,.95) 0 .8px, transparent 1.7px),
            radial-gradient(circle, rgba(212,175,55,.72) 0 1px, transparent 1.8px) !important;
          background-size: 47px 47px, 73px 73px !important;
          animation: v5GoldEmbers 5.2s linear infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-extra{
          display: block !important;
          inset: -5% !important;
          opacity: .66 !important;
          background:
            radial-gradient(ellipse at 18% 70%, rgba(250,204,21,.20), transparent 14%),
            radial-gradient(ellipse at 58% 28%, rgba(212,175,55,.22), transparent 16%),
            radial-gradient(ellipse at 86% 68%, rgba(255,228,128,.18), transparent 14%) !important;
          filter: blur(8px);
          animation: v5GoldMolten 3.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-gold .fx-flare{
          display: block !important;
          inset: 0 !important;
          opacity: .18 !important;
          background: linear-gradient(105deg, transparent 25%, rgba(255,220,110,.09) 50%, transparent 75%) !important;
          background-size: 220% 100% !important;
          animation: v5GoldSurface 4.8s ease-in-out infinite !important;
        }


        
/* SIR — top-tier showpiece:
           animated holographic glass, aurora depth, spectral caustics,
           crystal shimmer and periodic jackpot flare. */

        
.archive-featured-exact .hit-sir{
          border-color: rgba(196,181,253,.68) !important;
          background:
            radial-gradient(circle at 12% 16%, rgba(34,211,238,.065), transparent 25%),
            radial-gradient(circle at 86% 82%, rgba(244,114,182,.065), transparent 27%),
            linear-gradient(135deg, #050712, #0d1122 50%, #060711) !important;
          animation: v5SirBorder 2.8s linear infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-ambient{
          inset: -75% !important;
          opacity: .86 !important;
          background: conic-gradient(
            from 0deg,
            rgba(34,211,238,.44),
            rgba(59,130,246,.30),
            rgba(139,92,246,.48),
            rgba(244,114,182,.46),
            rgba(251,191,36,.28),
            rgba(52,211,153,.25),
            rgba(34,211,238,.44)
          ) !important;
          filter: blur(22px);
          animation: v5SirAurora 5.1s linear infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-primary{
          display: block !important;
          top: -28% !important;
          bottom: -28% !important;
          left: -24% !important;
          width: 16% !important;
          opacity: 0 !important;
          transform: rotate(11deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.12),
            rgba(255,255,255,1),
            rgba(103,232,249,.38),
            rgba(196,181,253,.42),
            rgba(244,114,182,.36),
            transparent
          ) !important;
          filter: blur(.25px);
          animation: v5SirSpectralSweep 3.25s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-secondary{
          display: block !important;
          inset: -4% !important;
          opacity: .82 !important;
          background:
            linear-gradient(
              112deg,
              transparent 4%,
              rgba(34,211,238,.16) 16%,
              transparent 27%,
              rgba(167,139,250,.22) 40%,
              transparent 52%,
              rgba(244,114,182,.19) 65%,
              transparent 78%,
              rgba(250,204,21,.11) 91%,
              transparent
            ) !important;
          background-size: 300% 100% !important;
          filter: blur(.2px);
          animation: v5SirCaustics 3.7s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-detail{
          display: block !important;
          inset: 0 !important;
          opacity: .82 !important;
          border: none !important;
          box-shadow: none !important;
          background-image:
            radial-gradient(circle, rgba(255,255,255,1) 0 .9px, transparent 1.8px),
            radial-gradient(circle, rgba(103,232,249,.86) 0 1px, transparent 1.9px),
            radial-gradient(circle, rgba(244,114,182,.80) 0 .9px, transparent 1.7px),
            radial-gradient(circle, rgba(196,181,253,.82) 0 1px, transparent 1.8px) !important;
          background-size: 37px 37px, 61px 61px, 83px 83px, 109px 109px !important;
          animation: v5SirCrystalDust 5.1s linear infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-extra{
          display: block !important;
          inset: -16% !important;
          opacity: .62 !important;
          background:
            radial-gradient(ellipse at 24% 48%, transparent 0 13%, rgba(34,211,238,.18) 20%, transparent 32%),
            radial-gradient(ellipse at 70% 42%, transparent 0 11%, rgba(244,114,182,.18) 19%, transparent 33%),
            radial-gradient(ellipse at 50% 70%, transparent 0 11%, rgba(167,139,250,.20) 19%, transparent 33%) !important;
          filter: blur(2.5px);
          animation: v5SirGlassDepth 4.2s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sir .fx-flare{
          display: block !important;
          inset: 0 !important;
          opacity: 0 !important;
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.32), transparent 14%),
            radial-gradient(circle at 50% 50%, rgba(103,232,249,.21), transparent 34%),
            radial-gradient(circle at 50% 50%, rgba(244,114,182,.13), transparent 52%) !important;
          animation: v5SirJackpot 4.9s ease-in-out infinite !important;
        }


        
@keyframes v5ExField{
          0%,100% { background-position:0 0,0 0,-70% 0; opacity:.42; }
          50% { background-position:0 0,0 0,110% 0; opacity:.68; }
        }

        
@keyframes v5ExEdgeCurrent{
          from { left:-18%; }
          to { left:108%; }
        }

        
@keyframes v5ExRibbon{
          0%,100% { background-position:0% 50%; opacity:.20; }
          50% { background-position:100% 50%; opacity:.48; }
        }


        
@keyframes v5IrEdge{
          0%,100% { border-color:rgba(244,114,182,.32); box-shadow:0 14px 34px rgba(0,0,0,.28),0 0 7px rgba(244,114,182,.05); }
          50% { border-color:rgba(103,232,249,.48); box-shadow:0 14px 34px rgba(0,0,0,.28),0 0 11px rgba(34,211,238,.10); }
        }

        
@keyframes v5IrAurora{
          from { transform:rotate(0deg) scale(1); }
          50% { transform:rotate(180deg) scale(1.08); }
          to { transform:rotate(360deg) scale(1); }
        }

        
@keyframes v5IrSweep{
          0%,14% { left:-22%; opacity:0; }
          26% { opacity:.84; }
          59% { left:113%; opacity:.55; }
          69%,100% { left:113%; opacity:0; }
        }

        
@keyframes v5IrInterference{
          0%,100% { background-position:0% 20%; opacity:.38; }
          50% { background-position:100% 80%; opacity:.68; }
        }

        
@keyframes v5IrDust{
          from { background-position:0 0,25px 40px; }
          to { background-position:0 -108px,25px -126px; }
        }


        
@keyframes v5GoldVeins{
          from { background-position:0% 0%; }
          to { background-position:100% 100%; }
        }

        
@keyframes v5GoldSweep{
          0%,12% { left:-24%; opacity:0; }
          24% { opacity:.98; }
          57% { left:114%; opacity:.72; }
          67%,100% { left:114%; opacity:0; }
        }

        
@keyframes v5GoldEmbers{
          from { background-position:5px 12px,28px 5px; }
          to { background-position:5px -82px,28px -141px; }
        }

        
@keyframes v5GoldMolten{
          0%,100% { transform:translate(-2%,1%) scale(.95); opacity:.40; }
          50% { transform:translate(2%,-1%) scale(1.08); opacity:.76; }
        }

        
@keyframes v5GoldSurface{
          0%,100% { background-position:0% 50%; opacity:.10; }
          50% { background-position:100% 50%; opacity:.30; }
        }


        
@keyframes v5SirBorder{
          0%,100% { border-color:rgba(103,232,249,.62); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 13px rgba(34,211,238,.13); }
          25% { border-color:rgba(167,139,250,.82); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 18px rgba(167,139,250,.18); }
          50% { border-color:rgba(244,114,182,.78); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 18px rgba(244,114,182,.16); }
          75% { border-color:rgba(250,204,21,.58); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 15px rgba(250,204,21,.11); }
        }

        
@keyframes v5SirAurora{
          from { transform:rotate(0deg) scale(1); }
          50% { transform:rotate(180deg) scale(1.15); }
          to { transform:rotate(360deg) scale(1); }
        }

        
@keyframes v5SirSpectralSweep{
          0%,10% { left:-24%; opacity:0; }
          22% { opacity:1; }
          55% { left:114%; opacity:.78; }
          65%,100% { left:114%; opacity:0; }
        }

        
@keyframes v5SirCaustics{
          0%,100% { background-position:0% 50%; opacity:.56; }
          50% { background-position:100% 50%; opacity:.94; }
        }

        
@keyframes v5SirCrystalDust{
          from { background-position:7px 12px,31px 3px,18px 41px,51px 22px; }
          to { background-position:7px -62px,31px -119px,18px -125px,51px -196px; }
        }

        
@keyframes v5SirGlassDepth{
          0%,100% { transform:translate(-2%,0) rotate(-2deg) scale(.95); }
          50% { transform:translate(2%,1%) rotate(2deg) scale(1.08); }
        }

        
@keyframes v5SirJackpot{
          0%,58%,100% { opacity:0; transform:scale(.90); }
          69% { opacity:.92; transform:scale(1.02); }
          76% { opacity:.24; }
          83% { opacity:.68; transform:scale(1.08); }
          90% { opacity:.07; }
        }


        
/* =====================================================
           RARITY FX V6 — IR / GOLD / SIR premium refinement
           ===================================================== */


        
/* IR: near-MAR tier. More dimensional foil with moving spectral bands
           and a clean diffraction flare, while remaining calmer than MAR. */

        
.archive-featured-exact .hit-ir{
          animation: v6IrEdge 3.5s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-ambient{
          inset: -62% !important;
          opacity: .70 !important;
          background: conic-gradient(
            from 20deg,
            rgba(251,146,60,.18),
            rgba(244,114,182,.36),
            rgba(167,139,250,.31),
            rgba(34,211,238,.28),
            rgba(52,211,153,.18),
            rgba(250,204,21,.13),
            rgba(251,146,60,.18)
          ) !important;
          filter: blur(23px);
          animation: v6IrAurora 6.5s linear infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-primary{
          top: -28% !important;
          bottom: -28% !important;
          left: -25% !important;
          width: 16% !important;
          opacity: 0 !important;
          transform: rotate(10deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.10),
            rgba(255,255,255,.88),
            rgba(244,114,182,.42),
            rgba(167,139,250,.30),
            rgba(34,211,238,.32),
            transparent
          ) !important;
          filter: blur(.25px);
          animation: v6IrPrismSweep 3.25s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-secondary{
          inset: 0 !important;
          opacity: .70 !important;
          background:
            repeating-linear-gradient(
              116deg,
              transparent 0 7%,
              rgba(244,114,182,.10) 8%,
              transparent 10% 15%,
              rgba(34,211,238,.09) 16%,
              transparent 18% 24%,
              rgba(167,139,250,.08) 25%,
              transparent 27% 34%
            ) !important;
          background-size: 220% 180% !important;
          animation: v6IrBands 4.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-extra{
          display: block !important;
          inset: -8% !important;
          opacity: .48 !important;
          background:
            radial-gradient(ellipse at 24% 45%, transparent 0 13%, rgba(244,114,182,.15) 20%, transparent 31%),
            radial-gradient(ellipse at 72% 58%, transparent 0 12%, rgba(34,211,238,.15) 19%, transparent 31%) !important;
          filter: blur(3px);
          animation: v6IrLens 4.2s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-ir .fx-flare{
          display: block !important;
          inset: 0 !important;
          opacity: 0 !important;
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.20), transparent 14%),
            linear-gradient(90deg, transparent, rgba(244,114,182,.12), rgba(34,211,238,.10), transparent) !important;
          animation: v6IrFlash 5.2s ease-in-out infinite !important;
        }


        
/* GOLD: replace the previous abstract vein motion with literal molten
           gold running down the card. */

        
.archive-featured-exact .hit-gold .fx-ambient, .archive-featured-exact .hit-gold .fx-primary, .archive-featured-exact .hit-gold .fx-secondary, .archive-featured-exact .hit-gold .fx-extra, .archive-featured-exact .hit-gold .fx-flare{
          opacity: 0 !important;
          animation: none !important;
        }


        
.archive-featured-exact .hit-gold{
          position: relative;
          overflow: hidden !important;
          background:
            radial-gradient(circle at 50% -10%, rgba(212,175,55,.13), transparent 36%),
            linear-gradient(135deg, #050505, #151108 52%, #070604) !important;
          border-color: rgba(225,190,75,.58) !important;
          animation: v6GoldCardGlow 2.7s ease-in-out infinite !important;
        }


        
.archive-featured-exact .gold-molten-system{
          position: absolute;
          inset: 0;
          z-index: 3;
          overflow: hidden;
          border-radius: inherit;
          pointer-events: none;
        }


        
.archive-featured-exact .gold-top-pool{
          position: absolute;
          top: -5px;
          left: -3%;
          width: 106%;
          height: 13px;
          border-radius: 0 0 55% 45%;
          background:
            linear-gradient(180deg, rgba(255,247,190,.96), rgba(250,204,21,.88) 38%, rgba(154,101,14,.86));
          box-shadow:
            0 2px 5px rgba(255,225,110,.38),
            0 7px 16px rgba(212,175,55,.15);
          animation: v6GoldPool 3.2s ease-in-out infinite;
        }


        
.archive-featured-exact .gold-drip{
          position: absolute;
          top: 3px;
          width: 5px;
          height: 54%;
          border-radius: 0 0 999px 999px;
          transform-origin: top center;
          background:
            linear-gradient(
              90deg,
              rgba(132,82,8,.80),
              rgba(250,204,21,.96) 32%,
              rgba(255,245,181,1) 52%,
              rgba(212,154,25,.94) 76%,
              rgba(111,67,7,.78)
            );
          box-shadow:
            0 0 5px rgba(250,204,21,.26),
            inset 1px 0 1px rgba(255,255,255,.32);
        }


        
.archive-featured-exact .gold-drip::after{
          content: "";
          position: absolute;
          left: 50%;
          bottom: -4px;
          width: 9px;
          height: 9px;
          transform: translateX(-50%);
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #fff6bd, #facc15 42%, #a16207 82%);
          box-shadow: 0 0 6px rgba(250,204,21,.34);
        }


        
.archive-featured-exact .gold-drip-1{
          left: 15%;
          height: 44%;
          animation: v6GoldDripA 3.6s ease-in-out infinite;
        }

        
.archive-featured-exact .gold-drip-2{
          left: 39%;
          width: 7px;
          height: 68%;
          animation: v6GoldDripB 4.3s ease-in-out infinite .45s;
        }

        
.archive-featured-exact .gold-drip-3{
          left: 68%;
          width: 4px;
          height: 51%;
          animation: v6GoldDripA 3.9s ease-in-out infinite 1.1s;
        }

        
.archive-featured-exact .gold-drip-4{
          left: 86%;
          width: 6px;
          height: 61%;
          animation: v6GoldDripB 4.6s ease-in-out infinite 1.7s;
        }


        
.archive-featured-exact .gold-drop{
          position: absolute;
          top: -12px;
          width: 8px;
          height: 11px;
          border-radius: 55% 55% 62% 62%;
          background: radial-gradient(circle at 35% 25%, #fff7c7, #facc15 43%, #9a6708 84%);
          box-shadow: 0 0 6px rgba(250,204,21,.34);
          opacity: 0;
        }


        
.archive-featured-exact .gold-drop-1{ left: 27%; animation: v6GoldDrop 3.4s ease-in infinite .2s; }

        
.archive-featured-exact .gold-drop-2{ left: 57%; animation: v6GoldDrop 4.1s ease-in infinite 1.3s; }

        
.archive-featured-exact .gold-drop-3{ left: 78%; animation: v6GoldDrop 3.7s ease-in infinite 2.1s; }


        
/* SIR: keep the classy holographic depth but add an unmistakable
           top-tier flash signature: crystalline starbursts + expanding prism ring. */

        
.archive-featured-exact .hit-sir .fx-ambient{
          opacity: .90 !important;
        }


        
.archive-featured-exact .hit-sir .fx-primary{
          animation-duration: 2.9s !important;
        }


        
.archive-featured-exact .hit-sir .fx-secondary{
          opacity: .88 !important;
          animation-duration: 3.25s !important;
        }


        
.archive-featured-exact .sir-flash-system{
          position: absolute;
          inset: 0;
          z-index: 4;
          overflow: hidden;
          border-radius: inherit;
          pointer-events: none;
        }


        
.archive-featured-exact .sir-starburst{
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          opacity: 0;
          background: #fff;
          box-shadow:
            0 0 6px rgba(255,255,255,.95),
            0 0 14px rgba(103,232,249,.55),
            0 0 22px rgba(196,181,253,.35);
        }


        
.archive-featured-exact .sir-starburst::before, .archive-featured-exact .sir-starburst::after{
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.95), transparent);
          transform: translate(-50%,-50%);
        }


        
.archive-featured-exact .sir-starburst::before{
          width: 74px;
          height: 1px;
        }


        
.archive-featured-exact .sir-starburst::after{
          width: 1px;
          height: 74px;
          background: linear-gradient(180deg, transparent, rgba(255,255,255,.95), transparent);
        }


        
.archive-featured-exact .sir-starburst-1{
          top: 28%;
          left: 24%;
          animation: v6SirStarA 4.2s ease-in-out infinite;
        }


        
.archive-featured-exact .sir-starburst-2{
          top: 68%;
          left: 76%;
          animation: v6SirStarB 4.2s ease-in-out infinite 1.7s;
        }


        
.archive-featured-exact .sir-rainbow-ring{
          position: absolute;
          top: 50%;
          left: 50%;
          width: 32%;
          aspect-ratio: 1;
          border-radius: 50%;
          opacity: 0;
          transform: translate(-50%,-50%) scale(.35);
          border: 1px solid rgba(255,255,255,.70);
          box-shadow:
            0 -2px 10px rgba(34,211,238,.42),
            2px 0 10px rgba(167,139,250,.40),
            0 2px 10px rgba(244,114,182,.38),
            -2px 0 10px rgba(250,204,21,.25);
          animation: v6SirRing 5s ease-out infinite;
        }


        
@keyframes v6IrEdge{
          0%,100% {
            border-color: rgba(244,114,182,.38);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 8px rgba(244,114,182,.07);
          }
          50% {
            border-color: rgba(103,232,249,.58);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 14px rgba(34,211,238,.13);
          }
        }

        
@keyframes v6IrAurora{
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.11); }
          to { transform: rotate(360deg) scale(1); }
        }

        
@keyframes v6IrPrismSweep{
          0%,10% { left:-25%; opacity:0; }
          23% { opacity:.94; }
          57% { left:114%; opacity:.68; }
          67%,100% { left:114%; opacity:0; }
        }

        
@keyframes v6IrBands{
          0%,100% { background-position:0% 15%; opacity:.48; }
          50% { background-position:100% 85%; opacity:.80; }
        }

        
@keyframes v6IrLens{
          0%,100% { transform:translate(-2%,0) scale(.96); }
          50% { transform:translate(2%,1%) scale(1.06); }
        }

        
@keyframes v6IrFlash{
          0%,70%,100% { opacity:0; transform:scale(.95); }
          80% { opacity:.58; transform:scale(1.02); }
          88% { opacity:.10; }
        }


        
@keyframes v6GoldCardGlow{
          0%,100% {
            border-color:rgba(225,190,75,.48);
            box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 8px rgba(212,175,55,.08);
          }
          50% {
            border-color:rgba(255,226,124,.80);
            box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 18px rgba(212,175,55,.21);
          }
        }

        
@keyframes v6GoldPool{
          0%,100% { transform:translateY(-2px) scaleX(.98); filter:brightness(.92); }
          50% { transform:translateY(1px) scaleX(1.02); filter:brightness(1.18); }
        }

        
@keyframes v6GoldDripA{
          0%,100% { transform:scaleY(.22); opacity:.54; }
          45% { transform:scaleY(.86); opacity:.96; }
          70% { transform:scaleY(1); opacity:.82; }
        }

        
@keyframes v6GoldDripB{
          0%,100% { transform:scaleY(.30); opacity:.48; }
          38% { transform:scaleY(1); opacity:1; }
          68% { transform:scaleY(.72); opacity:.78; }
        }

        
@keyframes v6GoldDrop{
          0%,22% { top:-12px; opacity:0; transform:scale(.65); }
          28% { opacity:1; }
          72% { opacity:.92; transform:scale(1); }
          100% { top:108%; opacity:0; transform:scale(.72); }
        }


        
@keyframes v6SirStarA{
          0%,58%,100% { opacity:0; transform:scale(.35) rotate(0deg); }
          68% { opacity:1; transform:scale(1.25) rotate(20deg); }
          76% { opacity:.24; transform:scale(.78) rotate(35deg); }
          82% { opacity:.78; transform:scale(1) rotate(45deg); }
          90% { opacity:0; transform:scale(1.5) rotate(55deg); }
        }

        
@keyframes v6SirStarB{
          0%,60%,100% { opacity:0; transform:scale(.3) rotate(45deg); }
          70% { opacity:.92; transform:scale(1.05) rotate(65deg); }
          79% { opacity:.18; }
          86% { opacity:.70; transform:scale(.86) rotate(80deg); }
          94% { opacity:0; transform:scale(1.4) rotate(95deg); }
        }

        
@keyframes v6SirRing{
          0%,55% { opacity:0; transform:translate(-50%,-50%) scale(.25); }
          65% { opacity:.78; }
          88% { opacity:.18; }
          100% { opacity:0; transform:translate(-50%,-50%) scale(3.6); }
        }


        
/* =====================================================
           V7 — IR signature spectral ribbons + heavier molten Gold
           ===================================================== */


        
/* IR's equivalent of MAR lightning:
           continuous luminous spectral ribbons flow across the whole card. */

        
.archive-featured-exact .ir-spectral-field{
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 4;
          overflow: visible;
          pointer-events: none;
          opacity: .92;
        }


        
.archive-featured-exact .ir-ribbon{
          fill: none;
          vector-effect: non-scaling-stroke;
          stroke-linecap: round;
          stroke-width: 2.2;
          stroke-dasharray: 34 13 8 12;
        }


        
.archive-featured-exact .ir-ribbon-a{
          animation: v7IrRibbonA 3.8s ease-in-out infinite;
        }


        
.archive-featured-exact .ir-ribbon-b{
          stroke-width: 1.65;
          opacity: .76;
          animation: v7IrRibbonB 4.5s ease-in-out infinite;
        }


        
.archive-featured-exact .ir-ribbon-c{
          stroke-width: 1.05;
          opacity: .58;
          animation: v7IrRibbonC 3.2s ease-in-out infinite;
        }


        
.archive-featured-exact .hit-ir .fx-ambient{
          opacity: .76 !important;
          animation-duration: 5.8s !important;
        }


        
.archive-featured-exact .hit-ir .fx-primary{
          animation-duration: 2.9s !important;
        }


        
.archive-featured-exact .hit-ir .fx-flare{
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.24), transparent 13%),
            radial-gradient(circle at 50% 50%, rgba(244,114,182,.13), transparent 32%),
            linear-gradient(90deg, transparent, rgba(103,232,249,.11), rgba(244,114,182,.13), transparent) !important;
          animation: v7IrPulse 4.4s ease-in-out infinite !important;
        }


        
/* Gold: denser, longer streams. Existing four remain, but now most
           streaks visibly travel deep into / all the way down the card. */

        
.archive-featured-exact .gold-drip-1{
          left: 8% !important;
          height: 94% !important;
          width: 4px !important;
          animation: v7GoldLongA 4.2s ease-in-out infinite !important;
        }


        
.archive-featured-exact .gold-drip-2{
          left: 22% !important;
          height: 112% !important;
          width: 7px !important;
          animation: v7GoldLongB 5.0s ease-in-out infinite .4s !important;
        }


        
.archive-featured-exact .gold-drip-3{
          left: 36% !important;
          height: 82% !important;
          width: 3px !important;
          animation: v7GoldLongA 4.6s ease-in-out infinite .9s !important;
        }


        
.archive-featured-exact .gold-drip-4{
          left: 51% !important;
          height: 118% !important;
          width: 6px !important;
          animation: v7GoldLongB 5.4s ease-in-out infinite 1.4s !important;
        }


        
.archive-featured-exact .gold-drip-5{
          left: 63%;
          height: 91%;
          width: 4px;
          animation: v7GoldLongA 4.8s ease-in-out infinite .7s;
        }


        
.archive-featured-exact .gold-drip-6{
          left: 73%;
          height: 115%;
          width: 7px;
          animation: v7GoldLongB 5.3s ease-in-out infinite 1.8s;
        }


        
.archive-featured-exact .gold-drip-7{
          left: 84%;
          height: 76%;
          width: 3px;
          animation: v7GoldLongA 4.1s ease-in-out infinite 1.2s;
        }


        
.archive-featured-exact .gold-drip-8{
          left: 93%;
          height: 108%;
          width: 5px;
          animation: v7GoldLongB 5.6s ease-in-out infinite 2.2s;
        }


        
.archive-featured-exact .gold-drip{
          top: -1px !important;
          background:
            linear-gradient(
              90deg,
              rgba(108,64,5,.78),
              rgba(212,154,25,.92) 18%,
              rgba(255,226,108,.98) 42%,
              rgba(255,248,194,1) 54%,
              rgba(230,174,43,.96) 72%,
              rgba(117,70,6,.80)
            ) !important;
          box-shadow:
            0 0 5px rgba(250,204,21,.25),
            0 0 12px rgba(212,175,55,.09),
            inset 1px 0 1px rgba(255,255,255,.32) !important;
        }


        
.archive-featured-exact .gold-top-pool{
          height: 16px !important;
          animation-duration: 2.7s !important;
        }


        
@keyframes v7IrRibbonA{
          0%,100% { stroke-dashoffset:0; opacity:.54; transform:translateY(3px); }
          50% { stroke-dashoffset:-86; opacity:1; transform:translateY(-4px); }
        }


        
@keyframes v7IrRibbonB{
          0%,100% { stroke-dashoffset:40; opacity:.42; transform:translateY(-3px); }
          50% { stroke-dashoffset:-72; opacity:.88; transform:translateY(4px); }
        }


        
@keyframes v7IrRibbonC{
          0%,100% { stroke-dashoffset:-20; opacity:.30; }
          50% { stroke-dashoffset:-108; opacity:.72; }
        }


        
@keyframes v7IrPulse{
          0%,62%,100% { opacity:0; transform:scale(.94); }
          73% { opacity:.68; transform:scale(1.02); }
          80% { opacity:.16; }
          86% { opacity:.46; transform:scale(1.05); }
          92% { opacity:.04; }
        }


        
@keyframes v7GoldLongA{
          0%,100% { transform:scaleY(.20); opacity:.52; filter:brightness(.86); }
          34% { transform:scaleY(.70); opacity:.92; filter:brightness(1.06); }
          68% { transform:scaleY(1); opacity:1; filter:brightness(1.16); }
          84% { transform:scaleY(.88); opacity:.82; }
        }


        
@keyframes v7GoldLongB{
          0%,100% { transform:scaleY(.28); opacity:.48; filter:brightness(.88); }
          28% { transform:scaleY(.56); opacity:.78; }
          57% { transform:scaleY(1); opacity:1; filter:brightness(1.18); }
          76% { transform:scaleY(.92); opacity:.88; }
        }


        
/* =====================================================
           V8 — SIR signature: dimensional crystal fracture
           ===================================================== */


        
.archive-featured-exact .sir-fracture-system{
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 4;
          overflow: hidden;
          pointer-events: none;
        }


        
.archive-featured-exact .sir-crack{
          fill: none;
          vector-effect: non-scaling-stroke;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 1.35;
          stroke-dasharray: 900;
          stroke-dashoffset: 900;
          opacity: 0;
        }


        
.archive-featured-exact .sir-crack-main{
          animation: v8SirFractureMain 6.2s ease-in-out infinite;
        }


        
.archive-featured-exact .sir-crack-right{
          animation-delay: .08s;
        }


        
.archive-featured-exact .sir-crack-down{
          stroke-width: 1.15;
          animation: v8SirFractureMain 6.2s ease-in-out infinite .15s;
        }


        
.archive-featured-exact .sir-crack-up{
          stroke-width: 1.05;
          animation: v8SirFractureMain 6.2s ease-in-out infinite .20s;
        }


        
.archive-featured-exact .sir-crack-branch{
          stroke-width: .78;
          animation: v8SirFractureBranch 6.2s ease-in-out infinite;
        }


        
.archive-featured-exact .branch-one{ animation-delay: .20s; }

        
.archive-featured-exact .branch-two{ animation-delay: .27s; }

        
.archive-featured-exact .branch-three{ animation-delay: .24s; }

        
.archive-featured-exact .branch-four{ animation-delay: .31s; }

        
.archive-featured-exact .branch-five{ animation-delay: .35s; }

        
.archive-featured-exact .branch-six{ animation-delay: .29s; }


        
.archive-featured-exact .sir-fracture-core{
          fill: rgba(255,255,255,.98);
          opacity: 0;
          filter:
            drop-shadow(0 0 4px rgba(255,255,255,1))
            drop-shadow(0 0 12px rgba(103,232,249,.85))
            drop-shadow(0 0 22px rgba(196,181,253,.55));
          animation: v8SirCore 6.2s ease-in-out infinite;
        }


        
/* During the fracture cycle, the whole SIR surface gets a brief
           refractive pulse rather than simply becoming brighter. */

        
.archive-featured-exact .hit-sir .fx-flare{
          animation: v8SirRefractivePulse 6.2s ease-in-out infinite !important;
        }


        
.archive-featured-exact .hit-sir{
          animation: v8SirGlassBorder 6.2s ease-in-out infinite !important;
        }


        
@keyframes v8SirFractureMain{
          0%,54% {
            stroke-dashoffset:900;
            opacity:0;
          }
          58% {
            opacity:.96;
          }
          67% {
            stroke-dashoffset:0;
            opacity:1;
          }
          76% {
            stroke-dashoffset:0;
            opacity:.86;
          }
          83% {
            stroke-dashoffset:-900;
            opacity:.36;
          }
          88%,100% {
            stroke-dashoffset:-900;
            opacity:0;
          }
        }


        
@keyframes v8SirFractureBranch{
          0%,58% {
            stroke-dashoffset:900;
            opacity:0;
          }
          64% {
            opacity:.82;
          }
          72% {
            stroke-dashoffset:0;
            opacity:.92;
          }
          79% {
            stroke-dashoffset:0;
            opacity:.64;
          }
          85% {
            stroke-dashoffset:-900;
            opacity:.20;
          }
          89%,100% {
            stroke-dashoffset:-900;
            opacity:0;
          }
        }


        
@keyframes v8SirCore{
          0%,54%,88%,100% {
            opacity:0;
            transform:scale(.3);
            transform-origin:505px 126px;
          }
          59% {
            opacity:1;
            transform:scale(1.35);
          }
          66% {
            opacity:.46;
            transform:scale(.72);
          }
          72% {
            opacity:.92;
            transform:scale(1);
          }
          81% {
            opacity:.22;
            transform:scale(.55);
          }
        }


        
@keyframes v8SirRefractivePulse{
          0%,53%,100% {
            opacity:0;
            transform:scale(.96);
          }
          59% {
            opacity:.28;
            transform:scale(.99);
          }
          68% {
            opacity:.74;
            transform:scale(1.025);
          }
          76% {
            opacity:.22;
            transform:scale(1.045);
          }
          84% {
            opacity:.58;
            transform:scale(1.065);
          }
          90% {
            opacity:0;
            transform:scale(1.08);
          }
        }


        
@keyframes v8SirGlassBorder{
          0%,52%,100% {
            border-color:rgba(103,232,249,.60);
            box-shadow:
              0 14px 34px rgba(0,0,0,.30),
              0 0 13px rgba(34,211,238,.12);
          }
          60% {
            border-color:rgba(196,181,253,.84);
            box-shadow:
              0 14px 34px rgba(0,0,0,.30),
              0 0 18px rgba(196,181,253,.22);
          }
          68% {
            border-color:rgba(255,255,255,.96);
            box-shadow:
              0 14px 34px rgba(0,0,0,.30),
              0 0 8px rgba(255,255,255,.34),
              0 0 22px rgba(103,232,249,.25),
              inset 0 0 15px rgba(196,181,253,.08);
          }
          76% {
            border-color:rgba(244,114,182,.76);
            box-shadow:
              0 14px 34px rgba(0,0,0,.30),
              0 0 18px rgba(244,114,182,.17);
          }
          86% {
            border-color:rgba(167,139,250,.70);
          }
        }


        
/* =====================================================
           V8.1 — SIR fracture visibility fix
           Normalised SVG drawing + persistent glass crack + strong pulse
           ===================================================== */


        
.archive-featured-exact .sir-fracture-system{
          z-index: 8 !important;
          opacity: 1 !important;
          mix-blend-mode: screen;
        }


        
.archive-featured-exact .sir-fracture-glow{
          opacity: 1 !important;
        }


        
.archive-featured-exact .sir-crack{
          stroke-dasharray: 1 !important;
          stroke-dashoffset: 0 !important;
          opacity: .16 !important;
          stroke-width: 1.45 !important;
          animation: v81SirCrackPulse 4.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .sir-crack-branch{
          opacity: .10 !important;
          stroke-width: .9 !important;
          animation: v81SirBranchPulse 4.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .sir-crack-right{ animation-delay: .05s !important; }

        
.archive-featured-exact .sir-crack-down{ animation-delay: .10s !important; }

        
.archive-featured-exact .sir-crack-up{ animation-delay: .14s !important; }

        
.archive-featured-exact .branch-one{ animation-delay: .18s !important; }

        
.archive-featured-exact .branch-two{ animation-delay: .22s !important; }

        
.archive-featured-exact .branch-three{ animation-delay: .26s !important; }

        
.archive-featured-exact .branch-four{ animation-delay: .30s !important; }

        
.archive-featured-exact .branch-five{ animation-delay: .34s !important; }

        
.archive-featured-exact .branch-six{ animation-delay: .38s !important; }


        
.archive-featured-exact .sir-fracture-core{
          opacity: .14 !important;
          animation: v81SirCorePulse 4.8s ease-in-out infinite !important;
        }


        
/* A glassy shockwave accompanies the fracture so the SIR event
           is impossible to miss even on a dark card/image. */

        
.archive-featured-exact .sir-rainbow-ring{
          z-index: 9 !important;
          animation: v81SirShockwave 4.8s ease-out infinite !important;
        }


        
.archive-featured-exact .sir-starburst-1{
          z-index: 10 !important;
          animation: v81SirBurstA 4.8s ease-in-out infinite !important;
        }


        
.archive-featured-exact .sir-starburst-2{
          z-index: 10 !important;
          animation: v81SirBurstB 4.8s ease-in-out infinite !important;
        }


        
@keyframes v81SirCrackPulse{
          0%,45%,100% {
            opacity:.14;
            stroke-dashoffset:1;
            filter:brightness(.85);
          }
          52% {
            opacity:.42;
            stroke-dashoffset:.72;
          }
          60% {
            opacity:1;
            stroke-dashoffset:0;
            filter:brightness(1.7);
          }
          68% {
            opacity:.92;
            stroke-dashoffset:0;
          }
          77% {
            opacity:.38;
            stroke-dashoffset:-.35;
          }
          86% {
            opacity:.14;
            stroke-dashoffset:-1;
          }
        }


        
@keyframes v81SirBranchPulse{
          0%,50%,100% { opacity:.08; stroke-dashoffset:1; }
          58% { opacity:.34; stroke-dashoffset:.6; }
          65% { opacity:.88; stroke-dashoffset:0; }
          74% { opacity:.55; stroke-dashoffset:0; }
          84% { opacity:.08; stroke-dashoffset:-1; }
        }


        
@keyframes v81SirCorePulse{
          0%,48%,100% { opacity:.10; transform:scale(.5); transform-origin:505px 126px; }
          57% { opacity:1; transform:scale(1.8); }
          64% { opacity:.45; transform:scale(.8); }
          70% { opacity:.95; transform:scale(1.25); }
          82% { opacity:.10; transform:scale(.5); }
        }


        
@keyframes v81SirShockwave{
          0%,53%,100% { opacity:0; transform:translate(-50%,-50%) scale(.18); }
          60% { opacity:.95; }
          78% { opacity:.28; }
          88% { opacity:0; transform:translate(-50%,-50%) scale(4.4); }
        }


        
@keyframes v81SirBurstA{
          0%,52%,100% { opacity:0; transform:scale(.25) rotate(0deg); }
          60% { opacity:1; transform:scale(1.55) rotate(25deg); }
          68% { opacity:.28; transform:scale(.75) rotate(38deg); }
          74% { opacity:.85; transform:scale(1.12) rotate(48deg); }
          84% { opacity:0; transform:scale(1.8) rotate(62deg); }
        }


        
@keyframes v81SirBurstB{
          0%,57%,100% { opacity:0; transform:scale(.25) rotate(45deg); }
          65% { opacity:.92; transform:scale(1.35) rotate(68deg); }
          73% { opacity:.22; }
          79% { opacity:.75; transform:scale(1) rotate(82deg); }
          88% { opacity:0; transform:scale(1.65) rotate(98deg); }
        }


        
/* =====================================================
           RARITY FX — Lifetime mini cards + Best Pulls carousel
           Reuses the exact same rarity identities as main hits.
           ===================================================== */


        
.archive-featured-exact .stat-box, .archive-featured-exact .showcase-hit-card{
          position: relative;
          isolation: isolate;
          overflow: hidden;
        }


        
.archive-featured-exact .stat-box > .rarity-fx, .archive-featured-exact .showcase-hit-card > .rarity-fx{
          position: absolute;
          inset: 0;
          border-radius: inherit;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
        }


        
.archive-featured-exact .stat-box > :not(.rarity-fx), .archive-featured-exact .showcase-hit-card > :not(.rarity-fx){
          position: relative;
          z-index: 3;
        }


        
/* Mini cards use the same animations, just slightly restrained so the
           count remains instantly readable. */

        
.archive-featured-exact .stat-box > .rarity-fx{
          opacity: .82;
        }


        
.archive-featured-exact .stat-box .mar-electric-field, .archive-featured-exact .stat-box .ir-spectral-field, .archive-featured-exact .stat-box .sir-fracture-system{
          width: 100%;
          height: 100%;
        }


        
.archive-featured-exact .stat-box .gold-molten-system{
          inset: 0;
        }


        
/* Gold drips should still reach the bottom even on the shorter cards. */

        
.archive-featured-exact .stat-box.hit-gold .gold-drip{
          min-height: 115%;
        }


        
/* Keep the Best Pull card at full-strength premium presentation. */

        
.archive-featured-exact .showcase-hit-card > .rarity-fx{
          opacity: 1;
        }


        
/* Readability layer: subtle dark glass behind mini-card numbers only. */

        
.archive-featured-exact .stat-box .stat-label, .archive-featured-exact .stat-box .stat-number{
          text-shadow: 0 1px 8px rgba(0,0,0,.72);
        }


        
.archive-featured-exact .stat-box .stat-number{
          position: relative;
          z-index: 4;
        }


        
/* Best Pulls is intentionally the exact same card component as Calendar/Search. */

        
.archive-featured-exact .best-pull-normal-card{
          margin-top: 8px;
          width: 100%;
        }


        
.archive-featured-exact .best-pull-normal-card > .hit-card{
          width: 100%;
          margin: 0;
        }


        
.archive-featured-exact .best-pull-normal-card > .best-hit-controls{
          position: relative;
          z-index: 10;
          margin-top: 10px;
        }

      
    
        /* Homepage Featured Hit: all visible copy is white */
        .archive-featured-exact .featured-home-copy,
        .archive-featured-exact .featured-home-copy *,
        .archive-featured-exact .featured-home-label,
        .archive-featured-exact .featured-home-pulled,
        .archive-featured-exact .featured-home-set,
        .archive-featured-exact .featured-home-copy h3,
        .archive-featured-exact .featured-home-copy .hit-badge {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
        }

        /* Homepage-specific Featured Hit copy */
        .archive-featured-exact .featured-home-label {
          font-size: .76rem;
          font-weight: 950;
          letter-spacing: .13em;
          text-transform: uppercase;
          margin-bottom: 8px;
          opacity: .9;
        }

        .archive-featured-exact .featured-home-pulled {
          margin-top: 8px;
          font-size: .88rem;
          font-weight: 800;
          line-height: 1.4;
          opacity: .94;
        }

        .archive-featured-exact .featured-home-set {
          margin-top: 9px;
          margin-bottom: 9px;
          font-size: .84rem;
          font-weight: 950;
          letter-spacing: .04em;
          text-transform: uppercase;
          opacity: .9;
        }

        /* ==========================================================
           CLC FULL HIT CARD — exact Collector-page vintage paper /
           old camera-projector treatment, scoped to homepage Featured.
           ========================================================== */
        .archive-featured-exact .hit-card.hit-clc,
        .archive-featured-exact .showcase-hit-card.hit-clc {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 50% 42%, rgba(247,232,188,.98) 0%, rgba(211,181,119,.98) 48%, rgba(126,88,43,.99) 100%) !important;
          border: 1px solid rgba(119,82,39,.92) !important;
          box-shadow:
            inset 0 0 58px rgba(61,35,10,.38),
            0 16px 38px rgba(61,40,18,.28) !important;
          animation: clcFullProjectorFlicker 5.1s steps(1,end) infinite !important;
        }

        .archive-featured-exact .hit-card.hit-clc::before,
        .archive-featured-exact .showcase-hit-card.hit-clc::before {
          content: '' !important;
          position: absolute !important;
          inset: -12% !important;
          z-index: 0 !important;
          opacity: .30 !important;
          display: block !important;
          background:
            radial-gradient(circle at 12% 18%, rgba(66,38,12,.32) 0 1px, transparent 1.7px),
            radial-gradient(circle at 74% 63%, rgba(66,38,12,.24) 0 1px, transparent 1.8px),
            repeating-radial-gradient(circle at 35% 42%, rgba(48,27,8,.22) 0 1px, transparent 1px 5px),
            repeating-linear-gradient(7deg, rgba(72,42,15,.055) 0 1px, transparent 1px 6px) !important;
          background-size: 43px 37px, 61px 53px, 8px 8px, auto !important;
          animation: clcFullGrain .18s steps(2,end) infinite !important;
          pointer-events: none;
        }

        .archive-featured-exact .hit-card.hit-clc::after,
        .archive-featured-exact .showcase-hit-card.hit-clc::after {
          content: '' !important;
          position: absolute !important;
          inset: 0 !important;
          left: 0 !important;
          top: 0 !important;
          width: auto !important;
          height: auto !important;
          transform: none !important;
          display: block !important;
          z-index: 1 !important;
          opacity: 1 !important;
          background:
            linear-gradient(90deg,
              transparent 0 18%,
              rgba(255,248,215,.13) 18.15% 18.3%,
              transparent 18.45% 72%,
              rgba(61,34,10,.13) 72.1% 72.25%,
              transparent 72.4% 100%),
            radial-gradient(ellipse at center, transparent 39%, rgba(61,35,11,.12) 67%, rgba(39,21,7,.52) 100%) !important;
          animation: clcFullExposure 3.9s ease-in-out infinite !important;
          pointer-events: none;
        }

        .archive-featured-exact .hit-card.hit-clc .hit-layout,
        .archive-featured-exact .hit-card.hit-clc .hit-content,
        .archive-featured-exact .showcase-hit-card.hit-clc .hit-layout,
        .archive-featured-exact .showcase-hit-card.hit-clc .hit-content {
          position: relative;
          z-index: 4;
        }

        .archive-featured-exact .hit-card.hit-clc .hit-break,
        .archive-featured-exact .hit-card.hit-clc h3,
        .archive-featured-exact .showcase-hit-card.hit-clc .hit-break,
        .archive-featured-exact .showcase-hit-card.hit-clc h3 {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          text-shadow:
            0 2px 2px rgba(48,27,8,.72),
            0 4px 14px rgba(48,27,8,.42) !important;
        }

        .archive-featured-exact .hit-card.hit-clc .break-number,
        .archive-featured-exact .showcase-hit-card.hit-clc .break-number {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          background: rgba(67,40,15,.36) !important;
          border-color: rgba(255,245,208,.52) !important;
          text-shadow: 0 2px 6px rgba(43,24,7,.72) !important;
        }

        .archive-featured-exact .hit-card.hit-clc .badge-clc,
        .archive-featured-exact .showcase-hit-card.hit-clc .badge-clc {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          background: rgba(67,40,15,.54) !important;
          border: 1px solid rgba(255,231,166,.82) !important;
          box-shadow:
            inset 0 0 12px rgba(255,224,145,.12),
            0 0 15px rgba(72,43,15,.20) !important;
          text-shadow: 0 2px 6px rgba(43,24,7,.72) !important;
        }

        /* Homepage had an older extra CLC overlay. Hide it so the card is
           visually identical to the Collector-page implementation. */
        .archive-featured-exact .hit-card.hit-clc > .clc-vintage-film {
          display: none !important;
        }

        @keyframes clcFullProjectorFlicker {
          0%,14%,16%,37%,39%,66%,68%,90%,92%,100% { filter: sepia(.24) contrast(1.04) brightness(1); }
          15% { filter: sepia(.42) contrast(1.10) brightness(.91); }
          38% { filter: sepia(.30) contrast(1.07) brightness(1.06); }
          67% { filter: sepia(.46) contrast(1.11) brightness(.90); }
          91% { filter: sepia(.34) contrast(1.07) brightness(1.04); }
        }

        @keyframes clcFullGrain {
          0% { transform: translate(0,0); }
          25% { transform: translate(-2px,1px); }
          50% { transform: translate(1px,-2px); }
          75% { transform: translate(2px,2px); }
          100% { transform: translate(-1px,1px); }
        }

        @keyframes clcFullExposure {
          0%,100% { opacity:.88; }
          45% { opacity:1; }
          47% { opacity:.80; }
          50% { opacity:.96; }
        }

`}</style>
  )
}



function isGenericGroupedHit(hit: any) {
  const normalize = (value: unknown) =>
    String(value || '')
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/^[^a-z0-9]+/i, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9' ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const generic = (value: unknown) => {
    const name = normalize(value)
    return (
      /^all\s+items(?:\s|$)/.test(name) ||
      /^all\s+(?:other\s+)?trainers(?:\s|$)/.test(name) ||
      /^all\s+other\s+ex(?:'s|s)?(?:\s|$)/.test(name)
    )
  }

  // If hit_name itself is a real selected card, keep it.
  // Otherwise hide legacy rows whose hit_name OR spot_name is still generic.
  const hitName = normalize(hit?.hit_name)
  if (hitName && !generic(hitName)) return false

  return generic(hit?.hit_name) || generic(hit?.spot_name)
}

export default function HomePage() {
  const [username, setUsername] = useState('')
  const [featuredHits, setFeaturedHits] = useState<any[]>([])
  const [featuredIndex, setFeaturedIndex] = useState(0)
  const [recentHits, setRecentHits] = useState<any[]>([])
  const [hitImages, setHitImages] = useState<Record<string, string>>({})
  const recentViewportRef = useRef<HTMLDivElement | null>(null)
  const recentTrackRef = useRef<HTMLDivElement | null>(null)
  const recentDragRef = useRef({ dragging: false, startX: 0, startScrollLeft: 0 })
  const recentLoopJumpRef = useRef(false)
  const [recentDragging, setRecentDragging] = useState(false)
  const router = useRouter()

  function startRecentDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const viewport = recentViewportRef.current
    if (!viewport) return

    recentDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startScrollLeft: viewport.scrollLeft,
    }
    setRecentDragging(true)
    viewport.setPointerCapture(e.pointerId)
  }

  function moveRecentDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!recentDragRef.current.dragging) return
    const viewport = recentViewportRef.current
    if (!viewport) return

    const distance = e.clientX - recentDragRef.current.startX
    viewport.scrollLeft = recentDragRef.current.startScrollLeft - distance
  }

  function endRecentDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!recentDragRef.current.dragging) return
    recentDragRef.current.dragging = false
    setRecentDragging(false)

    const viewport = recentViewportRef.current
    if (viewport?.hasPointerCapture(e.pointerId)) {
      viewport.releasePointerCapture(e.pointerId)
    }
  }

  function searchVault() {
    if (!username.trim()) return
    router.push(`/collector/${username.trim()}`)
  }

  async function loadHomepageHits() {
    const [{ data: featuredData }, { data: recentData }] = await Promise.all([
      supabase
        .from('entries')
        .select('*')
        .eq('featured_hit', true)
        .eq('is_hit', true)
        .order('revealed_at', { ascending: false })
        .limit(5),
      supabase
        .from('entries')
        .select('*')
        .eq('is_hit', true)
        .neq('hit_tier', 'reverse_holo')
        .order('revealed_at', { ascending: false })
        .limit(100),
    ])

    const combined = [...(featuredData || []), ...(recentData || [])]
    const collectorIds = [...new Set(combined.map((entry: any) => entry.collector_id).filter(Boolean))]
    const breakIds = [...new Set(combined.map((entry: any) => entry.break_id).filter(Boolean))]

    const [{ data: collectors }, { data: breaks }] = await Promise.all([
      collectorIds.length
        ? supabase.from('collectors').select('id, whatnot_name').in('id', collectorIds)
        : Promise.resolve({ data: [] as any[] }),
      breakIds.length
        ? supabase.from('breaks').select('id, break_name, stream_datetime').in('id', breakIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const collectorsById = new Map((collectors || []).map((c: any) => [String(c.id), c.whatnot_name]))
    const breaksById = new Map((breaks || []).map((b: any) => [String(b.id), b]))

    const hydrate = (entry: any) => {
      const breakData: any = breaksById.get(String(entry.break_id))
      return {
        ...entry,
        collector_name: collectorsById.get(String(entry.collector_id)) || 'Collector',
        break_name: breakData?.break_name || 'Collectiverse Break',
        stream_datetime: breakData?.stream_datetime || null,
      }
    }

    const hydratedFeatured = (featuredData || [])
      .map(hydrate)
      .filter((hit: any) => !isGenericGroupedHit(hit))

    const hydratedRecent = (recentData || [])
      .map(hydrate)
      .filter((hit: any) => !isGenericGroupedHit(hit))

    const sortedRecentHits = [...hydratedRecent].sort((a: any, b: any) => {
      const aDate = a.stream_datetime ? new Date(a.stream_datetime) : null
      const bDate = b.stream_datetime ? new Date(b.stream_datetime) : null

      const aDay = aDate && !Number.isNaN(aDate.getTime())
        ? new Date(aDate.getFullYear(), aDate.getMonth(), aDate.getDate()).getTime()
        : 0
      const bDay = bDate && !Number.isNaN(bDate.getTime())
        ? new Date(bDate.getFullYear(), bDate.getMonth(), bDate.getDate()).getTime()
        : 0

      // Newest calendar date first.
      if (bDay !== aDay) return bDay - aDay

      const getBreakNumber = (name: unknown) => {
        const matches = [...String(name || '').matchAll(/\bBreak\s*(\d+)\b/gi)]
        return matches.length ? Number(matches[matches.length - 1][1]) : 0
      }

      // On the same date, highest break number first.
      const breakDiff = getBreakNumber(b.break_name) - getBreakNumber(a.break_name)
      if (breakDiff !== 0) return breakDiff

      // Keep the original database order for cards within the same break.
      return hydratedRecent.indexOf(a) - hydratedRecent.indexOf(b)
    })

    setFeaturedHits(hydratedFeatured)
    setRecentHits(sortedRecentHits)
    setFeaturedIndex(0)

    const allHydrated = [...hydratedFeatured, ...hydratedRecent]
    const setKeys = [...new Set(allHydrated.map((hit: any) => normaliseImageKey(getBreakInfo(hit.break_name).setName)).filter(Boolean))]

    if (!setKeys.length) {
      setHitImages({})
      return
    }

    const { data: imageRows } = await supabase
      .from('hit_images')
      .select('set_name_normalized, hit_name_normalized, image_url')
      .in('set_name_normalized', setKeys)

    const imageMap: Record<string, string> = {}
    ;(imageRows || []).forEach((row: any) => {
      imageMap[`${row.set_name_normalized}::${row.hit_name_normalized}`] = String(row.image_url)
    })
    setHitImages(imageMap)
  }

  function imageForHit(hit: any) {
    if (!hit) return ''
    const info = getBreakInfo(hit.break_name)
    return resolveHitImage(
      hitImages,
      info.setName,
      hit.hit_name || hit.spot_name || '',
      hit.hit_tier
    )
  }

  useEffect(() => {
    loadHomepageHits()
  }, [])

  useEffect(() => {
    if (featuredHits.length <= 1) return

    const interval = window.setInterval(() => {
      setFeaturedIndex((current) => (current + 1) % featuredHits.length)
    }, 6500)

    return () => window.clearInterval(interval)
  }, [featuredHits.length])

  const featuredHit = featuredHits[featuredIndex] || null
  const tier = getTierStyle(featuredHit?.hit_tier || null)
  const showCosmic = ['ir', 'mar', 'gold', 'sir'].includes(
    String(featuredHit?.hit_tier || '').toLowerCase()
  )
  const featuredBreakInfo = getBreakInfo(featuredHit?.break_name || null)
  const featuredImage = imageForHit(featuredHit)
  const carouselRecentHits = recentHits.filter((hit: any) => !isGenericGroupedHit(hit))
  const recentLoop =
    carouselRecentHits.length > 0
      ? [...carouselRecentHits, ...carouselRecentHits, ...carouselRecentHits]
      : []

  function keepRecentCarouselInfinite() {
    const viewport = recentViewportRef.current
    const track = recentTrackRef.current
    if (!viewport || !track || carouselRecentHits.length === 0) return

    const oneLoopWidth = track.scrollWidth / 3
    if (!oneLoopWidth) return

    // Work from the middle copy. Crossing either boundary silently moves
    // to the identical position in the neighbouring copy.
    if (viewport.scrollLeft < oneLoopWidth * 0.5) {
      recentLoopJumpRef.current = true
      viewport.scrollLeft += oneLoopWidth
      recentLoopJumpRef.current = false
    } else if (viewport.scrollLeft > oneLoopWidth * 1.5) {
      recentLoopJumpRef.current = true
      viewport.scrollLeft -= oneLoopWidth
      recentLoopJumpRef.current = false
    }
  }

  useEffect(() => {
    const viewport = recentViewportRef.current
    const track = recentTrackRef.current
    if (!viewport || !track || carouselRecentHits.length === 0) return

    const placeInMiddle = () => {
      const oneLoopWidth = track.scrollWidth / 3
      if (oneLoopWidth) viewport.scrollLeft = oneLoopWidth
    }

    const frame = window.requestAnimationFrame(placeInMiddle)
    return () => window.cancelAnimationFrame(frame)
  }, [carouselRecentHits.length])

  useEffect(() => {
    // Use whole-pixel scroll steps instead of fractional requestAnimationFrame
    // movement. This is much more reliable across browsers for overflow scrollers.
    const autoplay = window.setInterval(() => {
      const viewport = recentViewportRef.current
      const track = recentTrackRef.current
      if (!viewport || !track || carouselRecentHits.length === 0) return

      // Only pause while the user is actively click-dragging.
      if (recentDragRef.current.dragging) return

      viewport.scrollLeft += 1
      keepRecentCarouselInfinite()
    }, 24)

    return () => window.clearInterval(autoplay)
  }, [carouselRecentHits.length])

  function showPreviousFeatured() {
    if (featuredHits.length <= 1) return
    setFeaturedIndex((current) => (current - 1 + featuredHits.length) % featuredHits.length)
  }

  function showNextFeatured() {
    if (featuredHits.length <= 1) return
    setFeaturedIndex((current) => (current + 1) % featuredHits.length)
  }

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
  max-width: 690px;
  text-align: center;
  transform: translateY(-235px);
}

        .logo {
          width: 100%;
          max-width: 300px;
          height: auto;
          margin: 0 auto -112px;
          display: block;
          filter: drop-shadow(0 14px 32px rgba(0,0,0,.42));
        }

        .featured {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          border-radius: 22px;
          padding: 12px 16px;
          margin: 0 0 10px;
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
          margin-bottom: 5px;
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
          margin-top: 6px;
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

        .featured-carousel-controls {
          position: relative;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: 7px;
        }

        .featured-arrow {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(0,0,0,.24);
          color: white;
          font-size: 1rem;
          font-weight: 950;
          cursor: pointer;
        }

        .featured-dots {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
        }

        .featured-dot {
          width: 8px;
          height: 8px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: rgba(255,255,255,.32);
          cursor: pointer;
          transition: width .18s ease, background .18s ease;
        }

        .featured-dot.active {
          width: 22px;
          background: #facc15;
        }


        .featured-hit-layout {
          display: grid;
          grid-template-columns: 118px minmax(0, 1fr);
          gap: 16px;
          align-items: center;
          text-align: left;
        }
        .featured-art-wrap { display:flex; justify-content:center; align-items:center; }
        .featured-art { width:100%; max-width:108px; max-height:138px; object-fit:contain; height:auto; display:block; filter:drop-shadow(0 10px 16px rgba(0,0,0,.42)); }
        .featured-set { font-size:.72rem; font-weight:950; letter-spacing:1.5px; text-transform:uppercase; opacity:.82; margin-bottom:5px; }
        .featured-break-number { display:inline-block; margin-bottom:8px; padding:4px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.18); background:rgba(0,0,0,.22); font-size:.62rem; font-weight:950; letter-spacing:1.1px; }

        .recent-section { margin: 14px 0 12px; text-align:left; }
        .recent-heading { display:flex; align-items:end; justify-content:space-between; gap:12px; margin:0 2px 9px; }
        .recent-title { font-size:.9rem; font-weight:950; letter-spacing:1.4px; text-transform:uppercase; }
        .recent-subtitle { font-size:.68rem; opacity:.62; }
        .recent-viewport { overflow-x:auto; overflow-y:hidden; width:100vw; margin-left:calc(50% - 50vw); padding:5px 0 10px; mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent); -webkit-mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent); -webkit-overflow-scrolling:touch; touch-action:pan-x; scrollbar-width:none; overscroll-behavior-x:contain; }
        .recent-viewport::-webkit-scrollbar { display:none; }
        .recent-viewport { cursor: grab; }
        .recent-viewport.is-dragging { cursor: grabbing; user-select:none; -webkit-user-select:none; }
        .recent-viewport.is-dragging .recent-track { pointer-events:none; }
        .recent-track { display:flex; width:max-content; gap:12px; padding:0 12px; }
        .recent-track:hover { animation-play-state:running; }
        .recent-card { width:142px; flex:0 0 142px; border:1px solid rgba(255,255,255,.14); border-radius:16px; background:rgba(255,255,255,.065); padding:10px; box-shadow:0 10px 28px rgba(0,0,0,.22); overflow:hidden; user-select:none; -webkit-user-select:none; }
        .recent-card img { -webkit-user-drag:none; user-select:none; pointer-events:none; }
        .recent-image-wrap { height:155px; display:flex; align-items:center; justify-content:center; margin-bottom:8px; position:relative; }
        .recent-image { max-width:100%; max-height:155px; width:auto; height:auto; display:block; filter:drop-shadow(0 8px 10px rgba(0,0,0,.4)); }
        .recent-image-tier {
          position:absolute;
          right:5px;
          bottom:5px;
          padding:3px 6px;
          border-radius:5px;
          border:1px solid rgba(255,255,255,.42);
          background:rgba(0,0,0,.74);
          color:#fff;
          font-size:.54rem;
          line-height:1;
          font-weight:900;
          letter-spacing:.5px;
          text-transform:uppercase;
        }
        .recent-placeholder { width:100%; height:100%; border-radius:10px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,rgba(124,58,237,.24),rgba(56,189,248,.12)); font-size:2rem; }
        .recent-name { font-size:.74rem; line-height:1.15; font-weight:950; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .recent-owner { margin-top:4px; font-size:.64rem; font-weight:850; color:#d8b4fe; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .recent-meta { margin-top:4px; font-size:.59rem; line-height:1.3; opacity:.82; }
        .recent-set-name { font-weight:950; color:#10152D; letter-spacing:.25px; }

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
		
		.admin-link {
  display: block;
  width: fit-content;
  margin: 25px auto 0;
  color: rgba(255,255,255,.78);
  text-decoration: none;
  font-weight: 850;
  font-size: .86rem;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.055);
}

.admin-link:hover {
  color: white;
  background: rgba(124,58,237,.20);
  border-color: rgba(192,132,252,.38);
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

  .featured-hit-layout { grid-template-columns: 112px minmax(0,1fr); gap:12px; }
  .featured-art { max-width:108px; }
  .recent-heading { padding:0 2px; }
  .recent-card { width:126px; flex-basis:126px; }
  .recent-image-wrap { height:137px; }
  .recent-image { max-height:137px; }


  .search-card {
    padding: 16px;
  }
}

        /* Homepage V2 layout: Featured -> Vault Search -> Recent activity */
        .search-card {
          margin: 0 0 12px;
          padding: 14px 16px;
        }

        .search-card h1 {
          font-size: 1.45rem;
          margin-bottom: 3px;
        }

        .search-card p {
          margin-bottom: 10px;
          font-size: .78rem;
        }

        .search-card .input {
          padding: 11px 13px;
          margin-bottom: 8px;
        }

        .search-card .button {
          padding: 11px 13px;
        }

        .recent-section {
          margin-top: 10px;
        }

        .recent-title {
          letter-spacing: 1.2px;
        }

        /* =====================================================
           HOMEPAGE V3 — one-screen desktop composition
           Featured card matches Break Archive proportions/layout
           ===================================================== */

        .page {
          min-height: 100vh;
          height: 100vh;
          padding: 6px 14px 10px;
          overflow-x: hidden;
          overflow-y: auto;
        }

        .wrap {
          width: 100%;
          max-width: 920px;
          margin: 0 auto;
          transform: none;
          text-align: center;
        }

        .logo {
          width: 190px;
          max-width: 190px;
          margin: -18px auto -26px;
        }

        .featured-section {
          width: 100%;
          margin: 0 auto 8px;
        }

        .featured-section-label {
          margin: 0 0 5px;
          font-size: .66rem;
          line-height: 1;
          font-weight: 950;
          letter-spacing: 1.7px;
          color: rgba(255,255,255,.72);
        }

        .featured {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          width: 100%;
          min-height: 150px;
          border-radius: 22px;
          padding: 18px;
          margin: 0;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          box-shadow: 0 18px 56px rgba(0,0,0,.30);
        }

        .featured-hit-layout {
          position: relative;
          z-index: 2;
          min-height: 114px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 22px;
        }

        .featured-hit-layout.has-image {
          display: grid;
          grid-template-columns: 122px minmax(0, 1fr);
        }

        .featured-art-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }

        .featured-art {
          display: block;
          width: 112px;
          max-width: 112px;
          max-height: 156px;
          object-fit: contain;
          border-radius: 7px;
          filter: drop-shadow(0 12px 18px rgba(0,0,0,.48));
        }

        .featured-content {
          position: relative;
          z-index: 2;
          width: 100%;
          text-align: center;
        }

        .featured-set {
          opacity: .9;
          font-size: 1rem;
          margin-bottom: 9px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .featured-break-number {
          display: inline-block;
          margin-bottom: 14px;
          padding: 8px 20px;
          border-radius: 11px;
          background: rgba(20,20,80,.45);
          border: 2px solid rgba(255,255,255,.75);
          color: white;
          font-size: 1rem;
          font-weight: 950;
          letter-spacing: 1px;
          box-shadow: 0 0 16px rgba(255,255,255,.16);
        }

        .featured .hit-name {
          text-align: center;
          margin: 0;
          font-size: clamp(1.35rem, 3.5vw, 2.05rem);
          line-height: 1.05;
          text-transform: uppercase;
          font-weight: 950;
          text-shadow: 0 7px 24px rgba(0,0,0,.45);
        }

        .featured .tier-badge {
          display: inline-block;
          margin-top: 14px;
          padding: 10px 28px;
          border-radius: 999px;
          color: #050505;
          font-weight: 950;
          letter-spacing: 1.5px;
          font-size: .98rem;
          box-shadow: 0 8px 26px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.65);
        }

        /* Controls sit over the bottom edge instead of adding card height. */
        .featured-carousel-controls {
          position: absolute;
          z-index: 12;
          left: 50%;
          bottom: 7px;
          transform: translateX(-50%);
          margin: 0;
          gap: 7px;
        }

        .featured-arrow {
          width: 25px;
          height: 25px;
          font-size: .85rem;
        }

        .featured-dot {
          width: 6px;
          height: 6px;
        }

        .featured-dot.active {
          width: 17px;
        }

        /* Search is deliberately compact so the activity feed remains visible
           without scrolling at 100% desktop zoom. */
        .search-card {
          margin: 0 auto 8px;
          padding: 9px 12px;
          border-radius: 15px;
          max-width: 920px;
        }

        .search-card h1 {
          font-size: 1.15rem;
          line-height: 1.1;
          margin: 0 0 2px;
        }

        .search-card p {
          font-size: .68rem;
          line-height: 1.25;
          margin: 0 0 6px;
        }

        .search-card .input {
          padding: 8px 10px;
          margin-bottom: 5px;
          border-radius: 10px;
          font-size: .76rem;
        }

        .search-card .button {
          padding: 8px 10px;
          border-radius: 10px;
          font-size: .74rem;
        }

        .admin-link {
          margin-top: 4px !important;
          font-size: .58rem !important;
        }

        .recent-section {
          margin: 5px 0 0;
        }

        .recent-heading {
          margin-bottom: 5px;
        }

        .recent-title {
          font-size: .76rem;
        }

        .recent-subtitle {
          font-size: .61rem;
        }

        .recent-viewport {
          padding-top: 2px;
          padding-bottom: 3px;
        }

        .recent-card {
          width: 118px;
          flex-basis: 118px;
          padding: 7px;
          border-radius: 12px;
        }

        .recent-image-wrap {
          height: 108px;
          margin-bottom: 5px;
        }

        .recent-image {
          max-height: 108px;
        }

        .recent-name {
          font-size: .64rem;
        }

        .recent-owner {
          margin-top: 2px;
          font-size: .56rem;
        }

        .recent-meta {
          margin-top: 2px;
          font-size: .51rem;
        }

        @media (max-width: 700px) {
          .page {
            height: auto;
            min-height: 100vh;
            padding: 8px 10px 18px;
          }

          .logo {
            width: 165px;
            max-width: 165px;
            margin: -12px auto -20px;
          }

          .featured {
            padding: 13px;
            min-height: 138px;
          }

          .featured-hit-layout.has-image {
            grid-template-columns: 90px minmax(0, 1fr);
            gap: 12px;
          }

          .featured-art {
            width: 82px;
            max-width: 82px;
            max-height: 120px;
          }

          .featured-set {
            font-size: .72rem;
            margin-bottom: 5px;
          }

          .featured-break-number {
            font-size: .72rem;
            padding: 5px 11px;
            margin-bottom: 7px;
          }

          .featured .hit-name {
            font-size: 1.15rem;
          }

          .featured .tier-badge {
            margin-top: 8px;
            padding: 7px 18px;
            font-size: .76rem;
          }
        }

        /* =====================================================
           V3.1 — FIX TOP SPACING ONLY
           Keep Featured + Recent carousel sizes; move logo to top.
           ===================================================== */

        .page {
          min-height: 100vh !important;
          height: auto !important;
          padding: 4px 14px 12px !important;
          display: block !important;
          align-items: initial !important;
          justify-content: initial !important;
        }

        .wrap {
          width: 100% !important;
          max-width: 920px !important;
          margin: 0 auto !important;
          transform: none !important;
          position: relative !important;
          top: auto !important;
        }

        .logo {
          position: static !important;
          max-width: none !important;
          transform: none !important;
          inset: auto !important;
        }

        .featured-section {
          margin-top: 0 !important;
        }

        /* Undo the V3 recent-card downsizing. The carousel itself stays at
           the fuller V2 size — only the header/logo is being compressed. */
        .recent-card {
          width: 154px !important;
          flex-basis: 154px !important;
          padding: 9px !important;
        }

        .recent-image-wrap {
          height: 132px !important;
          margin-bottom: 7px !important;
        }

        .recent-image {
          max-height: 132px !important;
        }

        .recent-name {
          font-size: .72rem !important;
        }

        .recent-owner {
          margin-top: 3px !important;
          font-size: .62rem !important;
        }

        .recent-meta {
          margin-top: 3px !important;
          font-size: .57rem !important;
        }

        @media (max-width: 700px) {
          .logo {
            width: 190px !important;
            height: 190px !important;
            margin: -54px auto -56px !important;
          }
        }

        /* =====================================================
           V3.3 — Featured Hit = exact Break Archive HitCard layout
           ===================================================== */

        .featured.hit-card {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border-radius: 22px;
          padding: 18px;
          min-height: 150px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.07);
          box-shadow: 0 18px 56px rgba(0,0,0,0.30);
        }

        .featured.hit-card .hit-layout {
          position: relative;
          z-index: 2;
          min-height: 114px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 22px;
        }

        .featured.hit-card .hit-layout.has-image {
          display: grid;
          grid-template-columns: 122px minmax(0, 1fr);
        }

        .featured.hit-card .hit-card-art-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }

        .featured.hit-card .hit-card-art {
          display: block;
          width: 112px;
          max-height: 156px;
          object-fit: contain;
          border-radius: 7px;
          filter: drop-shadow(0 12px 18px rgba(0,0,0,.48));
        }

        .featured.hit-card .hit-layout.has-image .hit-content {
          width: 100%;
        }

        .featured.hit-card .hit-content {
          position: relative;
          z-index: 2;
          text-align: center;
        }

        .featured.hit-card .hit-break {
          opacity: 0.9;
          font-size: 1rem;
          margin-bottom: 9px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .featured.hit-card .break-number {
          display: inline-block;
          margin-bottom: 14px;
          padding: 8px 20px;
          border-radius: 11px;
          background: rgba(20,20,80,0.45);
          border: 2px solid rgba(255,255,255,0.75);
          color: white;
          font-size: 1rem;
          font-weight: 950;
          letter-spacing: 1px;
          box-shadow: 0 0 16px rgba(255,255,255,0.16);
        }

        .featured.hit-card h3 {
          text-align: center;
          margin: 0;
          font-size: clamp(1.35rem, 3.5vw, 2.05rem);
          line-height: 1.05;
          text-transform: uppercase;
          font-weight: 950;
          text-shadow: 0 7px 24px rgba(0,0,0,0.45);
        }

        .featured.hit-card .hit-badge {
          display: inline-block;
          margin-top: 14px;
          padding: 10px 28px;
          border-radius: 999px;
          color: #050505;
          font-weight: 950;
          letter-spacing: 1.5px;
          font-size: .98rem;
          box-shadow: 0 8px 26px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.65);
        }

        /* Homepage tier colours, now applied to the Archive-style badge. */
        .featured.hit-card .badge-ex { background: linear-gradient(135deg,#60a5fa,#2563eb); }
        .featured.hit-card .badge-sr { background: linear-gradient(135deg,#c084fc,#7c3aed); }
        .featured.hit-card .badge-ir { background: linear-gradient(135deg,#fda4af,#fb7185); }
        .featured.hit-card .badge-mar { background: linear-gradient(135deg,#67e8f9,#22d3ee); }
        .featured.hit-card .badge-gold { background: linear-gradient(135deg,#fde68a,#f59e0b); }
        .featured.hit-card .badge-sir { background: linear-gradient(135deg,#fde047,#22d3ee,#c084fc); }

        /* Keep carousel navigation from changing the Archive card's height. */
        .featured.hit-card .featured-carousel-controls {
          position: absolute;
          z-index: 12;
          left: 50%;
          bottom: 7px;
          transform: translateX(-50%);
          margin: 0;
        }

        /* =====================================================
           V3.5 — SAFE archive-style Featured rarity treatment
           No SVG overlays / no layout-affecting FX elements.
           ===================================================== */

        .featured.hit-card {
          background: linear-gradient(135deg, #101426 0%, #11172a 58%, #0d1424 100%) !important;
        }

        .featured.hit-card::before,
        .featured.hit-card::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          z-index: 1;
        }

        .featured.hit-card::after {
          opacity: .32;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255,255,255,.035) 42%,
            rgba(255,255,255,.10) 50%,
            rgba(255,255,255,.025) 58%,
            transparent 100%
          );
          background-size: 220% 100%;
          animation: featuredArchiveSheen 6.5s ease-in-out infinite;
        }

        .featured.hit-card.hit-ex {
          border-color: rgba(59,130,246,.42) !important;
          background: linear-gradient(135deg,#0d1529,#0c1830 62%,#0c1426) !important;
        }

        .featured.hit-card.hit-sr {
          border-color: rgba(168,85,247,.40) !important;
          background: linear-gradient(135deg,#151426,#171329 58%,#101425) !important;
        }

        .featured.hit-card.hit-ir {
          border-color: rgba(244,114,182,.42) !important;
          background:
            radial-gradient(circle at 82% 35%,rgba(103,232,249,.08),transparent 34%),
            radial-gradient(circle at 18% 70%,rgba(244,114,182,.09),transparent 35%),
            linear-gradient(135deg,#171426,#12172a) !important;
        }

        .featured.hit-card.hit-mar {
          border-color: rgba(34,211,238,.48) !important;
          background:
            radial-gradient(circle at 76% 42%,rgba(34,211,238,.10),transparent 32%),
            linear-gradient(135deg,#0b1726,#0c1a2b 60%,#0a1423) !important;
          animation: featuredMarEdge 2.6s ease-in-out infinite;
        }

        .featured.hit-card.hit-gold {
          border-color: rgba(212,175,55,.52) !important;
          background:
            radial-gradient(circle at 78% 30%,rgba(212,175,55,.09),transparent 30%),
            linear-gradient(135deg,#17150f,#15150f 58%,#101313) !important;
          animation: featuredGoldEdge 4s ease-in-out infinite;
        }

        .featured.hit-card.hit-sir {
          border-color: rgba(167,139,250,.48) !important;
          background:
            radial-gradient(circle at 76% 35%,rgba(34,211,238,.10),transparent 31%),
            radial-gradient(circle at 22% 70%,rgba(244,114,182,.09),transparent 34%),
            linear-gradient(135deg,#141426,#11182a 58%,#121425) !important;
          animation: featuredSirEdge 3.8s ease-in-out infinite;
        }

        @keyframes featuredArchiveSheen {
          0%,18% { background-position: 120% 0; opacity: 0; }
          30% { opacity: .28; }
          62% { background-position: -120% 0; opacity: .22; }
          75%,100% { background-position: -120% 0; opacity: 0; }
        }

        @keyframes featuredMarEdge {
          0%,100% { box-shadow:0 18px 56px rgba(0,0,0,.30),0 0 0 rgba(34,211,238,0); }
          50% { box-shadow:0 18px 56px rgba(0,0,0,.30),0 0 15px rgba(34,211,238,.16); }
        }

        @keyframes featuredGoldEdge {
          0%,100% { box-shadow:0 18px 56px rgba(0,0,0,.30),0 0 0 rgba(212,175,55,0); }
          50% { box-shadow:0 18px 56px rgba(0,0,0,.30),0 0 15px rgba(212,175,55,.15); }
        }

        @keyframes featuredSirEdge {
          0%,100% { box-shadow:0 18px 56px rgba(0,0,0,.30),0 0 11px rgba(167,139,250,.10); }
          50% { box-shadow:0 18px 56px rgba(0,0,0,.30),0 0 17px rgba(34,211,238,.14); }
        }

        /* V3.6 — IMPORTANT: Featured now uses the Archive's hit-* tier classes.
           Kill the legacy homepage tier-* paint layer on this component. */
        .featured.hit-card.tier-sir,
        .featured.hit-card.tier-gold,
        .featured.hit-card.tier-mar,
        .featured.hit-card.tier-ir,
        .featured.hit-card.tier-sr,
        .featured.hit-card.tier-ex,
        .featured.hit-card.tier-default {
          background: unset;
        }

        .featured-exact-shell {
          position: relative;
          width: 100%;
          margin: 0 0 10px;
        }
        .featured-exact-shell .archive-featured-exact { width: 100%; }
        .featured-exact-shell .featured-carousel-controls {
          position: absolute;
          z-index: 50;
          left: 50%;
          bottom: 7px;
          transform: translateX(-50%);
          margin: 0;
        }
        .featured-empty {
          min-height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.07);
          font-weight: 900;
        }


        /* SIMPLE CREAM TEST — exact requested changes */
        html, body { background:#EEE9DF !important; }
        body { background:#EEE9DF !important; }
        .page { background:#EEE9DF !important; color:#11162D !important; }

        /* Full-width blue strip behind Collectiverse logo */
        .logo-wrap {
          width:100vw !important;
          max-width:none !important;
          margin-left:calc(50% - 50vw) !important;
          margin-right:calc(50% - 50vw) !important;
          margin-top:0 !important;
          margin-bottom:12px !important;
          padding:10px 24px 12px !important;
          box-sizing:border-box !important;
          background:linear-gradient(180deg,#11176A 0%,#080D4A 100%) !important;
          border-radius:0 !important;
          border:0 !important;
          box-shadow:0 8px 24px rgba(14,18,48,.14) !important;
        }

        .featured-section-label,.recent-title {
          color:#11162D !important;
          text-shadow:none !important;
        }
        .recent-subtitle { color:#716F6A !important; }

        /* Search Whatnot name: blue-grey instead of white */
        .search-card .input,
        .search-card input {
          background:#DCE3F0 !important;
          border:1px solid rgba(31,49,94,.18) !important;
          color:#11162D !important;
          -webkit-text-fill-color:#11162D !important;
          caret-color:#5B4FC7 !important;
        }
        .search-card .input::placeholder,
        .search-card input::placeholder {
          color:#667085 !important;
          -webkit-text-fill-color:#667085 !important;
          opacity:1 !important;
        }

        .admin-link { color:#5F5C57 !important; text-shadow:none !important; }


        /* =====================================================
           CREAM / NAVY REFINEMENT PASS
           Refines the approved light direction only.
           Rarity card effects remain untouched.
           ===================================================== */

        html, body {
          background: #F3E8D7 !important;
        }

        body,
        .page {
          background: #F3E8D7 !important;
          color: #10152D !important;
        }

        /* Proper dark Collectiverse brand band behind the white logo */
        .logo-wrap {
          width: 100vw !important;
          max-width: none !important;
          margin-left: calc(50% - 50vw) !important;
          margin-right: calc(50% - 50vw) !important;
          margin-top: 0 !important;
          margin-bottom: 12px !important;
          padding: 10px 24px 12px !important;
          box-sizing: border-box !important;
          background:
            radial-gradient(circle at 50% 0%, rgba(77,95,194,.24), transparent 50%),
            linear-gradient(180deg, #11186B 0%, #080D49 100%) !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: 0 10px 26px rgba(15,20,55,.12) !important;
        }

        .logo {
          filter: drop-shadow(0 7px 18px rgba(0,0,0,.18)) !important;
        }

        .featured-section-label,
        .recent-title {
          color: #10152D !important;
          text-shadow: none !important;
        }

        .recent-subtitle {
          color: #77766F !important;
        }

        /* Warm ivory Break Vault panel with subtle navy definition */
        .search-card {
          background:
            linear-gradient(145deg, #FAF7F1 0%, #F5F0E7 100%) !important;
          border: 1px solid rgba(16,21,45,.14) !important;
          box-shadow:
            0 14px 34px rgba(31,28,23,.11),
            0 2px 8px rgba(31,28,23,.055) !important;
        }

        .search-card h1 {
          color: #10152D !important;
          text-shadow: none !important;
        }

        .search-card p {
          color: #62636A !important;
        }

        /* Blue-grey search field: no stark white rectangle */
        .search-card .input,
        .search-card input {
          background: #E3E8F0 !important;
          border: 1px solid rgba(38,58,104,.18) !important;
          color: #10152D !important;
          -webkit-text-fill-color: #10152D !important;
          caret-color: #34589B !important;
          box-shadow: inset 0 1px 3px rgba(16,21,45,.055) !important;
        }

        .search-card .input::placeholder,
        .search-card input::placeholder {
          color: #737B8A !important;
          -webkit-text-fill-color: #737B8A !important;
          opacity: 1 !important;
        }

        .search-card .input:focus,
        .search-card input:focus {
          outline: none !important;
          border-color: rgba(52,88,155,.52) !important;
          box-shadow: 0 0 0 3px rgba(52,88,155,.10) !important;
        }

        /* Replace the purple CTA with restrained Collectiverse blue */
        .search-card .button,
        .search-card button[type="submit"] {
          background: linear-gradient(135deg, #294A88 0%, #3C65A9 100%) !important;
          border: 1px solid rgba(25,53,106,.22) !important;
          color: #FFFFFF !important;
          box-shadow:
            0 8px 18px rgba(37,67,126,.18),
            inset 0 1px 0 rgba(255,255,255,.12) !important;
        }

        /* Cleaner ivory recent cards */
        .recent-card {
          background: #F8F4EC !important;
          border: 1px solid rgba(16,21,45,.105) !important;
          box-shadow:
            0 8px 22px rgba(32,29,24,.085),
            0 2px 5px rgba(32,29,24,.04) !important;
        }

        /* Remove the lilac cast from the image wells */
        .recent-art {
          background:
            radial-gradient(circle at 50% 42%, rgba(61,91,150,.10), transparent 60%),
            linear-gradient(145deg, #E8EDF4 0%, #DDE5EC 100%) !important;
          border: 1px solid rgba(16,21,45,.065) !important;
        }

        .recent-name {
          color: #10152D !important;
        }

        .recent-owner {
          color: #34589B !important;
        }

        .recent-meta {
          color: #777A82 !important;
        }

        .admin-link {
          color: #555B69 !important;
          text-shadow: none !important;
        }

        /* Ground the featured card gently against the cream without
           changing any of its rarity-specific visual effects. */
        .featured-exact-shell {
          filter: drop-shadow(0 12px 22px rgba(30,27,23,.10)) !important;
        }


        /* Final warm-cream continuity: recent hits carousel */
        .recent-section,
        .recent-viewport,
        .recent-track {
          background: #F3E8D7 !important;
        }

        /* The cards themselves were still explicitly near-white (#F8F4EC). */
        .recent-card {
          background: #F3E8D7 !important;
        }

        /* =====================================================
           NAVY BRAND STRIP + NAVY VAULT WIDGET
           ===================================================== */

        /* Full-width navy strip behind the Collectiverse logo */
        .logo-wrap {
          width: 100vw !important;
          max-width: none !important;
          margin-left: calc(50% - 50vw) !important;
          margin-right: calc(50% - 50vw) !important;
          margin-top: 0 !important;
          margin-bottom: 12px !important;
          padding: 10px 24px 12px !important;
          box-sizing: border-box !important;
          background:
            radial-gradient(circle at 50% 0%, rgba(67,86,184,.28), transparent 52%),
            linear-gradient(180deg, #11176A 0%, #080D49 100%) !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: 0 10px 28px rgba(15,20,55,.14) !important;
        }

        .logo {
          filter: drop-shadow(0 7px 18px rgba(0,0,0,.20)) !important;
        }

        /* Make the whole Break Vault / Whatnot search widget match the navy strip */
        .search-card {
          background:
            radial-gradient(circle at 82% 0%, rgba(68,88,185,.22), transparent 38%),
            linear-gradient(145deg, #111A59 0%, #080D3D 100%) !important;
          border: 1px solid rgba(255,255,255,.10) !important;
          box-shadow:
            0 14px 32px rgba(24,27,54,.16),
            inset 0 1px 0 rgba(255,255,255,.04) !important;
        }

        .search-card h1 {
          color: #FFFFFF !important;
          text-shadow: none !important;
        }

        .search-card p {
          color: #B8C1D8 !important;
        }

        /* Keep the input readable but integrated with the navy widget */
        .search-card .input,
        .search-card input {
          background: rgba(255,255,255,.10) !important;
          border: 1px solid rgba(255,255,255,.18) !important;
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          caret-color: #FFFFFF !important;
          box-shadow: inset 0 1px 3px rgba(0,0,0,.14) !important;
        }

        .search-card .input::placeholder,
        .search-card input::placeholder {
          color: #B7C0D5 !important;
          -webkit-text-fill-color: #B7C0D5 !important;
          opacity: 1 !important;
        }

        .search-card .input:focus,
        .search-card input:focus {
          outline: none !important;
          border-color: rgba(155,177,232,.62) !important;
          box-shadow: 0 0 0 3px rgba(90,118,190,.16) !important;
        }

        /* Blue CTA, slightly brighter than the navy surface */
        .search-card .button,
        .search-card button[type="submit"] {
          background: linear-gradient(135deg, #31559A 0%, #4774BE 100%) !important;
          border: 1px solid rgba(255,255,255,.14) !important;
          color: #FFFFFF !important;
          box-shadow:
            0 7px 17px rgba(0,0,0,.18),
            inset 0 1px 0 rgba(255,255,255,.12) !important;
        }

        .admin-link {
          color: #AEB9D2 !important;
          text-shadow: none !important;
        }


        /* =====================================================
           HEADER + FEATURED HIT NAVY CONNECTOR PASS
           ===================================================== */

        /* Ensure the top logo sits on a clearly visible navy strip */
        .logo-wrap {
          position: relative !important;
          z-index: 2 !important;
          width: 100vw !important;
          max-width: none !important;
          margin-left: calc(50% - 50vw) !important;
          margin-right: calc(50% - 50vw) !important;
          padding: 10px 24px 12px !important;
          background: linear-gradient(180deg, #11176A 0%, #080D49 100%) !important;
          border-radius: 0 !important;
        }

        /* Navy strip directly beneath FEATURED HIT, visually joining the card */
        .featured-exact-shell {
          position: relative !important;
          margin-top: 0 !important;
          padding-top: 18px !important;
          background: linear-gradient(180deg, #080D49 0 42px, transparent 42px) !important;
          border-radius: 18px 18px 0 0 !important;
          filter: drop-shadow(0 12px 22px rgba(30,27,23,.10)) !important;
        }

        .featured-section-label {
          position: relative !important;
          z-index: 5 !important;
          color: #FFFFFF !important;
          text-shadow: none !important;
          margin-bottom: -18px !important;
          padding: 7px 0 8px !important;
          background: #080D49 !important;
          border-radius: 14px 14px 0 0 !important;
        }

        /* Force all ordinary text inside the featured hit card to white.
           Rarity badge/effects themselves remain untouched. */
        .featured-exact-shell .hit-card,
        .featured-exact-shell .hit-card .hit-content,
        .featured-exact-shell .hit-card .hit-content *,
        .featured-exact-shell .hit-card .hit-name,
        .featured-exact-shell .hit-card .hit-set,
        .featured-exact-shell .hit-card .hit-break,
        .featured-exact-shell .hit-card .hit-owner,
        .featured-exact-shell .hit-card .hit-date,
        .featured-exact-shell .archive-featured-exact,
        .featured-exact-shell .archive-featured-exact .hit-card {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
        }

        /* Keep badge text controlled by its own rarity design */
        .featured-exact-shell .tier-badge,
        .featured-exact-shell .tier-badge * {
          -webkit-text-fill-color: initial !important;
        }


        /* REAL TOP BRAND STRIP — wraps the actual logo element */
        .brand-strip {
          width: 100%;
          background:
            radial-gradient(circle at 50% 0%, rgba(72,91,190,.28), transparent 54%),
            linear-gradient(180deg, #11176A 0%, #080D49 100%);
          box-shadow: 0 9px 25px rgba(15,20,55,.14);
          position: relative;
          z-index: 1;
          padding: 0;
          margin: 0 0 12px;
          overflow: visible;
        }

        .brand-strip .logo {
          position: relative;
          z-index: 2;
        }


        /* =====================================================
           FINAL HEADER CORRECTION
           Structure preserved. Only real brand-strip sizing corrected.
           ===================================================== */

        .brand-strip {
          width: 100vw !important;
          max-width: none !important;
          margin-left: calc(50% - 50vw) !important;
          margin-right: calc(50% - 50vw) !important;
          margin-top: 0 !important;
          margin-bottom: 10px !important;

          /* The logo keeps its existing 270px size and -78/-82 margins.
             118px gives the visible logo enough room without the huge
             navy block from the previous version. */
          height: 118px !important;
          min-height: 118px !important;
          padding: 0 !important;

          display: flex !important;
          align-items: center !important;
          justify-content: center !important;

          background:
            radial-gradient(circle at 50% 0%, rgba(72,91,190,.24), transparent 52%),
            linear-gradient(180deg, #11176A 0%, #080D49 100%) !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: 0 8px 22px rgba(15,20,55,.13) !important;
          position: relative !important;
          z-index: 1 !important;
          overflow: hidden !important;
        }

        /* Override only the problematic negative vertical margins.
           Keep the established logo dimensions and centre it normally. */
        .brand-strip .logo {
          width: 270px !important;
          height: 270px !important;
          margin: -76px auto !important;
          display: block !important;
          object-fit: contain !important;
          position: relative !important;
          z-index: 2 !important;
        }

        /* No connector, no Featured Hit label, no extra featured padding. */
        .featured-section-label {
          display: none !important;
        }

        .featured-exact-shell {
          margin-top: 0 !important;
          padding-top: 0 !important;
          background: transparent !important;
          border-radius: 0 !important;
        }

        .featured-section {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }


        /* Hidden/minimal admin access — fixed top-right cog only */
        .admin-link {
          display: none !important;
        }

        .admin-corner-link {
          position: fixed;
          top: 10px;
          right: 12px;
          z-index: 1000;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: rgba(255,255,255,.58);
          background: rgba(255,255,255,.055);
          border: 1px solid rgba(255,255,255,.08);
          text-decoration: none;
          font-size: 14px;
          opacity: .52;
          transition: opacity .18s ease, background .18s ease, transform .18s ease;
        }

        .admin-corner-link:hover {
          opacity: 1;
          color: #FFFFFF;
          background: rgba(255,255,255,.12);
          transform: scale(1.05);
        }

              /* ===== CLC: vintage paper / old-film camera ===== */
        .hit-card.hit-clc,
        .showcase-hit-card.hit-clc {
          position: relative;
          isolation: isolate;
          overflow: hidden !important;
          background:
            radial-gradient(ellipse at 50% 42%, #f1e4bd 0%, #d6bd82 48%, #9d7540 100%) !important;
          border: 1px solid rgba(111,77,34,.82) !important;
          box-shadow:
            inset 0 0 52px rgba(68,40,13,.34),
            inset 0 0 2px rgba(255,250,221,.85),
            0 18px 42px rgba(68,45,22,.30) !important;
          animation: clcProjectorFlicker 4.8s steps(1,end) infinite !important;
        }

        .hit-card.hit-clc::before,
        .hit-card.hit-clc::after,
        .showcase-hit-card.hit-clc::before,
        .showcase-hit-card.hit-clc::after {
          display: none !important;
        }

        .clc-vintage-film {
          position: absolute;
          inset: 0;
          z-index: 2;
          border-radius: inherit;
          overflow: hidden;
          pointer-events: none;
        }

        .clc-paper-texture {
          position: absolute;
          inset: 0;
          opacity: .44;
          background:
            radial-gradient(circle at 12% 18%, rgba(75,45,18,.20) 0 1px, transparent 1.8px),
            radial-gradient(circle at 77% 63%, rgba(75,45,18,.15) 0 1px, transparent 1.7px),
            radial-gradient(circle at 42% 82%, rgba(255,248,211,.32) 0 1px, transparent 1.8px),
            repeating-linear-gradient(8deg, rgba(75,45,18,.035) 0 1px, transparent 1px 5px);
          background-size: 37px 31px, 53px 47px, 43px 39px, auto;
        }

        .clc-film-grain {
          position: absolute;
          inset: -12%;
          opacity: .24;
          background:
            repeating-radial-gradient(circle at 30% 40%, rgba(45,27,11,.35) 0 1px, transparent 1px 4px);
          background-size: 7px 7px;
          animation: clcGrain .16s steps(2,end) infinite;
        }

        .clc-film-vignette {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at center, transparent 42%, rgba(54,31,10,.16) 68%, rgba(43,24,8,.54) 100%);
          animation: clcExposure 3.7s ease-in-out infinite;
        }

        .clc-film-line {
          position: absolute;
          top: -10%;
          height: 120%;
          width: 1px;
          background: rgba(255,249,218,.72);
          opacity: .18;
          box-shadow: 2px 0 0 rgba(72,43,15,.12);
        }

        .clc-film-line-a {
          left: 22%;
          animation: clcScratchA 5.2s steps(1,end) infinite;
        }

        .clc-film-line-b {
          left: 79%;
          animation: clcScratchB 6.7s steps(1,end) infinite;
        }

        .hit-card.hit-clc > .hit-layout,
        .showcase-hit-card.hit-clc > :not(.clc-vintage-film) {
          position: relative;
          z-index: 5 !important;
        }

        .hit-card.hit-clc .hit-break,
        .hit-card.hit-clc h3,
        .showcase-hit-card.hit-clc .hit-break,
        .showcase-hit-card.hit-clc h3 {
          color: #2d2011 !important;
          -webkit-text-fill-color: #2d2011 !important;
          text-shadow: 0 1px 0 rgba(255,248,214,.72) !important;
        }

        .hit-card.hit-clc .break-number,
        .showcase-hit-card.hit-clc .break-number {
          color: #fff8df !important;
          -webkit-text-fill-color: #fff8df !important;
          background: rgba(57,38,18,.62) !important;
          border-color: rgba(242,213,143,.58) !important;
        }

        .hit-card.hit-clc .hit-badge,
        .showcase-hit-card.hit-clc .hit-badge {
          color: #fff8df !important;
          -webkit-text-fill-color: #fff8df !important;
          background: rgba(73,48,20,.78) !important;
          border-color: rgba(229,196,112,.88) !important;
          box-shadow: 0 0 16px rgba(111,77,34,.24) !important;
          text-transform: uppercase !important;
        }

        @keyframes clcProjectorFlicker {
          0%, 15%, 17%, 38%, 40%, 67%, 69%, 91%, 93%, 100% {
            filter: sepia(.26) contrast(1.03) brightness(1);
          }
          16% { filter: sepia(.42) contrast(1.08) brightness(.91); }
          39% { filter: sepia(.32) contrast(1.06) brightness(1.06); }
          68% { filter: sepia(.46) contrast(1.10) brightness(.90); }
          92% { filter: sepia(.36) contrast(1.07) brightness(1.04); }
        }

        @keyframes clcGrain {
          0% { transform: translate(0,0); }
          25% { transform: translate(-2px,1px); }
          50% { transform: translate(1px,-2px); }
          75% { transform: translate(2px,2px); }
          100% { transform: translate(-1px,1px); }
        }

        @keyframes clcExposure {
          0%,100% { opacity: .76; }
          50% { opacity: 1; }
        }

        @keyframes clcScratchA {
          0%, 26%, 28%, 65%, 67%, 100% { transform: translateX(0); opacity: .10; }
          27% { transform: translateX(17px); opacity: .42; }
          66% { transform: translateX(-11px); opacity: .30; }
        }

        @keyframes clcScratchB {
          0%, 34%, 36%, 72%, 74%, 100% { transform: translateX(0); opacity: .08; }
          35% { transform: translateX(-14px); opacity: .35; }
          73% { transform: translateX(9px); opacity: .26; }
        }
      `}</style>

      <div className="brand-strip">
        <Image
          className="logo"
          src="/logo.png"
          alt="Collectiverse"
          width={270}
          height={270}
          priority
          style={{
            width: '270px',
            height: '270px',
            display: 'block',
            margin: '-78px auto -82px',
            objectFit: 'contain',
          }}
        />
      </div>

      <div className="wrap">

        <div className="featured-section">
          <div className="featured-section-label">FEATURED HIT</div>

          <section className="featured-exact-shell">
            <ArchiveFeaturedStyles />
            {featuredHit ? (
              <ArchiveFeaturedHitCard hit={featuredHit} imageUrl={featuredImage} />
            ) : (
              <div className="featured-empty">Coming Soon</div>
            )}

            {featuredHits.length > 1 && (
              <div className="featured-carousel-controls" aria-label="Featured hits carousel">
                <button type="button" className="featured-arrow" onClick={showPreviousFeatured} aria-label="Previous featured hit">‹</button>
                <div className="featured-dots">
                  {featuredHits.filter((hit: any) => !isGenericGroupedHit(hit)).map((hit, index) => (
                    <button
                      type="button"
                      key={hit.id}
                      className={`featured-dot ${index === featuredIndex ? 'active' : ''}`}
                      onClick={() => setFeaturedIndex(index)}
                      aria-label={`Show featured hit ${index + 1}`}
                    />
                  ))}
                </div>
                <button type="button" className="featured-arrow" onClick={showNextFeatured} aria-label="Next featured hit">›</button>
              </div>
            )}
          </section>
        </div>

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

          <Link
            href="/admin"
            className="admin-corner-link"
            aria-label="Admin"
            title="Admin"
          >
            ⚙️
          </Link>
        </section>

        {recentHits.length > 0 && (
          <section className="recent-section">
            <div className="recent-heading">
              <div>
                <div className="recent-title">Recently Added to the Vault</div>
                <div className="recent-subtitle">Recently pulled on Collectiverse streams</div>
              </div>
            </div>

            <div
              ref={recentViewportRef}
              className={`recent-viewport ${recentDragging ? 'is-dragging' : ''}`}
              onPointerDown={startRecentDrag}
              onPointerMove={moveRecentDrag}
              onPointerUp={endRecentDrag}
              onPointerCancel={endRecentDrag}
              onPointerLeave={(e) => {
                if (recentDragRef.current.dragging) endRecentDrag(e)
              }}
              onScroll={() => {
                if (!recentLoopJumpRef.current) keepRecentCarouselInfinite()
              }}
            >
              <div ref={recentTrackRef} className="recent-track">
                {recentLoop.map((hit, index) => {
                  const info = getBreakInfo(hit.break_name)
                  const imageUrl = imageForHit(hit)
                  return (
                    <div className="recent-card" key={`${hit.id}-${index}`}>
                      <div className="recent-image-wrap">
                        {imageUrl ? (
                          <>
                            <img className="recent-image" src={imageUrl} alt={cardVariantName(hit.hit_name || hit.spot_name, hit.hit_tier)} />
                            <span className="recent-image-tier">{getTierStyle(hit.hit_tier || null).label}</span>
                          </>
                        ) : (
                          <div className="recent-placeholder">🎴</div>
                        )}
                      </div>
                      <div className="recent-name">{visibleCardName(hit.hit_name || hit.spot_name, hit.hit_tier)}</div>
                      <div className="recent-owner">{hit.collector_name}</div>
                      <div className="recent-meta">
                        <span className="recent-set-name">{info.setName}</span>{info.breakNumber ? ` · Break ${info.breakNumber}` : ''}<br />
                        {formatShortDate(hit.stream_datetime)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}


           </div>
    </main>
  )
}