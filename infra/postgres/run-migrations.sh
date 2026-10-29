#!/bin/sh
set -eu

for migration in /migrations/*.sql; do
  filename=${migration##*/}
  version=${filename%.sql}

  if [ "$version" = "001_platform_backoffice" ]; then
    applied=""
  else
    applied=$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT 1 FROM schema_migrations WHERE version='${version}'")
  fi

  if [ "$applied" = "1" ]; then
    echo "Skipping applied migration ${version}"
    continue
  fi

  echo "Applying migration ${version}"
  psql -X -v ON_ERROR_STOP=1 -f "$migration"
done
