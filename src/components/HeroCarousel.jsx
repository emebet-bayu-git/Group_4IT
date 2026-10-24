import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const fallbackImage = 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=1200&auto=format&fit=crop'

const defaultSlides = [
  { id: 1, imageUrl: '/school-images/download (2)_2.jfif', title: 'Morning Assembly', description: 'Students begin the school day together in unity and discipline.', tag: 'Morning Assembly' },
  { id: 2, imageUrl: '/school-images/download (1)_2.jfif', title: 'Flag Raising Ceremony', description: 'Our uniformed student community gathers to honour the nation.', tag: 'Flag Ceremony' },
  { id: 3, imageUrl: '/school-images/download_2.jfif', title: 'Campus Life', description: 'Students learning, competing, and growing across the school grounds.', tag: 'Campus Life' },
]

export default function HeroCarousel({ slides = defaultSlides, interval = 5000, variant = 'default' }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [loadedSlides, setLoadedSlides] = useState({})
  const [failedSlides, setFailedSlides] = useState({})

  const goTo = (index) => setActiveIndex((index + slides.length) % slides.length)
  const previous = () => goTo(activeIndex - 1)
  const next = () => goTo(activeIndex + 1)

  useEffect(() => {
    if (paused || slides.length < 2) return undefined
    const timer = window.setInterval(next, interval)
    return () => window.clearInterval(timer)
  }, [activeIndex, paused, interval, slides.length])

  useEffect(() => {
    const slide = slides[activeIndex]
    if (!slide || loadedSlides[slide.id] || failedSlides[slide.id]) return undefined
    const image = new Image()
    image.onload = () => setLoadedSlides((current) => ({ ...current, [slide.id]: true }))
    image.onerror = () => setFailedSlides((current) => ({ ...current, [slide.id]: true }))
    image.src = slide.imageUrl || fallbackImage
    return () => { image.onload = null; image.onerror = null }
  }, [activeIndex, slides, loadedSlides, failedSlides])

  if (!slides.length) return <div className="aspect-[16/10] animate-pulse rounded-lg bg-slate-200" />
  const current = slides[activeIndex]
  const currentLoaded = loadedSlides[current.id]
  const currentFailed = failedSlides[current.id]
  const containerClassName = variant === 'hero'
    ? 'relative h-full w-full overflow-hidden bg-slate-200'
    : 'relative aspect-[16/10] overflow-hidden rounded-lg border border-slate-200 bg-slate-200 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.35)]'
  return (
    <div className={containerClassName} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {!currentLoaded && !currentFailed && <div className="absolute inset-0 z-20 animate-pulse bg-slate-200" aria-label="Loading school image" />}
      {slides.map((slide, index) => <img key={slide.id} src={failedSlides[slide.id] ? fallbackImage : slide.imageUrl || fallbackImage} alt={slide.title || `School activity slide ${index + 1}`} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeIndex ? 'opacity-100' : 'opacity-0'}`} onError={() => setFailedSlides((current) => ({ ...current, [slide.id]: true }))} />)}
      {variant === 'hero' && current.title && <div className="absolute bottom-6 left-6 z-10 rounded-md bg-black/60 px-4 py-2 text-sm font-semibold tracking-wide text-white">{current.title}</div>}
      <button onClick={previous} className={variant === 'hero' ? 'absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 p-3 text-white transition hover:bg-black/70' : 'absolute left-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 shadow-sm hover:bg-white'} aria-label="Previous slide"><ChevronLeft className="h-5 w-5" /></button>
      <button onClick={next} className={variant === 'hero' ? 'absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 p-3 text-white transition hover:bg-black/70' : 'absolute right-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 shadow-sm hover:bg-white'} aria-label="Next slide"><ChevronRight className="h-5 w-5" /></button>
      {variant !== 'hero' && <div className="absolute bottom-3 right-4 z-10 flex gap-2" aria-label="Choose slide">{slides.map((slide, index) => <button key={slide.id} onClick={() => goTo(index)} aria-label={`Go to slide ${index + 1}`} aria-current={index === activeIndex} className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'}`} />)}</div>}
    </div>
  )
}
