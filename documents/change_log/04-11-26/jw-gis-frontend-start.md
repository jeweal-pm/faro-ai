# jw-gis-frontend: Ubuntu start troubleshooting

- Frontend already has `start: react-scripts start`; with Node.js 24.22.2 and pnpm 10.6.5 it compiled successfully without dependency or source changes.
- First compile took about 3 minutes 46 seconds and used roughly 2.3 GB RSS. CRA reported existing ESLint/deprecation warnings; no `Array buffer allocation failed` occurred.
- Port 3000 was already occupied, so CRA served the frontend on port 3001; `curl http://127.0.0.1:3001/` returned HTTP 200.
- Sent Ctrl-C after verification. The CRA process exited. Also found the backend's prior `nodemon` session still running on port 3009, so stopped it under the earlier request; port 3009 is now closed. MongoDB was left running.
- No frontend project files or `.env` values were changed. Backend setup summary remains in `jw-gis-backend-pnpm-ubuntu.md`.
