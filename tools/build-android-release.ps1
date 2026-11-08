[CmdletBinding()]
param(
    [string]$AndroidSdk = $env:ANDROID_SDK_ROOT,
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$GradleExecutable,
    [switch]$SkipNativeBuild,
    [switch]$IncludeDeviceTestVariant
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $AndroidSdk) { $AndroidSdk = $env:ANDROID_HOME }
if (-not $AndroidSdk) { throw 'Set ANDROID_SDK_ROOT or pass -AndroidSdk.' }
$toolchains = Split-Path $AndroidSdk -Parent
if (-not $JavaHome) { $JavaHome = Join-Path $toolchains 'jdk-17' }
if (-not $GradleExecutable) {
    $installedGradle = Get-Command gradle -ErrorAction SilentlyContinue
    $GradleExecutable = if ($installedGradle) { $installedGradle.Source } else { Join-Path $toolchains 'gradle-8.7/bin/gradle.bat' }
}
if (-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) { throw 'Java 17 was not found.' }
if (-not (Test-Path -LiteralPath $GradleExecutable)) { throw 'Gradle was not found; pass -GradleExecutable.' }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_SDK_ROOT = $AndroidSdk
$env:ANDROID_HOME = $AndroidSdk
$versionMatch = [regex]::Match((Get-Content (Join-Path $projectRoot 'android/app/build.gradle') -Raw), 'versionName\s+"([^"]+)"')
if (-not $versionMatch.Success) { throw 'Android versionName was not found.' }
$version = $versionMatch.Groups[1].Value
$releaseDirectory = Join-Path $projectRoot "build_out/releases/$version"
New-Item -ItemType Directory -Force -Path $releaseDirectory | Out-Null

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
}

