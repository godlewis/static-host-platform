# Static Website Host Platform - Design Document

## Overview
A dual-port platform for uploading static HTML website zips and serving them publicly.

## Architecture

### Port 3001 - Admin Interface
- Login required (single admin account)
- Upload zip files containing static websites
- Manage (list, edit, delete) uploaded sites
- Email-based password recovery

### Port 3000 - Public Interface
- Serve uploaded static websites
- Each site accessible via unique slug/URL
- No authentication required

## Data Model

### Sites Table
- id: primary key
- slug: unique identifier (e.g., my-site)
- title: display name
- description: optional description
- created_at: timestamp
- updated_at: timestamp
- files_path: filesystem path to extracted zip

## API Design

### Admin API (Port 3001)
```
POST /api/login          - Admin login
POST /api/logout         - Admin logout
POST /api/forgot-password - Request password reset
POST /api/reset-password  - Reset password with token
GET  /api/sites          - List all sites
POST /api/sites          - Upload new site (multipart)
PUT  /api/sites/:slug    - Update site metadata
DELETE /api/sites/:slug  - Delete a site
GET  /api/sites/:slug    - Get site details with preview
```

### Public API (Port 3000)
```
GET /sites/:slug/...     - Serve website files
GET /                   - Redirect to sites list or default
```

## Security Considerations
- Session-based auth for admin port
- Password hashing with bcrypt
- Email tokens with expiration for recovery
- Input validation on zip uploads
- Path traversal prevention
- Rate limiting on login attempts

## UI Design

### Admin Dashboard
- Clean, modern interface
- Login page with email recovery
- Site list with upload button
- Site detail with edit/delete actions
- Preview iframe for each site

### Public View
- Each site served at /sites/:slug
- Full-iframe display of the uploaded site

## File Structure
```
static-host-platform/
├── server/
│   ├── index.js
│   ├── routes/
│   │   ├── admin.js
│   │   └── public.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── upload.js
│   ├── config.js
│   └── db.js
├── client/
│   ├── admin.html
│   └── public.html
├── uploads/
├── package.json
└── design.md
```

## Tech Stack
- Backend: Node.js + Express
- Database: SQLite (better-sqlite3)
- Storage: Local filesystem
- Frontend: Vanilla JS + Tailwind CSS (via CDN)
- Email: Nodemailer (configurable SMTP)
