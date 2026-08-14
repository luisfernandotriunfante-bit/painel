import { useEffect, useRef } from 'react'
import fallbackSpriteBase64 from './triunfante-user/sprite6-full.txt?raw'

const FALLBACK_SPRITE = `data:image/webp;base64,${fallbackSpriteBase64.replace(/\s+/g, '')}`
const PIXELS_PER_LOOP = 720
const FALLBACK_FRAME_COUNT = 6
const FALLBACK_COLUMNS = 3
const EASING = 0.19

const HQ_CANDIDATES = [
  ['triunfante-hq-v2/part00.txt', 'triunfante-hq-v2/part01.txt'],
  ['triunfante-hq-v4/part00.txt', 'triunfante-hq-v4/part01.txt'],
]

type VideoCandidate = {
  url: string
  width: number
  height: number
  duration: number
  bytes: number
  label: string
}

function base64ToObjectUrl(base64: string) {
  const clean = base64.replace(/\s+/g, '')
  const binary = window.atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return {
    url: URL.createObjectURL(new Blob([bytes], { type: 'video/webm' })),
    bytes: bytes.byteLength,
  }
}

async function buildCandidate(parts: string[]): Promise<VideoCandidate | null> {
  try {
    const base = import.meta.env.BASE_URL || './'
    const texts = await Promise.all(
      parts.map(async (part) => {
        const response = await fetch(`${base}${part}`, { cache: 'force-cache' })
        if (!response.ok) throw new Error(`${part}: HTTP ${response.status}`)
        return response.text()
      }),
    )

    const { url, bytes } = base64ToObjectUrl(texts.join(''))
    const probe = document.createElement('video')
    probe.muted = true
    probe.playsInline = true
    probe.preload = 'metadata'

    const metadata = await new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('metadata timeout')), 5000)
      const cleanup = () => window.clearTimeout(timeout)

      probe.addEventListener('loadedmetadata', () => {
        cleanup()
        resolve({
          width: probe.videoWidth,
          height: probe.videoHeight,
          duration: probe.duration,
        })
      }, { once: true })
      probe.addEventListener('error', () => {
        cleanup()
        reject(new Error('video decode error'))
      }, { once: true })
      probe.src = url
      probe.load()
    })

    if (!metadata.width || !metadata.height || !Number.isFinite(metadata.duration) || metadata.duration <= 0) {
      URL.revokeObjectURL(url)
      return null
    }

    return {
      url,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      bytes,
      label: parts.join(' + '),
    }
  } catch (error) {
    console.warn('Fonte HQ Triunfante descartada:', parts, error)
    return null
  }
}

