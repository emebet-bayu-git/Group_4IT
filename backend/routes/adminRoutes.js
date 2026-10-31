import { Router } from 'express'
import {
  archiveStudent, assignStaffLeadershipRole, createDelegation, getDashboardStats, getHealth, getSecurityPolicy, getSetup, getSystemAccess,
  createUser, deactivateSchoolStaffMember, getSchoolStaffMember, listArchivedStudents, listDelegations, listGraduatedStudents, listGraduationCandidates, listSchoolStaff, listUsers, markStudentGraduated, purgeArchivedStudent,
  resetUserPassword, revokeDelegation, saveSecurityPolicy, saveSetup, unlockUser, uploadSchoolAsset,
  updateSchoolStaffMember, updateUser, verifyTranscript,
} from '../controllers/adminController.js'
import { requireSuperAdmin, requireSystemAdmin } from '../middleware/systemAdminMiddleware.js'
import { authenticateUser, authorizeRoles } from '../middleware/authMiddleware.js'
import { pool } from '../config/db.js'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const router = Router()
const directory = path.dirname(fileURLToPath(import.meta.url))
const assetDirectory = path.resolve(directory, '../../uploads/school-assets')
fs.mkdirSync(assetDirectory, { recursive: true })
const assetUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, assetDirectory),
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowedExtensions = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] }
    if (allowedExtensions[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())) callback(null, true)
    else callback(null, false)
  },
})
router.get('/transcript-verification/:code', verifyTranscript)
router.use(authenticateUser)

