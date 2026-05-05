package com.ckdcopilot.ckdapp

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class HealthConnectBackgroundSyncTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: Bundle()
    return HeadlessJsTaskConfig(
      HealthConnectBackgroundSyncModule.TASK_KEY,
      Arguments.fromBundle(extras),
      10 * 60 * 1000L,
      true
    )
  }
}
