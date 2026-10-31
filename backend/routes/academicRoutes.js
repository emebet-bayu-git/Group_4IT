import { Router } from 'express'
import {
  createAcademicSection, createAcademicTerm, createAcademicYear,
  deleteAcademicSection, deleteAcademicTerm, deleteAcademicYear,
  getActiveAcademicPeriod, listAcademicSections, listAcademicTerms, listAcademicYears,
  updateAcademicSection, updateAcademicTerm, updateAcademicYear,
} from '../controllers/academicController.js'
import { authenticateUser, authorizeRoles } from '../middleware/authMiddleware.js'

const router = Router()
router.use(authenticateUser, authorizeRoles('School Admin'))

router.get('/active', getActiveAcademicPeriod)
router.get('/years', listAcademicYears)
router.post('/years', createAcademicYear)
router.put('/years/:id', updateAcademicYear)
router.delete('/years/:id', deleteAcademicYear)

router.get('/terms', listAcademicTerms)
router.post('/terms', createAcademicTerm)
router.put('/terms/:id', updateAcademicTerm)
router.delete('/terms/:id', deleteAcademicTerm)

router.get('/sections', listAcademicSections)
router.post('/sections', createAcademicSection)
router.put('/sections/:id', updateAcademicSection)
router.delete('/sections/:id', deleteAcademicSection)

export default router