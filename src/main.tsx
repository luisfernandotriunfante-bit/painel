import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppShell'
import './styles.css'
import './real-data.css'
import './enhanced.css'
import './enhanced-v3.css'
import './premium-shell.css'
import './premium-v2.css'
import './premium-v3.css'
import './executive-command.css'
import './executive-unified.css'
import './executive-blackout.css'
import './glass-stable.css'
import './sidebar-material.css'

const frost = document.createElement('style')
frost.textContent = `
.premium-shell .summary-kpis .metric:nth-child(n),
.premium-shell .manager-kpis .metric:nth-child(n),
.premium-shell .metrics .metric:nth-child(n),
.premium-shell .enhanced-metrics .metric:nth-child(n),
.premium-shell .metric,
.premium-shell .panel,
.premium-shell .section-block,
.premium-shell .info-card,
.premium-shell .target-control,
.premium-shell .upload-card,
.premium-shell .storage,
.premium-shell .stock-result,
.premium-shell .manager-info-grid,
.premium-shell .movement-wrap,
.premium-shell .movement-table,
.premium-shell .table-scroll,
.premium-shell .stock-table-viewport,
.premium-shell .inline-alert,
.premium-shell .empty-state {
  background: rgba(5, 11, 19, .16) !important;
  -webkit-backdrop-filter: blur(30px) saturate(118%) !important;
  backdrop-filter: blur(30px) saturate(118%) !important;
}`
document.head.appendChild(frost)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
