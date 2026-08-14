import { useEffect, useRef } from 'react'
import fallbackSpriteBase64 from './triunfante-user/sprite6-full.txt?raw'
import hq00 from './triunfante-hq-video/part00.txt?raw'
import hq01 from './triunfante-hq-video/part01.txt?raw'
import hq02 from './triunfante-hq-video/part02.txt?raw'
import hq03 from './triunfante-hq-video/part03.txt?raw'
import hq04 from './triunfante-hq-video/part04.txt?raw'
import hq05 from './triunfante-hq-video/part05.txt?raw'
import hq06 from './triunfante-hq-video/part06.txt?raw'
import hq07 from './triunfante-hq-video/part07.txt?raw'

const HQ_PARTS = [hq00, hq01, hq02, hq03, hq04, hq05, hq06, hq07]
const FALLBACK_SPRITE = `data:image/webp;base64,${fallbackSpriteBase64.trim()}`
const PIXELS_PER_LOOP = 720
const EASING = 0.19

function makeVideoUrl() {
  const base64 = HQ_PARTS.join('').replace(/\s+/g, '')
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }))
}

export default function ScrollTriunfanteBackdropExact() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let raf = 0
    let duration = 0
    let targetVirtual = 0
    let currentVirtual = 0
    let lastApplied = -1
    let videoUrl = ''

    const modulo = (value: number, divisor: number) =>
      ((value % divisor) + divisor) % divisor

    const revealVideo = () => {
      if (cancelled) return
      video.style.opacity = '1'
      if (fallbackRef.current) fallbackRef.current.style.opacity = '0'
    }

    const applyFrame = () => {
      raf = 0
      if (cancelled || !duration || !Number.isFinite(duration)) return

      const distance = targetVirtual - currentVirtual
      currentVirtual += distance * EASING
      if (Math.abs(distance) < 0.0005) currentVirtual = targetVirtual

      const nextTime = modulo(currentVirtual, duration)
      if (Math.abs(nextTime - lastApplied) > 0.006 || lastApplied < 0) {
        try {
          video.currentTime = Math.min(nextTime, Math.max(0, duration - 0.001))
          lastApplied = nextTime
        } catch {
          // The browser can briefly reject a seek before metadata is ready.
        }
      }

      if (Math.abs(targetVirtual - currentVirtual) > 0.0005) {
        raf = window.requestAnimationFrame(applyFrame)
      }
    }

    const queueFrame = () => {
      if (!duration) return
      targetVirtual = (Math.max(0, window.scrollY) / PIXELS_PER_LOOP) * duration
      if (!raf) raf = window.requestAnimationFrame(applyFrame)
    }

    const onLoadedMetadata = () => {
      duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 2.4
      targetVirtual = (Math.max(0, window.scrollY) / PIXELS_PER_LOOP) * duration
      currentVirtual = targetVirtual
      lastApplied = -1
      video.pause()
      try {
        video.currentTime = modulo(currentVirtual, duration)
      } catch {
        // A first seek will be retried on the next animation frame.
      }
      window.requestAnimationFrame(() => {
        revealVideo()
        queueFrame()
      })
    }

    const onCanPlay = () => revealVideo()

    try {
      videoUrl = makeVideoUrl()
      video.src = videoUrl
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.load()
    } catch (error) {
      console.error('Falha ao montar a animação HQ da Triunfante:', error)
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('canplay', onCanPlay)
    window.addEventListener('scroll', queueFrame, { passive: true })
    window.addEventListener('resize', queueFrame, { passive: true })

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('canplay', onCanPlay)
      window.removeEventListener('scroll', queueFrame)
      window.removeEventListener('resize', queueFrame)
      if (raf) window.cancelAnimationFrame(raf)
      video.pause()
      video.removeAttribute('src')
      video.load()
      if (videoUrl) URL.revokeObjectURL(videoUrl)
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
