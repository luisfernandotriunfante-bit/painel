import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppShell'
import './styles.css'
import './real-data.css'
import './enhanced.css'
import './enhanced-v3.css'
import './premium-shell.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
