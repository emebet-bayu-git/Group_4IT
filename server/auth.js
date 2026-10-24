export function requireAdmin(req, res, next) {
  // Replace this header check with verified JWT/session authorization in production.
  if (req.get('x-admin-role') !== 'Admin') {
    return res.status(403).json({ message: 'Administrator access required.' })
  }
  return next()
}
