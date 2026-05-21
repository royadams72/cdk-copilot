package com.ckdcopilot.ckdapp

import android.util.Log
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Constraints
import androidx.work.Data
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class HealthConnectBackgroundSyncModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "HealthConnectBackgroundSync"

  @ReactMethod
  fun ensureScheduled(promise: Promise) {
    executor.execute {
      try {
        val now = System.currentTimeMillis()
        val reason = "periodic-schedule"
        val request = PeriodicWorkRequestBuilder<HealthConnectBackgroundSyncWorker>(
          15,
          TimeUnit.MINUTES
        )
          .setConstraints(defaultConstraints())
          .setInputData(createInputData(reason, now))
          .build()

        WorkManager.getInstance(reactApplicationContext).enqueueUniquePeriodicWork(
          UNIQUE_PERIODIC_WORK_NAME,
          ExistingPeriodicWorkPolicy.UPDATE,
          request
        )
        HealthConnectBackgroundSyncState.setScheduled(reactApplicationContext, true, now)
        Log.i(TAG, "Scheduled periodic native background sync at=$now work=$UNIQUE_PERIODIC_WORK_NAME")
        promise.resolve(createStatusMap())
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_SCHEDULE_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun triggerNow(promise: Promise) {
    executor.execute {
      try {
        val now = System.currentTimeMillis()
        val reason = "manual-trigger"
        val request = OneTimeWorkRequestBuilder<HealthConnectBackgroundSyncWorker>()
          .setConstraints(defaultConstraints())
          .setInputData(createInputData(reason, now))
          .build()

        WorkManager.getInstance(reactApplicationContext).enqueueUniqueWork(
          UNIQUE_IMMEDIATE_WORK_NAME,
          ExistingWorkPolicy.REPLACE,
          request
        )
        HealthConnectBackgroundSyncState.setTriggered(reactApplicationContext, now, reason)
        Log.i(TAG, "Triggered immediate native background sync at=$now work=$UNIQUE_IMMEDIATE_WORK_NAME")
        promise.resolve(createStatusMap())
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_TRIGGER_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun cancelScheduled(promise: Promise) {
    executor.execute {
      try {
        val workManager = WorkManager.getInstance(reactApplicationContext)
        workManager.cancelUniqueWork(UNIQUE_PERIODIC_WORK_NAME)
        workManager.cancelUniqueWork(UNIQUE_IMMEDIATE_WORK_NAME)
        HealthConnectBackgroundSyncState.clearScheduled(reactApplicationContext)
        promise.resolve(createStatusMap())
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_CANCEL_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    executor.execute {
      try {
        promise.resolve(createStatusMap())
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_STATUS_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun markTaskStarted(runId: String, reason: String, promise: Promise) {
    executor.execute {
      try {
        HealthConnectBackgroundSyncState.markTaskStarted(
          reactApplicationContext,
          runId,
          System.currentTimeMillis(),
          reason,
        )
        promise.resolve(createStatusMap())
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_MARK_STARTED_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun markTaskFinished(runId: String, succeeded: Boolean, errorMessage: String?, promise: Promise) {
    executor.execute {
      try {
        HealthConnectBackgroundSyncState.markTaskFinished(
          reactApplicationContext,
          runId,
          succeeded,
          System.currentTimeMillis(),
          errorMessage,
        )
        promise.resolve(createStatusMap())
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_MARK_FINISHED_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun syncAuthSession(jwt: String?, refreshToken: String?, promise: Promise) {
    executor.execute {
      try {
        NativeBackgroundAuthStore(reactApplicationContext).save(jwt, refreshToken)
        Log.i(
          TAG,
          "Mirrored auth session to native jwtPresent=${!jwt.isNullOrBlank()} refreshPresent=${!refreshToken.isNullOrBlank()}",
        )
        promise.resolve(true)
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_AUTH_MIRROR_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun clearAuthSession(promise: Promise) {
    executor.execute {
      try {
        NativeBackgroundAuthStore(reactApplicationContext).clear()
        Log.i(TAG, "Cleared mirrored native auth session")
        promise.resolve(true)
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_AUTH_CLEAR_ERROR", error)
      }
    }
  }

  private fun createStatusMap() = Arguments.createMap().apply {
    val snapshot = HealthConnectBackgroundSyncState.snapshot(reactApplicationContext)
    val isScheduled = snapshot["nativeWorkerEnabled"] as? Boolean ?: false
    val activeRunId = snapshot["activeRunId"] as? String

    putBoolean("bridgeReady", true)
    putBoolean("nativeWorkerEnabled", isScheduled)
    putString("platform", "android")
    putString("strategy", "foreground-work-manager-native")
    putString("taskKey", TASK_KEY)
    putString("uniquePeriodicWorkName", UNIQUE_PERIODIC_WORK_NAME)
    putString("uniqueImmediateWorkName", UNIQUE_IMMEDIATE_WORK_NAME)
    putString("periodicWorkState", if (isScheduled) "scheduled" else "not-scheduled")
    putString("immediateWorkState", if (activeRunId != null) "running" else null)
    putString("activeRunId", activeRunId)
    putString("lastRunId", snapshot["lastRunId"] as? String)
    putString("lastTaskStatus", snapshot["lastTaskStatus"] as? String)
    putString("lastFailureReason", snapshot["lastFailureReason"] as? String)
    putString("lastTriggerReason", snapshot["lastTriggerReason"] as? String)
    putDoubleOrNull("lastScheduledAt", snapshot["lastScheduledAt"] as? Long)
    putDoubleOrNull("lastTriggeredAt", snapshot["lastTriggeredAt"] as? Long)
    putDoubleOrNull("lastWorkerStartedAt", snapshot["lastWorkerStartedAt"] as? Long)
    putDoubleOrNull("lastForegroundAt", snapshot["lastForegroundAt"] as? Long)
    putDoubleOrNull("lastTaskStartedAt", snapshot["lastTaskStartedAt"] as? Long)
    putDoubleOrNull("lastTaskFinishedAt", snapshot["lastTaskFinishedAt"] as? Long)
  }

  private fun createInputData(reason: String, triggeredAt: Long): Data {
    return Data.Builder()
      .putBoolean("force", true)
      .putString("reason", reason)
      .putLong("triggeredAt", triggeredAt)
      .build()
  }

  private fun defaultConstraints() = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)
    .build()

  private fun com.facebook.react.bridge.WritableMap.putDoubleOrNull(key: String, value: Long?) {
    if (value == null) {
      putNull(key)
    } else {
      putDouble(key, value.toDouble())
    }
  }

  companion object {
    const val TASK_KEY = "HealthConnectBackgroundSyncTask"
    private const val TAG = "HCBackgroundSync"
    private const val UNIQUE_IMMEDIATE_WORK_NAME = "health-connect-sync-immediate"
    private const val UNIQUE_PERIODIC_WORK_NAME = "health-connect-sync-periodic"
  }
}
