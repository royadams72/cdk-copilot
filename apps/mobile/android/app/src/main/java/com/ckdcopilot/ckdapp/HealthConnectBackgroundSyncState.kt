package com.ckdcopilot.ckdapp

import android.content.Context
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object HealthConnectBackgroundSyncState {
  private const val PREFS_NAME = "health_connect_background_sync"
  private const val KEY_SCHEDULED = "scheduled"
  private const val KEY_LAST_SCHEDULED_AT = "last_scheduled_at"
  private const val KEY_LAST_TRIGGERED_AT = "last_triggered_at"
  private const val KEY_LAST_WORKER_STARTED_AT = "last_worker_started_at"
  private const val KEY_LAST_FOREGROUND_AT = "last_foreground_at"
  private const val KEY_LAST_TASK_STARTED_AT = "last_task_started_at"
  private const val KEY_LAST_TASK_FINISHED_AT = "last_task_finished_at"
  private const val KEY_LAST_TASK_STATUS = "last_task_status"
  private const val KEY_LAST_FAILURE_REASON = "last_failure_reason"
  private const val KEY_LAST_RUN_ID = "last_run_id"
  private const val KEY_LAST_TRIGGER_REASON = "last_trigger_reason"
  private const val KEY_ACTIVE_RUN_ID = "active_run_id"

  private val completions = ConcurrentHashMap<String, CountDownLatch>()

  private data class RunResult(
    val succeeded: Boolean,
    val error: String?,
  )

  private val results = ConcurrentHashMap<String, RunResult>()

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun beginRun(context: Context, runId: String, reason: String, workerStartedAt: Long) {
    completions[runId] = CountDownLatch(1)
    results.remove(runId)
    prefs(context).edit()
      .putString(KEY_ACTIVE_RUN_ID, runId)
      .putString(KEY_LAST_RUN_ID, runId)
      .putString(KEY_LAST_TRIGGER_REASON, reason)
      .putLong(KEY_LAST_WORKER_STARTED_AT, workerStartedAt)
      .putString(KEY_LAST_TASK_STATUS, "worker-started")
      .remove(KEY_LAST_FAILURE_REASON)
      .apply()
  }

  fun markForeground(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_LAST_FOREGROUND_AT, at).apply()
  }

  fun markTaskStarted(context: Context, runId: String, at: Long, reason: String) {
    prefs(context).edit()
      .putString(KEY_ACTIVE_RUN_ID, runId)
      .putString(KEY_LAST_RUN_ID, runId)
      .putString(KEY_LAST_TRIGGER_REASON, reason)
      .putLong(KEY_LAST_TASK_STARTED_AT, at)
      .putString(KEY_LAST_TASK_STATUS, "task-started")
      .remove(KEY_LAST_FAILURE_REASON)
      .apply()
  }

  fun markTaskFinished(context: Context, runId: String, succeeded: Boolean, at: Long, error: String?) {
    results[runId] = RunResult(succeeded, error)
    prefs(context).edit()
      .putLong(KEY_LAST_TASK_FINISHED_AT, at)
      .putString(KEY_LAST_TASK_STATUS, if (succeeded) "task-succeeded" else "task-failed")
      .putString(KEY_LAST_FAILURE_REASON, error)
      .putString(KEY_ACTIVE_RUN_ID, "")
      .apply()
    completions.remove(runId)?.countDown()
  }

  fun markWorkerTimeout(context: Context, runId: String, at: Long, reason: String) {
    prefs(context).edit()
      .putLong(KEY_LAST_TASK_FINISHED_AT, at)
      .putString(KEY_LAST_TASK_STATUS, "worker-timeout")
      .putString(KEY_LAST_FAILURE_REASON, reason)
      .putString(KEY_ACTIVE_RUN_ID, "")
      .apply()
    results.remove(runId)
    completions.remove(runId)?.countDown()
  }

  fun markWorkerLaunchFailure(context: Context, runId: String, at: Long, reason: String) {
    prefs(context).edit()
      .putLong(KEY_LAST_TASK_FINISHED_AT, at)
      .putString(KEY_LAST_TASK_STATUS, "worker-launch-failed")
      .putString(KEY_LAST_FAILURE_REASON, reason)
      .putString(KEY_ACTIVE_RUN_ID, "")
      .apply()
    results.remove(runId)
    completions.remove(runId)?.countDown()
  }

  fun awaitCompletion(runId: String, timeoutMs: Long): Boolean {
    val latch = completions[runId] ?: return false
    return latch.await(timeoutMs, TimeUnit.MILLISECONDS)
  }

  fun wasLastRunSuccessful(runId: String): Boolean? {
    return results[runId]?.succeeded
  }

  fun setScheduled(context: Context, scheduled: Boolean, at: Long) {
    prefs(context).edit()
      .putBoolean(KEY_SCHEDULED, scheduled)
      .putLong(KEY_LAST_SCHEDULED_AT, at)
      .apply()
  }

  fun setTriggered(context: Context, at: Long, reason: String) {
    prefs(context).edit()
      .putLong(KEY_LAST_TRIGGERED_AT, at)
      .putString(KEY_LAST_TRIGGER_REASON, reason)
      .apply()
  }

  fun clearScheduled(context: Context) {
    prefs(context).edit()
      .putBoolean(KEY_SCHEDULED, false)
      .putString(KEY_ACTIVE_RUN_ID, "")
      .apply()
  }

  fun snapshot(context: Context): Map<String, Any?> {
    val prefs = prefs(context)
    return mapOf(
      "activeRunId" to prefs.getString(KEY_ACTIVE_RUN_ID, "")?.ifBlank { null },
      "lastFailureReason" to prefs.getString(KEY_LAST_FAILURE_REASON, null),
      "lastForegroundAt" to prefs.getLong(KEY_LAST_FOREGROUND_AT, 0L).takeIf { it > 0 },
      "lastRunId" to prefs.getString(KEY_LAST_RUN_ID, null),
      "lastScheduledAt" to prefs.getLong(KEY_LAST_SCHEDULED_AT, 0L).takeIf { it > 0 },
      "lastTaskFinishedAt" to prefs.getLong(KEY_LAST_TASK_FINISHED_AT, 0L).takeIf { it > 0 },
      "lastTaskStartedAt" to prefs.getLong(KEY_LAST_TASK_STARTED_AT, 0L).takeIf { it > 0 },
      "lastTaskStatus" to prefs.getString(KEY_LAST_TASK_STATUS, null),
      "lastTriggeredAt" to prefs.getLong(KEY_LAST_TRIGGERED_AT, 0L).takeIf { it > 0 },
      "lastTriggerReason" to prefs.getString(KEY_LAST_TRIGGER_REASON, null),
      "lastWorkerStartedAt" to prefs.getLong(KEY_LAST_WORKER_STARTED_AT, 0L).takeIf { it > 0 },
      "nativeWorkerEnabled" to prefs.getBoolean(KEY_SCHEDULED, false),
    )
  }
}
