package com.nivora.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {
    
    private static final String CURRENT_VERSION = "1.0.0";
    private static final String VERSIONS_URL = "https://task-manager-theta-beryl-91.vercel.app/versions.json";
    
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
                    
                    webView.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, String url) {
                            if (url.contains("accounts.google.com") || 
                                url.contains("nivora-t9ov.onrender.com/api/auth/google") ||
                                url.contains("task-manager-theta-beryl-91.vercel.app/login.html")) {
                                view.loadUrl(url);
                                return true;
                            }
                            return false;
                        }
                    });
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
        
        // ✅ فحص التحديثات في الخلفية
        checkForUpdates();
    }
    
    private void checkForUpdates() {
        new Thread(() -> {
            try {
                URL url = new URL(VERSIONS_URL);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                
                BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();
                
                JSONObject json = new JSONObject(response.toString());
                JSONObject androidInfo = json.getJSONObject("android");
                String latestVersion = androidInfo.getString("version");
                String downloadUrl = androidInfo.getString("url");
                String releaseNotes = json.optString("releaseNotes", "تحديث جديد متاح");
                
                // مقارنة الإصدارات
                if (!latestVersion.equals(CURRENT_VERSION)) {
                    runOnUiThread(() -> showUpdateDialog(latestVersion, downloadUrl, releaseNotes));
                }
                
            } catch (Exception e) {
                // تجاهل أخطاء الفحص
            }
        }).start();
    }
    
    private void showUpdateDialog(String newVersion, String downloadUrl, String notes) {
        new android.app.AlertDialog.Builder(this)
            .setTitle("🔄 تحديث جديد v" + newVersion)
            .setMessage(notes + "\n\nهل تريد تحميل التحديث الآن؟")
            .setPositiveButton("تحميل", (dialog, which) -> {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl));
                startActivity(browserIntent);
            })
            .setNegativeButton("لاحقًا", null)
            .show();
    }
}