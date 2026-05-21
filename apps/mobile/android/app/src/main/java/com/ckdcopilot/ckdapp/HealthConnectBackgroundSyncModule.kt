package com.ckdcopilot.ckdapp

import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
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
  private val prefs by lazy {
    reactApplicationContext.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
  }

  override fun getName(): String = "HealthConnectBackgroundSync"

  @ReactMethod
  fun ensureScheduled(promise: Promise) {
    executor.execute {
      try {
        val request = PeriodicWorkRequestBuilder<HealthConnectBackgroundSyncWorker>(
          15,
          TimeUnit.MINUTES
        )
          .build()

        WorkManager.getInstance(reactApplicationContext).enqueueUniquePeriodicWork(
          UNIQUE_PERIODIC_WORK_NAME,
          ExistingPeriodicWorkPolicy.UPDATE,
          request
        )
        setScheduledFlag(true)
        promise.resolve(createStatusMap(true))
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_SCHEDULE_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun triggerNow(promise: Promise) {
    executor.execute {
      try {
        val request = OneTimeWorkRequestBuilder<HealthConnectBackgroundSyncWorker>()
          .build()

        WorkManager.getInstance(reactApplicationContext).enqueueUniqueWork(
          UNIQUE_IMMEDIATE_WORK_NAME,
          ExistingWorkPolicy.REPLACE,
          request
        )
        promise.resolve(createStatusMap(isScheduled()))
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
        setScheduledFlag(false)
        promise.resolve(createStatusMap(false))
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_CANCEL_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    executor.execute {
      try {
        promise.resolve(createStatusMap(isScheduled()))
      } catch (error: Throwable) {
        promise.reject("HC_BACKGROUND_SYNC_STATUS_ERROR", error)
      }
    }
  }

  private fun isScheduled(): Boolean {
    return prefs.getBoolean(SCHEDULED_FLAG_KEY, false)
  }

  private fun setScheduledFlag(isScheduled: Boolean) {
    prefs.edit().putBoolean(SCHEDULED_FLAG_KEY, isScheduled).apply()
  }

  private fun createStatusMap(isScheduled: Boolean) = Arguments.createMap().apply {
    putBoolean("bridgeReady", true)
    putBoolean("nativeWorkerEnabled", isScheduled)
    putString("platform", "android")
    putString("strategy", "work-manager-headless-js")
    putString("taskKey", TASK_KEY)
    putString("uniquePeriodicWorkName", UNIQUE_PERIODIC_WORK_NAME)
  }

  companion object {
    const val TASK_KEY = "HealthConnectBackgroundSyncTask"
    private const val PREFS_NAME = "health_connect_background_sync"
    private const val SCHEDULED_FLAG_KEY = "scheduled"
    private const val UNIQUE_IMMEDIATE_WORK_NAME = "health-connect-sync-immediate"
    private const val UNIQUE_PERIODIC_WORK_NAME = "health-connect-sync-periodic"
  }
}
