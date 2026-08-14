import { useEffect, useRef } from 'react'
import fallbackSpriteBase64 from './triunfante-user/sprite6-full.txt?raw'

const FALLBACK_SPRITE = `data:image/webp;base64,${fallbackSpriteBase64.replace(/\s+/g, '')}`
const PIXELS_PER_LOOP = 720
const FALLBACK_FRAME_COUNT = 6
const FALLBACK_COLUMNS = 3
const SCROLL_STOP_DELAY = 135

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

      probe.addEventListener(
        'loadedmetadata',
        () => {
          cleanup()
          resolve({
            width: probe.videoWidth,
            height: probe.videoHeight,
            duration: probe.duration,
          })
        },
        { once: true },
      )
      probe.addEventListener(
        'error',
        () => {
          cleanup()
          reject(new Error('video decode error'))
        },
        { once: true },
      )
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
    let pauseTimer = 0
    let lastScrollTop = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
    let activeUrl = ''
    let hqReady = false
    const candidateUrls: string[] = []

    const modulo = (value: number, divisor: number) =>
      ((value % divisor) + divisor) % divisor

    const paintFallback = () => {
      const scrollTop = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
      const progress = modulo(scrollTop / PIXELS_PER_LOOP, 1)
      const frame = Math.floor(progress * FALLBACK_FRAME_COUNT) % FALLBACK_FRAME_COUNT
      const column = frame % FALLBACK_COLUMNS
      const row = Math.floor(frame / FALLBACK_COLUMNS)
      fallback.style.backgroundPosition = `${column * 50}% ${row * 100}%`
    }

    const stopPlaybackSoon = () => {
      if (pauseTimer) window.clearTimeout(pauseTimer)
      pauseTimer = window.setTimeout(() => {
        pauseTimer = 0
        if (!cancelled) video.pause()
      }, SCROLL_STOP_DELAY)
    }

    const startPlayback = (intensity = 1) => {
      if (cancelled || !hqReady) {
        paintFallback()
        return
      }

      // Let the browser decode the animation naturally. This is much more reliable
      // in Chrome than repeatedly seeking a paused VP9/WebM while the page scrolls.
      video.playbackRate = Math.min(2.15, Math.max(0.8, intensity))
      const playPromise = video.play()
      if (playPromise) {
        playPromise.catch(() => {
          // Muted playback is normally allowed; if Chrome delays it, the next
          // scroll/wheel event retries without hiding the HQ frame.
        })
      }
      stopPlaybackSoon()
    }

    const onScroll = () => {
      paintFallback()
      const scrollTop = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
      const delta = scrollTop - lastScrollTop
      lastScrollTop = scrollTop

      if (delta > 0.25) {
        startPlayback(0.95 + Math.min(1.15, delta / 22))
      }
    }

    const onWheel = (event: WheelEvent) => {
      // Wheel/trackpad is also observed directly so the animation still reacts
      // when a browser or wrapper changes which element owns the actual scroll.
      if (event.deltaY > 0.25) {
        startPlayback(0.95 + Math.min(1.15, Math.abs(event.deltaY) / 120))
      }
    }

    const keepFallback = () => {
      if (cancelled || hqReady) return
      video.pause()
      video.style.opacity = '0'
      fallback.style.opacity = '1'
      paintFallback()
    }

    const revealVideo = () => {
      if (cancelled || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      hqReady = true
      video.pause()
      video.style.opacity = '1'
      fallback.style.opacity = '0'
    }

    fallback.style.opacity = '1'
    video.style.opacity = '0'
    paintFallback()

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('resize', paintFallback, { passive: true })

    ;(async () => {
      const results = await Promise.all(HQ_CANDIDATES.map(buildCandidate))
      if (cancelled) {
        results.forEach((candidate) => candidate && URL.revokeObjectURL(candidate.url))
        return
      }

      const valid = results.filter((candidate): candidate is VideoCandidate => Boolean(candidate))
      candidateUrls.push(...valid.map((candidate) => candidate.url))

      // Keep exactly the quality behavior that produced the approved sharp frame:
      // largest decoded source first, encoded payload only as the tie breaker.
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
      video.src = activeUrl
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.loop = true
      video.defaultPlaybackRate = 1
      video.playbackRate = 1

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup()
          reject(new Error('HQ video load timeout'))
        }, 7000)

        const cleanup = () => {
          window.clearTimeout(timeout)
          video.removeEventListener('loadeddata', onLoaded)
          video.removeEventListener('error', onError)
        }

        const onLoaded = () => {
          cleanup()
          resolve()
        }

        const onError = () => {
          cleanup()
          reject(new Error('HQ video load error'))
        }

        video.addEventListener('loadeddata', onLoaded, { once: true })
        video.addEventListener('error', onError, { once: true })
        video.load()
      })

      if (cancelled) return

      revealVideo()
      console.info(
        `Triunfante HQ pronto para playback por scroll: ${video.videoWidth}x${video.videoHeight}, ${best.label}`,
      )
    })().catch((error) => {
      console.warn('Falha ao iniciar Triunfante HQ:', error)
      keepFallback()
    })

    return () => {
      cancelled = true
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', paintFallback)
      if (pauseTimer) window.clearTimeout(pauseTimer)
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
      <video ref={videoRef} className="triunfante-hq-video" muted playsInline loop preload="auto" />
    </div>
  )
}