router.get('/access', authenticateUser, getSystemAccess)
router.get('/dashboard-stats', authorizeRoles('School Admin'), getDashboardStats)
router.get('/schools', requireSuperAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, code, region, zone, wereda, contact_details, stamp_path, logo_path,
              status, is_active, created_at
       FROM schools ORDER BY created_at DESC LIMIT 100`
    )
    return res.status(200).json(rows)
  } catch (error) {
    return next(error)
  }
})
router.post('/schools', requireSuperAdmin, assetUpload.fields([
  { name: 'stamp', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
]), async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  const region = typeof req.body?.region === 'string' ? req.body.region.trim() : ''
  const zone = typeof req.body?.zone === 'string' ? req.body.zone.trim() : ''
  const wereda = typeof req.body?.wereda === 'string' ? req.body.wereda.trim() : ''
  const contactDetails = typeof req.body?.contactDetails === 'string' ? req.body.contactDetails.trim() : ''
  const files = req.files || {}
  const uploadedPaths = [files.stamp?.[0]?.path, files.logo?.[0]?.path].filter(Boolean)
  const removeUploadedFiles = async () => Promise.all(uploadedPaths.map((filePath) => fs.promises.unlink(filePath).catch((error) => {
    if (error.code !== 'ENOENT') console.error('Unable to remove unreferenced school image:', error.message)
  })))
  if (!name || name.length > 150 || !/^[A-Za-z0-9_-]{2,50}$/.test(code)
    || region.length > 100 || zone.length > 100 || wereda.length > 100 || contactDetails.length > 255) {
    await removeUploadedFiles()
    return res.status(400).json({ message: 'Enter a school name and valid school code; location fields must be at most 100 characters and contact details at most 255 characters.' })
  }
  try {
    const stampPath = files.stamp?.[0] ? `/uploads/school-assets/${files.stamp[0].filename}` : null
    const logoPath = files.logo?.[0] ? `/uploads/school-assets/${files.logo[0].filename}` : null
    const [result] = await pool.execute(
      `INSERT INTO schools
        (name, code, address, region, zone, wereda, contact, stamp_url, logo_url,
         contact_details, stamp_path, logo_path, is_active, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'active')`,
      [name, code, `${region}${zone ? `, ${zone}` : ''}${wereda ? `, ${wereda}` : ''}`.slice(0, 255) || null,
        region || null, zone || null, wereda || null, contactDetails || null, stampPath, logoPath,
        contactDetails || null, stampPath, logoPath]
    )
    await pool.execute(
      `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
       VALUES (?, ?, 'school.registered', 'schools', ?)`,
      [req.user.id, req.user.role, JSON.stringify({ schoolId: result.insertId, name, code })]
    )
    res.status(201).json({
      id: result.insertId, name, code, region: region || null, zone: zone || null,
      wereda: wereda || null, contact_details: contactDetails || null,
      contact: contactDetails || null, stamp_url: stampPath, logo_url: logoPath,
      stamp_path: stampPath, logo_path: logoPath, status: 'active', is_active: true,
    })
  } catch (error) {
    await removeUploadedFiles()
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A school with that code is already registered.' })
    }
    return next(error)
  }
})
router.patch('/schools/:id/status', requireSuperAdmin, async (req, res, next) => {
  const id = Number(req.params.id)
  const { status } = req.body ?? {}
  if (!Number.isSafeInteger(id) || id < 1 || !['active', 'inactive'].includes(status)) {
    return res.status(400).json({ message: 'Provide a valid school ID and status.' })
  }
  try {
    const [result] = await pool.execute(
      'UPDATE schools SET status = ?, is_active = ? WHERE id = ?',
      [status, status === 'active', id]
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'School not found.' })
    await pool.execute(
      `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
       VALUES (?, ?, 'school.status_updated', 'schools', ?)`,
      [req.user.id, req.user.role, JSON.stringify({ schoolId: id, status })]
    )
    res.json({ message: 'School status updated.' })
  } catch (error) {
    return next(error)
  }
})
router.get('/activity-logs', requireSuperAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100')
    res.json(rows)
  } catch (error) {
    next(error)
  }
})
router.get('/users', authorizeRoles('Super Admin', 'School Admin'), listUsers)
router.post('/users', authorizeRoles('Super Admin', 'School Admin'), createUser)
router.get('/staff', authorizeRoles('School Admin'), listSchoolStaff)
router.get('/staff/:id', authorizeRoles('School Admin'), getSchoolStaffMember)
router.put('/staff/:id', authorizeRoles('School Admin'), updateSchoolStaffMember)
router.delete('/staff/:id', authorizeRoles('School Admin'), deactivateSchoolStaffMember)
router.post('/users/:id/assign-role', authorizeRoles('School Admin'), assignStaffLeadershipRole)
router.patch('/users/:id', authorizeRoles('Super Admin', 'School Admin'), updateUser)
router.post('/users/:id/reset-password', requireSystemAdmin('users'), resetUserPassword)
router.post('/users/:id/unlock', requireSystemAdmin('users'), unlockUser)
router.get('/setup', authorizeRoles('Super Admin', 'School Admin'), getSetup)
router.put('/setup', authorizeRoles('Super Admin', 'School Admin'), saveSetup)
router.post('/school-assets', authorizeRoles('Super Admin', 'School Admin'), assetUpload.single('asset'), uploadSchoolAsset)
router.get('/security', requireSystemAdmin('security'), getSecurityPolicy)
router.put('/security', requireSystemAdmin('security'), saveSecurityPolicy)
router.get('/health', requireSystemAdmin('health'), getHealth)
router.get('/delegations', requireSystemAdmin('delegations'), listDelegations)
router.post('/delegations', requireSuperAdmin, createDelegation)
router.delete('/delegations/:id', requireSuperAdmin, revokeDelegation)
router.get('/archive', requireSystemAdmin('archive'), listArchivedStudents)
router.get('/graduates', requireSystemAdmin('archive'), listGraduatedStudents)
router.get('/graduation-candidates', requireSystemAdmin('archive'), listGraduationCandidates)
router.post('/graduates/:id', requireSystemAdmin('archive'), markStudentGraduated)
router.post('/archive/:id', requireSystemAdmin('archive'), archiveStudent)
router.delete('/archive/:id', requireSystemAdmin('archive'), purgeArchivedStudent)

export default router
