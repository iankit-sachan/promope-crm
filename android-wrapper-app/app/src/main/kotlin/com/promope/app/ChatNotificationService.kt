package com.promope.app

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * ChatNotificationService — background foreground service.
 *
 * Runs two parallel real-time channels:
 *
 * 1. HTTP polling (every 30s) → /api/chat/conversations/
 *    Fires heads-up notifications for new unread chat messages (unchanged logic).
 *
 * 2. OkHttp WebSocket → wss://team.promope.site/ws/notifications/?token=<jwt>
 *    Receives data_sync envelopes and broadcasts them so MainActivity can
 *    call window.__crmSyncCallback() inside the WebView for instant UI refresh.
 *    Also handles regular CRM notifications (task assigned, etc.).
 *
 * Lifecycle:
 *  START → ChatBridge.setAuthToken() or MainActivity on page load
 *  STOP  → ChatBridge.clearAuthToken() on logout, or 401 response
 */
class ChatNotificationService : Service() {

    companion object {
        private const val PREFS_NAME       = "prefs_chat"
        private const val PREFS_SNAPSHOT   = "prefs_chat_snapshot"
        private const val KEY_JWT          = "jwt_token"
        private const val POLL_INTERVAL_MS = 30_000L        // chat poll: 30 seconds
        private const val WS_RECONNECT_MS  = 10_000L        // WS reconnect: 10 seconds
        private const val BASE_URL         = "https://team.promope.site"
        private const val WS_URL           = "wss://team.promope.site/ws/notifications/"
    }

    // ── HTTP client for chat polling ───────────────────────────────────────
    private val handler   = Handler(Looper.getMainLooper())
    private val executor  = Executors.newSingleThreadExecutor()
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    // ── WebSocket client for real-time sync notifications ─────────────────
    private val wsClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)   // no timeout — long-lived connection
        .pingInterval(30, TimeUnit.SECONDS)       // auto keepalive ping
        .build()
    private var webSocket: WebSocket? = null

    // ── Chat poll runnable (unchanged from original) ───────────────────────
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
        // (Re-)start chat polling
        handler.removeCallbacks(pollRunnable)
        handler.post(pollRunnable)
        // Connect notification WebSocket
        connectNotificationWs()
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(pollRunnable)
        executor.shutdownNow()
        webSocket?.close(1000, "Service stopping")
        wsClient.dispatcher.executorService.shutdown()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Notification WebSocket ─────────────────────────────────────────────

    private fun connectNotificationWs() {
        val jwt = getJwt() ?: return   // no token yet — will reconnect when token arrives

        val request = Request.Builder()
            .url("$WS_URL?token=$jwt")
            .build()

        webSocket = wsClient.newWebSocket(request, object : WebSocketListener() {

            override fun onOpen(ws: WebSocket, response: Response) {
                // Connected — nothing to do, server sends initial unread count
            }

            override fun onMessage(ws: WebSocket, text: String) {
                handleWsMessage(text)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                // Network error — schedule reconnect
                handler.postDelayed({ connectNotificationWs() }, WS_RECONNECT_MS)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                if (code == 4001) {
                    // JWT invalid — stop service (same behaviour as 401 in HTTP polling)
                    stopSelf()
                } else {
                    handler.postDelayed({ connectNotificationWs() }, WS_RECONNECT_MS)
                }
            }
        })
    }

    /**
     * Route an incoming WS text frame.
     *
     * Frame shape from NotificationConsumer:
     *   { "type": "new_notification", "data": { ... } }
     *
     * data.msg_type = "data_sync" → broadcast Intent for MainActivity to relay to WebView
     * data.msg_type = anything else → show native CRM notification
     */
    private fun handleWsMessage(text: String) {
        try {
            val msg = JSONObject(text)
            if (msg.optString("type") != "new_notification") return

            val data    = msg.getJSONObject("data")
            val msgType = data.optString("msg_type", "")

            if (msgType == "data_sync") {
                // Tell MainActivity to call window.__crmSyncCallback() in the WebView
                val broadcastIntent = Intent("com.promope.app.DATA_SYNC").apply {
                    putExtra("resource_type", data.optString("resource_type", ""))
                    putExtra("resource_id",   data.optInt("resource_id", -1))
                    putExtra("action",        data.optString("action", "updated"))
                }
                sendBroadcast(broadcastIntent)
            } else {
                // Regular CRM notification (task assigned, etc.)
                val title   = data.optString("title",   "CRM Update")
                val message = data.optString("message", "")
                val notifId = data.optInt("id",  (System.currentTimeMillis() % Int.MAX_VALUE).toInt())
                NotificationHelper.postChatNotification(this, title, message, notifId)
            }
        } catch (e: Exception) {
            // Malformed JSON — ignore silently
        }
    }

    // ── Chat HTTP polling (unchanged from original) ────────────────────────

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
                        stopSelf()
                        return
                    }
                    !response.isSuccessful -> return

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

    private fun processConversations(body: String) {
        val snapshot    = loadSnapshot()
        val newSnapshot = mutableMapOf<Int, Int>()
        var totalUnread = 0

        val array: JSONArray = try {
            val root = JSONObject(body)
            root.optJSONArray("results") ?: JSONArray(body)
        } catch (e: Exception) {
            try { JSONArray(body) } catch (e2: Exception) { return }
        }

        for (i in 0 until array.length()) {
            val conv       = array.getJSONObject(i)
            val convId     = conv.getInt("id")
            val unread     = conv.optInt("unread_count", 0)
            val prevUnread = snapshot[convId] ?: 0

            newSnapshot[convId] = unread
            totalUnread += unread

            if (unread > prevUnread) {
                val senderName  = getSenderName(conv)
                val lastMessage = getLastMessagePreview(conv)
                NotificationHelper.postChatNotification(this, senderName, lastMessage, convId)
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

    private fun getSenderName(conv: JSONObject): String {
        return try {
            val participant = conv.optJSONObject("other_user")
                ?: conv.optJSONObject("other_participant")
            participant?.optString("full_name")?.takeIf { it.isNotBlank() }
                ?: participant?.optString("email")?.takeIf { it.isNotBlank() }
                ?: "New message"
        } catch (e: Exception) { "New message" }
    }

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
