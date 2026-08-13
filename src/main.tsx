import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppV2'
import './styles.css'
import './real-data.css'
import './enhanced.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
