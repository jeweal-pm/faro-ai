$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backofficePath = Join-Path $repoRoot 'backoffice'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is required. Install the project-supported Node.js version, then try again.'
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw 'pnpm is required. Enable Corepack or install pnpm, then try again.'
}
if (-not (Test-Path (Join-Path $backofficePath 'node_modules/next/package.json'))) {
  throw 'Backoffice dependencies are missing. Run "pnpm install --frozen-lockfile" inside backoffice first.'
}

$portOwner = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($portOwner) {
  throw 'Port 3001 is already in use. Stop the Backoffice container with "docker compose stop backoffice", then retry.'
}

$oldPort = $env:PORT
$oldHostname = $env:HOSTNAME
$environmentKeys = @(
  'FAROAI_DEMO_ENABLED',
  'FAROAI_DEMO_TENANT_ID',
  'FAROAI_DEMO_API_KEY',
  'FAROAI_TENANT_MODE',
  'FAROAI_SINGLE_TENANT_ID',
  'FAROAI_DEPLOYMENT_MODE',
  'FAROAI_LOCAL_LLM_ENABLED',
  'FAROAI_SHARED_TRAINING_ENABLED',
  'FAROAI_API_INTERNAL_URL'
)
$oldEnvironment = @{}
foreach ($key in $environmentKeys) { $oldEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
$pushedLocation = $false

try {
  $localEnvFile = Join-Path $repoRoot '.env'
  if (Test-Path $localEnvFile) {
    foreach ($line in Get-Content -LiteralPath $localEnvFile) {
      if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$' -and $environmentKeys -contains $Matches[1]) {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
      }
    }
  }
  $env:PORT = '3001'
  $env:HOSTNAME = '127.0.0.1'
  $env:FAROAI_API_INTERNAL_URL = 'http://127.0.0.1:3000'
  Push-Location $backofficePath
  $pushedLocation = $true
  & pnpm exec next dev --hostname 127.0.0.1 --port 3001
  if ($LASTEXITCODE -ne 0) {
    throw "Next.js dev server exited with code $LASTEXITCODE."
  }
}
finally {
  if ($pushedLocation) { Pop-Location }
  $env:PORT = $oldPort
  $env:HOSTNAME = $oldHostname
  foreach ($key in $environmentKeys) { [Environment]::SetEnvironmentVariable($key, $oldEnvironment[$key], 'Process') }
}
