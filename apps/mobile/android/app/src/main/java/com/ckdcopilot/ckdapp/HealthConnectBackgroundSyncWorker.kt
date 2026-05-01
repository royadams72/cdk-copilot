package com.ckdcopilot.ckdapp

import android.content.Intent
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService

class HealthConnectBackgroundSyncWorker(
  appContext: android.content.Context,
  workerParams: WorkerParameters
) : Worker(appContext, workerParams) {

  override fun doWork(): Result {
    val serviceIntent = Intent(applicationContext, HealthConnectBackgroundSyncTaskService::class.java).apply {
      putExtra("force", inputData.getBoolean("force", true))
      putExtra("reason", inputData.getString("reason") ?: "background-task")
      putExtra("triggeredAt", System.currentTimeMillis())
    }

    HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
    applicationContext.startService(serviceIntent)
    return Result.success()
  }
}
