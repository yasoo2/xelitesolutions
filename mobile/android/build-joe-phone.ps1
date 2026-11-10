# Builds the Joe app for Android and puts it where Joe serves it (/api/phones/app.apk).
#   -Tools  where Java 17, the Android SDK and Gradle are (default D:\Joe\tools)
#   -Into   Joe's data folder (default: the api\data folder of this checkout)
param(
    [string]$Tools = 'D:\Joe\tools',
    [string]$Into = (Join-Path $PSScriptRoot '..\..\api\data')
)
$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = Join-Path $Tools 'jdk17'
$env:GRADLE_USER_HOME = Join-Path $Tools 'gradle-home'
$sdk = (Join-Path $Tools 'android-sdk') -replace '\\', '/'
Set-Content -LiteralPath (Join-Path $PSScriptRoot 'local.properties') -Value "sdk.dir=$sdk" -Encoding ASCII
Push-Location $PSScriptRoot
try {
    #  Gradle and javac write notes on stderr («Some input files use a deprecated API»): with
    #  'Stop', Windows PowerShell turns the first one into a failure of a build that succeeded.
    #  The exit code alone says whether it failed.
    $ErrorActionPreference = 'Continue'
    & (Join-Path $Tools 'gradle-8.7\bin\gradle.bat') assembleRelease --no-daemon --console=plain 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0) { throw "the build failed ($code)" }
} finally { Pop-Location }
$apk = Join-Path $PSScriptRoot 'app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { throw "no APK at $apk" }
New-Item -ItemType Directory -Force $Into | Out-Null
Copy-Item -LiteralPath $apk -Destination (Join-Path $Into 'joe-phone.apk') -Force
Write-Output "Joe app: $((Get-Item (Join-Path $Into 'joe-phone.apk')).Length) bytes -> $(Join-Path $Into 'joe-phone.apk')"
