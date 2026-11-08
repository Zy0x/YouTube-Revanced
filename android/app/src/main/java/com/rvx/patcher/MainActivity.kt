package com.rvx.patcher

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.DocumentsContract
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var loadingContainer: LinearLayout
    private lateinit var loadingText: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var daemonManager: DaemonManager

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var lastBackPressTime: Long = 0L
    private var pendingDirectoryRequest: Pair<String, String>? = null

    private fun sendDirectoryResult(requestId: String, result: JSONObject) {
        result.put("requestId", requestId)
        webView.evaluateJavascript("window.rvxStorageDirectoryResult?.($result)", null)
    }

    private fun deviceDirectoryPath(uri: Uri): String {
        require(uri.authority == "com.android.externalstorage.documents") {
            "Pilih folder pada penyimpanan perangkat. Folder cloud belum dapat digunakan oleh mesin build."
        }
        val documentId = DocumentsContract.getTreeDocumentId(uri)
        val volume = documentId.substringBefore(':')
        val relative = documentId.substringAfter(':', "")
        val root = if (volume.equals("primary", true)) {
            android.os.Environment.getExternalStorageDirectory()
        } else {
            require(volume.matches(Regex("[A-Za-z0-9-]+"))) { "Volume penyimpanan tidak dikenali." }
            File("/storage", volume)
        }.canonicalFile
        val directory = File(root, relative).canonicalFile
        require(directory == root || directory.path.startsWith(root.path + File.separator)) {
            "Alamat folder berada di luar volume penyimpanan."
        }
        return directory.path
    }

    private val directoryPickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val pending = pendingDirectoryRequest ?: return@registerForActivityResult
        pendingDirectoryRequest = null
        val uri = result.data?.data
        if (result.resultCode != RESULT_OK || uri == null) {
            sendDirectoryResult(pending.second, JSONObject().put("cancelled", true))
            return@registerForActivityResult
        }
        try {
            val path = deviceDirectoryPath(uri)
            val granted = (result.data?.flags ?: 0) and
                (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            contentResolver.takePersistableUriPermission(uri, granted)
            getSharedPreferences("storage-picker", MODE_PRIVATE).edit().putString(pending.first, uri.toString()).apply()
            sendDirectoryResult(pending.second, JSONObject().put("path", path).put("uri", uri.toString()))
        } catch (error: Exception) {
            sendDirectoryResult(pending.second, JSONObject().put("error", error.message ?: "Folder tidak dapat digunakan."))
        }
    }

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (filePathCallback != null) {
            val uriResult = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            filePathCallback?.onReceiveValue(uriResult)
            filePathCallback = null
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        daemonManager = DaemonManager(this)

        setupLayout()
        setupWebView()
        setupBackHandler()

        lifecycleScope.launch {
            loadingText.text = getString(R.string.daemon_starting)
            val ready = daemonManager.startDaemon()
            if (ready) {
                loadingContainer.visibility = View.GONE
                webView.visibility = View.VISIBLE
                webView.loadUrl(daemonManager.baseUrl)
            } else {
                loadingText.text = getString(R.string.daemon_failed)
                progressBar.visibility = View.GONE
            }
        }
    }

    private fun setupLayout() {
        val root = android.widget.FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.background_dark))
        }

        webView = WebView(this).apply {
            visibility = View.GONE
            setBackgroundColor(getColor(R.color.background_dark))
        }
        root.addView(webView, android.widget.FrameLayout.LayoutParams.MATCH_PARENT, android.widget.FrameLayout.LayoutParams.MATCH_PARENT)

        loadingContainer = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(getColor(R.color.background_dark))
        }

        progressBar = ProgressBar(this).apply {
            indeterminateTintList = android.content.res.ColorStateList.valueOf(getColor(R.color.accent_blue))
        }
        loadingContainer.addView(progressBar)

        loadingText = TextView(this).apply {
            setTextColor(getColor(R.color.white))
            textSize = 15f
            setPadding(0, 32, 0, 0)
            gravity = android.view.Gravity.CENTER
        }
        loadingContainer.addView(loadingText)

        root.addView(loadingContainer, android.widget.FrameLayout.LayoutParams.MATCH_PARENT, android.widget.FrameLayout.LayoutParams.MATCH_PARENT)
        setContentView(root)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        // Append custom token for native app bridge detection
        val currentUa = settings.userAgentString
        settings.userAgentString = "$currentUa RVXPatcherApp/${BuildConfig.VERSION_NAME}"

        webView.addJavascriptInterface(AndroidBridge(), "RVXNativeBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
                    return false
                }
                // Open external links in system browser
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                } catch (_: Exception) {}
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                wv: WebView?,
                filePathCb: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = filePathCb

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                }
                try {
                    filePickerLauncher.launch(intent)
                } catch (e: Exception) {
                    filePathCallback = null
                    return false
                }
                return true
            }
        }
    }

    private fun setupBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                try {
                    // Query JavaScript master back handler for hierarchical back navigation
                    webView.evaluateJavascript("(function(){ return Boolean(window.RVXHandleBackGesture && window.RVXHandleBackGesture()); })()") { result ->
                        val handled = result?.trim()?.equals("true", ignoreCase = true) == true
                        if (!handled) {
                            val currentTime = System.currentTimeMillis()
                            if (currentTime - lastBackPressTime < 2000) {
                                finish()
                            } else {
                                lastBackPressTime = currentTime
                                Toast.makeText(this@MainActivity, "Tekan sekali lagi untuk keluar", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                } catch (_: Exception) {
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastBackPressTime < 2000) {
                        finish()
                    } else {
                        lastBackPressTime = currentTime
                        Toast.makeText(this@MainActivity, "Tekan sekali lagi untuk keluar", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        })
    }

    override fun onDestroy() {
        super.onDestroy()
        daemonManager.stopDaemon()
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun installApk(filePath: String) {
            runOnUiThread {
                try {
                    val file = File(filePath)
                    if (!file.exists()) {
                        Toast.makeText(this@MainActivity, "File APK tidak ditemukan: $filePath", Toast.LENGTH_LONG).show()
                        return@runOnUiThread
                    }

                    val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        FileProvider.getUriForFile(this@MainActivity, "${packageName}.provider", file)
                    } else {
                        Uri.fromFile(file)
                    }

                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "application/vnd.android.package-archive")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                    }
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "Gagal membuka installer: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun isRootAvailable(): Boolean {
            return daemonManager.hasVerifiedRootAccess
        }

        @JavascriptInterface
        fun installApkRoot(filePath: String) {
            lifecycleScope.launch(Dispatchers.IO) {
                try {
                    val file = File(filePath)
                    if (!file.exists()) {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(this@MainActivity, "Berkas APK tidak ditemukan: $filePath", Toast.LENGTH_LONG).show()
                        }
                        return@launch
                    }
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Memasang langsung dengan hak root...", Toast.LENGTH_SHORT).show()
                    }
                    val suCandidates = arrayOf("/system/bin/su", "/data/adb/ap/bin/su", "/data/adb/magisk/su", "su")
                    val suBin = suCandidates.firstOrNull { bin ->
                        try {
                            val p = ProcessBuilder(bin, "-c", "id").start()
                            val out = p.inputStream.bufferedReader().readText()
                            p.waitFor()
                            out.contains("uid=0")
                        } catch (_: Exception) {
                            false
                        }
                    } ?: "su"

                    val cmd = "cp -f \"${file.absolutePath}\" /data/local/tmp/install_temp.apk && chmod 644 /data/local/tmp/install_temp.apk && pm install -r -d /data/local/tmp/install_temp.apk; ret=\$?; rm -f /data/local/tmp/install_temp.apk; exit \$ret"
                    val p = ProcessBuilder(suBin, "-c", cmd).start()
                    val out = p.inputStream.bufferedReader().readText() + "\n" + p.errorStream.bufferedReader().readText()
                    val exitCode = p.waitFor()

                    withContext(Dispatchers.Main) {
                        if (exitCode == 0 && out.contains("Success")) {
                            Toast.makeText(this@MainActivity, "Aplikasi berhasil dipasang dengan hak root!", Toast.LENGTH_LONG).show()
                            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('rvx:root_install_success'));", null)
                        } else {
                            val isSignatureConflict = out.contains("INSTALL_FAILED_UPDATE_INCOMPATIBLE", ignoreCase = true) ||
                                    out.contains("signatures do not match", ignoreCase = true) ||
                                    out.contains("signatures differ", ignoreCase = true)
                            if (isSignatureConflict) {
                                Toast.makeText(
                                    this@MainActivity,
                                    "Perbedaan tanda tangan (Signature Mismatch) dengan YouTube Play Store!\nGunakan 'Metode A • Live Hot-Mount' atau aktifkan CorePatch.",
                                    Toast.LENGTH_LONG
                                ).show()
                                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('rvx:signature_mismatch'));", null)
                            } else {
                                Toast.makeText(this@MainActivity, "Root install gagal: $out\nMembuka installer sistem...", Toast.LENGTH_LONG).show()
                                installApk(filePath)
                            }
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Kesalahan root install: ${e.message}\nMembuka installer sistem...", Toast.LENGTH_LONG).show()
                        installApk(filePath)
                    }
                }
            }
        }

        @JavascriptInterface
        fun copyOrMoveFile(sourcePath: String, destDirPath: String, isMove: Boolean) {
            lifecycleScope.launch(Dispatchers.IO) {
                try {
                    val src = File(sourcePath)
                    if (!src.exists()) {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(this@MainActivity, "Berkas sumber tidak ditemukan: $sourcePath", Toast.LENGTH_LONG).show()
                        }
                        return@launch
                    }
                    val destDir = File(destDirPath)
                    if (!destDir.exists()) destDir.mkdirs()
                    val destFile = File(destDir, src.name)

                    val success = try {
                        if (isMove) {
                            if (!src.renameTo(destFile)) {
                                src.copyTo(destFile, overwrite = true)
                                src.delete()
                            }
                            true
                        } else {
                            src.copyTo(destFile, overwrite = true)
                            true
                        }
                    } catch (_: Exception) {
                        val suCandidates = arrayOf("/system/bin/su", "/data/adb/ap/bin/su", "/data/adb/magisk/su", "su")
                        val suBin = suCandidates.firstOrNull { File(it).exists() } ?: "su"
                        val opCmd = if (isMove) "mv -f \"${src.absolutePath}\" \"${destFile.absolutePath}\"" else "cp -f \"${src.absolutePath}\" \"${destFile.absolutePath}\""
                        val proc = ProcessBuilder(suBin, "-c", opCmd).start()
                        proc.waitFor() == 0 && destFile.exists()
                    }

                    withContext(Dispatchers.Main) {
                        if (success) {
                            val actionName = if (isMove) "dipindahkan" else "disalin"
                            Toast.makeText(this@MainActivity, "Berkas berhasil $actionName ke: ${destFile.absolutePath}", Toast.LENGTH_LONG).show()
                        } else {
                            Toast.makeText(this@MainActivity, "Gagal memproses berkas ke: ${destDir.absolutePath}", Toast.LENGTH_LONG).show()
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Error berkas: ${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        @JavascriptInterface
        fun setKeepScreenOn(enabled: Boolean) {
            runOnUiThread {
                if (enabled) {
                    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }
        }

        @JavascriptInterface
        fun isPackageInstalled(packageName: String): Boolean {
            return try {
                packageManager.getPackageInfo(packageName, 0)
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun getInstalledAppVersion(packageName: String): String {
            return try {
                val pInfo = packageManager.getPackageInfo(packageName, 0)
                pInfo.versionName ?: ""
            } catch (e: Exception) {
                ""
            }
        }

        @JavascriptInterface
        fun getInstalledApkInfo(packageName: String): String {
            return try {
                val info = packageManager.getPackageInfo(packageName, 0)
                val app = info.applicationInfo ?: return JSONObject().put("available", false).toString()
                val source = File(app.publicSourceDir ?: app.sourceDir)
                val split = !app.splitSourceDirs.isNullOrEmpty()
                JSONObject().put("available", source.isFile && source.canRead() && !split)
                    .put("packageName", info.packageName).put("versionName", info.versionName ?: "")
                    .put("path", if (!split) source.absolutePath else JSONObject.NULL)
                    .put("size", source.length()).put("split", split).toString()
            } catch (_: Exception) {
                JSONObject().put("available", false).toString()
            }
        }

        @JavascriptInterface
        fun openBrowser(url: String) {
            runOnUiThread {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "Gagal membuka tautan: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun isNativeWrapper(): Boolean = true

        @JavascriptInterface
        fun pickStorageDirectory(kind: String, requestId: String) {
            if (kind !in setOf("workspace", "output") || requestId.length > 128) return
            runOnUiThread {
                if (pendingDirectoryRequest != null) return@runOnUiThread
                pendingDirectoryRequest = kind to requestId
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
                    getSharedPreferences("storage-picker", MODE_PRIVATE).getString(kind, null)?.let {
                        putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(it))
                    }
                }
                try { directoryPickerLauncher.launch(intent) }
                catch (error: Exception) {
                    pendingDirectoryRequest = null
                    sendDirectoryResult(requestId, JSONObject().put("error", error.message ?: "Pemilih Files tidak tersedia."))
                }
            }
        }

        @JavascriptInterface
        fun requestStoragePermission() {
            runOnUiThread {
                checkStoragePermissions()
            }
        }

        @JavascriptInterface
        fun hasStoragePermission(): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.os.Environment.isExternalStorageManager()
            } else {
                checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED
            }
        }
    }

    private fun checkStoragePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!android.os.Environment.isExternalStorageManager()) {
                try {
                    val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    startActivity(intent)
                } catch (_: Exception) {
                    try {
                        val intent = Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                        startActivity(intent)
                    } catch (_: Exception) {}
                }
            }
        } else {
            val permissions = arrayOf(
                android.Manifest.permission.READ_EXTERNAL_STORAGE,
                android.Manifest.permission.WRITE_EXTERNAL_STORAGE
            )
            requestPermissions(permissions, 1001)
        }
    }
}
