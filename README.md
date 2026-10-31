# School Information Management System

## Project structure

- `frontend/` contains the Vite/React application, public images, and Tailwind configuration.
- `backend/` contains the Express API, MySQL configuration, middleware, controllers, and routes.

## Development

Install dependencies from the project root with `npm install`, then run:

- `npm run dev` to start the frontend.
- `npm run api` to start the backend API.
- `npm run build` to build the frontend for production.

Copy `backend/.env.example` to `backend/.env` and set the local database connection values before starting the API. The backend loads `backend/.env` directly regardless of the shell's working directory. In local development, if `JWT_SECRET` is missing or still has the example placeholder, the API creates and persists a random secret in the ignored `backend/.jwt-secret` file. In production (`NODE_ENV=production`), set a unique random `JWT_SECRET` of at least 32 characters explicitly; the API will not generate a production secret. Restart the backend after changing configuration. For a new database, run `backend/schema.sql` and `backend/gallery_images.sql`. At startup, the API first prepares essential authentication fields and security policy, then initializes the separate admin-workspace schema and creates `student_records` if it is missing. It also repairs authorization metadata for active student accounts that have a matching active student record, so completed admin/registrar registrations remain sign-in eligible. Missing admin-only tables no longer block login; only an unavailable database, a missing `users` table, or insufficient database permission prevents authentication initialization. The standalone `backend/admin_workspace.sql` remains available for manual installation. Check `/api/health` for separate authentication and admin-workspace readiness. The API listens on `127.0.0.1:API_PORT` (default `4000`); the Vite proxy targets `127.0.0.1:4000` by default.

In local development, the API initializes a Super Admin account once on startup. The defaults are `admin@gmail.com` / `admin123`; the password is bcrypt-hashed. On first initialization only, an existing account with that exact email is normalized to the requested Super Admin credentials and enabled; later startups do not reset it. You can override the credentials in `backend/.env`, or explicitly run `npm run seed:admin --prefix backend`. Automatic default initialization is disabled in production. These requested demo credentials are weak and must be replaced before exposing the app outside a trusted local development environment.

The schema defines the two system administrator roles, `Super Admin` and `School Admin`, together with supporting staff and student roles. The default local `admin@gmail.com` account remains the system-wide Super Admin and cannot be changed through the normal management interfaces. Initial role task records and demo users are intended for local development only. Sign in with the numeric account ID or registered email address and password. The admin migration marks active pre-existing managed database accounts as admin-registered; future account records default to pending until created by an authorized admin/registrar workflow. Student enrollment records the registering admin/registrar, hashes the password, and saves the generated account ID as the Student ID with the complete student/guardian profile and optional photo. The Student directory reads records from the database. Registration and directory endpoints require a valid admin/registrar JWT.

## System Administrator workspace

The System Administration dashboard is available to Super Admins and to users with an active, explicitly delegated capability. It includes account enable/disable, role changes, password reset and lockout clearing; academic years, terms, Grade 9–12 sections, school metadata, logo/stamp uploads; login policy and session timeout controls; audit events; API/database health; graduate archival, guarded purge, and transcript verification. Delegations can last at most four hours and only Super Admins can grant or revoke them.

Backups are intentionally not implemented. Purging a graduate deletes the detailed user and student profile after archival; the random-code transcript verification endpoint retains only student ID/name, grade, section, year, and archive/purge timestamps. Treat the verification code as a bearer token. Existing role permissions remain subject to the backend JWT and database checks; disabling an account or changing its role takes effect on the next authenticated request.

The existing grade-entry and transcript screens still use demo UI data and do not yet have backend write/generation endpoints.