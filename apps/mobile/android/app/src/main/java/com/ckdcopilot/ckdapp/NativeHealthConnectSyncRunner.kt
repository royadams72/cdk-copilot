package com.ckdcopilot.ckdapp

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import kotlin.math.max
import kotlin.reflect.KClass

class NativeHealthConnectSyncRunner(
  private val context: Context,
) {
  private val apiBaseUrl = BuildConfig.API_BASE_URL.trimEnd('/')
  private val zoneId = ZoneId.systemDefault()

  suspend fun sync(runId: String, reason: String, force: Boolean) {
    val auth = NativeBackgroundAuthStore(context)
    val client = HealthConnectClient.getOrCreate(context)
    val granted = client.permissionController.getGrantedPermissions()

    syncSteps(client, auth)
    syncMeasurements(client, auth, granted)
    logEvent(auth, "native-background-sync-native-success", JSONObject().apply {
      put("force", force)
      put("reason", reason)
      put("runId", runId)
    }, "info", reason)
  }

  private suspend fun syncSteps(
    client: HealthConnectClient,
    auth: NativeBackgroundAuthStore,
  ) {
    val now = ZonedDateTime.now(zoneId)
    val dayStart = now.toLocalDate().atStartOfDay(zoneId)
    val dayEnd = dayStart.plusDays(1).minusNanos(1)
    val timeRange = TimeRangeFilter.between(dayStart.toInstant(), dayEnd.toInstant())

    val aggregate = client.aggregate(
      AggregateRequest(
        metrics = setOf(StepsRecord.COUNT_TOTAL),
        timeRangeFilter = timeRange,
      )
    )
    val aggregateTotal = max(0, (aggregate[StepsRecord.COUNT_TOTAL] ?: 0L).toInt())
    val dataOrigins = aggregate.dataOrigins.map { it.packageName }.distinct()
    val originTotals = linkedMapOf<String, Int>()

    for (origin in dataOrigins) {
      val result = client.aggregate(
        AggregateRequest(
          metrics = setOf(StepsRecord.COUNT_TOTAL),
          timeRangeFilter = timeRange,
          dataOriginFilter = setOf(DataOrigin(origin)),
        )
      )
      originTotals[origin] = max(0, (result[StepsRecord.COUNT_TOTAL] ?: 0L).toInt())
    }

    val selectedOrigin = selectStepDataOrigin(dataOrigins, originTotals)
    val selectedTotal = when {
      selectedOrigin != null -> originTotals[selectedOrigin] ?: aggregateTotal
      else -> aggregateTotal
    }
    if (selectedTotal <= 0) {
      return
    }

    val distanceMeters = readAggregateDistance(client, timeRange, selectedOrigin)
    val caloriesKcal = readAggregateCalories(client, timeRange, selectedOrigin)
    val averageSpeedKph = readAverageSpeed(client, timeRange, selectedOrigin)
    val dateKey = dayStart.toLocalDate().toString()

    val item = JSONObject().apply {
      put("count", selectedTotal)
      put("externalRecordId", "health-connect:steps:$dateKey")
      put("measuredAt", dayStart.plusHours(12).toInstant().toString())
      put("provider", providerJson(selectedOrigin ?: "android.healthconnect"))
      put(
        "sync",
        JSONObject().apply {
          put("dayKey", dateKey)
          put("lastReconciledAt", Instant.now().toString())
          put("provider", "health_connect")
          put("status", "provisional")
        }
      )
      if (distanceMeters != null) put("distanceMeters", distanceMeters)
      if (caloriesKcal != null) put("caloriesKcal", caloriesKcal)
      if (averageSpeedKph != null) put("averageSpeedKph", averageSpeedKph)
    }

    postJson(
      auth,
      "/api/measurements/steps-batch-upsert",
      JSONObject().put("items", JSONArray().put(item)),
    )
  }

  private suspend fun syncMeasurements(
    client: HealthConnectClient,
    auth: NativeBackgroundAuthStore,
    grantedPermissions: Set<String>,
  ) {
    val syncState = fetchSyncState(auth)
    val items = JSONArray()
    val latestByType = linkedMapOf<String, String>()

    if (grantedPermissions.contains(HealthPermission.getReadPermission(HeartRateRecord::class))) {
      val records = readRecords(client, HeartRateRecord::class, syncWindow(syncState.optJSONObject("heart_rate"), 1))
      for (record in records) {
        for (sample in record.samples) {
          val measuredAt = sample.time.toString()
          items.put(JSONObject().apply {
            put("kind", "heart_rate")
            put("externalRecordId", externalRecordId("HeartRate", record.metadata.dataOrigin.packageName, record.metadata.id, measuredAt, measuredAt))
            put("measuredAt", measuredAt)
            put("bpm", sample.beatsPerMinute.toInt())
            put("provider", providerJson(record.metadata.dataOrigin.packageName))
            deviceJson(record.metadata.device?.manufacturer, record.metadata.device?.model, record.metadata.dataOrigin.packageName)?.let {
              put("device", it)
            }
          })
          latestByType["heart_rate"] = maxInstant(latestByType["heart_rate"], measuredAt)
        }
      }
    }

    if (grantedPermissions.contains(HealthPermission.getReadPermission(RestingHeartRateRecord::class))) {
      val records = readRecords(client, RestingHeartRateRecord::class, syncWindow(syncState.optJSONObject("heart_rate"), 1))
      for (record in records) {
        val measuredAt = record.time.toString()
        items.put(JSONObject().apply {
          put("kind", "heart_rate")
          put("externalRecordId", externalRecordId("RestingHeartRate", record.metadata.dataOrigin.packageName, record.metadata.id, measuredAt))
          put("measuredAt", measuredAt)
          put("bpm", record.beatsPerMinute.toInt())
          put("provider", providerJson(record.metadata.dataOrigin.packageName))
          deviceJson(record.metadata.device?.manufacturer, record.metadata.device?.model, record.metadata.dataOrigin.packageName)?.let {
            put("device", it)
          }
        })
        latestByType["heart_rate"] = maxInstant(latestByType["heart_rate"], measuredAt)
      }
    }

    if (grantedPermissions.contains(HealthPermission.getReadPermission(SleepSessionRecord::class))) {
      val records = readRecords(client, SleepSessionRecord::class, syncWindow(syncState.optJSONObject("sleep"), 7))
      for (record in records) {
        val measuredAt = record.endTime.toString()
        items.put(JSONObject().apply {
          put("kind", "sleep")
          put("externalRecordId", externalRecordId("SleepSession", record.metadata.dataOrigin.packageName, record.metadata.id, measuredAt))
          put("measuredAt", measuredAt)
          put("sleepFromAt", record.startTime.toString())
          put("sleepToAt", record.endTime.toString())
          put("provider", providerJson(record.metadata.dataOrigin.packageName))
          deviceJson(record.metadata.device?.manufacturer, record.metadata.device?.model, record.metadata.dataOrigin.packageName)?.let {
            put("device", it)
          }
        })
        latestByType["sleep"] = maxInstant(latestByType["sleep"], measuredAt)
      }
    }

    if (grantedPermissions.contains(HealthPermission.getReadPermission(ExerciseSessionRecord::class))) {
      val records = readRecords(client, ExerciseSessionRecord::class, syncWindow(syncState.optJSONObject("exercise"), 3))
      for (record in records) {
        val measuredAt = record.endTime.toString()
        items.put(JSONObject().apply {
          put("kind", "exercise")
          put("externalRecordId", externalRecordId("ExerciseSession", record.metadata.dataOrigin.packageName, record.metadata.id, measuredAt))
          put("measuredAt", measuredAt)
          put("durationMin", max(1.0, ChronoUnit.MINUTES.between(record.startTime, record.endTime).toDouble()))
          put("caloriesKcal", 0)
          put("exerciseId", "health_connect_exercise_${record.exerciseType}")
          put("exerciseTitle", record.title ?: "Imported exercise")
          put("category", "health_connect")
          put("intensity", "moderate")
          put("met", 1)
          put("provider", providerJson(record.metadata.dataOrigin.packageName))
          deviceJson(record.metadata.device?.manufacturer, record.metadata.device?.model, record.metadata.dataOrigin.packageName)?.let {
            put("device", it)
          }
        })
        latestByType["exercise"] = maxInstant(latestByType["exercise"], measuredAt)
      }
    }

    if (grantedPermissions.contains(HealthPermission.getReadPermission(BloodPressureRecord::class))) {
      val records = readRecords(client, BloodPressureRecord::class, syncWindow(syncState.optJSONObject("blood_pressure"), 3))
      for (record in records) {
        val measuredAt = record.time.toString()
        items.put(JSONObject().apply {
          put("kind", "blood_pressure")
          put("externalRecordId", externalRecordId("BloodPressure", record.metadata.dataOrigin.packageName, record.metadata.id, measuredAt))
          put("measuredAt", measuredAt)
          put("systolicMmHg", record.systolic.inMillimetersOfMercury)
          put("diastolicMmHg", record.diastolic.inMillimetersOfMercury)
          put("provider", providerJson(record.metadata.dataOrigin.packageName))
          deviceJson(record.metadata.device?.manufacturer, record.metadata.device?.model, record.metadata.dataOrigin.packageName)?.let {
            put("device", it)
          }
        })
        latestByType["blood_pressure"] = maxInstant(latestByType["blood_pressure"], measuredAt)
      }
    }

    if (items.length() > 0) {
      postJson(auth, "/api/measurements/provider-batch-upsert", JSONObject().put("items", items))
    }

    if (latestByType.isNotEmpty()) {
      val recordTypes = JSONObject()
      for ((key, value) in latestByType) {
        recordTypes.put(key, JSONObject().put("lastSyncedAt", value))
      }
      patchJson(auth, "/api/users/health-connect/sync-state", JSONObject().put("recordTypes", recordTypes))
    }
  }

  private suspend fun fetchSyncState(auth: NativeBackgroundAuthStore): JSONObject {
    val response = getJson(auth, "/api/users/health-connect/sync-state")
    return response.optJSONObject("data")?.optJSONObject("recordTypes") ?: JSONObject()
  }

  private fun syncWindow(recordTypeState: JSONObject?, defaultLookbackDays: Long): TimeRangeFilter {
    val end = Instant.now()
    val lastSyncedAt = recordTypeState?.optString("lastSyncedAt")?.takeIf { it.isNotBlank() }
    val start = if (lastSyncedAt != null) {
      runCatching { Instant.parse(lastSyncedAt).minus(5, ChronoUnit.MINUTES) }
        .getOrElse { end.minus(defaultLookbackDays, ChronoUnit.DAYS) }
    } else {
      end.minus(defaultLookbackDays, ChronoUnit.DAYS)
    }
    return TimeRangeFilter.between(start, end)
  }

  private suspend fun readAggregateDistance(
    client: HealthConnectClient,
    timeRange: TimeRangeFilter,
    selectedOrigin: String?,
  ): Double? = runCatching {
    client.aggregate(
      AggregateRequest(
        metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
        timeRangeFilter = timeRange,
        dataOriginFilter = selectedOrigin?.let { setOf(DataOrigin(it)) } ?: emptySet(),
      )
    )[DistanceRecord.DISTANCE_TOTAL]?.inMeters
  }.getOrNull()

  private suspend fun readAggregateCalories(
    client: HealthConnectClient,
    timeRange: TimeRangeFilter,
    selectedOrigin: String?,
  ): Double? = runCatching {
    client.aggregate(
      AggregateRequest(
        metrics = setOf(TotalCaloriesBurnedRecord.ENERGY_TOTAL),
        timeRangeFilter = timeRange,
        dataOriginFilter = selectedOrigin?.let { setOf(DataOrigin(it)) } ?: emptySet(),
      )
    )[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories
  }.getOrNull()

  private suspend fun readAverageSpeed(
    client: HealthConnectClient,
    timeRange: TimeRangeFilter,
    selectedOrigin: String?,
  ): Double? = runCatching {
    client.aggregate(
      AggregateRequest(
        metrics = setOf(SpeedRecord.SPEED_AVG),
        timeRangeFilter = timeRange,
        dataOriginFilter = selectedOrigin?.let { setOf(DataOrigin(it)) } ?: emptySet(),
      )
    )[SpeedRecord.SPEED_AVG]?.inKilometersPerHour
  }.getOrNull()

  private fun selectStepDataOrigin(
    dataOrigins: List<String>,
    originTotals: Map<String, Int>,
  ): String? {
    val preferred = dataOrigins.filter { it != "android" }.maxByOrNull { originTotals[it] ?: 0 }
    if (preferred != null && (originTotals[preferred] ?: 0) > 0) {
      return preferred
    }
    return dataOrigins.maxByOrNull { originTotals[it] ?: 0 }
  }

  private fun providerJson(packageName: String): JSONObject {
    return JSONObject().apply {
      put("displayName", packageName.substringAfterLast('.'))
      put("packageName", packageName)
    }
  }

  private fun deviceJson(manufacturer: String?, model: String?, packageName: String): JSONObject? {
    val safeManufacturer = manufacturer?.trim().orEmpty()
    val safeModel = model?.trim().orEmpty()
    if (safeManufacturer.isBlank() && safeModel.isBlank()) return null
    return JSONObject().apply {
      put("externalId", listOf(packageName, safeManufacturer, safeModel).filter { it.isNotBlank() }.joinToString(":"))
      put("name", listOf(safeManufacturer, safeModel).filter { it.isNotBlank() }.joinToString(" "))
      put("platform", "Health Connect")
    }
  }

  private fun externalRecordId(
    recordType: String,
    origin: String,
    metadataId: String?,
    fallbackTime: String,
    sampleKey: String? = null,
  ): String {
    val stableId = metadataId?.trim().takeUnless { it.isNullOrBlank() } ?: fallbackTime
    return if (sampleKey != null) {
      "health-connect:$origin:$recordType:$stableId:$sampleKey"
    } else {
      "health-connect:$origin:$recordType:$stableId"
    }
  }

  private fun maxInstant(current: String?, candidate: String): String {
    if (current == null) return candidate
    return if (candidate > current) candidate else current
  }

  private suspend fun <T : Record> readRecords(
    client: HealthConnectClient,
    type: KClass<T>,
    timeRange: TimeRangeFilter,
  ): List<T> = withContext(Dispatchers.IO) {
    client.readRecords(
      ReadRecordsRequest(
        recordType = type,
        timeRangeFilter = timeRange,
        pageSize = 500,
        ascendingOrder = false,
      )
    ).records
  }

  private suspend fun getJson(auth: NativeBackgroundAuthStore, path: String): JSONObject {
    return requestJson(auth, "GET", path, null)
  }

  private suspend fun patchJson(auth: NativeBackgroundAuthStore, path: String, body: JSONObject): JSONObject {
    return requestJson(auth, "PATCH", path, body)
  }

  private suspend fun postJson(auth: NativeBackgroundAuthStore, path: String, body: JSONObject): JSONObject {
    return requestJson(auth, "POST", path, body)
  }

  private suspend fun requestJson(
    auth: NativeBackgroundAuthStore,
    method: String,
    path: String,
    body: JSONObject?,
  ): JSONObject = withContext(Dispatchers.IO) {
    val first = requestWithToken(auth.currentJwt(), method, path, body)
    if (first.first == 401) {
      Log.w(TAG, "Request got 401 for $method $path, attempting token refresh")
    }
    val response = if (first.first == 401 && auth.refreshTokens(apiBaseUrl)) {
      val retried = requestWithToken(auth.currentJwt(), method, path, body)
      Log.i(TAG, "Retried request for $method $path after token refresh with status=${retried.first}")
      retried
    } else {
      first
    }
    if (response.first !in 200..299) {
      val message = response.second.optString("message", "Request failed")
      Log.w(TAG, "Request failed method=$method path=$path status=${response.first} message=$message")
      throw IllegalStateException("HTTP ${response.first} for $path: $message")
    }
    Log.i(TAG, "Request succeeded method=$method path=$path status=${response.first}")
    response.second
  }

  private fun requestWithToken(
    jwt: String?,
    method: String,
    path: String,
    body: JSONObject?,
  ): Pair<Int, JSONObject> {
    if (jwt.isNullOrBlank()) {
      Log.w(TAG, "No mirrored JWT available for $method $path")
      throw IllegalStateException("No mirrored auth token available for native background sync.")
    }

    try {
      val connection = (URL("$apiBaseUrl$path").openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = 15_000
        readTimeout = 30_000
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Authorization", "Bearer $jwt")
        doInput = true
        if (body != null) {
          doOutput = true
        }
      }

      if (body != null) {
        OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
      }

      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
      if (status !in 200..299) {
        Log.w(TAG, "Raw request failure method=$method path=$path status=$status body=${truncate(text)}")
      }
      return status to runCatching { JSONObject(text) }.getOrElse { JSONObject() }
    } catch (error: Throwable) {
      Log.e(TAG, "Network failure for $method $path: ${error.javaClass.simpleName}: ${error.message}", error)
      throw IllegalStateException("Network failure for $path: ${error.message}", error)
    }
  }

  private suspend fun logEvent(
    auth: NativeBackgroundAuthStore,
    event: String,
    payload: JSONObject,
    status: String,
    trigger: String,
  ) {
    runCatching {
      postJson(
        auth,
        "/api/users/health-connect/event-log",
        JSONObject().put(
          "events",
          JSONArray().put(
            JSONObject().apply {
              put("clientAt", Instant.now().toString())
              put("event", event)
              put("payload", payload)
              put("platform", "android")
              put("source", "background-task")
              put("status", status)
              put("trigger", trigger)
            }
          )
        )
      )
    }
  }

  private fun truncate(value: String, max: Int = 240): String {
    if (value.length <= max) return value
    return value.take(max) + "..."
  }

  companion object {
    private const val TAG = "HCNativeSync"
  }
}
