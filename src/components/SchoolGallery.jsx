import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, LoaderCircle, X } from 'lucide-react'

const fallbackGallery = [
  { id: 1, category: 'Assembly', title: 'Morning Assembly', date: 'October 20, 2026', imageUrl: '/school-images/download (2)_2.jfif' },
  { id: 2, category: 'Flag Ceremony', title: 'Flag Raising Ceremony', date: 'October 18, 2026', imageUrl: '/school-images/download (1)_2.jfif' },
  { id: 3, category: 'Events', title: 'Campus Life', date: 'October 12, 2026', imageUrl: '/school-images/download_2.jfif' },
]

const categories = ['All Photos', 'Assembly', 'Flag Ceremony', 'Events']

export default function SchoolGallery({ endpoint = '/api/gallery' }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('All Photos')
  const [selectedIndex, setSelectedIndex] = useState(null)

  useEffect(() => {
    let ignore = false
    const loadGallery = async () => {
      try {
        const response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
        if (!response.ok) throw new Error(`Gallery request failed (${response.status})`)
        const data = await response.json()
        const items = Array.isArray(data) ? data : data.items
        if (!ignore) setImages(Array.isArray(items) ? items : [])
      } catch (requestError) {
        if (!ignore) setError(requestError.message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    loadGallery()
    return () => { ignore = true }
  }, [endpoint])

  const filteredImages = activeCategory === 'All Photos' ? images : images.filter((image) => image.category === activeCategory)
  const move = (direction) => setSelectedIndex((current) => current === null ? null : (current + direction + filteredImages.length) % filteredImages.length)

  useEffect(() => {
    if (selectedIndex === null) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedIndex(null)
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleKeyDown) }
  }, [selectedIndex, filteredImages.length])

  const displayImages = images.length ? filteredImages : fallbackGallery

  return (
    <section className="py-16 sm:py-20" aria-labelledby="gallery-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-wider text-primary-700">Inside Northfield</p><h2 id="gallery-heading" className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">Campus life & events</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Moments of learning, leadership, tradition, and celebration from across the school year.</p></div></div>
        <div className="mt-7 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Gallery categories">{categories.map((category) => <button key={category} role="tab" aria-selected={activeCategory === category} onClick={() => { setActiveCategory(category); setSelectedIndex(null) }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${activeCategory === category ? 'bg-primary-900 text-white' : 'border border-slate-300 bg-white text-slate-600 hover:border-primary-300 hover:text-primary-800'}`}>{category}</button>)}</div>
        {loading ? <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" role="status">{[0,1,2,3,4,5].map((item) => <div key={item} className="aspect-[4/3] animate-pulse rounded-lg bg-slate-200" />)}<span className="sr-only">Loading gallery...</span></div> : error && images.length === 0 ? <div className="mt-6 flex items-center gap-2 rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700"><LoaderCircle className="h-4 w-4 animate-spin" />Gallery is temporarily unavailable. Showing sample campus photos.</div> : !displayImages.length ? <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-14 text-center"><ImageOff className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-semibold text-slate-700">No photos in this gallery</p><p className="mt-1 text-sm text-slate-500">New campus moments will appear here when published.</p></div> : null}
        {!loading && <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{displayImages.map((image, index) => <button key={image.id} onClick={() => setSelectedIndex(index)} className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-200 text-left shadow-panel" aria-label={`Open ${image.title}`}><img src={image.imageUrl} alt={image.title} loading="lazy" className="h-full w-full object-cover hover:scale-105 transition-transform duration-300" /><div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-transparent px-5 pb-5 pt-16 text-white transition-transform duration-300 group-hover:translate-y-0 group-focus-visible:translate-y-0"><p className="text-sm font-bold">{image.title}</p><p className="mt-1 text-xs text-slate-200">{image.date}</p></div></button>)}</div>}
      </div>

      {selectedIndex !== null && filteredImages[selectedIndex] && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label="Gallery image viewer"><button onClick={() => setSelectedIndex(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close gallery"><X className="h-6 w-6" /></button><button onClick={() => move(-1)} className="absolute left-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-white text-slate-900 shadow-lg sm:left-6" aria-label="Previous image"><ChevronLeft className="h-6 w-6" /></button><figure className="max-h-[85vh] max-w-5xl"><img src={filteredImages[selectedIndex].imageUrl} alt={filteredImages[selectedIndex].title} className="max-h-[75vh] w-auto max-w-full object-contain" /><figcaption className="mt-4 text-center text-white"><p className="font-bold">{filteredImages[selectedIndex].title}</p><p className="mt-1 text-sm text-slate-300">{filteredImages[selectedIndex].date}</p></figcaption></figure><button onClick={() => move(1)} className="absolute right-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-white text-slate-900 shadow-lg sm:right-6" aria-label="Next image"><ChevronRight className="h-6 w-6" /></button></div>}
    </section>
  )
}
