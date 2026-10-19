# Evidence included in source control

Reviewed Markdown findings and the two **public, already-broadcast** transaction fixtures under `test/fixtures/` are versioned. The fixtures contain transaction/parent bytes for offline SDK fee checks; they contain no private signing keys or app payment authorization headers.

The following remain local and ignored:

- Real `.env` files and keys/certificates.
- SQLite ledgers, WAL/SHM files, private proof/state backups and browser payment journals.
- `runs/`, raw exported JSON/logs and one-run payment permits.
- Native test screenshots, which can include wallet balances and financial details.

Some historical Markdown links refer to these private local captures. They deliberately do not resolve in a fresh clone. This does not mean the capture was published or that an acceptance criterion passed. Public design-reference screenshots and Gutenberg cover assets are included separately in their original directories.
