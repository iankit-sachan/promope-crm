package com.promope.app

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * ChatNotificationService — background foreground service.
 *
 * Polls `/api/chat/conversations/` every [POLL_INTERVAL_MS] milliseconds
 * using the JWT stored in SharedPreferences by [ChatBridge].
 *
 * When it detects a conversation whose `unread_count` has grown since the
 * last snapshot, it fires a heads-up notification via [NotificationHelper]
 * and updates the launcher-icon badge.
 *
 * Lifecycle:
 *  START → [ChatBridge.setAuthToken()] or [MainActivity] on page load
 *  STOP  → [ChatBridge.clearAuthToken()] on logout, or 401 response
 */
class ChatNotificationService : Service() {

    companion object {
        private const val PREFS_NAME          = "prefs_chat"
        private const val PREFS_SNAPSHOT      = "prefs_chat_snapshot"
        private const val KEY_JWT             = "jwt_token"
        private const val POLL_INTERVAL_MS    = 30_000L   // 30 seconds
        private const val BASE_URL            = "https://team.promope.site"
    }

    // ── Internals ──────────────────────────────────────────────────────────

    private val handler   = Handler(Looper.getMainLooper())
    private val executor  = Executors.newSingleThreadExecutor()
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val pollRunnable = object : Runnable {
        override fun run() {
            executor.execute { doPoll() }
            handler.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    // ── Service lifecycle ──────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        startForeground(
            NotificationHelper.NOTIF_ID_SYNC,
            NotificationHelper.buildSyncNotification(this)
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Run first poll immediately, then every POLL_INTERVAL_MS
        handler.removeCallbacks(pollRunnable)
        handler.post(pollRunnable)
        return START_STICKY   // restart if killed by OS
    }

    override fun onDestroy() {
        handler.removeCallbacks(pollRunnable)
        executor.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Polling logic ──────────────────────────────────────────────────────

    private fun doPoll() {
        val jwt = getJwt() ?: run { stopSelf(); return }

        val request = Request.Builder()
            .url("$BASE_URL/api/chat/conversations/")
            .addHeader("Authorization", "Bearer $jwt")
            .addHeader("Accept", "application/json")
            .build()

        try {
            httpClient.newCall(request).execute().use { response ->
                when {
                    response.code == 401 -> {
                        // Token expired or revoked — stop polling
                        stopSelf()
                        return
                    }
                    !response.isSuccessful -> return   // transient error — retry next cycle

                    else -> {
                        val body = response.body?.string() ?: return
                        processConversations(body)
                    }
                }
            }
        } catch (e: IOException) {
            // Network unavailable — silent retry on next cycle
        }
    }

    /**
     * Parse the conversations JSON, compare against the last snapshot,
     * and fire notifications for any newly-unread conversations.
     *
     * The API may return:
     *  • A raw JSON array: `[{id, other_participant, unread_count, ...}, ...]`
     *  • A paginated object: `{count, results: [...]}`
     */
    private fun processConversations(body: String) {
        val snapshot  = loadSnapshot()
        val newSnapshot = mutableMapOf<Int, Int>()     // convId → unread_count
        var totalUnread = 0

        val array: JSONArray = try {
            val root = JSONObject(body)
            root.optJSONArray("results") ?: JSONArray(body)
        } catch (e: Exception) {
            try { JSONArray(body) } catch (e2: Exception) { return }
        }

        for (i in 0 until array.length()) {
            val conv        = array.getJSONObject(i)
            val convId      = conv.getInt("id")
            val unread      = conv.optInt("unread_count", 0)
            val prevUnread  = snapshot[convId] ?: 0

            newSnapshot[convId] = unread
            totalUnread += unread

            // Only notify if unread grew (not just any non-zero value)
            if (unread > prevUnread) {
                val senderName  = getSenderName(conv)
                val lastMessage = getLastMessagePreview(conv)
                NotificationHelper.postChatNotification(
                    this, senderName, lastMessage, convId
                )
            }
        }

        saveSnapshot(newSnapshot)
        NotificationHelper.updateBadge(this, totalUnread)
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private fun getJwt(): String? {
        val token = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_JWT, null)
        return if (token.isNullOrBlank()) null else token
    }

    /**
     * Derive a human-readable sender name from the conversation object.
     * Handles the `other_participant` nested object returned by the API.
     */
    private fun getSenderName(conv: JSONObject): String {
        return try {
            // API returns "other_user" object (not "other_participant")
            val participant = conv.optJSONObject("other_user")
                ?: conv.optJSONObject("other_participant")
            participant?.optString("full_name")?.takeIf { it.isNotBlank() }
                ?: participant?.optString("email")?.takeIf { it.isNotBlank() }
                ?: "New message"
        } catch (e: Exception) { "New message" }
    }

    /** Extract last message text from the conversation object. */
    private fun getLastMessagePreview(conv: JSONObject): String {
        return try {
            val last = conv.optJSONObject("last_message")
            last?.optString("content")?.takeIf { it.isNotBlank() }
                ?: "You have a new message"
        } catch (e: Exception) { "You have a new message" }
    }

    // ── Snapshot persistence ───────────────────────────────────────────────

    private fun loadSnapshot(): Map<Int, Int> {
        val raw = getSharedPreferences(PREFS_SNAPSHOT, Context.MODE_PRIVATE)
            .getString("snapshot", null) ?: return emptyMap()
        return try {
            val obj = JSONObject(raw)
            obj.keys().asSequence().associate { k -> k.toInt() to obj.getInt(k) }
        } catch (e: Exception) { emptyMap() }
    }

    private fun saveSnapshot(snapshot: Map<Int, Int>) {
        val obj = JSONObject()
        snapshot.forEach { (k, v) -> obj.put(k.toString(), v) }
        getSharedPreferences(PREFS_SNAPSHOT, Context.MODE_PRIVATE)
            .edit()
            .putString("snapshot", obj.toString())
            .apply()
    }
}
