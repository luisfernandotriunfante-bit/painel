import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppShellAnimatedExact'
import ExportExcelButton from './ExportExcelButton'
import MovementModernOverlay from './MovementModernOverlay'
import SafeLayoutRedistribution from './SafeLayoutRedistribution'
import NetworkMetaConfigOverlay from './NetworkMetaConfigOverlay'
import { reconcileStoredState, ValueReconciliationWatcher } from './value-reconciliation'
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
import './sidebar-material.css'
import './glass-stable.css'
import './frosted-everywhere.css'
import './final-polish.css'
import './panel-interaction-fixes.css'
import './visual-standardization.css'
import './movement-modern.css'
import './safe-layout-redistribution.css'
import './network-meta-config.css'

reconcileStoredState()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <MovementModernOverlay />
    <SafeLayoutRedistribution />
    <NetworkMetaConfigOverlay />
    <ValueReconciliationWatcher />
    <div className="excel-export-fixed">
      <ExportExcelButton />
    </div>
    <style>{`
      .excel-export-fixed {
        position: fixed;
        left: 0;
        bottom: 72px;
        width: 246px;
        z-index: 1300;
      }
      .excel-export-fixed .excel-export-wrap {
        margin-top: 0;
      }
      @media (max-width: 760px) {
        .excel-export-fixed {
          left: auto;
          right: 14px;
          bottom: 166px;
          width: 210px;
        }
      }
    `}</style>
  </React.StrictMode>,
)
