import { useEffect, useRef, useState } from 'react'
import fallbackSpriteBase64 from './triunfante-user/sprite6-full.txt?raw'

const FALLBACK_SPRITE = `data:image/webp;base64,${fallbackSpriteBase64.trim()}`
const HQ_BLOB_API = 'https://api.github.com/repos/luisfernandotriunfante-bit/painel/git/blobs/d2a5d73f77952092f4a5d6d01b6aa57b7b35cfb1'
const HQ_CACHE_KEY = 'triunfante-hq12-v1'
const EASING = 0.24

type SpriteConfig = {
  url: string
  frameCount: number
  columns: number
  rows: number
  scrollPxPerFrame: number
}

const FALLBACK_CONFIG: SpriteConfig = {
  url: FALLBACK_SPRITE,
  frameCount: 6,
  columns: 3,
  rows: 2,
  scrollPxPerFrame: 42,
}

function framePosition(frame: number, columns: number, rows: number) {
  const column = frame % columns
  const row = Math.floor(frame / columns)
  const x = columns > 1 ? (column / (columns - 1)) * 100 : 0
  const y = rows > 1 ? (row / (rows - 1)) * 100 : 0
  return `${x}% ${y}%`
}

export default function ScrollTriunfanteBackdropExact() {
  const layerA = useRef<HTMLDivElement>(null)
  const layerB = useRef<HTMLDivElement>(null)
  const [sprite, setSprite] = useState<SpriteConfig>(FALLBACK_CONFIG)

  useEffect(() => {
    let cancelled = false

    const applyHighQualitySprite = (base64: string) => {
      if (cancelled || !base64) return
      const clean = base64.replace(/\s/g, '')
      const url = `data:image/webp;base64,${clean}`
      const preload = new Image()
      preload.decoding = 'async'
      preload.onload = () => {
        if (cancelled) return
        setSprite({
          url,
          frameCount: 12,
          columns: 4,
          rows: 3,
          // 12 quadros ocupam praticamente a mesma distância de scroll de uma volta da versão anterior.
          scrollPxPerFrame: 21,
        })
      }
      preload.src = url
    }

    try {
      const cached = window.localStorage.getItem(HQ_CACHE_KEY)
      if (cached) {
        applyHighQualitySprite(cached)
        return () => {
          cancelled = true
        }
      }
    } catch {
      // localStorage indisponível: segue para o carregamento direto.
    }

    fetch(HQ_BLOB_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HQ sprite: ${response.status}`)
        return response.json()
      })
      .then((payload: { content?: string }) => {
        if (!payload.content || cancelled) return
        const clean = payload.content.replace(/\s/g, '')
        try {
          window.localStorage.setItem(HQ_CACHE_KEY, clean)
        } catch {
          // Cache é opcional.
        }
        applyHighQualitySprite(clean)
      })
      .catch(() => {
        // O sprite de baixa resolução permanece apenas como fallback de segurança.
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let raf = 0
    let target = Math.max(0, window.scrollY) / sprite.scrollPxPerFrame
    let current = target

    const paint = () => {
      const distance = target - current
      current += distance * EASING
      if (Math.abs(distance) < 0.002) current = target

      const normalized = ((current % sprite.frameCount) + sprite.frameCount) % sprite.frameCount
      const frameA = Math.floor(normalized)
      const frameB = (frameA + 1) % sprite.frameCount
      const mix = normalized - frameA

      if (layerA.current) {
        layerA.current.style.backgroundPosition = framePosition(frameA, sprite.columns, sprite.rows)
        layerA.current.style.opacity = String(1 - mix)
      }

      if (layerB.current) {
        layerB.current.style.backgroundPosition = framePosition(frameB, sprite.columns, sprite.rows)
        layerB.current.style.opacity = String(mix)
      }

      if (Math.abs(target - current) > 0.002) {
        raf = window.requestAnimationFrame(paint)
      } else {
        raf = 0
      }
    }

    const queuePaint = () => {
      target = Math.max(0, window.scrollY) / sprite.scrollPxPerFrame
      if (!raf) raf = window.requestAnimationFrame(paint)
    }

    paint()
    window.addEventListener('scroll', queuePaint, { passive: true })

    return () => {
      window.removeEventListener('scroll', queuePaint)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [sprite])

  const layerStyle = {
    backgroundImage: `url("${sprite.url}")`,
    backgroundSize: `${sprite.columns * 100}% ${sprite.rows * 100}%`,
    backgroundRepeat: 'no-repeat',
  }

  return (
    <div className="triunfante-scroll-backdrop" aria-hidden="true">
      <div ref={layerA} className="triunfante-frame-layer" style={layerStyle} />
      <div ref={layerB} className="triunfante-frame-layer" style={layerStyle} />
    </div>
  )
}
