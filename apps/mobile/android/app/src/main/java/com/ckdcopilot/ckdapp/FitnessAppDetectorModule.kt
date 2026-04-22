package com.ckdcopilot.ckdapp

import android.content.pm.PackageManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class FitnessAppDetectorModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FitnessAppDetector"

  @ReactMethod
  fun getInstalledFitnessApps(packageNames: ReadableArray, promise: Promise) {
    val packageManager = reactApplicationContext.packageManager
    val installedPackages = Arguments.createArray()

    try {
      for (index in 0 until packageNames.size()) {
        val packageName = packageNames.getString(index)?.trim().orEmpty()
        if (packageName.isEmpty()) {
          continue
        }

        if (isPackageInstalled(packageManager, packageName)) {
          installedPackages.pushString(packageName)
        }
      }

      promise.resolve(installedPackages)
    } catch (error: Throwable) {
      promise.reject("FITNESS_APP_DETECTOR_ERROR", error)
    }
  }

  private fun isPackageInstalled(
    packageManager: PackageManager,
    packageName: String
  ): Boolean {
    return try {
      packageManager.getPackageInfo(packageName, 0)
      true
    } catch (_: PackageManager.NameNotFoundException) {
      false
    }
  }
}
