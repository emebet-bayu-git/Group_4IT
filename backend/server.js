import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import authRoutes from './routes/authRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'

const app = express()
const port = Number(process.env.API_PORT || 4000)
const directory = path.dirname(fileURLToPath(import.meta.url))
const uploadsDirectory = path.resolve(directory, '../uploads')

app.use(express.json())
app.use('/uploads', express.static(uploadsDirectory))
app.use('/api/auth', authRoutes)
app.use('/api', dashboardRoutes)

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ message: error.message })
  res.status(500).json({ message: error.message || 'Internal server error.' })
})

app.listen(port, () => console.log(`School gallery API listening on port ${port}`))
