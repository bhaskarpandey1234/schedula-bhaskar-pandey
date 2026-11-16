$ErrorActionPreference = "Stop"

$secureKey = $null
$securePassword = $null
$keyPointer = [IntPtr]::Zero
$passwordPointer = [IntPtr]::Zero
$exitCode = 1
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path

try {
  $secureKey = Read-Host "Supabase production service-role key" -AsSecureString
  $securePassword = Read-Host "Choose the admin password (at least 12 characters)" -AsSecureString
  $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

  $env:NEXT_PUBLIC_SUPABASE_URL = "https://eqckoayhycvbkxqudocw.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  $env:ADMIN_SEED_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:ADMIN_SEED_PROJECT_REF = "eqckoayhycvbkxqudocw"
  $env:ADMIN_SEED_CONFIRMATION = "seed-admin:production:eqckoayhycvbkxqudocw"

  Push-Location $repoRoot
  try {
    pnpm --filter frontend seed:admin
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} catch {
  Write-Error "Admin seed could not run. Check the prompts and local setup."
} finally {
  if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
  if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY, Env:ADMIN_SEED_PASSWORD, Env:ADMIN_SEED_PROJECT_REF, Env:ADMIN_SEED_CONFIRMATION, Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Variable secureKey, securePassword, keyPointer, passwordPointer -ErrorAction SilentlyContinue
}

exit $exitCode