# This location is also the Gradle release signing default. Never regenerate an
# existing key, and never put its password or private key in the repository.
$signingDirectory = Join-Path $env:USERPROFILE '.android/rvx-patcher'
$keystore = Join-Path $signingDirectory 'release.p12'
$signingProperties = Join-Path $signingDirectory 'signing.properties'
if ((Test-Path -LiteralPath $keystore) -xor (Test-Path -LiteralPath $signingProperties)) {
    throw "Signing files are incomplete in $signingDirectory. Restore the original pair; do not replace the key."
}
if (-not (Test-Path -LiteralPath $keystore)) {
    New-Item -ItemType Directory -Force -Path $signingDirectory | Out-Null
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    $systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Set-Acl -LiteralPath $signingDirectory -AclObject $acl
    $randomBytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $generator.GetBytes($randomBytes)
    $generator.Dispose()
    $password = [BitConverter]::ToString($randomBytes).Replace('-', '')
    $env:RVX_KEY_SETUP_PASSWORD = $password
    try {
        Invoke-Checked (Join-Path $JavaHome 'bin/keytool.exe') @('-genkeypair', '-storetype', 'PKCS12', '-keystore', $keystore, '-alias', 'rvx-patcher', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=RVX Patcher', '-storepass:env', 'RVX_KEY_SETUP_PASSWORD', '-keypass:env', 'RVX_KEY_SETUP_PASSWORD')
        $settings = @(
            "storeFile=$($keystore.Replace('\', '/'))",
            "storePassword=$password",
            'keyAlias=rvx-patcher',
            "keyPassword=$password"
        ) -join "`n"
        [System.IO.File]::WriteAllText($signingProperties, $settings)
    } finally {
        Remove-Item Env:RVX_KEY_SETUP_PASSWORD -ErrorAction SilentlyContinue
        $password = $null
        $settings = $null
    }
    Write-Output "Created the fixed release signing key: $keystore"
} else {
    Write-Output "Using the existing release signing key: $keystore"
}

Push-Location $projectRoot
try {
    Invoke-Checked 'node' @('tools/build-single-html.mjs')
    Invoke-Checked 'node' @('--test', 'tools/test-ui.mjs')
    Invoke-Checked 'node' @('tools/sync-web-assets.mjs')
    if (-not $SkipNativeBuild) {
        $ndk = Get-ChildItem (Join-Path $AndroidSdk 'ndk') -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
        if (-not $ndk) { throw 'Android NDK was not found.' }
        $env:ANDROID_NDK_HOME = $ndk.FullName
        $cargoTools = Join-Path $toolchains 'cargo-tools/bin'
        if (Test-Path -LiteralPath $cargoTools) { $env:PATH = "$cargoTools;$env:PATH" }
        $nativeLog = Join-Path $releaseDirectory 'native-build.log'
        Push-Location (Join-Path $projectRoot 'daemon')
        $nativeErrorPreference = $ErrorActionPreference
        try {
            # Windows PowerShell 5 treats redirected native stderr as errors.
            # Cargo writes progress there even when the build succeeds.
            $ErrorActionPreference = 'Continue'
            & cargo ndk -t arm64-v8a --platform 26 build --release *> $nativeLog
            $nativeExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $nativeErrorPreference
            Pop-Location
        }
        if ($nativeExit -ne 0) { throw "Native build failed. See $nativeLog" }
        Write-Output 'Native ARM64 release build completed.'
    }
    $native = Join-Path $projectRoot 'daemon/target/aarch64-linux-android/release/rvx-daemon'
    if (-not (Test-Path -LiteralPath $native)) { throw 'Build the ARM64 native core first.' }
    $jniDirectory = Join-Path $projectRoot 'android/app/src/main/jniLibs/arm64-v8a'
    $binDirectory = Join-Path $projectRoot 'android/app/src/main/assets/bin'
    New-Item -ItemType Directory -Force -Path $jniDirectory, $binDirectory | Out-Null
    Copy-Item -LiteralPath $native -Destination (Join-Path $jniDirectory 'librvx_daemon.so')
    $runtimeNdk = Get-ChildItem (Join-Path $AndroidSdk 'ndk') -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    $cxxRuntime = Join-Path $runtimeNdk.FullName 'toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so'
    if (-not (Test-Path -LiteralPath $cxxRuntime)) { throw 'Android C++ runtime was not found in the NDK.' }
    Copy-Item -LiteralPath $cxxRuntime -Destination (Join-Path $jniDirectory 'libc++_shared.so')
    Copy-Item -LiteralPath $native -Destination (Join-Path $binDirectory 'rvx-daemon')
    $buildTools = Get-ChildItem (Join-Path $AndroidSdk 'build-tools') -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    $apkSigner = Join-Path $buildTools.FullName 'apksigner.bat'
    $artifacts = @()
    Push-Location (Join-Path $projectRoot 'android')
    try {
        Invoke-Checked $GradleExecutable @(':app:assembleRelease', '--no-daemon', '--console=plain')
        $releaseApk = Join-Path $releaseDirectory "RVX-Patcher-$version-release.apk"
        Copy-Item -LiteralPath 'app/build/outputs/apk/release/app-release.apk' -Destination $releaseApk
        Invoke-Checked $apkSigner @('verify', '--verbose', '--print-certs', $releaseApk)
        $artifacts += $releaseApk
        if ($IncludeDeviceTestVariant) {
            Invoke-Checked $GradleExecutable @(':app:assembleRelease', '-PrvxApplicationId=com.rvx.patcher.qa', '-PrvxAppLabel=RVX Patcher Uji', '-PrvxPreferRoot=false', '--no-daemon', '--console=plain')
            $testApk = Join-Path $releaseDirectory "RVX-Patcher-$version-infinix-test-release.apk"
            Copy-Item -LiteralPath 'app/build/outputs/apk/release/app-release.apk' -Destination $testApk
            Invoke-Checked $apkSigner @('verify', '--verbose', '--print-certs', $testApk)
            $artifacts += $testApk
        }
    } finally { Pop-Location }
    $hashes = $artifacts | ForEach-Object { $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256; "$($hash.Hash.ToLower())  $([System.IO.Path]::GetFileName($_))" }
    $hashes | Set-Content -LiteralPath (Join-Path $releaseDirectory 'SHA256SUMS.txt')
    Write-Output "Release artifacts: $releaseDirectory"
} finally { Pop-Location }
