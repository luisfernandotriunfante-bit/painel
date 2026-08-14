import AppV3 from './AppV3'
import ScrollTriunfanteBackdropExact from './ScrollTriunfanteBackdropExact'

const shellStyles = `
.premium-shell {
  position: relative !important;
  isolation: isolate !important;
  min-height: 100vh !important;
}

.triunfante-scroll-backdrop {
  position: fixed !important;
  left: 50% !important;
  top: 50% !important;
  width: clamp(420px, 38vw, 620px) !important;
  aspect-ratio: 1320 / 940 !important;
  transform: translate(-50%, -50%) !important;
  display: block !important;
  pointer-events: none !important;
  z-index: 1 !important;
  opacity: .68 !important;
  overflow: visible !important;
  background: none !important;
  perspective: none !important;
  filter: none !important;
  mix-blend-mode: normal !important;
}

.triunfante-hq-video,
.triunfante-hq-fallback,
.triunfante-frame-layer,
.triunfante-hq-canvas {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  display: block !important;
  pointer-events: none !important;
  transform: translateZ(0) !important;
  backface-visibility: hidden !important;
}

.triunfante-hq-video {
  object-fit: contain !important;
  object-position: center !important;
  opacity: 0;
  transition: opacity 160ms ease !important;
  background: transparent !important;
  filter: none !important;
}

.triunfante-hq-fallback {
  background-repeat: no-repeat !important;
  background-position: 0 0;
  background-size: 300% 200% !important;
  opacity: 1;
  transition: opacity 160ms ease !important;
  image-rendering: auto !important;
  filter: none !important;
}

.triunfante-frame-layer {
  background-repeat: no-repeat !important;
  will-change: opacity, background-position !important;
}

.premium-shell > .shell-content {
  position: relative !important;
  z-index: 2 !important;
}

@media (min-width: 761px) {
  .premium-shell > .module-sidebar {
    position: fixed !important;
    z-index: 1000 !important;
    top: 0 !important;
    left: 0 !important;
    bottom: 0 !important;
    width: 246px !important;
    height: 100vh !important;
    min-height: 100vh !important;
    transform: translateX(0) !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: visible !important;
  }

  .premium-shell > .shell-content {
    margin-left: 246px !important;
    width: calc(100% - 246px) !important;
    min-height: 100vh !important;
    padding-top: 0 !important;
  }

  .premium-shell .shell-content .v3-app,
  .premium-shell .shell-content .compact-main {
    margin-top: 0 !important;
    padding-top: 0 !important;
    top: auto !important;
    transform: none !important;
  }

  .premium-shell .shell-content .v3-main {
    margin-top: 0 !important;
    padding-top: 28px !important;
    top: auto !important;
    transform: none !important;
  }

  .premium-shell .shell-content .tabs {
    top: 0 !important;
    margin-top: 22px !important;
    margin-bottom: 28px !important;
  }
}

@media (max-width: 760px) {
  .triunfante-scroll-backdrop {
    width: min(84vw, 520px) !important;
    opacity: .48 !important;
  }
}
`

function goToSellOutHome() {
  window.location.href = window.location.pathname
}

export default function AppShellAnimatedExact() {
  return <div className="premium-shell">
    <style>{shellStyles}</style>
    <ScrollTriunfanteBackdropExact />

    <aside className="module-sidebar" aria-label="Módulos do painel">
      <div className="sidebar-brand">
        <div className="brand-mark">M</div>
        <div className="brand-copy">
          <strong>Milênio</strong>
          <span>Inteligência Comercial</span>
        </div>
      </div>

      <nav className="module-nav">
        <button className="module-item active" onClick={goToSellOutHome} title="Sell Out">
          <span className="module-number">01</span>
          <span className="module-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V9" />
              <path d="M10 19V5" />
              <path d="M16 19v-7" />
              <path d="M22 19V3" />
            </svg>
          </span>
          <span className="module-label">
            <b>SELL OUT</b>
            <small>Comercial & performance</small>
          </span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <span className="status-dot" />
        <div>
          <strong>Sistema ativo</strong>
          <small>Base local segura</small>
        </div>
      </div>
    </aside>

    <div className="shell-content">
      <AppV3 />
    </div>
  </div>
}
