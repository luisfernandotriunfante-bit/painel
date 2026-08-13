import { useEffect, useRef } from 'react'
import part0 from './triunfante-sprite/part00.txt?raw'
import part1 from './triunfante-sprite/part01.txt?raw'

const source = ['data:', 'image/webp;', 'base64,', part0.trim(), part1.trim()].join('')
const frames = 6
const columns = 3
const rows = 2

const framePosition = (frame: number) => {
  const column = frame % columns
  const row = Math.floor(frame / columns)
  return `${(column / 2) * 100}% ${row * 100}%`
}

export default function ScrollTriunfanteSpriteBackdrop() {
  const layerA = useRef<HTMLDivElement>(null)
  const layerB = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let current = Math.max(0, window.scrollY) / 54
    let target = current

    const paint = () => {
      const distance = target - current
      current += distance * 0.2
      if (Math.abs(distance) < 0.002) current = target

      const normalized = ((current % frames) + frames) % frames
      const firstFrame = Math.floor(normalized)
      const secondFrame = (firstFrame + 1) % frames
      const mix = normalized - firstFrame

      if (layerA.current) {
        layerA.current.style.backgroundPosition = framePosition(firstFrame)
        layerA.current.style.opacity = String(1 - mix)
      }
      if (layerB.current) {
        layerB.current.style.backgroundPosition = framePosition(secondFrame)
        layerB.current.style.opacity = String(mix)
      }

      if (Math.abs(target - current) > 0.002) raf = requestAnimationFrame(paint)
      else raf = 0
    }

    const onScroll = () => {
      target = Math.max(0, window.scrollY) / 54
      if (!raf) raf = requestAnimationFrame(paint)
    }

    paint()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const layerStyle = {
    backgroundImage: `url("${source}")`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
  }

  return <div className="triunfante-scroll-backdrop" aria-hidden="true">
    <div ref={layerA} className="triunfante-frame-layer" style={layerStyle} />
    <div ref={layerB} className="triunfante-frame-layer" style={layerStyle} />
  </div>
}
