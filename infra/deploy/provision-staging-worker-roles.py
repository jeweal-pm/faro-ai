#!/usr/bin/env python3
"""Emit SQL on stdout to provision restricted staging worker logins.

The caller must pipe stdout directly to psql and suppress psql output. Never
log this program's stdout: it contains worker database passwords.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


def fail(code: str) -> None:
    print(f"Worker database provisioning failed [{code}]; credentials were not logged", file=sys.stderr)
    raise SystemExit(1)


def read_secret_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or "=" not in line:
            continue
        name, encoded = line.split("=", 1)
        if name not in {"FAROAI_ARTIFACT_DATABASE_URL", "FAROAI_DOCUMENT_IMPORT_DATABASE_URL"}:
            continue
        try:
            value = ast.literal_eval(encoded)
        except (ValueError, SyntaxError):
            fail("SECRET_FILE_INVALID")
        if not isinstance(value, str):
            fail("SECRET_FILE_INVALID")
        values[name] = value
    return values


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def role_sql(url: str, role: str, group: str) -> str:
    try:
        parsed = urlsplit(url)
        password = unquote(parsed.password or "")
        valid = (
            parsed.scheme in {"postgres", "postgresql"}
            and parsed.hostname == "postgres"
            and parsed.port == 5432
            and parsed.path == "/faroai"
            and parsed.username == role
            and password
            and not parsed.query
            and not parsed.fragment
            and all(char not in password for char in "\x00\r\n")
        )
    except ValueError:
        valid = False
    if not valid:
        fail(f"{role.upper()}_URL_INVALID")

    secret = sql_literal(password)
    return f"""
DO $worker$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{group}') THEN
    RAISE EXCEPTION 'required worker access group is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = '{group}'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'worker access group has unsafe attributes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = '{role}'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'worker login has unsafe attributes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
    EXECUTE format('CREATE ROLE {role} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', {secret});
  ELSE
    EXECUTE format('ALTER ROLE {role} WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', {secret});
  END IF;
  GRANT {group} TO {role};
END
$worker$;
"""


def main() -> None:
    if len(sys.argv) != 4:
        fail("ARGUMENTS_INVALID")
    path = Path(sys.argv[1])
    if not path.is_file() or path.is_symlink():
        fail("SECRET_FILE_MISSING")
    values = read_secret_file(path)
    enabled = (
        (sys.argv[2] == "true", "FAROAI_ARTIFACT_DATABASE_URL", "faroai_artifact_worker", "faroai_artifact_access"),
        (sys.argv[3] == "true", "FAROAI_DOCUMENT_IMPORT_DATABASE_URL", "faroai_document_import_worker", "faroai_document_import_access"),
    )
    statements: list[str] = []
    for active, key, role, group in enabled:
        if active:
            if not values.get(key):
                fail(f"{key}_MISSING")
            statements.append(role_sql(values[key], role, group))
    sys.stdout.write("\n".join(statements))


if __name__ == "__main__":
    main()
