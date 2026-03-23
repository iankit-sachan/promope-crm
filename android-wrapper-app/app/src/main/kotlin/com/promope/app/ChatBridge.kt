package com.promope.app

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.content.ContextCompat

/**
 * ChatBridge — JavaScript ↔ Native bridge.
 *
 * Registered as `window.Android` in the WebView.
 * The React web app calls these methods to hand off auth state
 * and unread counts to the native layer.
 */
class ChatBridge(private val context: Context) {

    companion object {
        private const val PREFS_NAME = "prefs_chat"
        private const val KEY_JWT    = "jwt_token"
    }

    /**
     * Called by the React app (or by JS injection in MainActivity)
     * after login / on every page load when a token is found in localStorage.
     *
     * Saves the JWT to SharedPreferences and (re-)starts the background
     * polling service.
     */
    @JavascriptInterface
    fun setAuthToken(token: String) {
        if (token.isBlank()) return
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JWT, token)
            .apply()
        startService()
    }

    /**
     * Called by the React app whenever the global unread-message count
     * changes (e.g. from chatStore).  Updates the launcher-icon badge.
     *
     * Usage in React:  window.Android?.updateUnreadBadge(totalUnread)
     */
    @JavascriptInterface
    fun updateUnreadBadge(count: Int) {
        NotificationHelper.updateBadge(context, count)
    }

    /**
     * Called by the React app on logout.
     * Clears the stored JWT, stops the background service, and removes
     * any active badge / chat notifications.
     */
    @JavascriptInterface
    fun clearAuthToken() {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_JWT)
            .apply()
        stopService()
        NotificationHelper.cancelBadge(context)
        NotificationHelper.cancelAllChatNotifications(context)
    }

    /**
     * Called by useAppVersion hook when a soft update is available.
     * Shows a dismissible Toast on the main thread.
     *
     * Usage in React: window.Android?.showUpdateBanner(versionName)
     */
    @JavascriptInterface
    fun showUpdateBanner(versionName: String) {
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(
                context,
                "Update available: v$versionName — download the latest app for new features.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    /**
     * Called by useAppVersion hook when force_update = true.
     * Shows a non-dismissible AlertDialog that opens the APK download URL.
     *
     * Usage in React: window.Android?.showForceUpdateDialog(versionName, releaseNotes)
     */
    @JavascriptInterface
    fun showForceUpdateDialog(versionName: String, releaseNotes: String) {
        Handler(Looper.getMainLooper()).post {
            android.app.AlertDialog.Builder(context)
                .setTitle("Update Required")
                .setMessage("Version $versionName is required to continue.\n\n$releaseNotes")
                .setCancelable(false)
                .setPositiveButton("Update Now") { _, _ ->
                    val intent = Intent(
                        Intent.ACTION_VIEW,
                        android.net.Uri.parse("https://team.promope.site/download/app-PromoPe.apk")
                    )
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                }
                .show()
        }
    }

    /**
     * Called by the React app when a data_sync event is received.
     * Currently a no-op — reserved for future home-screen widget / badge updates.
     *
     * Usage in React: window.Android?.onDataSyncReceived(resourceType)
     */
    @JavascriptInterface
    fun onDataSyncReceived(resourceType: String) {
        // Reserved for future use (widgets, quick-settings tile, etc.)
    }

    // ── Internal helpers ───────────────────────────────────────────────────

    private fun startService() {
        val intent = Intent(context, ChatNotificationService::class.java)
        ContextCompat.startForegroundService(context, intent)
    }

    private fun stopService() {
        context.stopService(Intent(context, ChatNotificationService::class.java))
    }
}
