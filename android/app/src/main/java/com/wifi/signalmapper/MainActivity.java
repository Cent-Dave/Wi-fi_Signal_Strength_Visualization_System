package com.wifi.signalmapper;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final int PERMISSION_REQUEST_CODE = 101;
    private static final String PREFS_NAME = "WiFiSignalMapperPrefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String KEY_AUTH_TOKEN = "auth_token";
    private static final String KEY_USERNAME = "user_name";

    private TextView tvUserAccount;
    private TextView tvWifiNetwork;
    private TextView tvWifiHint;
    private Spinner spinnerGridLocation;
    private TextView tvSignalStrength;
    private TextView tvSignalStatusBadge;
    private Button btnMeasureSave;
    private Button btnClearHeatmap;
    private TextView tvStatusMessage;
    private ImageButton btnSettings;
    private ImageButton btnLogout;
    private ImageButton btnRefreshWifi;

    private ApiClient apiClient;
    private SharedPreferences prefs;

    // Grid coordinates: A1 through E5
    private final String[] gridLocations = {
            "A1", "A2", "A3", "A4", "A5",
            "B1", "B2", "B3", "B4", "B5",
            "C1", "C2", "C3", "C4", "C5",
            "D1", "D2", "D3", "D4", "D5",
            "E1", "E2", "E3", "E4", "E5"
    };

    /**
     * BroadcastReceiver to automatically detect when the phone switches Wi-Fi networks
     */
    private final BroadcastReceiver wifiStateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            refreshWifiStatusPreview();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        apiClient = new ApiClient();
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        initViews();
        setupGridSpinner();
        checkAndRequestPermissions();
        updateUserInfoDisplay();
        refreshWifiStatusPreview();

        btnMeasureSave.setOnClickListener(v -> performMeasureAndSave());
        btnClearHeatmap.setOnClickListener(v -> confirmClearHeatmap());
        btnSettings.setOnClickListener(v -> showServerSettingsDialog());
        btnLogout.setOnClickListener(v -> confirmLogout());
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshWifiStatusPreview();

        // Register receiver to listen for real-time Wi-Fi network switches
        try {
            IntentFilter filter = new IntentFilter();
            filter.addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION);
            filter.addAction(WifiManager.WIFI_STATE_CHANGED_ACTION);
            filter.addAction(WifiManager.RSSI_CHANGED_ACTION);
            filter.addAction(ConnectivityManager.CONNECTIVITY_ACTION);
            registerReceiver(wifiStateReceiver, filter);
        } catch (Exception ignored) {}
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            unregisterReceiver(wifiStateReceiver);
        } catch (Exception ignored) {}
    }

    private void initViews() {
        tvUserAccount = findViewById(R.id.tvUserAccount);
        tvWifiNetwork = findViewById(R.id.tvWifiNetwork);
        tvWifiHint = findViewById(R.id.tvWifiHint);
        spinnerGridLocation = findViewById(R.id.spinnerGridLocation);
        tvSignalStrength = findViewById(R.id.tvSignalStrength);
        tvSignalStatusBadge = findViewById(R.id.tvSignalStatusBadge);
        btnMeasureSave = findViewById(R.id.btnMeasureSave);
        btnClearHeatmap = findViewById(R.id.btnClearHeatmap);
        tvStatusMessage = findViewById(R.id.tvStatusMessage);
        btnSettings = findViewById(R.id.btnSettings);
        btnLogout = findViewById(R.id.btnLogout);
        btnRefreshWifi = findViewById(R.id.btnRefreshWifi);

        // Instant refresh on button tap
        btnRefreshWifi.setOnClickListener(v -> {
            refreshWifiStatusPreview();
            Toast.makeText(this, "Wi-Fi refreshed: " + tvWifiNetwork.getText(), Toast.LENGTH_SHORT).show();
        });

        // Tapping the Wi-Fi name also refreshes immediately
        tvWifiNetwork.setOnClickListener(v -> {
            refreshWifiStatusPreview();
            Toast.makeText(this, "Wi-Fi refreshed: " + tvWifiNetwork.getText(), Toast.LENGTH_SHORT).show();
        });

        tvWifiHint.setOnClickListener(v -> {
            try {
                android.content.Intent intent = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception ignored) {}
        });
    }

    private void setupGridSpinner() {
        ArrayAdapter<String> adapter = new ArrayAdapter<>(
                this,
                android.R.layout.simple_spinner_item,
                gridLocations
        );
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerGridLocation.setAdapter(adapter);
    }

    /**
     * Checks runtime location permissions required by Android to read Wi-Fi RSSI
     */
    private void checkAndRequestPermissions() {
        List<String> permissions = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_WIFI_STATE) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_WIFI_STATE);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.NEARBY_WIFI_DEVICES);
            }
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                refreshWifiStatusPreview();
            } else {
                tvStatusMessage.setText("Required permission has not been granted.");
                tvStatusMessage.setTextColor(Color.parseColor("#f87171"));
            }
        }
    }

    /**
     * Updates preview of Wi-Fi network and RSSI
     */
    private void refreshWifiStatusPreview() {
        WifiScanner.WifiReading reading = WifiScanner.getCurrentWifiReading(this);
        tvWifiNetwork.setText(reading.ssid);

        if (reading.isConnected) {
            tvSignalStrength.setText(reading.rssi + " dBm");
            tvSignalStatusBadge.setText(reading.status);
            updateBadgeColor(reading.status);

            if (!reading.isExactSsidFound) {
                tvWifiHint.setVisibility(View.VISIBLE);
            } else {
                tvWifiHint.setVisibility(View.GONE);
            }
        } else {
            tvSignalStrength.setText("-- dBm");
            tvSignalStatusBadge.setText("Disconnected");
            tvSignalStatusBadge.setTextColor(Color.parseColor("#94a3b8"));
            tvWifiHint.setVisibility(View.GONE);
        }
    }

    private void updateBadgeColor(String status) {
        int color;
        switch (status) {
            case "Strong":
                color = Color.parseColor("#10b981");
                break;
            case "Good":
                color = Color.parseColor("#84cc16");
                break;
            case "Fair":
                color = Color.parseColor("#eab308");
                break;
            case "Weak":
                color = Color.parseColor("#f97316");
                break;
            default:
                color = Color.parseColor("#ef4444");
                break;
        }
        tvSignalStatusBadge.setTextColor(color);
    }

    /**
     * MAIN ACTION: MEASURE & SAVE
     */
    private void performMeasureAndSave() {
        // 1. Check Wi-Fi availability
        WifiScanner.WifiReading reading = WifiScanner.getCurrentWifiReading(this);
        if (!reading.isConnected) {
            if (!reading.isLocationEnabled) {
                tvStatusMessage.setText("Wi-Fi is not detected: Please turn ON Location (GPS) in phone quick settings.");
            } else {
                tvStatusMessage.setText("Wi-Fi is not available. Please connect to a Wi-Fi network.");
            }
            tvStatusMessage.setTextColor(Color.parseColor("#f87171"));
            return;
        }

        // 2. Automatically obtain RSSI
        int rssi = reading.rssi;
        tvSignalStrength.setText(rssi + " dBm");
        tvSignalStatusBadge.setText(reading.status);
        updateBadgeColor(reading.status);

        // 3. Obtain selected grid location
        String selectedGrid = (String) spinnerGridLocation.getSelectedItem();
        if (selectedGrid == null || selectedGrid.trim().isEmpty()) {
            tvStatusMessage.setText("Please select a grid location.");
            tvStatusMessage.setTextColor(Color.parseColor("#f87171"));
            return;
        }

        // 4. Verify Server URL & Authentication
        String serverUrl = prefs.getString(KEY_SERVER_URL, "http://10.0.2.2:5000");
        String token = prefs.getString(KEY_AUTH_TOKEN, "");

        if (token.isEmpty()) {
            tvStatusMessage.setText("Please log in via Settings before saving.");
            tvStatusMessage.setTextColor(Color.parseColor("#f87171"));
            showServerSettingsDialog();
            return;
        }

        btnMeasureSave.setEnabled(false);
        tvStatusMessage.setText("Sending measurement to server...");
        tvStatusMessage.setTextColor(Color.parseColor("#38bdf8"));

        // 5. Send data to Node.js backend
        apiClient.sendMeasurement(serverUrl, token, rssi, selectedGrid, new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(JSONObject json) {
                btnMeasureSave.setEnabled(true);
                tvStatusMessage.setText("Measurement saved successfully.");
                tvStatusMessage.setTextColor(Color.parseColor("#10b981"));
                Toast.makeText(MainActivity.this, "Saved " + selectedGrid + " (" + rssi + " dBm)", Toast.LENGTH_SHORT).show();
            }

            @Override
            public void onError(String errorMessage) {
                btnMeasureSave.setEnabled(true);
                tvStatusMessage.setText("Measurement could not be saved: " + errorMessage);
                tvStatusMessage.setTextColor(Color.parseColor("#f87171"));
            }
        });
    }

    private void updateUserInfoDisplay() {
        String username = prefs.getString(KEY_USERNAME, "");
        if (!username.isEmpty()) {
            tvUserAccount.setText("Logged in as: " + username);
            if (btnLogout != null) {
                btnLogout.setVisibility(View.VISIBLE);
            }
        } else {
            tvUserAccount.setText("Not logged in (Tap gear to set up)");
            if (btnLogout != null) {
                btnLogout.setVisibility(View.GONE);
            }
        }
    }

    /**
     * Shows a confirmation dialog to confirm or cancel the logout action
     */
    private void confirmLogout() {
        String token = prefs.getString(KEY_AUTH_TOKEN, "");
        if (token.isEmpty()) {
            Toast.makeText(this, "You are not currently logged in.", Toast.LENGTH_SHORT).show();
            return;
        }

        String username = prefs.getString(KEY_USERNAME, "your account");

        new AlertDialog.Builder(this)
                .setTitle("Confirm Logout")
                .setMessage("Are you sure you want to log out of " + username + "?")
                .setIcon(android.R.drawable.ic_dialog_alert)
                .setPositiveButton("Log Out", (dialog, which) -> {
                    // Clear user authentication credentials
                    prefs.edit()
                            .remove(KEY_AUTH_TOKEN)
                            .remove(KEY_USERNAME)
                            .apply();

                    updateUserInfoDisplay();
                    tvStatusMessage.setText("Logged out successfully.");
                    tvStatusMessage.setTextColor(Color.parseColor("#94a3b8"));
                    Toast.makeText(MainActivity.this, "Logged out successfully.", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", (dialog, which) -> {
                    dialog.dismiss();
                })
                .show();
    }

    /**
     * Shows confirmation dialog to clear all measurements (Reset Heatmap / Start New Survey)
     */
    private void confirmClearHeatmap() {
        String token = prefs.getString(KEY_AUTH_TOKEN, "");
        if (token.isEmpty()) {
            Toast.makeText(this, "Please log in via Settings first.", Toast.LENGTH_SHORT).show();
            showServerSettingsDialog();
            return;
        }

        new AlertDialog.Builder(this)
                .setTitle("Clear Heatmap / New Survey")
                .setMessage("Are you sure you want to clear your current heatmap measurements from the server?\n\nThis will reset the survey grid so you can record a new survey.")
                .setIcon(android.R.drawable.ic_dialog_alert)
                .setPositiveButton("Yes, Clear Heatmap", (dialog, which) -> {
                    String serverUrl = prefs.getString(KEY_SERVER_URL, "http://10.0.2.2:5000");
                    btnClearHeatmap.setEnabled(false);
                    tvStatusMessage.setText("Clearing heatmap data on server...");
                    tvStatusMessage.setTextColor(Color.parseColor("#38bdf8"));

                    apiClient.clearMeasurements(serverUrl, token, new ApiClient.ApiCallback() {
                        @Override
                        public void onSuccess(JSONObject json) {
                            btnClearHeatmap.setEnabled(true);
                            tvStatusMessage.setText("Heatmap cleared! Ready to start a new survey.");
                            tvStatusMessage.setTextColor(Color.parseColor("#10b981"));
                            Toast.makeText(MainActivity.this, "Heatmap cleared. You can start a new survey!", Toast.LENGTH_LONG).show();
                        }

                        @Override
                        public void onError(String errorMessage) {
                            btnClearHeatmap.setEnabled(true);
                            tvStatusMessage.setText("Could not clear heatmap: " + errorMessage);
                            tvStatusMessage.setTextColor(Color.parseColor("#f87171"));
                            Toast.makeText(MainActivity.this, "Error: " + errorMessage, Toast.LENGTH_SHORT).show();
                        }
                    });
                })
                .setNegativeButton("Cancel", (dialog, which) -> dialog.dismiss())
                .show();
    }

    /**
     * Settings / Connection Dialog
     */
    private void showServerSettingsDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Server & Account Setup");

        View dialogView = LayoutInflater.from(this).inflate(android.R.layout.simple_list_item_2, null);
        // Build a programmatic clean custom dialog layout
        android.widget.LinearLayout layout = new android.widget.LinearLayout(this);
        layout.setOrientation(android.widget.LinearLayout.VERTICAL);
        layout.setPadding(40, 20, 40, 20);

        TextView tvUrlLabel = new TextView(this);
        tvUrlLabel.setText("Backend Server URL:");
        tvUrlLabel.setTextColor(Color.BLACK);
        layout.addView(tvUrlLabel);

        final EditText etUrl = new EditText(this);
        etUrl.setText(prefs.getString(KEY_SERVER_URL, "http://10.156.247.108:5000"));
        layout.addView(etUrl);

        // Quick IP Presets for Emulator vs Physical Device
        android.widget.LinearLayout ipPresetsLayout = new android.widget.LinearLayout(this);
        ipPresetsLayout.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        ipPresetsLayout.setPadding(0, 8, 0, 16);

        Button btnPresetEmulator = new Button(this);
        btnPresetEmulator.setText("Emulator");
        btnPresetEmulator.setTextSize(11);
        btnPresetEmulator.setOnClickListener(v -> etUrl.setText("http://10.0.2.2:5000"));
        ipPresetsLayout.addView(btnPresetEmulator);

        Button btnPresetLan = new Button(this);
        btnPresetLan.setText("Hotspot IP (10.156.247.108)");
        btnPresetLan.setTextSize(11);
        btnPresetLan.setOnClickListener(v -> etUrl.setText("http://10.156.247.108:5000"));
        ipPresetsLayout.addView(btnPresetLan);

        layout.addView(ipPresetsLayout);

        TextView tvEmailLabel = new TextView(this);
        tvEmailLabel.setText("Account Email:");
        tvEmailLabel.setTextColor(Color.BLACK);
        layout.addView(tvEmailLabel);

        final EditText etEmail = new EditText(this);
        etEmail.setHint("user@university.edu");
        layout.addView(etEmail);

        TextView tvPassLabel = new TextView(this);
        tvPassLabel.setText("Account Password:");
        tvPassLabel.setTextColor(Color.BLACK);
        layout.addView(tvPassLabel);

        final EditText etPassword = new EditText(this);
        etPassword.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        layout.addView(etPassword);

        String currentToken = prefs.getString(KEY_AUTH_TOKEN, "");
        String currentUsername = prefs.getString(KEY_USERNAME, "");
        if (!currentToken.isEmpty()) {
            Button btnLogoutInSettings = new Button(this);
            btnLogoutInSettings.setText("Log Out (" + currentUsername + ")");
            btnLogoutInSettings.setTextColor(Color.parseColor("#ef4444"));
            btnLogoutInSettings.setBackgroundColor(Color.TRANSPARENT);
            btnLogoutInSettings.setOnClickListener(v -> {
                confirmLogout();
            });
            layout.addView(btnLogoutInSettings);
        }

        builder.setView(layout);

        builder.setPositiveButton("Save & Login", (dialog, which) -> {
            String url = etUrl.getText().toString().trim();
            String email = etEmail.getText().toString().trim();
            String pass = etPassword.getText().toString();

            if (!url.isEmpty()) {
                prefs.edit().putString(KEY_SERVER_URL, url).apply();
            }

            if (!email.isEmpty() && !pass.isEmpty()) {
                tvStatusMessage.setText("Authenticating with server...");
                apiClient.login(url, email, pass, new ApiClient.ApiCallback() {
                    @Override
                    public void onSuccess(JSONObject json) {
                        String token = json.optString("token");
                        JSONObject user = json.optJSONObject("user");
                        String username = user != null ? user.optString("username", email) : email;

                        prefs.edit()
                                .putString(KEY_AUTH_TOKEN, token)
                                .putString(KEY_USERNAME, username)
                                .apply();

                        updateUserInfoDisplay();
                        tvStatusMessage.setText("Logged in as " + username + ". Ready.");
                        tvStatusMessage.setTextColor(Color.parseColor("#10b981"));
                        Toast.makeText(MainActivity.this, "Login successful!", Toast.LENGTH_SHORT).show();
                    }

                    @Override
                    public void onError(String errorMessage) {
                        tvStatusMessage.setText("Login failed: " + errorMessage);
                        tvStatusMessage.setTextColor(Color.parseColor("#f87171"));
                        Toast.makeText(MainActivity.this, "Authentication failed.", Toast.LENGTH_LONG).show();
                    }
                });
            }
        });

        builder.setNegativeButton("Cancel", (dialog, which) -> dialog.dismiss());
        builder.show();
    }
}
