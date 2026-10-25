# School Information Management System

## Project structure

- `frontend/` contains the Vite/React application, public images, and Tailwind configuration.
- `backend/` contains the Express API, MySQL configuration, middleware, controllers, and routes.

## Development

Install dependencies from the project root with `npm install`, then run:

- `npm run dev` to start the frontend.
- `npm run api` to start the backend API.
- `npm run build` to build the frontend for production.

Copy `backend/.env.example` to `backend/.env` and set the local database connection values before starting the API. Run `backend/schema.sql` to create the `school_sims_db` database and the user/task tables, then run `backend/gallery_images.sql` to create the gallery table.

The schema defines seven roles and includes initial role task records. It does not create sample users: accounts must be provisioned with valid password hashes before authentication is implemented. The current frontend login is a demo flow, and the backend login route intentionally returns `501 Not Implemented`. Role-based frontend visibility is not a substitute for server-side authorization.