package com.wifi.signalmapper;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Handles HTTP REST communication with the Node.js Express server
 */
public class ApiClient {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public interface ApiCallback {
        void onSuccess(JSONObject json);
        void onError(String errorMessage);
    }

    /**
     * Send Wi-Fi RSSI measurement to Node.js backend
     * POST /api/measurements
     */
    public void sendMeasurement(String baseUrl, String token, int rssi, String gridPoint, ApiCallback callback) {
        executor.execute(() -> {
            try {
                String cleanBase = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
                URL url = new URL(cleanBase + "/api/measurements");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "application/json");
                if (token != null && !token.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + token);
                }
                conn.setConnectTimeout(12000);
                conn.setReadTimeout(12000);
                conn.setDoOutput(true);

                JSONObject payload = new JSONObject();
                payload.put("signalStrength", rssi);
                payload.put("measurementPoint", gridPoint);

                byte[] bodyBytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bodyBytes);
                }

                int statusCode = conn.getResponseCode();
                InputStream is = (statusCode >= 200 && statusCode < 300) ? conn.getInputStream() : conn.getErrorStream();

                StringBuilder responseBuilder = new StringBuilder();
                if (is != null) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            responseBuilder.append(line);
                        }
                    }
                }

                String responseStr = responseBuilder.toString();
                JSONObject json = responseStr.isEmpty() ? new JSONObject() : new JSONObject(responseStr);

                if (statusCode >= 200 && statusCode < 300) {
                    mainHandler.post(() -> callback.onSuccess(json));
                } else {
                    String msg = json.optString("message", "Server error (Code " + statusCode + ")");
                    mainHandler.post(() -> callback.onError(msg));
                }
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : e.toString();
                mainHandler.post(() -> callback.onError("Network error: " + msg));
            }
        });
    }

    /**
     * Clear all measurements for authenticated user
     * POST /api/measurements/clear
     */
    public void clearMeasurements(String baseUrl, String token, ApiCallback callback) {
        executor.execute(() -> {
            try {
                String cleanBase = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
                URL url = new URL(cleanBase + "/api/measurements/clear");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "application/json");
                if (token != null && !token.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + token);
                }
                conn.setConnectTimeout(12000);
                conn.setReadTimeout(12000);

                int statusCode = conn.getResponseCode();
                InputStream is = (statusCode >= 200 && statusCode < 300) ? conn.getInputStream() : conn.getErrorStream();

                StringBuilder responseBuilder = new StringBuilder();
                if (is != null) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            responseBuilder.append(line);
                        }
                    }
                }

                String responseStr = responseBuilder.toString();
                JSONObject json = responseStr.isEmpty() ? new JSONObject() : new JSONObject(responseStr);

                if (statusCode >= 200 && statusCode < 300) {
                    mainHandler.post(() -> callback.onSuccess(json));
                } else {
                    String msg = json.optString("message", "Server error (Code " + statusCode + ")");
                    mainHandler.post(() -> callback.onError(msg));
                }
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : e.toString();
                mainHandler.post(() -> callback.onError("Network error: " + msg));
            }
        });
    }

    /**
     * Authenticate and get JWT token from Node.js backend
     * POST /api/auth/login
     */

    public void login(String baseUrl, String email, String password, ApiCallback callback) {
        executor.execute(() -> {
            try {
                String cleanBase = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
                URL url = new URL(cleanBase + "/api/auth/login");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "application/json");
                conn.setConnectTimeout(12000);
                conn.setReadTimeout(12000);
                conn.setDoOutput(true);

                JSONObject payload = new JSONObject();
                payload.put("email", email);
                payload.put("password", password);

                byte[] bodyBytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bodyBytes);
                }

                int statusCode = conn.getResponseCode();
                InputStream is = (statusCode >= 200 && statusCode < 300) ? conn.getInputStream() : conn.getErrorStream();

                StringBuilder responseBuilder = new StringBuilder();
                if (is != null) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            responseBuilder.append(line);
                        }
                    }
                }

                String responseStr = responseBuilder.toString();
                JSONObject json = responseStr.isEmpty() ? new JSONObject() : new JSONObject(responseStr);

                if (statusCode >= 200 && statusCode < 300) {
                    mainHandler.post(() -> callback.onSuccess(json));
                } else {
                    String msg = json.optString("message", "Login failed (Code " + statusCode + ")");
                    mainHandler.post(() -> callback.onError(msg));
                }
            } catch (Exception e) {
                mainHandler.post(() -> callback.onError("Network error: " + e.getMessage()));
            }
        });
    }
}
