# Trusted PostgreSQL client

`linux-amd64/` contains public PostgreSQL 18.6 client tools, libpq, OpenSSL and
zlib with their upstream licenses. These tools serve the work-owned recovery
operator; no customer data or credentials are included. The fixed inventory in
`manifest.json` binds each regular file by size and SHA-256. The domain verifier
rejects substitutions, unlisted libraries, symlinks and writable directories.

`client.Dockerfile` documents the Amazon Linux 2023 build and checks the official
PostgreSQL source checksum before compilation. Build with Linux AMD64 explicitly.
System packages are resolved from Amazon's repository; rebuilding may produce
different library bytes. Review changes and regenerate the inventory explicitly;
do not silently overwrite a verified bundle or reuse its acceptance evidence.

The bundle passed a Linux dump check against an isolated PostgreSQL 18 database.
Local verification does not establish Vercel execution, a scheduled backup,
outside-domain copy, recovery authority or restoration readiness. The hosted
operator must prove those behaviors before service admission.
