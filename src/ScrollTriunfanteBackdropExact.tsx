import { useEffect, useRef } from 'react'
import fallbackSpriteBase64 from './triunfante-user/sprite6-full.txt?raw'

const FALLBACK_SPRITE = `data:image/webp;base64,${fallbackSpriteBase64.trim()}`
const HQ_BLOB_API = 'https://api.github.com/repos/luisfernandotriunfante-bit/painel/git/blobs/d2a5d73f77952092f4a5d6d01b6aa57b7b35cfb1'
const HQ_CACHE_KEY = 'triunfante-hq12-v1'
const EASING = 0.24

type SpriteConfig = {
  image: HTMLImageElement
  frameCount: number
  columns: number
  rows: number
  scrollPxPerFrame: number
}

function makeImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
}

export default function ScrollTriunfanteBackdropExact() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let resizeObserver: ResizeObserver | null = null
    let sprite: SpriteConfig | null = null
    let target = Math.max(0, window.scrollY) / 21
    let current = target
    let lastFrame = -1
    let lastWidth = 0
    let lastHeight = 0

    const resizeCanvas = () => {
      const canvas = canvasRef.current
      if (!canvas) return false

      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return false

      // Render explicitly at device-pixel density. This avoids the browser
      // rasterising the animation at CSS-pixel resolution on HiDPI screens.
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const width = Math.max(1, Math.round(rect.width * dpr))
      const height = Math.max(1, Math.round(rect.height * dpr))

      if (width !== canvas.width || height !== canvas.height) {
        canvas.width = width
        canvas.height = height
        lastFrame = -1
      }

      const changed = width !== lastWidth || height !== lastHeight
      lastWidth = width
      lastHeight = height
      return changed
    }

    const drawFrame = (frame: number) => {
      const canvas = canvasRef.current
      if (!canvas || !sprite) return

      resizeCanvas()
      if (!canvas.width || !canvas.height) return

      const ctx = canvas.getContext('2d', { alpha: true })
      if (!ctx) return

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const sourceWidth = sprite.image.naturalWidth / sprite.columns
      const sourceHeight = sprite.image.naturalHeight / sprite.rows
      const column = frame % sprite.columns
      const row = Math.floor(frame / sprite.columns)

      ctx.drawImage(
        sprite.image,
        column * sourceWidth,
        row * sourceHeight,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      )
    }

    const paint = () => {
      raf = 0
      if (!sprite || cancelled) return

      const distance = target - current
      current += distance * EASING
      if (Math.abs(distance) < 0.002) current = target

      // Important: render ONE complete source frame at a time.
      // The previous two-layer crossfade blended two different rotations and
      // produced the soft/ghosted appearance that looked like low resolution.
      const normalized = ((current % sprite.frameCount) + sprite.frameCount) % sprite.frameCount
      const frame = Math.round(normalized) % sprite.frameCount

      const resized = resizeCanvas()
      if (frame !== lastFrame || resized) {
        drawFrame(frame)
        lastFrame = frame
      }

      if (Math.abs(target - current) > 0.002) {
        raf = window.requestAnimationFrame(paint)
      }
    }

    const queuePaint = () => {
      if (!sprite) return
      target = Math.max(0, window.scrollY) / sprite.scrollPxPerFrame
      if (!raf) raf = window.requestAnimationFrame(paint)
    }

    const activateSprite = async (
      url: string,
      frameCount: number,
      columns: number,
      rows: number,
      scrollPxPerFrame: number,
    ) => {
      try {
        const image = await makeImage(url)
        if (cancelled) return
        sprite = { image, frameCount, columns, rows, scrollPxPerFrame }
        target = Math.max(0, window.scrollY) / scrollPxPerFrame
        current = target
        lastFrame = -1
        queuePaint()
      } catch {
        // Keep the currently active sprite if a replacement fails.
      }
    }

    // Start immediately with the bundled fallback so there is never a blank layer.
    activateSprite(FALLBACK_SPRITE, 6, 3, 2, 42)

    const applyHQ = (base64: string) => {
      const clean = base64.replace(/\s/g, '')
      if (!clean || cancelled) return
      activateSprite(`data:image/webp;base64,${clean}`, 12, 4, 3, 21)
    }

    try {
      const cached = window.localStorage.getItem(HQ_CACHE_KEY)
      if (cached) {
        applyHQ(cached)
      } else {
        fetch(HQ_BLOB_API, { headers: { Accept: 'application/vnd.github+json' } })
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
              // Cache is optional.
            }
            applyHQ(clean)
          })
          .catch(() => {
            // Bundled fallback remains available.
          })
      }
    } catch {
      fetch(HQ_BLOB_API, { headers: { Accept: 'application/vnd.github+json' } })
        .then((response) => response.json())
        .then((payload: { content?: string }) => payload.content && applyHQ(payload.content))
        .catch(() => undefined)
    }

    window.addEventListener('scroll', queuePaint, { passive: true })
    window.addEventListener('resize', queuePaint, { passive: true })

    if (canvasRef.current && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        lastFrame = -1
        queuePaint()
      })
      resizeObserver.observe(canvasRef.current)
    }

    return () => {
      cancelled = true
      window.removeEventListener('scroll', queuePaint)
      window.removeEventListener('resize', queuePaint)
      resizeObserver?.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="triunfante-scroll-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="triunfante-hq-canvas" />
    </div>
  )
}
