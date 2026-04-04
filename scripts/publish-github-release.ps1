#Requires -Version 5.1
<#
  Creates GitHub Release 1.0.0 with main.js, manifest.json, styles.css.
  Uses GH_TOKEN or GITHUB_TOKEN if set (classic PAT: repo scope).
  Otherwise requires: gh auth login (one-time, stores in credential manager).
#>
$ErrorActionPreference = 'Stop'
$Repo = 'gaozichen2012/hailysync'
$Tag = '1.0.0'
$Title = 'v1.0.0 - First Public Release'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path (Join-Path $Root 'manifest.json'))) {
    throw "manifest.json not found under $Root"
}

$gh = 'gh'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $ghExe = "${env:ProgramFiles}\GitHub CLI\gh.exe"
    if (Test-Path $ghExe) { $gh = $ghExe } else { throw 'gh not found. Install GitHub CLI or add it to PATH.' }
}

$notes = @'
## HailySync v1.0.0

First public release of HailySync (海狸同步).

### Features

- Cloud sync solution for Obsidian
- Multi-device sync with binding code
- Automatic and manual sync modes
- Conflict handling and data safety design
- End-to-end encryption (E2EE)

### Notes

- This version is focused on stability and core sync capability
- Advanced features (history, merge, collaboration) are not included yet

### Author

Hailink
'@

$notesFile = Join-Path $env:TEMP 'hailysync-release-notes.md'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($notesFile, $notes, $utf8NoBom)

Push-Location $Root
try {
    $hasToken = [bool]($env:GH_TOKEN -or $env:GITHUB_TOKEN)
    if ($hasToken) {
        $authOk = $true
    } else {
        & $gh auth status 2>$null | Out-Null
        $authOk = ($LASTEXITCODE -eq 0)
    }
    if (-not $authOk) {
        Write-Host @'

未检测到 gh 登录状态，且未设置 GH_TOKEN / GITHUB_TOKEN。

任选其一：
  1) 在本机执行一次（会打开浏览器或设备码）：
     gh auth login -h github.com -p https -w
  2) 设置经典 PAT（需 repo 权限）后重跑本脚本：
     $env:GH_TOKEN = 'ghp_xxxx'

'@
        exit 2
    }

    cmd /c "`"$gh`" release view $Tag --repo $Repo >nul 2>nul"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Release $Tag already exists. Use 'gh release edit' or delete first."
        exit 1
    }

    & $gh release create $Tag --repo $Repo --title $Title -F $notesFile --verify-tag main.js manifest.json styles.css
    if ($LASTEXITCODE -ne 0) {
        throw "gh release create failed with exit code $LASTEXITCODE"
    }
    Write-Host 'Release created successfully.'
}
finally {
    Pop-Location
    Remove-Item -LiteralPath $notesFile -Force -ErrorAction SilentlyContinue
}