export default function ScrollTriunfanteBackdropExact() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const fallback = fallbackRef.current
    if (!video || !fallback) return

    let cancelled = false
    let raf = 0
    let duration = 0
    let targetVirtual = 0
    let currentVirtual = 0
    let lastApplied = -1
    let hqReady = false
    let activeUrl = ''
    const candidateUrls: string[] = []

    const modulo = (value: number, divisor: number) =>
      ((value % divisor) + divisor) % divisor

    const paintFallback = () => {
      const progress = modulo(Math.max(0, window.scrollY) / PIXELS_PER_LOOP, 1)
      const frame = Math.floor(progress * FALLBACK_FRAME_COUNT) % FALLBACK_FRAME_COUNT
      const column = frame % FALLBACK_COLUMNS
      const row = Math.floor(frame / FALLBACK_COLUMNS)
      fallback.style.backgroundPosition = `${column * 50}% ${row * 100}%`
    }

    const keepFallback = () => {
      if (cancelled) return
      hqReady = false
      video.style.opacity = '0'
      fallback.style.opacity = '1'
      paintFallback()
    }

    const frameHasVisiblePixels = () => {
      if (
        cancelled ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) return false

      try {
        const width = 128
        const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return false

        context.drawImage(video, 0, 0, width, height)
        const pixels = context.getImageData(0, 0, width, height).data
        let visiblePixels = 0
        const minimumVisible = Math.max(24, Math.floor((pixels.length / 4) * 0.002))

        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3]
          const brightness = Math.max(pixels[index], pixels[index + 1], pixels[index + 2])
          if (alpha > 18 && brightness > 18) {
            visiblePixels += 1
            if (visiblePixels >= minimumVisible) return true
          }
        }
      } catch {
        return false
      }

      return false
    }

    const revealVideoIfVisible = () => {
      if (cancelled || !duration || !Number.isFinite(duration)) return
      if (!frameHasVisiblePixels()) return

      hqReady = true
      video.style.opacity = '1'
      window.requestAnimationFrame(() => {
        if (!cancelled && hqReady) fallback.style.opacity = '0'
      })
    }

    const applyFrame = () => {
      raf = 0
      if (cancelled) return

      paintFallback()
      if (!duration || !Number.isFinite(duration)) return

      const distance = targetVirtual - currentVirtual
      currentVirtual += distance * EASING
      if (Math.abs(distance) < 0.0005) currentVirtual = targetVirtual

      const nextTime = modulo(currentVirtual, duration)
      if (Math.abs(nextTime - lastApplied) > 0.003 || lastApplied < 0) {
        try {
          video.currentTime = Math.min(nextTime, Math.max(0, duration - 0.001))
          lastApplied = nextTime
        } catch {
          // A seek can briefly be rejected while Chrome is decoding a VP9 frame.
        }
      }

      if (Math.abs(targetVirtual - currentVirtual) > 0.0005) {
        raf = window.requestAnimationFrame(applyFrame)
      }
    }

    const queueFrame = () => {
      paintFallback()
      if (!duration) return
      targetVirtual = (Math.max(0, window.scrollY) / PIXELS_PER_LOOP) * duration
      if (!raf) raf = window.requestAnimationFrame(applyFrame)
    }

    const onLoadedMetadata = () => {
      duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      if (!duration) return

      targetVirtual = (Math.max(0, window.scrollY) / PIXELS_PER_LOOP) * duration
      currentVirtual = targetVirtual
      lastApplied = -1
      video.pause()

      try {
        video.currentTime = modulo(currentVirtual, duration)
      } catch {
        // Retried on the next animation frame.
      }
      window.requestAnimationFrame(queueFrame)
    }

    const onDecodedFrame = () => revealVideoIfVisible()
    const onVideoError = () => keepFallback()

    fallback.style.opacity = '1'
    video.style.opacity = '0'
    paintFallback()

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('loadeddata', onDecodedFrame)
    video.addEventListener('canplay', onDecodedFrame)
    video.addEventListener('seeked', onDecodedFrame)
    video.addEventListener('error', onVideoError)
    window.addEventListener('scroll', queueFrame, { passive: true })
    window.addEventListener('resize', queueFrame, { passive: true })

    ;(async () => {
      const results = await Promise.all(HQ_CANDIDATES.map(buildCandidate))
      if (cancelled) {
        results.forEach((candidate) => candidate && URL.revokeObjectURL(candidate.url))
        return
      }

      const valid = results.filter((candidate): candidate is VideoCandidate => Boolean(candidate))
      candidateUrls.push(...valid.map((candidate) => candidate.url))

      // Prefer actual pixel count first, then encoded payload size. This keeps us
      // on the sharpest version that the browser can really decode.
      valid.sort((a, b) => {
        const pixelDifference = b.width * b.height - a.width * a.height
        return pixelDifference || b.bytes - a.bytes
      })

      const best = valid[0]
      if (!best) {
        console.warn('Nenhuma fonte HQ Triunfante pôde ser decodificada; mantendo fallback.')
        return
      }

      activeUrl = best.url
      console.info(`Triunfante HQ selecionado: ${best.width}x${best.height}, ${best.bytes} bytes, ${best.label}`)
      video.src = activeUrl
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.load()
    })()

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('loadeddata', onDecodedFrame)
      video.removeEventListener('canplay', onDecodedFrame)
      video.removeEventListener('seeked', onDecodedFrame)
      video.removeEventListener('error', onVideoError)
      window.removeEventListener('scroll', queueFrame)
      window.removeEventListener('resize', queueFrame)
      if (raf) window.cancelAnimationFrame(raf)
      video.pause()
      video.removeAttribute('src')
      candidateUrls.forEach((url) => URL.revokeObjectURL(url))
      if (activeUrl && !candidateUrls.includes(activeUrl)) URL.revokeObjectURL(activeUrl)
    }
  }, [])

  return (
    <div className="triunfante-scroll-backdrop" aria-hidden="true">
      <div
        ref={fallbackRef}
        className="triunfante-hq-fallback"
        style={{ backgroundImage: `url("${FALLBACK_SPRITE}")` }}
      />
      <video ref={videoRef} className="triunfante-hq-video" muted playsInline preload="auto" />
    </div>
  )
}
