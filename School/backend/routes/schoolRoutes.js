import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../config/db.js'
import { authenticateUser } from '../middleware/authMiddleware.js'
import { requireSuperAdmin } from '../middleware/systemAdminMiddleware.js'

const router = Router()
const directory = path.dirname(fileURLToPath(import.meta.url))
const assetDirectory = path.resolve(directory, '../../uploads/school-assets')
fs.mkdirSync(assetDirectory, { recursive: true })
const assetUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, assetDirectory),
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, callback) => {
    const allowedExtensions = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] }
    if (allowedExtensions[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())) callback(null, true)
    else callback(Object.assign(new Error('Upload a JPEG, PNG, or WebP image.'), { status: 400 }))
  },
})

router.use(authenticateUser, requireSuperAdmin)

function validId(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0 && Number.isSafeInteger(Number(value))
}

function getSchoolDetails(body) {
  const fields = ['name', 'code', 'region', 'zone', 'wereda', 'contactDetails']
  const values = Object.fromEntries(fields.map((field) => [
    field,
    typeof body?.[field] === 'string' ? body[field].trim() : '',
  ]))
  const { name, code, region, zone, wereda, contactDetails } = values
  if (!name || name.length > 150 || !/^[A-Za-z0-9_-]{2,50}$/.test(code)
    || region.length > 100 || zone.length > 100 || wereda.length > 100 || contactDetails.length > 255) {
    return { error: 'Enter a school name and valid school code; location fields must be at most 100 characters and contact details at most 255 characters.' }
  }
  return { values }
}

async function removeAssets(filePaths) {
  const candidates = [...new Set(filePaths.filter((filePath) => (
    typeof filePath === 'string' && filePath.startsWith('/uploads/school-assets/')
  )).map((filePath) => path.resolve(assetDirectory, path.basename(filePath))))]
  for (const filePath of candidates) {
    try {
      await fsPromises.unlink(filePath)
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Unable to remove an unreferenced school image:', error.message)
    }
  }
}

function getUploadedPaths(files) {
  return [files.stamp?.[0]?.path, files.logo?.[0]?.path].filter(Boolean)
}

function getPublicPath(file) {
  return file ? `/uploads/school-assets/${file.filename}` : null
}

router.put('/:id', assetUpload.fields([
  { name: 'stamp', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
]), async (req, res, next) => {
  const id = Number(req.params.id)
  const files = req.files || {}
  const uploadedPaths = getUploadedPaths(files)
  const details = getSchoolDetails(req.body)
  if (!validId(req.params.id)) {
    await removeAssets(uploadedPaths.map((filePath) => `/uploads/school-assets/${path.basename(filePath)}`))
    return res.status(400).json({ message: 'Provide a valid school ID.' })
  }
  if (details.error) {
    await removeAssets(uploadedPaths.map((filePath) => `/uploads/school-assets/${path.basename(filePath)}`))
    return res.status(400).json({ message: details.error })
  }

  let connection
  let transactionStarted = false
  let committed = false
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    transactionStarted = true
    const [schools] = await connection.execute(
      'SELECT stamp_path, logo_path FROM schools WHERE id = ? FOR UPDATE',
      [id]
    )
    if (!schools.length) {
      await connection.rollback()
      transactionStarted = false
      return res.status(404).json({ message: 'School not found.' })
    }

    const { name, code, region, zone, wereda, contactDetails } = details.values
    const stampPath = getPublicPath(files.stamp?.[0]) || schools[0].stamp_path || null
    const logoPath = getPublicPath(files.logo?.[0]) || schools[0].logo_path || null
    await connection.execute(
      `UPDATE schools
       SET name = ?, code = ?, address = ?, region = ?, zone = ?, wereda = ?,
           contact = ?, contact_details = ?, stamp_url = ?, stamp_path = ?,
           logo_url = ?, logo_path = ?
       WHERE id = ?`,
      [name, code, `${region}${zone ? `, ${zone}` : ''}${wereda ? `, ${wereda}` : ''}`.slice(0, 255) || null,
        region || null, zone || null, wereda || null, contactDetails || null, contactDetails || null,
        stampPath, stampPath, logoPath, logoPath, id]
    )
    await connection.execute(
      `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
       VALUES (?, ?, 'school.updated', 'schools', ?)`,
      [req.user.id, req.user.role, JSON.stringify({ schoolId: id, name, code })]
    )
    await connection.commit()
    transactionStarted = false
    committed = true

    const replacedAssets = []
    if (files.stamp?.[0] && schools[0].stamp_path !== stampPath) replacedAssets.push(schools[0].stamp_path)
    if (files.logo?.[0] && schools[0].logo_path !== logoPath) replacedAssets.push(schools[0].logo_path)
    const assetsToRemove = []
    for (const asset of replacedAssets) {
      if (asset === schools[0].stamp_path && asset) {
        const [[references]] = await pool.execute(
          `SELECT
             EXISTS(SELECT 1 FROM section_result_submissions
                    WHERE school_id = ? AND approval_stamp_path = ?) AS approvedReference,
             EXISTS(SELECT 1 FROM permanent_academic_records
                    WHERE school_id = ? AND stamp_path = ?) AS archiveReference`,
          [id, asset, id, asset]
        )
        if (references.approvedReference || references.archiveReference) continue
      }
      assetsToRemove.push(asset)
    }
    await removeAssets(assetsToRemove)
    return res.json({ message: 'School updated.' })
  } catch (error) {
    if (transactionStarted) await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A school with that code is already registered.' })
    }
    return next(error)
  } finally {
    connection?.release()
    if (!committed) await removeAssets(uploadedPaths.map((filePath) => `/uploads/school-assets/${path.basename(filePath)}`))
  }
})

router.delete('/:id', async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid school ID.' })
  const id = Number(req.params.id)
  let connection
  let transactionStarted = false
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    transactionStarted = true
    const [schools] = await connection.execute(
      'SELECT name, stamp_path, logo_path, signature_path FROM schools WHERE id = ? FOR UPDATE',
      [id]
    )
    if (!schools.length) {
      await connection.rollback()
      transactionStarted = false
      return res.status(404).json({ message: 'School not found.' })
    }

    const [[archive]] = await connection.execute(
      'SELECT COUNT(*) AS recordCount FROM permanent_academic_records WHERE school_id = ?',
      [id]
    )
    await connection.execute('DELETE FROM schools WHERE id = ?', [id])
    await connection.execute(
      `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
       VALUES (?, ?, 'school.deleted', 'schools', ?)`,
      [req.user.id, req.user.role, JSON.stringify({ schoolId: id, name: schools[0].name })]
    )
    await connection.commit()
    transactionStarted = false
    await removeAssets([
      schools[0].logo_path,
      ...(Number(archive.recordCount) ? [] : [schools[0].stamp_path, schools[0].signature_path]),
    ])
    return res.json({ message: 'School deleted.' })
  } catch (error) {
    if (transactionStarted) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
})

export default router
