<# 
remove-old-casemask-system.ps1

Deletes the old, fully-superseded Case Mask system, now replaced by
CaseMask (types/config/CaseMask.ts) and the caseRegistry/ services
built on it (ICaseMaskService, mockCaseMaskService, caseMaskService,
resolveCaseMaskScopeCandidates).

Run from the root of your local pathscribe-ai repo (the folder
containing src/). Supports -WhatIf to preview without deleting:

    .\remove-old-casemask-system.ps1 -WhatIf
    .\remove-old-casemask-system.ps1
#>

[CmdletBinding(SupportsShouldProcess)]
param()

$files = @(
    "src\types\config\CaseMaskConfig.ts",
    "src\services\caseRegistry\ICaseRegistryService.ts",
    "src\services\caseRegistry\mockCaseRegistryService.ts",
    "src\services\caseRegistry\mockCaseRegistryService.test.ts",
    "src\services\caseRegistry\caseRegistryService.ts"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Remove-Item $file -WhatIf:$WhatIfPreference
        if (-not $WhatIfPreference) {
            Write-Host "Removed: $file" -ForegroundColor Green
        }
    } else {
        Write-Host "Already absent, skipping: $file" -ForegroundColor Yellow
    }
}
