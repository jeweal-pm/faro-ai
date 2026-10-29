# FaroAI portable PHP reference

This directory preserves the original framework-independent PHP 8.1 reference implementation. The migrated FaroAI services live at the workspace root; this folder is kept for behavior and sample-data comparison.

## Requirements

- PHP 8.1 or newer
- PDO SQLite
- cURL and mbstring extensions
- A writable `data/` directory

## Run the reference

From `C:\dev\faroai`:

```powershell
php -S 127.0.0.1:8090 -t faroai_example
```

The sample database is `data/faroai.sqlite`. `config.php` contains local reference settings. Do not put production secrets in this example folder or expose its PHP server publicly.

The PHP example implements the original portable chat, consent, feedback, SQLite product/FAQ lookup, and optional OpenRouter adapter. It is a reference implementation; it does not include the migrated multi-tenant gateway, PostgreSQL, Redis, MCP, or Qdrant services.
