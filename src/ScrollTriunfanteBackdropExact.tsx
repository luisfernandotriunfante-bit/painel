import { useEffect, useRef } from 'react'
import fallbackSpriteBase64 from './triunfante-user/sprite6-full.txt?raw'

const FALLBACK_SPRITE = `data:image/webp;base64,${fallbackSpriteBase64.replace(/\s+/g, '')}`
const PIXELS_PER_LOOP = 720
const FALLBACK_FRAME_COUNT = 6
const FALLBACK_COLUMNS = 3
const HQ_FRAME_COUNT = 18
const EASING = 0.2

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

function seekVideo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const safeTime = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.001)))

    if (Math.abs(video.currentTime - safeTime) < 0.002 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve()
      return
    }

    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('seek timeout'))
    }, 2500)

    const onSeeked = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error('seek decode error'))
    }

    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }

    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })

    try {
      video.currentTime = safeTime
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

async function decodeFrameCache(video: HTMLVideoElement, frameCount: number) {
  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
    throw new Error('invalid video metadata')
  }

  const frames: ImageBitmap[] = []

  try {
    for (let frame = 0; frame < frameCount; frame += 1) {
      // Sampling the middle of each slot avoids landing exactly on the loop seam.
      const progress = (frame + 0.35) / frameCount
      const time = progress * video.duration
      await seekVideo(video, time)
      frames.push(await createImageBitmap(video))
    }
  } catch (error) {
    frames.forEach((frame) => frame.close())
    throw error
  }

  return frames
}

export default function ScrollTriunfanteBackdropExact() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const fallback = fallbackRef.current
    if (!video || !canvas || !fallback) return

    const context = canvas.getContext('2d', { alpha: true })
    if (!context) return

    let cancelled = false
    let raf = 0
    let targetFrame = 0
    let currentFrame = 0
    let frameCache: ImageBitmap[] = []
    let directDuration = 0
    let directLastApplied = -1
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

    const drawCachedFrame = () => {
      if (!frameCache.length) return false

      const normalized = modulo(currentFrame, frameCache.length)
      const frameA = Math.floor(normalized)
      const frameB = (frameA + 1) % frameCache.length
      const mix = normalized - frameA

      context.clearRect(0, 0, canvas.width, canvas.height)
      context.globalAlpha = 1 - mix
      context.drawImage(frameCache[frameA], 0, 0, canvas.width, canvas.height)
      context.globalAlpha = mix
      context.drawImage(frameCache[frameB], 0, 0, canvas.width, canvas.height)
      context.globalAlpha = 1
      return true
    }

    const applyFrame = () => {
      raf = 0
      if (cancelled) return

      paintFallback()

      if (frameCache.length) {
        const distance = targetFrame - currentFrame
        currentFrame += distance * EASING
        if (Math.abs(distance) < 0.002) currentFrame = targetFrame
        drawCachedFrame()

        if (Math.abs(targetFrame - currentFrame) > 0.002) {
          raf = window.requestAnimationFrame(applyFrame)
        }
        return
      }

      // Emergency path while the HQ frame cache is still being prepared.
      if (directDuration > 0 && Number.isFinite(directDuration)) {
        const nextTime = modulo((Math.max(0, window.scrollY) / PIXELS_PER_LOOP) * directDuration, directDuration)
        if (Math.abs(nextTime - directLastApplied) > 0.003 || directLastApplied < 0) {
          try {
            video.currentTime = Math.min(nextTime, Math.max(0, directDuration - 0.001))
            directLastApplied = nextTime
          } catch {
            // The cached-frame path replaces this as soon as decoding completes.
          }
        }
      }
    }

    const queueFrame = () => {
      paintFallback()
      targetFrame = (Math.max(0, window.scrollY) / PIXELS_PER_LOOP) * HQ_FRAME_COUNT
      if (!raf) raf = window.requestAnimationFrame(applyFrame)
    }

    const keepFallback = () => {
      if (cancelled || frameCache.length) return
      video.style.opacity = '0'
      canvas.style.opacity = '0'
      fallback.style.opacity = '1'
      paintFallback()
    }

    const showVideoFrame = () => {
      if (cancelled || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      video.style.opacity = '1'
      fallback.style.opacity = '0'
    }

    fallback.style.opacity = '1'
    video.style.opacity = '0'
    canvas.style.opacity = '0'
    paintFallback()

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
      video.load()

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup()
          reject(new Error('HQ video load timeout'))
        }, 6000)

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
      })

      if (cancelled) return

      directDuration = Number.isFinite(video.duration) ? video.duration : best.duration
      showVideoFrame()

      try {
        const decoded = await decodeFrameCache(video, HQ_FRAME_COUNT)
        if (cancelled) {
          decoded.forEach((frame) => frame.close())
          return
        }

        frameCache = decoded
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        targetFrame = (Math.max(0, window.scrollY) / PIXELS_PER_LOOP) * HQ_FRAME_COUNT
        currentFrame = targetFrame
        drawCachedFrame()

        canvas.style.opacity = '1'
        video.style.opacity = '0'
        fallback.style.opacity = '0'
        console.info(
          `Triunfante HQ com movimento: ${video.videoWidth}x${video.videoHeight}, ${HQ_FRAME_COUNT} quadros em cache, ${best.label}`,
        )
        queueFrame()
      } catch (error) {
        console.warn('Cache HQ de quadros não pôde ser criado; usando scrub direto do vídeo.', error)
        showVideoFrame()
        queueFrame()
      }
    })().catch((error) => {
      console.warn('Falha ao iniciar Triunfante HQ:', error)
      keepFallback()
    })

    return () => {
      cancelled = true
      window.removeEventListener('scroll', queueFrame)
      window.removeEventListener('resize', queueFrame)
      if (raf) window.cancelAnimationFrame(raf)
      frameCache.forEach((frame) => frame.close())
      frameCache = []
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
      <canvas ref={canvasRef} className="triunfante-hq-video triunfante-hq-canvas" />
    </div>
  )
}
