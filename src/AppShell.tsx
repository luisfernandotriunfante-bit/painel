import AppV3 from './AppV3'

function goToSellOutHome() {
  // AppV3 inicia sempre em Resumo. Recarregar preserva a base local e
  // garante que clicar no módulo SELL OUT volte para a home do módulo.
  window.location.href = window.location.pathname
}

export default function AppShell() {
  return <div className="premium-shell">
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
