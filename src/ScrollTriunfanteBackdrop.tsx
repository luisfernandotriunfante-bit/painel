import { useEffect, useRef } from 'react'

const DEPTH_LAYERS = [-15, -11, -7, -3, 1, 5, 9, 13]

function LogoSilhouette() {
  return (
    <svg viewBox="0 0 600 430" aria-hidden="true">
      <circle cx="300" cy="215" r="131" fill="#c7c9cd" stroke="#8d9198" strokeWidth="7" />
      <rect x="88" y="164" width="424" height="102" rx="13" fill="#c7c9cd" stroke="#8d9198" strokeWidth="7" />
    </svg>
  )
}

function LogoFront() {
  return (
    <svg viewBox="0 0 600 430" aria-hidden="true">
      <defs>
        <linearGradient id="tri-metal-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#d9dadd" />
          <stop offset="0.68" stopColor="#ffffff" />
          <stop offset="1" stopColor="#a7abb2" />
        </linearGradient>
        <linearGradient id="tri-red-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e21d2f" />
          <stop offset="1" stopColor="#a90d20" />
        </linearGradient>
        <filter id="tri-front-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="9" stdDeviation="9" floodColor="#000" floodOpacity="0.42" />
        </filter>
      </defs>

      <g filter="url(#tri-front-shadow)">
        <circle cx="300" cy="215" r="132" fill="url(#tri-metal-front)" stroke="#858a92" strokeWidth="7" />
        <circle cx="300" cy="215" r="105" fill="url(#tri-red-front)" stroke="#f6f6f7" strokeWidth="11" />
        <circle cx="300" cy="215" r="86" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="4" />

        <rect x="88" y="164" width="424" height="102" rx="13" fill="url(#tri-metal-front)" stroke="#868b93" strokeWidth="7" />
        <rect x="103" y="177" width="394" height="76" rx="8" fill="#f7f7f8" stroke="#c5c7cb" strokeWidth="3" />

        <text
          x="300"
          y="235"
          textAnchor="middle"
          fill="#b91329"
          stroke="#ffffff"
          strokeWidth="2.2"
          paintOrder="stroke fill"
          fontFamily="Impact, 'Arial Narrow', 'Roboto Condensed', sans-serif"
          fontSize="67"
          fontStyle="italic"
          fontWeight="900"
          letterSpacing="-1.5"
        >
          TRIUNFANTE
        </text>
      </g>
    </svg>
  )
}

function LogoBack() {
  return (
    <svg viewBox="0 0 600 430" aria-hidden="true">
      <defs>
        <linearGradient id="tri-metal-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6f6f7" />
          <stop offset="0.5" stopColor="#c8cbd0" />
          <stop offset="1" stopColor="#92979f" />
        </linearGradient>
        <filter id="tri-back-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="9" stdDeviation="9" floodColor="#000" floodOpacity="0.38" />
        </filter>
      </defs>
      <g filter="url(#tri-back-shadow)">
        <circle cx="300" cy="215" r="132" fill="url(#tri-metal-back)" stroke="#7e838b" strokeWidth="7" />
        <circle cx="300" cy="215" r="105" fill="#e4e5e7" stroke="#fafafa" strokeWidth="9" />
        <rect x="88" y="164" width="424" height="102" rx="13" fill="url(#tri-metal-back)" stroke="#7e838b" strokeWidth="7" />
        <rect x="105" y="180" width="390" height="70" rx="8" fill="#dfe1e4" stroke="#f4f4f5" strokeWidth="3" />
      </g>
    </svg>
  )
}

export default function ScrollTriunfanteBackdrop() {
  const logoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let currentAngle = Math.max(0, window.scrollY) * 0.42
    let targetAngle = currentAngle

    const paint = () => {
      raf = 0
      currentAngle += (targetAngle - currentAngle) * 0.24

      if (logoRef.current) {
        logoRef.current.style.transform = `rotateX(-4deg) rotateY(${currentAngle}deg)`
      }

      if (Math.abs(targetAngle - currentAngle) > 0.035) {
        raf = window.requestAnimationFrame(paint)
      }
    }

    const onScroll = () => {
      targetAngle = Math.max(0, window.scrollY) * 0.42
      if (!raf) raf = window.requestAnimationFrame(paint)
    }

    if (logoRef.current) {
      logoRef.current.style.transform = `rotateX(-4deg) rotateY(${currentAngle}deg)`
    }

    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="triunfante-scroll-backdrop" aria-hidden="true">
      <div ref={logoRef} className="triunfante-3d-logo">
        {DEPTH_LAYERS.map((depth) => (
          <div
            key={depth}
            className="triunfante-depth-layer"
            style={{ transform: `translateZ(${depth}px)` }}
          >
            <LogoSilhouette />
          </div>
        ))}
        <div className="triunfante-face triunfante-front">
          <LogoFront />
        </div>
        <div className="triunfante-face triunfante-back">
          <LogoBack />
        </div>
      </div>
    </div>
  )
}
