package com.promope.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var loadingSpinner: ProgressBar
    private lateinit var errorView: LinearLayout
    private lateinit var retryButton: Button

    private val APP_URL = "https://team.promope.site"

    /**
     * Receives DATA_SYNC broadcasts from ChatNotificationService (native WS layer).
     * Calls window.__crmSyncCallback in the WebView so React Query can invalidate
     * the relevant cache key and silently refetch — giving instant UI updates.
     */
    private val dataSyncReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != "com.promope.app.DATA_SYNC") return
            val resourceType = intent.getStringExtra("resource_type") ?: return
            val resourceId   = intent.getIntExtra("resource_id", -1)
            val action       = intent.getStringExtra("action") ?: "updated"
            webView.post {
                webView.evaluateJavascript(
                    "(function(){if(window.__crmSyncCallback)" +
                    "window.__crmSyncCallback('$resourceType',$resourceId,'$action');})();",
                    null
                )
            }
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView        = findViewById(R.id.webview)
        loadingSpinner = findViewById(R.id.loading_spinner)
        errorView      = findViewById(R.id.error_view)
        retryButton    = findViewById(R.id.retry_button)

        // Create notification channels (safe to call multiple times)
        NotificationHelper.createChannels(this)

        // Request POST_NOTIFICATIONS permission on Android 13+
        requestNotificationPermissionIfNeeded()

        setupWebView()

        retryButton.setOnClickListener {
            if (isNetworkAvailable()) {
                showLoading()
                webView.reload()
            }
        }

        if (isNetworkAvailable()) {
            webView.loadUrl(APP_URL)
        } else {
            showError()
        }

        // Handle deep-link intent that launched this Activity
        handleChatDeepLink(intent)

        // Listen for data_sync broadcasts from ChatNotificationService
        registerReceiver(dataSyncReceiver, IntentFilter("com.promope.app.DATA_SYNC"))
    }

    /** Called when Activity is already running and a new Intent arrives (singleTop). */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleChatDeepLink(intent)
    }

    // ── WebView setup ──────────────────────────────────────────────────────

    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled         = true
        settings.domStorageEnabled         = true
        settings.databaseEnabled           = true
        settings.loadWithOverviewMode      = true
        settings.useWideViewPort           = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls       = false
        settings.displayZoomControls       = false
        settings.mixedContentMode          = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.userAgentString           = settings.userAgentString + " PromoPeApp/1.0"
        settings.cacheMode                 = WebSettings.LOAD_DEFAULT

        // ── JS ↔ Native bridge ────────────────────────────────────────────
        webView.addJavascriptInterface(ChatBridge(this), "Android")

        webView.webViewClient = object : WebViewClient() {

            override fun onPageStarted(
                view: WebView?, url: String?, favicon: android.graphics.Bitmap?
            ) {
                showLoading()
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                hideLoading()

                // Inject JS to extract JWT from localStorage and pass it to
                // the native layer — this starts the background polling service
                // without requiring any changes to the React frontend.
                injectJwtExtraction()

                // If the Activity was launched via deep-link before the page
                // was ready, navigate now.
                val target = getIntent()?.takeIf {
                    it.action == "com.promope.app.OPEN_CHAT"
                }?.getStringExtra("navigate_to")
                if (target != null) {
                    navigateTo(target)
                    // Clear navigate_to so subsequent onPageFinished calls skip
                    getIntent()?.removeExtra("navigate_to")
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    showError()
                }
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?, request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                return if (url.startsWith("https://team.promope.site") ||
                           url.startsWith("http://team.promope.site")) {
                    false // load inside WebView
                } else {
                    val intent = Intent(
                        Intent.ACTION_VIEW, android.net.Uri.parse(url)
                    )
                    startActivity(intent)
                    true
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress == 100) hideLoading()
            }
        }

        // Handle file downloads
        webView.setDownloadListener { url, _, _, _, _ ->
            val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
            startActivity(intent)
        }
    }

    // ── JWT extraction JS injection ────────────────────────────────────────

    /**
     * Injects a small JS snippet that reads the Zustand-persisted auth state
     * from localStorage and passes the access token to [ChatBridge.setAuthToken].
     *
     * Zustand-persist stores state under key "crm-auth" in the shape:
     *   { state: { token: "...", refreshToken: "...", user: {...} }, version: 0 }
     *
     * No changes to the React frontend are required.
     */
    private fun injectJwtExtraction() {
        webView.evaluateJavascript(
            """
            (function() {
                try {
                    var raw = localStorage.getItem('crm-auth');
                    if (!raw) return;
                    var parsed = JSON.parse(raw);
                    // Zustand-persist shape: { state: { accessToken, refreshToken, user }, version }
                    var token = (parsed && parsed.state && parsed.state.accessToken)
                                || (parsed && parsed.accessToken)
                                || '';
                    if (token && window.Android) {
                        window.Android.setAuthToken(token);
                    }
                } catch(e) {
                    // Silently ignore parse errors
                }
            })();
            """.trimIndent(),
            null
        )
    }

    // ── Deep-link handling ─────────────────────────────────────────────────

    /**
     * When the user taps a chat notification, [ChatNotificationService] fires
     * an Intent with action "com.promope.app.OPEN_CHAT" and extra
     * "navigate_to" = "/chat".  This method evaluates the navigation inside
     * the WebView once it is ready.
     */
    private fun handleChatDeepLink(intent: Intent?) {
        if (intent?.action != "com.promope.app.OPEN_CHAT") return
        val target = intent.getStringExtra("navigate_to") ?: return
        // If WebView has already loaded, navigate immediately;
        // otherwise onPageFinished will pick it up.
        navigateTo(target)
    }

    /** Evaluate a client-side navigation to [path] (e.g. "/chat"). */
    private fun navigateTo(path: String) {
        webView.post {
            webView.evaluateJavascript(
                "window.location.href = '$path';",
                null
            )
        }
    }

    // ── Notification permission (Android 13+) ──────────────────────────────

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    /* requestCode = */ 1001
                )
            }
        }
    }

    // ── Visibility helpers ─────────────────────────────────────────────────

    private fun showLoading() {
        loadingSpinner.visibility = View.VISIBLE
        errorView.visibility      = View.GONE
        webView.visibility        = View.VISIBLE
    }

    private fun hideLoading() {
        loadingSpinner.visibility = View.GONE
        errorView.visibility      = View.GONE
        webView.visibility        = View.VISIBLE
    }

    private fun showError() {
        loadingSpinner.visibility = View.GONE
        errorView.visibility      = View.VISIBLE
        webView.visibility        = View.GONE
    }

    // ── Network check ──────────────────────────────────────────────────────

    private fun isNetworkAvailable(): Boolean {
        val cm      = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps    = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    // ── Back button ────────────────────────────────────────────────────────

    @Deprecated("Required override for minSdk < 33")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else @Suppress("DEPRECATION") super.onBackPressed()
    }

    // ── WebView state save/restore ─────────────────────────────────────────

    override fun onDestroy() {
        unregisterReceiver(dataSyncReceiver)
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }
}
