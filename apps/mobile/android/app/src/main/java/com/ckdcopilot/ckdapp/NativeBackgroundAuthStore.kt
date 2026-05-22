package com.ckdcopilot.ckdapp

import android.util.Log
import android.content.Context
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class NativeBackgroundAuthStore(
  context: Context,
) {
  private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun save(jwt: String?, refreshToken: String?) {
    prefs.edit()
      .putString(KEY_JWT, jwt)
      .putString(KEY_REFRESH, refreshToken)
      .apply()
  }

  fun clear() {
    prefs.edit().remove(KEY_JWT).remove(KEY_REFRESH).apply()
  }

  fun currentJwt(): String? = prefs.getString(KEY_JWT, null)?.trim()?.ifBlank { null }

  private fun currentRefreshToken(): String? = prefs.getString(KEY_REFRESH, null)?.trim()?.ifBlank { null }

  fun refreshTokens(apiBaseUrl: String): Boolean {
    val normalizedApiBaseUrl = apiBaseUrl.trim().trimEnd('/')
    val refreshToken = currentRefreshToken() ?: return false
    return try {
      val connection = (URL("$normalizedApiBaseUrl/api/users/refresh-token").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15_000
        readTimeout = 30_000
        setRequestProperty("Content-Type", "application/json")
        doInput = true
        doOutput = true
      }
      val body = JSONObject().put("refreshToken", refreshToken)
      OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val responseText = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      val json = runCatching { JSONObject(responseText) }.getOrElse { JSONObject() }
      val data = json.optJSONObject("data")
      val nextJwt = data?.optString("jwt")?.trim().orEmpty()
      if (status !in 200..299 || nextJwt.isBlank()) {
        Log.w(TAG, "Native auth refresh failed status=$status hasData=${data != null} body=${truncate(responseText)}")
        clear()
        return false
      }
      val nextRefresh = data?.optString("refreshToken")?.trim().orEmpty().ifBlank { refreshToken }
      save(nextJwt, nextRefresh)
      Log.i(TAG, "Native auth refresh succeeded status=$status")
      true
    } catch (error: Throwable) {
      Log.e(TAG, "Native auth refresh threw ${error.javaClass.simpleName}: ${error.message}", error)
      return false
    }
  }

  private fun truncate(value: String, max: Int = 240): String {
    if (value.length <= max) return value
    return value.take(max) + "..."
  }

  companion object {
    private const val KEY_JWT = "jwt"
    private const val KEY_REFRESH = "refresh"
    private const val PREFS_NAME = "native_background_auth"
    private const val TAG = "HCNativeAuth"
  }
}
