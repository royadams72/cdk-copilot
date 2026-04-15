package com.ckdcopilot.ckdapp

import android.app.Activity
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class PermissionsRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val webView = WebView(this)
    webView.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: WebResourceRequest?,
      ): Boolean {
        return false
      }
    }
    webView.loadUrl("https://developer.android.com/health-and-fitness/guides/health-connect")

    setContentView(webView)
  }
}
