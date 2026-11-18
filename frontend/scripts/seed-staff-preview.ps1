$ErrorActionPreference = "Stop"

$projectRef = "eqckoayhycvbkxqudocw"
$confirmation = "seed-staff:production:$projectRef"
$secureKey = $null
$securePassword = $null
$keyPointer = [IntPtr]::Zero
$passwordPointer = [IntPtr]::Zero
$exitCode = 1
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path

try {
  Write-Host "This creates a staff account in the production Supabase project used by the preview."
  $typedConfirmation = Read-Host "Type $confirmation to continue"
  if ($typedConfirmation -cne $confirmation) {
    throw "Confirmation did not match. No account was created."
  }

  $secureKey = Read-Host "Supabase production secret key (legacy service_role key also works)" -AsSecureString
  $securePassword = Read-Host "Choose the staff password (at least 12 characters)" -AsSecureString
  $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

  $env:NEXT_PUBLIC_SUPABASE_URL = "https://$projectRef.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  $env:STAFF_SEED_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:STAFF_SEED_PROJECT_REF = $projectRef
  $env:STAFF_SEED_CONFIRMATION = $confirmation

  Push-Location $repoRoot
  try {
    pnpm --filter frontend seed:staff
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} catch {
  Write-Error "Staff seed could not run. Check the confirmation and runtime inputs."
} finally {
  if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
  if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY, Env:STAFF_SEED_PASSWORD, Env:STAFF_SEED_PROJECT_REF, Env:STAFF_SEED_CONFIRMATION, Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Variable secureKey, securePassword, keyPointer, passwordPointer -ErrorAction SilentlyContinue
}

exit $exitCode
