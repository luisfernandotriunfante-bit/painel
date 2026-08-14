import { useEffect, useRef } from 'react'
import fallbackSpriteBase64 from './triunfante-user/sprite6-full.txt?raw'

const FALLBACK_SPRITE = `data:image/webp;base64,${fallbackSpriteBase64.replace(/\s+/g, '')}`
const PIXELS_PER_LOOP = 720
const FALLBACK_FRAME_COUNT = 6
const FALLBACK_COLUMNS = 3
const SCROLL_STOP_DELAY = 520
const ROTATION_PER_PIXEL = 0.58
const MOTION_EASING = 0.22

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
    let motionRaf = 0
    let currentAngle = 0
    let targetAngle = 0
    let activeUrl = ''
    let hqReady = false
    const candidateUrls: string[] = []
    const lastScrollByElement = new WeakMap<Element, number>()
    let lastDocumentScroll = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)

    const modulo = (value: number, divisor: number) =>
      ((value % divisor) + divisor) % divisor

    const setMotionTransform = (angle: number) => {
      const transform = `perspective(1500px) rotateX(-3deg) rotateY(${angle.toFixed(3)}deg) translateZ(0)`

      ;[video, fallback].forEach((element) => {
        // These properties are set with !important because the final theme has
        // older safety rules that otherwise force translateZ(0) over the motion.
        element.style.setProperty('transform', transform, 'important')
        element.style.setProperty('transform-origin', '50% 50%', 'important')
        element.style.setProperty('backface-visibility', 'visible', 'important')
        element.style.setProperty('-webkit-backface-visibility', 'visible', 'important')
        element.style.setProperty('will-change', 'transform', 'important')
      })
    }

    const animateMotion = () => {
      motionRaf = 0
      if (cancelled) return

      const distance = targetAngle - currentAngle
      currentAngle += distance * MOTION_EASING

      if (Math.abs(distance) < 0.02) currentAngle = targetAngle
      setMotionTransform(currentAngle)

      if (Math.abs(targetAngle - currentAngle) > 0.02) {
        motionRaf = window.requestAnimationFrame(animateMotion)
      }
    }

    const addRotation = (scrollDelta: number) => {
      if (!Number.isFinite(scrollDelta) || Math.abs(scrollDelta) < 0.05) return
      targetAngle += scrollDelta * ROTATION_PER_PIXEL
      if (!motionRaf) motionRaf = window.requestAnimationFrame(animateMotion)
    }

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

      video.playbackRate = Math.min(2.3, Math.max(0.9, intensity))
      const playPromise = video.play()
      if (playPromise) playPromise.catch(() => undefined)
      stopPlaybackSoon()
    }

    const onAnyScroll = (event: Event) => {
      paintFallback()

      const target = event.target
      let delta = 0

      if (target instanceof Element) {
        const current = target.scrollTop
        const previous = lastScrollByElement.get(target) ?? current
        delta = current - previous
        lastScrollByElement.set(target, current)
      } else {
        const current = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
        delta = current - lastDocumentScroll
        lastDocumentScroll = current
      }

      if (Math.abs(delta) > 0.05) {
        addRotation(delta)
        if (delta > 0) startPlayback(1 + Math.min(1.2, Math.abs(delta) / 26))
      }
    }

    const onWindowScroll = () => {
      paintFallback()
      const current = Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY)
      const delta = current - lastDocumentScroll
      lastDocumentScroll = current
      if (Math.abs(delta) > 0.05) {
        addRotation(delta)
        if (delta > 0) startPlayback(1 + Math.min(1.2, Math.abs(delta) / 26))
      }
    }

    const onWheel = (event: WheelEvent) => {
      // Some layouts consume wheel input in an internal scroller. The captured
      // scroll listener normally supplies the real delta; this small kick makes
      // the logo react immediately even before that scroll event is dispatched.
      if (Math.abs(event.deltaY) > 0.05) {
        addRotation(event.deltaY * 0.16)
        if (event.deltaY > 0) startPlayback(1 + Math.min(1.2, Math.abs(event.deltaY) / 140))
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
      setMotionTransform(currentAngle)
    }

    fallback.style.opacity = '1'
    video.style.opacity = '0'
    setMotionTransform(0)
    paintFallback()

    // Capture phase catches scrolling inside tables/panels as well as the page.
    document.addEventListener('scroll', onAnyScroll, true)
    window.addEventListener('scroll', onWindowScroll, { passive: true })
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
        `Triunfante HQ + rotação garantida por scroll: ${video.videoWidth}x${video.videoHeight}, ${best.label}`,
      )
    })().catch((error) => {
      console.warn('Falha ao iniciar Triunfante HQ:', error)
      keepFallback()
    })

    return () => {
      cancelled = true
      document.removeEventListener('scroll', onAnyScroll, true)
      window.removeEventListener('scroll', onWindowScroll)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', paintFallback)
      if (pauseTimer) window.clearTimeout(pauseTimer)
      if (motionRaf) window.cancelAnimationFrame(motionRaf)
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
