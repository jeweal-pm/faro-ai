$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envPath = Join-Path $root '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Project .env is required.' }

$lines = [System.Collections.Generic.List[string]]::new()
foreach ($line in (Get-Content -LiteralPath $envPath)) { $lines.Add($line) }
$entry = $lines | Where-Object { $_ -match '^\s*FAROAI_ARTIFACT_DATABASE_URL\s*=' } | Select-Object -First 1
if ($entry) {
  $workerUrl = ($entry -split '=', 2)[1].Trim().Trim('"').Trim("'")
  $uri = [Uri]$workerUrl
  if ($uri.Host -ne 'postgres' -or $uri.UserInfo.Split(':')[0] -ne 'faroai_artifact_worker') {
    throw 'FAROAI_ARTIFACT_DATABASE_URL must point to the dedicated artifact worker role on the compose postgres service.'
  }
  $password = [Uri]::UnescapeDataString(($uri.UserInfo -split ':', 2)[1])
} else {
  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $password = [Convert]::ToHexString($bytes).ToLowerInvariant()
  $workerUrl = "postgres://faroai_artifact_worker:$password@postgres:5432/faroai"
}
if ($password.Length -lt 32 -or $password -notmatch '^[a-f0-9]+$') { throw 'Artifact worker database password must be at least 128 bits of URL-safe hexadecimal data.' }

foreach ($pair in (@{
  FAROAI_ARTIFACT_DATABASE_URL = $workerUrl
  FAROAI_ARTIFACT_ENABLED = 'true'
}).GetEnumerator()) {
  $pattern = '^\s*' + [Regex]::Escape($pair.Key) + '\s*='
  $index = -1
  for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match $pattern) { $index = $i; break } }
  $value = "$($pair.Key)=$($pair.Value)"
  if ($index -ge 0) { $lines[$index] = $value } else { $lines.Add($value) }
}
Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8NoBOM

$sql = @"
SELECT format('CREATE ROLE faroai_artifact_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', '$password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='faroai_artifact_worker') \gexec
SELECT format('ALTER ROLE faroai_artifact_worker WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', '$password') \gexec
GRANT faroai_artifact_access TO faroai_artifact_worker;
"@
$sql | docker compose exec -T postgres psql -U postgres -d faroai -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Could not provision the scoped artifact database login.' }
Write-Output 'Provisioned the private artifact worker login and enabled local artifact generation.'
