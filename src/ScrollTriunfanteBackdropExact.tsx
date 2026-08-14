import { useEffect, useRef } from 'react'
import fallbackSpriteBase64 from './triunfante-user/sprite6-full.txt?raw'
import hqVideoBase64 from './triunfante-hq18/chunk00'

const HQ_VIDEO = `data:video/webm;base64,${hqVideoBase64.trim()}`
const FALLBACK_SPRITE = `data:image/webp;base64,${fallbackSpriteBase64.replace(/\s+/g, '')}`
const PIXELS_PER_LOOP = 720
const FALLBACK_FRAME_COUNT = 6
const FALLBACK_COLUMNS = 3
const FALLBACK_ROWS = 2
const EASING = 0.19

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
      if (cancelled || hqReady) return
      video.style.opacity = '0'
      fallback.style.opacity = '1'
      paintFallback()
    }

    const revealVideo = () => {
      if (cancelled || !duration || !Number.isFinite(duration)) return
      hqReady = true
      video.style.opacity = '1'
      fallback.style.opacity = '0'
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
          // Chrome can reject a seek for a few milliseconds while decoding.
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
      if (!duration) {
        keepFallback()
        return
      }

      targetVirtual = (Math.max(0, window.scrollY) / PIXELS_PER_LOOP) * duration
      currentVirtual = targetVirtual
      lastApplied = -1
      video.pause()

      try {
        video.currentTime = modulo(currentVirtual, duration)
      } catch {
        // Retried in requestAnimationFrame below.
      }

      window.requestAnimationFrame(() => {
        revealVideo()
        queueFrame()
      })
    }

    const onCanPlay = () => {
      if (duration) revealVideo()
    }

    const onVideoError = () => keepFallback()

    fallback.style.opacity = '1'
    video.style.opacity = '0'
    paintFallback()

    video.src = HQ_VIDEO
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.load()

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onVideoError)
    window.addEventListener('scroll', queueFrame, { passive: true })
    window.addEventListener('resize', queueFrame, { passive: true })

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onVideoError)
      window.removeEventListener('scroll', queueFrame)
      window.removeEventListener('resize', queueFrame)
      if (raf) window.cancelAnimationFrame(raf)
      video.pause()
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
