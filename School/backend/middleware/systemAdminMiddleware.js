import { authorizeRoles } from './authMiddleware.js'

export const requireSuperAdmin = (req, res, next) => authorizeRoles('Super Admin')(req, res, next)

export function requireSystemAdmin(_permission) {
  return (req, res, next) => authorizeRoles('Super Admin')(req, res, next)
}
