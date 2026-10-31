import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(backendDirectory, '.env')
dotenv.config({ path: envPath })

function isValidSecret(secret) {
  return typeof secret === 'string'
    && secret.length >= 32
    && !secret.startsWith('replace-with-')
}

if (!isValidSecret(process.env.JWT_SECRET)) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be explicitly configured with a unique random value of at least 32 characters in production.')
  }

  const secretPath = path.join(backendDirectory, '.jwt-secret')
  let secret
  try {
    secret = fs.readFileSync(secretPath, 'utf8').trim()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error

    secret = crypto.randomBytes(48).toString('hex')
    try {
      fs.writeFileSync(secretPath, `${secret}\n`, { flag: 'wx', mode: 0o600 })
      console.warn('Created a persistent local-development JWT secret in backend/.jwt-secret.')
    } catch (writeError) {
      if (writeError.code !== 'EEXIST') throw writeError
      secret = fs.readFileSync(secretPath, 'utf8').trim()
    }
  }

  if (!isValidSecret(secret)) {
    throw new Error('The local JWT secret file is invalid. Remove backend/.jwt-secret and restart the API to generate a new one.')
  }
  process.env.JWT_SECRET = secret
}
