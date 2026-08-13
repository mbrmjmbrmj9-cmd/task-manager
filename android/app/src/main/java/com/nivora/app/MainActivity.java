package com.nivora.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        findViewById(android.R.id.content).post(() -> {
            try {
                WebView webView = (WebView) findViewById(com.getcapacitor.android.R.id.webview);
                if (webView != null) {
                    WebSettings settings = webView.getSettings();
                    settings.setJavaScriptEnabled(true);
                    settings.setDomStorageEnabled(true);
                    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                    
                    // ✅ التقاط روابط Google OAuth داخل WebView
                    webView.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, String url) {
                            // إذا كان رابط Google OAuth، افتحه داخل WebView
                            if (url.contains("accounts.google.com") || 
                                url.contains("nivora-t9ov.onrender.com/api/auth/google") ||
                                url.contains("task-manager-theta-beryl-91.vercel.app/login.html")) {
                                view.loadUrl(url);
                                return true; // يمنع فتح المتصفح الخارجي
                            }
                            return false;
                        }
                    });
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
        
        // ✅ استقبال الـ Callback بعد المصادقة
        handleIntent(getIntent());
    }
    
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }
    
    private void handleIntent(Intent intent) {
        Uri data = intent.getData();
        if (data != null) {
            String url = data.toString();
            // إعادة تحميل الرابط داخل WebView
            runOnUiThread(() -> {
                try {
                    WebView webView = (WebView) findViewById(com.getcapacitor.android.R.id.webview);
                    if (webView != null) {
                        webView.loadUrl(url);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    }
}