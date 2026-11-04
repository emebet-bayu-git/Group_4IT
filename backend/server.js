import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './config/db.js'
import { ensureAuthenticationSchema } from './config/ensureAuthenticationSchema.js'
import { ensureAdminWorkspaceSchema } from './config/ensureAdminWorkspaceSchema.js'
import { ensureLocalDefaultAdmin } from './config/ensureLocalDefaultAdmin.js'
import authRoutes from './routes/authRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import academicRoutes from './routes/academicRoutes.js'
import schoolRoutes from './routes/schoolRoutes.js'

const app = express()
const port = Number(process.env.API_PORT || 4000)
const directory = path.dirname(fileURLToPath(import.meta.url))
const uploadsDirectory = path.resolve(directory, '../uploads')
let authenticationReady = false
let workspaceReady = false

app.use(express.json())
app.use('/uploads', express.static(uploadsDirectory))
app.get('/api/health', async (_req, res) => {
  let database = 'unavailable'
  try {
    await pool.query('SELECT 1')
    database = 'connected'
  } catch (error) {
    console.error('Health check could not reach the database:', error.message)
  }
  res.json({ ok: true, status: 'healthy', database })
})
app.use('/api', (_req, res, next) => {
  if (authenticationReady && (_req.path.startsWith('/auth') || workspaceReady)) return next()
  return res.status(503).json({
    message: !authenticationReady
      ? 'The authentication service is temporarily unavailable.'
      : 'The administrative service is temporarily unavailable.',
  })
})
app.use('/api/auth', authRoutes)
app.use('/api/schools', schoolRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/system-admin', adminRoutes)
app.use('/api/academic', academicRoutes)
app.use('/api', dashboardRoutes)

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ message: error.message })
  if (error.status === 400) return res.status(400).json({ message: error.message })
  if (error.code === 'ER_BAD_FIELD_ERROR' || error.code === 'ER_NO_SUCH_TABLE') {
    console.error('A database query failed because a required SIMS table or field is unavailable:', error.message)
    return res.status(503).json({
      message: 'A required service is temporarily unavailable. Please try again later.',
    })
  }
  console.error('Unhandled API error:', error)
  res.status(500).json({ message: error.message || 'Internal server error.' })
})

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`School SIMS API listening on http://127.0.0.1:${port}`)
  console.log(`Database readiness: http://127.0.0.1:${port}/api/health`)
})

async function initializeDatabase() {
  try {
    await ensureAuthenticationSchema()
  } catch (error) {
    console.error('Unable to prepare the SIMS authentication schema:', error.message)
    return
  }

  try {
    await ensureAdminWorkspaceSchema()
    workspaceReady = true
    console.log('SIMS admin workspace schema is ready.')
  } catch (error) {
    console.error('Unable to prepare the SIMS admin workspace schema:', error.message)
  }

  if (workspaceReady) {
    try {
      await ensureLocalDefaultAdmin()
    } catch (error) {
      console.error('Unable to initialize the local default administrator:', error.message)
    }
  }
  authenticationReady = true
  authenticationReady = true
  console.log('SIMS authentication schema is ready.')
}

initializeDatabase()

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0))
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
