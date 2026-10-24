import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Menu, X } from 'lucide-react'
import HeroCarousel from './HeroCarousel.jsx'

const fallbackImages = [
  { id: 1, imageUrl: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=1200&auto=format&fit=crop', title: 'Flag Raising Ceremony' },
  { id: 2, imageUrl: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=1200&auto=format&fit=crop', title: 'Morning Assembly' },
  { id: 3, imageUrl: data:image/webp;base64,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', title: 'Campus Life' },
]

export default function HomePage({ onAccessPortal, onAbout, onContact }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [homeImages, setHomeImages] = useState(fallbackImages)

  useEffect(() => {
    let ignore = false
    axios.get('/api/home-images')
      .then(({ data }) => {
        const images = Array.isArray(data) ? data : data.items || []
        if (!ignore && images.length) setHomeImages(images)
      })
      .catch((error) => console.error('Unable to load home images:', error.message))
    return () => { ignore = true }
  }, [])

  const scrollToHome = () => {
    document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  const navigate = (handler) => {
    setMenuOpen(false)
    handler?.()
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <nav className="relative z-20 flex items-center justify-between bg-slate-900 px-6 py-4 text-white shadow-md" aria-label="Main navigation">
        <button onClick={scrollToHome} className="text-left text-xl font-bold tracking-wide">
          Northfield Secondary School
        </button>
        <div className="hidden items-center gap-6 text-sm font-medium md:flex">
          <button onClick={scrollToHome} className="transition hover:text-emerald-400">Home</button>
          <button onClick={() => navigate(onAbout)} className="transition hover:text-emerald-400">About</button>
          <button onClick={() => navigate(onContact)} className="transition hover:text-emerald-400">Contact</button>
          <button onClick={() => navigate(onAccessPortal)} className="rounded-md bg-emerald-600 px-4 py-2 transition hover:bg-emerald-700">Login</button>
        </div>
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-md p-2 transition hover:bg-slate-800 md:hidden"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        {menuOpen && (
          <div className="absolute left-0 right-0 top-16 border-t border-slate-700 bg-slate-900 px-6 py-4 md:hidden">
            <div className="flex flex-col gap-3 text-sm font-medium">
              <button onClick={scrollToHome} className="py-1 text-left hover:text-emerald-400">Home</button>
              <button onClick={() => navigate(onAbout)} className="py-1 text-left hover:text-emerald-400">About</button>
              <button onClick={() => navigate(onContact)} className="py-1 text-left hover:text-emerald-400">Contact</button>
              <button onClick={() => navigate(onAccessPortal)} className="mt-1 rounded-md bg-emerald-600 px-4 py-2.5 text-left hover:bg-emerald-700">Login</button>
            </div>
          </div>
        )}
      </nav>

      <header id="home" className="relative h-[450px] w-full overflow-hidden bg-slate-900 shadow-lg md:h-[550px]">
        <HeroCarousel
          slides={homeImages.map((image, index) => ({
            id: image.id ?? index,
            imageUrl: image.imageUrl || image.image_path,
            title: image.title,
            description: image.description,
          }))}
          variant="hero"
        />
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-grow flex-col items-center px-6 py-12 text-center">
        <h1 className="mb-4 text-3xl font-extrabold text-slate-800 md:text-4xl">
          Empowering Education Through Smart Management
        </h1>
        <p className="mb-8 max-w-2xl text-slate-600">
          Welcome to the official student management portal.
        </p>
        <button
          onClick={() => navigate(onAccessPortal)}
          className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
        >
          Access the school portal
        </button>
      </main>

      <footer className="bg-slate-900 py-6 text-center text-sm text-slate-400">
        <p>&copy; 2026 Northfield Secondary School. All rights reserved.</p>
      </footer>
    </div>
  )
}
