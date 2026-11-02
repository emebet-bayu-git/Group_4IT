import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bulkImportStudents, deleteStudent, downloadStudentImportTemplate, getAcademicOptions, getHomeImages, getPublicSchoolProfile, getStudent, getStudentProfile, getWorkspaceAcademicPeriod, listStudents, registerStudent, updateStudent, uploadHomeImage } from '../controllers/dashboardController.js'
import { getTeacherClassGrades, listTeacherClasses, saveTeacherClassGrades } from '../controllers/teacherController.js'
import { authenticateUser, authorizeRoles, requireSchoolAdmin } from '../middleware/authMiddleware.js'

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
router.get('/school-profile', getPublicSchoolProfile)
router.get('/workspace-academic-period', authenticateUser, getWorkspaceAcademicPeriod)
router.get('/academic-options', authenticateUser, authorizeRoles('School Admin', 'Registrar'), getAcademicOptions)
router.get('/students/me', authenticateUser, getStudentProfile)
router.get('/teacher/classes', authenticateUser, authorizeRoles('Teacher'), listTeacherClasses)
router.get('/teacher/classes/:id/grades', authenticateUser, authorizeRoles('Teacher'), getTeacherClassGrades)
router.put('/teacher/classes/:id/grades', authenticateUser, authorizeRoles('Teacher'), saveTeacherClassGrades)
router.get('/students', authenticateUser, authorizeRoles('School Admin', 'Registrar'), listStudents)
const studentBulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (/\.(xlsx|csv)$/i.test(file.originalname)) callback(null, true)
    else callback(new Error('Choose an .xlsx or .csv file.'))
  },
})
router.get('/students/bulk-template', authenticateUser, authorizeRoles('School Admin', 'Registrar'), downloadStudentImportTemplate)
router.post('/students/bulk-import', authenticateUser, authorizeRoles('School Admin', 'Registrar'), studentBulkUpload.single('file'), bulkImportStudents)
const studentPhotoDirectory = path.resolve(directory, '../../uploads/students')
fs.mkdirSync(studentPhotoDirectory, { recursive: true })
const studentPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, studentPhotoDirectory),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase()
      callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, callback) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) callback(null, true)
    else callback(new Error('Student photos must be JPEG, PNG, or WebP images.'))
  },
})
const studentPhotoFields = studentPhotoUpload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'parent_photo', maxCount: 1 },
  { name: 'parentPhoto', maxCount: 1 },
])
const attachStudentPhotos = (req, _res, next) => {
  req.file = req.files?.photo?.[0] || null
  req.parentPhotoFile = req.files?.parent_photo?.[0] || req.files?.parentPhoto?.[0] || null
  next()
}
router.post('/students', authenticateUser, authorizeRoles('School Admin', 'Registrar'), studentPhotoFields, attachStudentPhotos, registerStudent)
router.get('/students/:id', authenticateUser, authorizeRoles('School Admin', 'Registrar'), getStudent)
router.put('/students/:id', authenticateUser, authorizeRoles('School Admin', 'Registrar'), studentPhotoFields, attachStudentPhotos, updateStudent)
router.delete('/students/:id', authenticateUser, authorizeRoles('School Admin', 'Registrar'), deleteStudent)
router.post('/admin/upload-image', requireSchoolAdmin, upload.single('image'), uploadHomeImage)

export default router
