$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:GITHUB_ACTIONS -ne 'true' -or $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or
    $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or
    $env:RUNNER_ARCH -ne 'X64' -or -not $IsWindows) {
    throw 'Windows installer acceptance requires a manually dispatched GitHub-hosted Windows x64 job.'
}
if ($env:SOLIDFLOW_DEV_URL -or $env:ELECTRON_RUN_AS_NODE) {
    throw 'The installed application must start in production mode.'
}

function Get-Sha256([string]$LiteralPath) {
    (Get-FileHash -Algorithm SHA256 -LiteralPath $LiteralPath).Hash.ToLowerInvariant()
}

function Assert-X64Executable([string]$LiteralPath) {
    $reader = [IO.BinaryReader]::new([IO.File]::OpenRead($LiteralPath))
    try {
        $stream = $reader.BaseStream
        if ($stream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5a4d) {
            throw 'The installed application lacks a DOS executable header.'
        }
        $stream.Position = 0x3c
        $offset = $reader.ReadUInt32()
        if ($offset -lt 64 -or $offset -gt $stream.Length - 6) {
            throw 'The installed application has an invalid PE offset.'
        }
        $stream.Position = $offset
        if ($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664) {
            throw 'The installed application is not an x64 PE executable.'
        }
    } finally {
        $reader.Dispose()
    }
}

$repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
$commit = git -C $repository rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $commit -cne $env:GITHUB_SHA -or $commit -cnotmatch '^[0-9a-f]{40}$') {
    throw 'The checked-out source differs from the exact dispatched revision.'
}
$version = (Get-Content -LiteralPath (Join-Path $repository 'package.json') -Raw | ConvertFrom-Json).version
if ($version -cnotmatch '^\d+\.\d+\.\d+$') {
    throw 'The installer acceptance job expects a numeric application version.'
}
$release = Join-Path $repository 'release'
$installer = Join-Path $release "SolidFlow Setup $version.exe"
$unpacked = Join-Path $release 'win-unpacked'
$asarMember = 'resources/app.asar'
$installerSha256 = Get-Sha256 $installer
$exeSha256 = Get-Sha256 (Join-Path $unpacked 'SolidFlow.exe')
$asarSha256 = Get-Sha256 (Join-Path $unpacked $asarMember)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$names = [System.Windows.Automation.AutomationElement]::NameProperty
$readyName = [System.Windows.Automation.PropertyCondition]::new($names, 'Listo')
$solidName = [System.Windows.Automation.PropertyCondition]::new($names, 'Sólido')
$descendants = [System.Windows.Automation.TreeScope]::Descendants

$temp = (Resolve-Path -LiteralPath $env:RUNNER_TEMP).ProviderPath
$owned = Join-Path $temp ('solidflow-nsis-' + [guid]::NewGuid().ToString('N'))
$installation = Join-Path $owned 'installed'
$profile = Join-Path $owned 'profile'
[IO.Directory]::CreateDirectory($profile) | Out-Null
$defaultProfile = Join-Path $env:APPDATA 'SolidFlow'
if (Test-Path -LiteralPath $defaultProfile) {
    throw 'The hosted runner already has a default SolidFlow profile.'
}

# NSIS requires the absolute /D argument last and unquoted, even with spaces.
$setup = Start-Process -FilePath $installer -ArgumentList "/S /D=$installation" -PassThru -WindowStyle Hidden
try {
    if (-not $setup.WaitForExit(120000)) {
        throw 'The owned NSIS installer exceeded two minutes.'
    }
    if ($setup.ExitCode -ne 0) {
        throw "The owned NSIS installer exited with code $($setup.ExitCode)."
    }
} finally {
    if (-not $setup.HasExited) { Stop-Process -InputObject $setup -Force }
    $setup.Dispose()
}

$installedExe = Join-Path $installation 'SolidFlow.exe'
Assert-X64Executable $installedExe
$metadata = [Diagnostics.FileVersionInfo]::GetVersionInfo($installedExe)
if ($metadata.ProductName -cne 'SolidFlow' -or $metadata.FileVersion -cne $version -or
    $metadata.ProductVersion -cne "$version.0") {
    throw 'The installed PE identity differs from the dispatched application version.'
}

$compared = 0
foreach ($file in Get-ChildItem -LiteralPath $unpacked -Recurse -File -Force) {
    $member = [IO.Path]::GetRelativePath($unpacked, $file.FullName)
    $installed = Join-Path $installation $member
    if ((Get-Sha256 $file.FullName) -cne (Get-Sha256 $installed)) {
        throw "The installed package differs from its unpacked build: $member"
    }
    $compared++
}
if ($compared -lt 2) { throw 'The unpacked build inventory is incomplete.' }

$arguments = @("`"--user-data-dir=$profile`"", '--force-renderer-accessibility')
# The disposable runner needs the native window for Windows accessibility.
$appProcess = Start-Process -FilePath $installedExe -ArgumentList $arguments -WorkingDirectory $installation -PassThru -WindowStyle Normal
try {
    if ($appProcess.Path -ne $installedExe) { throw 'The startup process is not the exact installed executable.' }
    $automation = [System.Windows.Automation.AutomationElement]::RootElement
    $ownedWindow = [System.Windows.Automation.AndCondition]::new(
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $appProcess.Id),
        [System.Windows.Automation.PropertyCondition]::new($names, 'SolidFlow — Diseño paramétrico'))
    $deadline = [Diagnostics.Stopwatch]::StartNew()
    do {
        $appProcess.Refresh()
        if ($appProcess.HasExited) { throw 'The installed application exited before readiness.' }
        try {
            $window = $automation.FindFirst([System.Windows.Automation.TreeScope]::Children, $ownedWindow)
            $ready = $null -ne $window -and $window.Current.NativeWindowHandle -ne 0 -and
                $null -ne $window.FindFirst($descendants, $readyName) -and $null -ne $window.FindFirst($descendants, $solidName)
        } catch [System.Windows.Automation.ElementNotAvailableException] {
            $ready = $false
        }
        $ready = $ready -and (Test-Path -LiteralPath (Join-Path $profile 'Preferences') -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $profile 'Local Storage/leveldb') -PathType Container)
        if (-not $ready) { Start-Sleep -Milliseconds 250 }
    } until ($ready -or $deadline.Elapsed.TotalSeconds -ge 60)
    if (-not $ready) { throw 'The exact installed window did not show a ready solid in its isolated profile.' }
} finally {
    # The fresh sample is unsaved. End only the process this check launched.
    if (-not $appProcess.HasExited) {
        Stop-Process -InputObject $appProcess -Force
        if (-not $appProcess.WaitForExit(10000)) { throw 'The owned application process did not exit.' }
    }
    $appProcess.Dispose()
}
if (Test-Path -LiteralPath $defaultProfile) { throw 'The installed startup wrote to the default profile.' }

[ordered]@{
    status = 'PASS'
    commit = $commit
    version = $version
    architecture = 'x64'
    installerSha256 = $installerSha256
    installedExeSha256 = $exeSha256
    installedAsarSha256 = $asarSha256
    matchedFiles = $compared
    readySolid = $true
    isolatedProfile = $true
} | ConvertTo-Json -Compress
