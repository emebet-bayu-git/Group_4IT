import express from 'express'
import multer from 'multer'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'
import { requireAdmin } from './auth.js'

const app = express()
const port = Number(process.env.API_PORT || 4000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDirectory = path.resolve(__dirname, '../uploads/gallery')
fs.mkdirSync(uploadDirectory, { recursive: true })

app.use(express.json())
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')))

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) callback(null, true)
    else callback(new Error('Only JPEG, PNG, and WebP images are allowed.'))
  },
})

app.get('/api/home-images', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, title, description, image_path AS imageUrl, category, created_at AS createdAt FROM gallery_images WHERE is_featured_home = TRUE AND is_active = TRUE ORDER BY created_at DESC'
    )
    res.json(rows)
  } catch (error) { next(error) }
})

app.post('/api/admin/upload-image', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const { title, description = '', category = 'Events', is_featured_home = false } = req.body
    if (!req.file) return res.status(400).json({ message: 'An image file is required.' })
    if (!title?.trim()) return res.status(400).json({ message: 'Title is required.' })

    const imagePath = `/uploads/gallery/${req.file.filename}`
    const [result] = await pool.execute(
      `INSERT INTO gallery_images (title, description, image_path, category, is_featured_home)
       VALUES (?, ?, ?, ?, ?)`,
      [title.trim(), description.trim(), imagePath, category.trim(), Boolean(is_featured_home === true || is_featured_home === 'true')]
    )
    res.status(201).json({ id: result.insertId, title: title.trim(), description, imagePath, category })
  } catch (error) { next(error) }
})

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ message: error.message })
  res.status(500).json({ message: error.message || 'Internal server error.' })
})

app.listen(port, () => console.log(`School gallery API listening on port ${port}`))
