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
        const width = 96
        const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return false

        context.clearRect(0, 0, width, height)
        context.drawImage(video, 0, 0, width, height)
        const pixels = context.getImageData(0, 0, width, height).data
        let visiblePixels = 0
        const minimumVisible = Math.max(18, Math.floor((pixels.length / 4) * 0.002))

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

      // loadedmetadata/canplay only prove that the container was parsed. They do
      // not prove Chrome has painted a non-empty VP9 frame yet. Never hide the
      // fallback until an actual decoded frame contains visible logo pixels.
      if (!frameHasVisiblePixels()) {
        keepFallback()
        return
      }

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

      // Important: do not reveal here. Metadata is exactly where the previous
      // implementation hid the working fallback before a frame existed.
      window.requestAnimationFrame(queueFrame)
    }

    const onDecodedFrame = () => {
      revealVideoIfVisible()
    }

    const onVideoError = () => keepFallback()

    // The fallback is the guaranteed visual source from the first paint onward.
    // HQ is promoted only after a real frame passes the visibility check above.
    fallback.style.opacity = '1'
    video.style.opacity = '0'
    paintFallback()

    video.src = HQ_VIDEO
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.load()

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('loadeddata', onDecodedFrame)
    video.addEventListener('canplay', onDecodedFrame)
    video.addEventListener('seeked', onDecodedFrame)
    video.addEventListener('error', onVideoError)
    window.addEventListener('scroll', queueFrame, { passive: true })
    window.addEventListener('resize', queueFrame, { passive: true })

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
