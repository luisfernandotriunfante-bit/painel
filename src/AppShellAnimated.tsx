import AppV3 from './AppV3'
import ExportExcelButton from './ExportExcelButton'
import ScrollTriunfanteBackdrop from './ScrollTriunfanteBackdrop'

const backdropStyles = `
.premium-shell {
  position: relative !important;
  isolation: isolate !important;
}

.triunfante-scroll-backdrop {
  position: fixed !important;
  left: 50% !important;
  top: 50% !important;
  width: clamp(340px, 42vw, 660px) !important;
  aspect-ratio: 180 / 128 !important;
  transform: translate(-50%, -50%) !important;
  background-repeat: no-repeat !important;
  background-position: 0 0;
  pointer-events: none !important;
  z-index: 0 !important;
  opacity: .34 !important;
  will-change: background-position;
}

.premium-shell > .module-sidebar,
.premium-shell > .shell-content {
  position: relative !important;
  z-index: 1 !important;
}

@media (max-width: 760px) {
  .triunfante-scroll-backdrop {
    width: min(78vw, 500px) !important;
    opacity: .28 !important;
  }
}
`

function goToSellOutHome() {
  window.location.href = window.location.pathname
}

export default function AppShellAnimated() {
  return <div className="premium-shell">
    <style>{backdropStyles}</style>
    <ScrollTriunfanteBackdrop />

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

      <ExportExcelButton />

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
