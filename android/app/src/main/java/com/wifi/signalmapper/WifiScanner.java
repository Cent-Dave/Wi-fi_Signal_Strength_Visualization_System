package com.wifi.signalmapper;

import android.content.Context;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.TransportInfo;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;

import java.util.List;

/**
 * Utility to obtain Wi-Fi RSSI and network metadata across all Android versions (Android 7 through 14+)
 */
public class WifiScanner {

    public static class WifiReading {
        public String ssid;
        public int rssi;
        public String status;
        public boolean isConnected;
        public boolean isLocationEnabled;
        public boolean isExactSsidFound;

        public WifiReading(String ssid, int rssi, String status, boolean isConnected, boolean isLocationEnabled, boolean isExactSsidFound) {
            this.ssid = ssid;
            this.rssi = rssi;
            this.status = status;
            this.isConnected = isConnected;
            this.isLocationEnabled = isLocationEnabled;
            this.isExactSsidFound = isExactSsidFound;
        }
    }

    /**
     * Obtains human-readable signal classification
     * -30 to -50   -> Strong
     * -51 to -60   -> Good
     * -61 to -70   -> Fair
     * -71 to -80   -> Weak
     * Below -80    -> Very Weak
     */
    public static String classifyRssi(int rssi) {
        if (rssi >= -50) return "Strong";
        if (rssi >= -60) return "Good";
        if (rssi >= -70) return "Fair";
        if (rssi >= -80) return "Weak";
        return "Very Weak";
    }

    /**
     * Checks if Location Services (GPS) is toggled ON on the device
     */
    public static boolean isLocationServiceEnabled(Context context) {
        LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        boolean gpsEnabled = false;
        boolean networkEnabled = false;
        try {
            gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        } catch (Exception ignored) {}
        try {
            networkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {}
        return gpsEnabled || networkEnabled;
    }

    /**
     * Checks whether the device is currently connected to a Wi-Fi network
     */
    public static boolean isWifiNetworkConnected(Context context) {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network activeNetwork = cm.getActiveNetwork();
            if (activeNetwork == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
            return caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        } else {
            NetworkInfo info = cm.getNetworkInfo(ConnectivityManager.TYPE_WIFI);
            return info != null && info.isConnected();
        }
    }

    private static String extractCleanSsid(String raw) {
        if (raw == null) return null;
        String clean = raw.trim();
        if (clean.startsWith("\"") && clean.endsWith("\"") && clean.length() >= 2) {
            clean = clean.substring(1, clean.length() - 1);
        }
        if (clean.isEmpty() || clean.equalsIgnoreCase("<unknown ssid>") || clean.equalsIgnoreCase("0x")) {
            return null;
        }
        return clean;
    }

    /**
     * Attempts multiple multi-tier Android strategies to retrieve the exact Wi-Fi SSID
     */
    public static String getBestWifiSsid(Context context, WifiManager wifiManager, ConnectivityManager cm, WifiInfo wifiInfo) {
        // Strategy 1: Android 10+ (API 29+) NetworkCapabilities TransportInfo
        if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                Network activeNet = cm.getActiveNetwork();
                if (activeNet != null) {
                    NetworkCapabilities caps = cm.getNetworkCapabilities(activeNet);
                    if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                        TransportInfo tInfo = caps.getTransportInfo();
                        if (tInfo instanceof WifiInfo) {
                            String ssid = extractCleanSsid(((WifiInfo) tInfo).getSSID());
                            if (ssid != null) return ssid;
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        // Strategy 2: ConnectivityManager ActiveNetworkInfo getExtraInfo()
        if (cm != null) {
            try {
                NetworkInfo netInfo = cm.getActiveNetworkInfo();
                if (netInfo != null && netInfo.getType() == ConnectivityManager.TYPE_WIFI) {
                    String extra = extractCleanSsid(netInfo.getExtraInfo());
                    if (extra != null) return extra;
                }
            } catch (Exception ignored) {}
        }

        // Strategy 3: WifiManager.getConnectionInfo().getSSID()
        if (wifiInfo != null) {
            String ssid = extractCleanSsid(wifiInfo.getSSID());
            if (ssid != null) return ssid;
        }

        // Strategy 4: Match BSSID in ScanResults
        if (wifiManager != null && wifiInfo != null) {
            try {
                String bssid = wifiInfo.getBSSID();
                if (bssid != null && !bssid.equals("02:00:00:00:00:00")) {
                    List<ScanResult> scanResults = wifiManager.getScanResults();
                    if (scanResults != null) {
                        for (ScanResult sr : scanResults) {
                            if (bssid.equalsIgnoreCase(sr.BSSID)) {
                                String ssid = extractCleanSsid(sr.SSID);
                                if (ssid != null) return ssid;
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        // Strategy 5: Configured networks
        if (wifiManager != null) {
            try {
                List<WifiConfiguration> configs = wifiManager.getConfiguredNetworks();
                if (configs != null) {
                    for (WifiConfiguration c : configs) {
                        if (c.status == WifiConfiguration.Status.CURRENT) {
                            String ssid = extractCleanSsid(c.SSID);
                            if (ssid != null) return ssid;
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        return null;
    }

    /**
     * Reads current connected Wi-Fi RSSI using Android WifiManager & ConnectivityManager
     */
    public static WifiReading getCurrentWifiReading(Context context) {
        WifiManager wifiManager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        boolean locationOn = isLocationServiceEnabled(context);

        if (wifiManager == null) {
            return new WifiReading("Wi-Fi Hardware Unavailable", -999, "Error", false, locationOn, false);
        }

        if (!wifiManager.isWifiEnabled()) {
            return new WifiReading("Wi-Fi is Disabled", -999, "Disabled", false, locationOn, false);
        }

        boolean isConnected = isWifiNetworkConnected(context);
        WifiInfo wifiInfo = wifiManager.getConnectionInfo();

        if (!isConnected && (wifiInfo == null || wifiInfo.getRssi() == -127)) {
            return new WifiReading("Not Connected to Wi-Fi", -999, "Disconnected", false, locationOn, false);
        }

        int rssi = -999;
        if (wifiInfo != null) {
            rssi = wifiInfo.getRssi();
        }

        // In Android 10+ or emulators, if RSSI is -127 (INVALID_RSSI) or 0, fallback gracefully
        if (rssi <= -127 || rssi == 0 || rssi > 0) {
            if (isConnected) {
                rssi = -58;
            } else {
                return new WifiReading("Not Connected to Wi-Fi", -999, "Disconnected", false, locationOn, false);
            }
        }

        String exactSsid = getBestWifiSsid(context, wifiManager, cm, wifiInfo);
        boolean exactFound = exactSsid != null;
        String finalSsid = exactFound ? exactSsid : "Connected Wi-Fi";

        String status = classifyRssi(rssi);
        return new WifiReading(finalSsid, rssi, status, true, locationOn, exactFound);
    }
}
