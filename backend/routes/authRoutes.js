import { Router } from 'express'
import multer from 'multer'
import { changeTemporaryPassword, login } from '../controllers/authController.js'
import { getStaffProfile, updateStaffProfile } from '../controllers/profileController.js'
import { authenticateUser, authorizeRoles } from '../middleware/authMiddleware.js'

const router = Router()
const staffRoles = ['Super Admin', 'School Admin', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor', 'Teacher']
const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) return callback(null, true)
    const error = new Error('Profile photos must be JPEG or PNG images.')
    error.status = 400
    return callback(error)
  },
})

router.post('/login', login)
router.post('/change-password', authenticateUser, changeTemporaryPassword)
router.get('/profile', authenticateUser, authorizeRoles(...staffRoles), getStaffProfile)
router.put('/profile', authenticateUser, authorizeRoles(...staffRoles), profilePhotoUpload.single('profilePhoto'), updateStaffProfile)

export default router
