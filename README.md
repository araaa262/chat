# chat-express (ready for VPS)
Small Chat app (Express + SQLite + Socket.io) ready to run on a VPS.

## Quick start on your VPS (Ubuntu/Debian)
1. Upload this folder to your VPS and `cd` into it.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create DB (migration):
   ```bash
   npm run migrate
   ```
4. Start server:
   ```bash
   npm start
   ```
5. Open http://your-vps-ip:3000 in the browser.

Default config:
- JWT secret is `dev-secret` (set env `JWT_SECRET` in production).
- Uploaded files are saved to `/uploads` and served from `/uploads/<file>`.
