import { useEffect, useRef } from 'react'
import spriteBase64 from './triunfante-user/sprite6-full.txt?raw'

const SPRITE = `data:image/webp;base64,${spriteBase64.trim()}`
const FRAME_COUNT = 6
const COLUMNS = 3
const ROWS = 2
const SCROLL_PX_PER_FRAME = 42
const EASING = 0.2

function framePosition(frame: number) {
  const column = frame % COLUMNS
  const row = Math.floor(frame / COLUMNS)
  const x = COLUMNS > 1 ? (column / (COLUMNS - 1)) * 100 : 0
  const y = ROWS > 1 ? (row / (ROWS - 1)) * 100 : 0
  return `${x}% ${y}%`
}

export default function ScrollTriunfanteBackdropExact() {
  const layerA = useRef<HTMLDivElement>(null)
  const layerB = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let target = Math.max(0, window.scrollY) / SCROLL_PX_PER_FRAME
    let current = target

    const paint = () => {
      const distance = target - current
      current += distance * EASING
      if (Math.abs(distance) < 0.002) current = target

      const normalized = ((current % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT
      const frameA = Math.floor(normalized)
      const frameB = (frameA + 1) % FRAME_COUNT
      const mix = normalized - frameA

      if (layerA.current) {
        layerA.current.style.backgroundPosition = framePosition(frameA)
        layerA.current.style.opacity = String(1 - mix)
      }

      if (layerB.current) {
        layerB.current.style.backgroundPosition = framePosition(frameB)
        layerB.current.style.opacity = String(mix)
      }

      if (Math.abs(target - current) > 0.002) {
        raf = window.requestAnimationFrame(paint)
      } else {
        raf = 0
      }
    }

    const queuePaint = () => {
      target = Math.max(0, window.scrollY) / SCROLL_PX_PER_FRAME
      if (!raf) raf = window.requestAnimationFrame(paint)
    }

    paint()
    window.addEventListener('scroll', queuePaint, { passive: true })

    return () => {
      window.removeEventListener('scroll', queuePaint)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  const layerStyle = {
    backgroundImage: `url("${SPRITE}")`,
    backgroundSize: `${COLUMNS * 100}% ${ROWS * 100}%`,
  }

  return (
    <div className="triunfante-scroll-backdrop" aria-hidden="true">
      <div ref={layerA} className="triunfante-frame-layer" style={layerStyle} />
      <div ref={layerB} className="triunfante-frame-layer" style={layerStyle} />
    </div>
  )
}
