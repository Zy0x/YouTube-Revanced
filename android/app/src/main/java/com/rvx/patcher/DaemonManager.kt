package com.rvx.patcher

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

class DaemonManager(private val context: Context) {
    companion object {
        private const val TAG = "RVX-Daemon"
        const val DEFAULT_PORT = 8088
    }

    private var process: Process? = null
    private var activePort: Int = DEFAULT_PORT
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(500, TimeUnit.MILLISECONDS)
        .readTimeout(800, TimeUnit.MILLISECONDS)
        .build()

    val baseUrl: String
        get() = "http://127.0.0.1:$activePort"

    suspend fun startDaemon(): Boolean = withContext(Dispatchers.IO) {
        try {
            if (isDaemonAlive()) {
                Log.i(TAG, "Daemon is already running on port $DEFAULT_PORT")
                return@withContext true
            }

            extractWebAssets()

            val daemonFile = getDaemonExecutable()
            if (!daemonFile.exists() || !daemonFile.canExecute()) {
                Log.e(TAG, "Daemon binary not executable at ${daemonFile.absolutePath}")
                return@withContext false
            }

            val workingDir = context.filesDir
            val builder = ProcessBuilder(
                daemonFile.absolutePath,
                "server",
                "--port", DEFAULT_PORT.toString()
            )
            builder.directory(workingDir)
            builder.environment()["RVX_STANDALONE_APP"] = "1"
            builder.environment()["RVX_APP_PACKAGE"] = context.packageName
            builder.environment()["MODPATH"] = workingDir.absolutePath
            builder.environment()["HOME"] = workingDir.absolutePath
            builder.environment()["TMPDIR"] = context.cacheDir.absolutePath
            builder.redirectErrorStream(true)

            val suCandidates = arrayOf("/system/bin/su", "/data/adb/ap/bin/su", "/data/adb/magisk/su", "su")
            val workingSu = suCandidates.firstOrNull { bin ->
                try {
                    val p = ProcessBuilder(bin, "-c", "id").start()
                    val out = p.inputStream.bufferedReader().readText()
                    p.waitFor()
                    out.contains("uid=0")
                } catch (_: Exception) {
                    false
                }
            }

            val proc = if (workingSu != null) {
                Log.i(TAG, "Root available ($workingSu). Spawning daemon via root shell.")
                val suCmd = "export LD_LIBRARY_PATH=\"${context.applicationInfo.nativeLibraryDir}:/system/lib64\"; export MODPATH=\"${workingDir.absolutePath}\"; export HOME=\"${workingDir.absolutePath}\"; export TMPDIR=\"${context.cacheDir.absolutePath}\"; export RVX_STANDALONE_APP=1; export RVX_APP_PACKAGE=\"${context.packageName}\"; exec ${daemonFile.absolutePath} server --port $DEFAULT_PORT"
                ProcessBuilder(workingSu, "-c", suCmd)
                    .directory(workingDir)
                    .redirectErrorStream(true)
                    .start()
            } else {
                Log.i(TAG, "Spawning daemon process: ${daemonFile.absolutePath}")
                builder.start()
            }
            process = proc

            // Read daemon logs in background thread
            Thread {
                try {
                    val reader = BufferedReader(InputStreamReader(proc.inputStream))
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        Log.d(TAG, "[Core] $line")
                        val currentLine = line ?: ""
                        if (currentLine.contains("http://127.0.0.1:")) {
                            Regex("""http://127\.0\.0\.1:(\d+)""").find(currentLine)?.let { m ->
                                val detected = m.groupValues[1].toIntOrNull()
                                if (detected != null) {
                                    activePort = detected
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Log stream closed: ${e.message}")
                }
            }.start()

            // Poll until daemon is responsive
            val ready = pollUntilReady(maxWaitMs = 6000)
            if (ready) {
                Log.i(TAG, "Daemon started successfully and is listening on $baseUrl")
            } else {
                Log.e(TAG, "Daemon failed to become ready within timeout")
            }
            ready
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start daemon", e)
            false
        }
    }

    private fun getDaemonExecutable(): File {
        // 1. Android nativeLibraryDir (Primary & SELinux-compliant on Android 10+)
        val nativeLibDir = File(context.applicationInfo.nativeLibraryDir)
        val bundledLib = File(nativeLibDir, "librvx_daemon.so")
        if (bundledLib.exists() && bundledLib.canExecute()) {
            Log.i(TAG, "Using native binary from nativeLibraryDir: ${bundledLib.absolutePath}")
            return bundledLib
        }

        // 2. Fallback: filesDir/bin/rvx-daemon
        val binDir = File(context.filesDir, "bin")
        if (!binDir.exists()) binDir.mkdirs()

        val targetFile = File(binDir, "rvx-daemon")

        if (bundledLib.exists()) {
            copyFile(bundledLib, targetFile)
        } else {
            // Try extracting from assets
            try {
                context.assets.open("bin/rvx-daemon").use { input ->
                    FileOutputStream(targetFile).use { output ->
                        input.copyTo(output)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Asset bin/rvx-daemon not found: ${e.message}")
            }
        }

        // Ensure executable permissions
        if (targetFile.exists()) {
            targetFile.setReadable(true, false)
            targetFile.setExecutable(true, false)
            try {
                Runtime.getRuntime().exec(arrayOf("chmod", "755", targetFile.absolutePath)).waitFor()
            } catch (_: Exception) {}
        }
        return targetFile
    }

    private fun copyFile(src: File, dst: File) {
        src.inputStream().use { input ->
            dst.outputStream().use { output ->
                input.copyTo(output)
            }
        }
    }

    private fun extractWebAssets() {
        try {
            val webDir = File(context.filesDir, "web")
            if (!webDir.exists()) webDir.mkdirs()
            copyAssetTree("web", webDir)
        } catch (e: Exception) {
            Log.w(TAG, "Failed extracting web assets: ${e.message}")
        }
    }

    private fun copyAssetTree(assetPath: String, targetDir: File) {
        val list = context.assets.list(assetPath) ?: return
        if (list.isEmpty()) {
            val file = File(targetDir, File(assetPath).name)
            try {
                context.assets.open(assetPath).use { input ->
                    FileOutputStream(file).use { output ->
                        input.copyTo(output)
                    }
                }
            } catch (_: Exception) {}
        } else {
            val destSubDir = if (assetPath == "web") targetDir else File(targetDir, File(assetPath).name)
            if (!destSubDir.exists()) destSubDir.mkdirs()
            for (item in list) {
                copyAssetTree("$assetPath/$item", destSubDir)
            }
        }
    }

    suspend fun isDaemonAlive(port: Int = activePort): Boolean = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("http://127.0.0.1:$port/api/v1/system/status")
            .build()
        try {
            httpClient.newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (_: Exception) {
            false
        }
    }

    private suspend fun pollUntilReady(maxWaitMs: Long): Boolean {
        val startTime = System.currentTimeMillis()
        while (System.currentTimeMillis() - startTime < maxWaitMs) {
            for (p in listOf(activePort, 8088, 8089, 8090)) {
                if (isDaemonAlive(p)) {
                    activePort = p
                    return true
                }
            }
            kotlinx.coroutines.delay(200)
        }
        return false
    }

    fun stopDaemon() {
        try {
            process?.let {
                Log.i(TAG, "Stopping daemon process")
                it.destroy()
                if (it.isAlive) {
                    it.destroyForcibly()
                }
            }
            process = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping daemon", e)
        }
    }
}
