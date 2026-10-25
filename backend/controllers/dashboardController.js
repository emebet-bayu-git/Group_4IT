import { pool } from '../config/db.js'

export async function getHomeImages(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, title, description, image_path AS imageUrl, category, created_at AS createdAt FROM gallery_images WHERE is_featured_home = TRUE AND is_active = TRUE ORDER BY created_at DESC'
    )
    res.json(rows)
  } catch (error) {
    next(error)
  }
}

export async function uploadHomeImage(req, res, next) {
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
  } catch (error) {
    next(error)
  }
}
