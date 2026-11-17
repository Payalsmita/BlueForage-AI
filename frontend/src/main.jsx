import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// The preset themes dark mode via a .dark class; follow the OS setting.
const mq = matchMedia('(prefers-color-scheme: dark)')
const theme = () => document.documentElement.classList.toggle('dark', mq.matches)
theme(); mq.addEventListener('change', theme)

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
