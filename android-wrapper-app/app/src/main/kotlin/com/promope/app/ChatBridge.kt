package com.promope.app

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
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

    // ── Internal helpers ───────────────────────────────────────────────────

    private fun startService() {
        val intent = Intent(context, ChatNotificationService::class.java)
        ContextCompat.startForegroundService(context, intent)
    }

    private fun stopService() {
        context.stopService(Intent(context, ChatNotificationService::class.java))
    }
}
