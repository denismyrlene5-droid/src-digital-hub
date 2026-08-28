# Railway persistent storage

The SRC Digital Hub stores its SQLite database and uploaded article images on the server filesystem. Railway's normal deployment filesystem is temporary. The application can run there for testing, but database changes and uploads are only guaranteed to survive redeployments after persistent storage is configured.

## Railway setup

1. Open the Railway service and add a Volume.
2. Mount the Volume at `/data`.
3. Add these service variables:

   - `DATABASE_PATH=/data/src-awards.sqlite`
   - `UPLOAD_DIRECTORY=/data/uploads`

4. Redeploy the service and confirm `/api/health` reports healthy database and storage states.
5. Keep the service at one replica while it uses SQLite. Multiple replicas must not write to the same SQLite database.

Uploaded files and the database will then survive redeployments and restarts. Until the Volume is added, treat Railway uploads as temporary. Back up the Railway Volume regularly. Do not place credentials in either path or commit runtime data to Git.
