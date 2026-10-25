import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getHomeImages, uploadHomeImage } from '../controllers/dashboardController.js'
import { requireAdmin } from '../middleware/authMiddleware.js'

const router = Router()
const directory = path.dirname(fileURLToPath(import.meta.url))
const uploadDirectory = path.resolve(directory, '../../uploads/gallery')
fs.mkdirSync(uploadDirectory, { recursive: true })

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

router.get('/home-images', getHomeImages)
router.post('/admin/upload-image', requireAdmin, upload.single('image'), uploadHomeImage)

export default router
