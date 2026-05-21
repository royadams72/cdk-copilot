package com.ckdcopilot.ckdapp

import android.content.pm.ServiceInfo
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import java.util.UUID

class HealthConnectBackgroundSyncWorker(
  appContext: android.content.Context,
  workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {
  override suspend fun doWork(): Result {
    val runId = inputData.getString(KEY_RUN_ID) ?: UUID.randomUUID().toString()
    val reason = inputData.getString(KEY_REASON) ?: "background-task"
    val workerStartedAt = System.currentTimeMillis()

    HealthConnectBackgroundSyncState.beginRun(
      applicationContext,
      runId,
      reason,
      workerStartedAt,
    )
    setForeground(createForegroundInfo())
    HealthConnectBackgroundSyncState.markForeground(applicationContext, System.currentTimeMillis())

    return try {
      HealthConnectBackgroundSyncState.markTaskStarted(
        applicationContext,
        runId,
        System.currentTimeMillis(),
        reason,
      )
      NativeHealthConnectSyncRunner(applicationContext).sync(
        runId = runId,
        reason = reason,
        force = inputData.getBoolean("force", true),
      )
      HealthConnectBackgroundSyncState.markTaskFinished(
        applicationContext,
        runId,
        true,
        System.currentTimeMillis(),
        null,
      )
      Result.success()
    } catch (error: Throwable) {
      HealthConnectBackgroundSyncState.markTaskFinished(
        applicationContext,
        runId,
        false,
        System.currentTimeMillis(),
        error.message ?: error.javaClass.simpleName,
      )
      Result.retry()
    }
  }

  private fun createForegroundInfo(): ForegroundInfo {
    ensureNotificationChannel()
    val notification = NotificationCompat.Builder(applicationContext, NOTIFICATION_CHANNEL_ID)
      .setContentTitle("Syncing Health Connect")
      .setContentText("CKD Copilot is refreshing health data in the background.")
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setSmallIcon(R.mipmap.ic_launcher)
      .build()

    return ForegroundInfo(
      NOTIFICATION_ID,
      notification,
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
    )
  }

  private fun ensureNotificationChannel() {
    val channel = NotificationChannelCompat.Builder(
      NOTIFICATION_CHANNEL_ID,
      NotificationManagerCompat.IMPORTANCE_LOW,
    )
      .setName("Health sync")
      .setDescription("Background health data sync status")
      .build()
    NotificationManagerCompat.from(applicationContext).createNotificationChannel(channel)
  }

  companion object {
    private const val KEY_REASON = "reason"
    private const val KEY_RUN_ID = "runId"
    private const val NOTIFICATION_CHANNEL_ID = "health-connect-sync"
    private const val NOTIFICATION_ID = 41021
  }
}
