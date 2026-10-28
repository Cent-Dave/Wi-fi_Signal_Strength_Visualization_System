# Wi-Fi Signal Strength Visualization System for Indoor Wi-Fi Network Optimization

A practical, robust, and university-defense-ready final-year B.Sc. Computer Science project.

---

## 1. Project Overview & Objective

In indoor environments, Wi-Fi radio frequency (RF) propagation is significantly affected by physical obstructions (concrete walls, partitions, doors, furniture) and electromagnetic interference, leading to unexpected signal attenuation, weak coverage, and dead zones.

The **Wi-Fi Signal Strength Visualization System** provides an end-to-end practical solution for surveying, analyzing, and optimizing indoor Wi-Fi networks. The system enables:
1. **Automated RSSI Collection:** Automatically capturing Received Signal Strength Indicator (RSSI in dBm) of the connected Wi-Fi network using native Android Wi-Fi APIs.
2. **Indoor Grid Mapping:** Associating every measurement with a structured 5&times;5 indoor coordinate grid (`A1` to `E5`).
3. **Automated Timestamping:** Automatically recording the date and time of each measurement using server-side timestamps.
4. **Three-Tier Architecture:** Streaming measurements from the Android mobile device to a Node.js/Express REST server, securely storing data in a MySQL database.
5. **Data Isolation & Security:** Ensuring authenticated users (Network Administrators, Students, and Home Users) only view, manage, and report on their own survey records.
6. **Dynamic Heatmap Visualization:** Rendering interactive signal intensity distribution contours across the indoor grid in real time using **Heatmap.js** (without storing static heatmaps in the database).
7. **Comprehensive Optimization Reports:** Synthesizing coverage statistics, quality distributions, dead zones, and generating Access Point (AP) placement recommendations with one-click print and PDF export.

---

## 2. Technologies Used

| Layer | Technology | Purpose |
|---|---|---|
| **Web Frontend** | HTML5, CSS3 (Vanilla), JavaScript | Responsive, clean user interface (Dashboard, Measurements, Heatmap, Reports) |
| **Heatmap Engine** | Heatmap.js (v2.0.5) | Client-side dynamic thermal heatmap generation over indoor grid |
| **Backend API** | Node.js, Express.js | RESTful API middle-tier, validation, auto-timestamping, CORS |
| **Database** | MySQL / MariaDB (via `mysql2`) | Relational storage for Users, Measurements, and Reports |
| **Authentication** | JSON Web Tokens (JWT) & bcryptjs | Password hashing (salt rounds = 10) and stateless token authorization |
| **Android Client** | Native Android (Java, SDK 34) | Simple, single-screen RSSI measurement collection tool via `WifiManager` |
| **Networking** | `HttpURLConnection` & Fetch API | REST communication over HTTP/JSON |

---

## 3. System Architecture

```text
+-----------------------------------------------------------+
|               Native Android Application                  |
|    - Auto-reads connected Wi-Fi SSID                      |
|    - User selects Grid Location (A1–E5)                   |
|    - Auto-reads Wi-Fi RSSI (dBm) via WifiManager          |
|    - User taps ONE button: [ MEASURE & SAVE ]             |
+-----------------------------+-----------------------------+
                              |
                              | HTTP POST /api/measurements
                              | (Authorization: Bearer <token>)
                              v
+-----------------------------------------------------------+
|               Node.js + Express.js Backend                |
|    - JWT Authentication & Ownership Verification          |
|    - Input Validation & RSSI Range Verification           |
|    - Server-Side Date & Time Generation (CURDATE/CURTIME) |
+-----------------------------+-----------------------------+
                              |
                              | Parameterized SQL Queries
                              | (mysql2/promise pool)
                              v
+-----------------------------------------------------------+
|                       MySQL Database                      |
|    - Database: wifi_signal_mapper                         |
|    - Tables: Users, Measurements, Reports                 |
|    * NO Heatmaps table (dynamically generated)            |
+-----------------------------+-----------------------------+
                              ^
                              | Parameterized SQL Queries
                              | (Filtered strictly by userId)
+-----------------------------+-----------------------------+
|               Node.js + Express.js Backend                |
+-----------------------------+-----------------------------+
                              ^
                              | HTTP REST Requests
                              | (Fetch with Bearer JWT)
+-----------------------------+-----------------------------+
|               Web Application (HTML5/CSS3/JS)             |
|    - Login & Registration (with Role Selection)           |
|    - Survey Dashboard (Key Metrics & Quality Badges)      |
|    - Measurements Management (View, Edit, Delete)         |
|    - Dynamic Heatmap.js (A1–E5 normalized intensities)    |
|    - Optimization Reports (Summary, Tips & PDF Export)    |
+-----------------------------------------------------------+
```

> **CRITICAL ARCHITECTURAL RULE:**
> - Neither the Android application nor the web browser connects directly to MySQL.
> - The Android application sends measurements to the Node.js REST API.
> - No `Heatmaps` table exists in MySQL; heatmaps are dynamically rendered from stored `Measurements`.

---

## 4. Database Design

The database `wifi_signal_mapper` contains **strictly 3 tables**:

### 1. `Users` Table
Stores authenticated user accounts.
```sql
CREATE TABLE Users (
    userId INT(11) NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userId)
);
```

### 2. `Measurements` Table
Stores RSSI signal measurements taken from the Android application.
```sql
CREATE TABLE Measurements (
    measurementId INT(11) NOT NULL AUTO_INCREMENT,
    userId INT(11) NOT NULL,
    signalStrength INT(11) NOT NULL,
    measurementPoint VARCHAR(100) NOT NULL,
    measurementDate DATE NOT NULL,
    measurementTime TIME NOT NULL,
    PRIMARY KEY (measurementId),
    FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE CASCADE
);
```
- `signalStrength`: Stores negative RSSI in dBm (e.g., `-45`, `-58`, `-76`, `-88`).
- `measurementPoint`: Stores the indoor grid coordinate (e.g., `A1`, `B3`, `E5`).
- `measurementDate` and `measurementTime`: Populated automatically by the server.

### 3. `Reports` Table
Stores summaries of generated network optimization reports.
```sql
CREATE TABLE Reports (
    reportId INT(11) NOT NULL AUTO_INCREMENT,
    userId INT(11) NOT NULL,
    reportTitle VARCHAR(100) NOT NULL,
    reportSummary TEXT,
    generatedDate DATE NOT NULL,
    generatedTime TIME NOT NULL,
    PRIMARY KEY (reportId),
    FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE CASCADE
);
```

---

## 5. Indoor Grid Location System

The indoor testing environment is modeled as a 5&times;5 matrix:
```text
A1   B1   C1   D1   E1
A2   B2   C2   D2   E2
A3   B3   C3   D3   E3
A4   B4   C4   D4   E4
A5   B5   C5   D5   E5
```

### Heatmap.js Coordinate Mapping
Each grid location maps directly to a coordinate on the heatmap canvas:
- Column `A` &rarr; `x = 10%`, Column `B` &rarr; `x = 30%`, Column `C` &rarr; `x = 50%`, Column `D` &rarr; `x = 70%`, Column `E` &rarr; `x = 90%`
- Row `1` &rarr; `y = 10%`, Row `2` &rarr; `y = 30%`, Row `3` &rarr; `y = 50%`, Row `4` &rarr; `y = 70%`, Row `5` &rarr; `y = 90%`

### Negative RSSI Transformation
Heatmap.js expects positive intensity values where higher values produce stronger heat. Negative RSSI values (typically spanning -95 dBm up to -30 dBm) are calibrated into a 0–100 scale aligned with standard Wi-Fi quality tiers:

| RSSI Range (dBm) | Classification | Normalized Intensity | Heatmap Color |
|---|---|---|---|
| **-30 to -50** | **Strong** | 85 – 100 | Green (`#10b981`) |
| **-51 to -60** | **Good** | 65 – 84 | Lime (`#84cc16`) |
| **-61 to -70** | **Fair** | 45 – 64 | Yellow (`#eab308`) |
| **-71 to -80** | **Weak** | 25 – 44 | Orange (`#f97316`) |
| **Below -80** | **Very Weak / Dead Zone** | 5 – 24 | Red (`#ef4444`) |

---

## 6. Android Application Interface

The Android application is designed as an **ultra-simple single-screen tool** specifically for collecting Wi-Fi RSSI without unnecessary clutter:

```text
+--------------------------------------------+
|            Wi-Fi Signal Mapper             |
| Logged in as: student@university.edu       |
+--------------------------------------------+
|  Wi-Fi Network:                            |
|  Campus_ComputerLab_5G                     |
|                                            |
|  Grid Location:                            |
|  [ B3                      ▼ ]             |
|                                            |
|  Signal Strength:                          |
|  -52 dBm      [ GOOD ]                     |
|                                            |
|  +--------------------------------------+  |
|  |           MEASURE & SAVE             |  |
|  +--------------------------------------+  |
|                                            |
|  Status:                                   |
|  Measurement saved successfully.           |
+--------------------------------------------+
```

### Main Workflow:
1. Open the Android application.
2. The app automatically detects the connected Wi-Fi SSID and live RSSI.
3. The user selects an indoor grid location (e.g. `B3`).
4. The user taps **MEASURE & SAVE**.
5. The app automatically reads the current RSSI, transmits the reading to `POST /api/measurements` via JSON, and displays `Measurement saved successfully`.
6. Date and time are automatically recorded on the server.

---

## 7. Installation & Local Development Guide

### Prerequisites
- **Node.js**: v18 or higher (tested on Node.js v24)
- **MySQL / MariaDB**: MySQL 8.0+ or XAMPP (port 3306)
- **Web Browser**: Any modern browser (Chrome, Edge, Firefox)
- **Android Studio**: Android Studio Hedgehog / Iguana / Jellyfish (Optional for building the APK; project files are pre-configured)

---

### Step 1: Database Setup
1. Start your local MySQL service (e.g., via XAMPP Control Panel or Windows Service).
2. Open terminal and run:
   ```bash
   mysql -u root -p < database/schema.sql
   ```
   *(If using XAMPP default without password, simply run `mysql -u root < database/schema.sql`)*

---

### Step 2: Backend Setup
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `backend/.env`:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=wifi_signal_mapper
   DB_PORT=3306
   JWT_SECRET=wifi_signal_mapper_super_secure_jwt_secret_2026_final_year_project
   ```
4. Start the backend server:
   ```bash
   npm start
   ```
   The server will start listening on:
   ```text
   http://localhost:5000
   ```

---

### Step 3: Seed Demo Data (Recommended for Defense)
To immediately populate the database with realistic indoor survey measurements across all 25 grid points (`A1` to `E5`) and an initial optimization report, run:
```bash
npm run seed
```
This prepares a ready-to-use demonstration account:
- **Email:** `student@university.edu`
- **Password:** `Project2026!`

---

### Step 4: Run Automated Tests
Run the comprehensive integration test suite verifying authentication, ownership isolation, CRUD operations, and reports:
```bash
npm test
```
All 14 test suites will execute and display green checkmarks.

---

### Step 5: Access the Web Application
Open your browser and navigate to:
```text
http://localhost:5000
```
- **Landing Page:** `http://localhost:5000/index.html`
- **Login Page:** `http://localhost:5000/login.html` (has a `⚡ Fill Demo Account` button for one-click login!)
- **Dashboard:** `http://localhost:5000/dashboard.html`
- **Measurements Table:** `http://localhost:5000/measurements.html`
- **Dynamic Heatmap:** `http://localhost:5000/heatmap.html`
- **Reports & PDF Export:** `http://localhost:5000/reports.html`
- **User Profile:** `http://localhost:5000/profile.html`

---

### Step 6: Android Application Setup
1. Open **Android Studio**.
2. Select **File &rarr; Open** and browse to `FINAL YEAR PROJECT/android`.
3. Allow Gradle to sync dependencies.
4. **Networking Configuration:**
   - **Running on Android Emulator:** The default server address is `http://10.0.2.2:5000` (which refers to `localhost` on the host PC).
   - **Running on Physical Android Phone:** Connect the phone to the same Wi-Fi network as your computer, find your computer's local IP address (e.g. `ipconfig` &rarr; `192.168.1.15`), and enter `http://192.168.1.15:5000` in the app's settings dialog.
5. In the app, tap the top-right Settings gear icon, enter your account email and password, tap **Save & Login**, and begin capturing measurements!

---

## 8. REST API Reference

All protected endpoints require the HTTP header:
`Authorization: Bearer <your_jwt_token>`

### Authentication Endpoints
- `POST /api/auth/register`: Register new user (`username`, `email`, `password`).
- `POST /api/auth/login`: Authenticate and obtain JWT (`email`, `password`).
- `GET /api/auth/profile`: Get current authenticated user details and counts.
- `POST /api/auth/logout`: Invalidate client session.

### Measurement Endpoints
- `POST /api/measurements`: Save new measurement (`signalStrength`, `measurementPoint`).
- `GET /api/measurements`: Retrieve measurements belonging strictly to the authenticated user.
- `GET /api/measurements/:id`: Fetch a single measurement (ownership verified).
- `PUT /api/measurements/:id`: Edit measurement point or RSSI (ownership verified).
- `DELETE /api/measurements/:id`: Delete measurement record (ownership verified).

### Report Endpoints
- `POST /api/reports`: Analyze stored measurements and generate optimization report (`reportTitle`, `networkName`).
- `GET /api/reports`: List user's report history.
- `GET /api/reports/:id`: Get full report details with measurement breakdown.
- `DELETE /api/reports/:id`: Delete report (ownership verified).

---

## 9. 15-Minute University Project Defense Script

Use this step-by-step walkthrough during your final-year project defense:

| Step | Time | Action | Demonstration Goal |
|---|---|---|---|
| **1. Introduction** | 2 min | Open `http://localhost:5000` | State project title, objective, and explain the three-tier architecture (Android &rarr; Node.js &rarr; MySQL). |
| **2. Authentication & Data Isolation** | 2 min | Go to `login.html` &rarr; Click `⚡ Fill Demo Account` &rarr; Sign In | Show secure JWT authentication and explain that each user's records are completely isolated in MySQL. |
| **3. Mobile Measurement Collection** | 3 min | Show Android App (or emulator) &rarr; Select `C3` &rarr; Tap `MEASURE & SAVE` | Demonstrate automatic RSSI capture via `WifiManager`, automatic server timestamping, and instant success response. |
| **4. Measurements Management** | 2 min | Open `measurements.html` | Show newly synced record. Demonstrate the **Edit** modal (change RSSI or grid point) and the **Delete** confirmation modal. |
| **5. Dynamic Heatmap Visualization** | 3 min | Open `heatmap.html` | Show the 5&times;5 indoor grid. Explain negative RSSI normalization (`intensity = RSSI + 100`). Click on cells `A1` (green/strong) and `E5` (red/dead zone) to show the Inspector panel. |
| **6. Optimization Report & PDF Export** | 2 min | Open `reports.html` &rarr; Click `➕ Generate New Report` | Show computed average RSSI, identified weak zones, and automated AP placement suggestions. Click **Print / Export to PDF** to demonstrate the academic print stylesheet. |
| **7. Conclusion & Q&A** | 1 min | Show terminal running automated tests (`npm test`) | Reiterate that no static heatmaps table exists, and that Android does not connect directly to MySQL. Welcome questions from examiners. |

---

## 10. Project Structure

```text
FINAL YEAR PROJECT/
├── backend/
│   ├── config/
│   │   └── db.js                 # Reusable MySQL connection pool & auto-init
│   ├── controllers/
│   │   ├── authController.js     # Register, Login, Profile
│   │   ├── measurementController.js # Create, List, Edit, Delete measurements
│   │   └── reportController.js   # Generate, List, View, Delete reports
│   ├── middleware/
│   │   └── authMiddleware.js     # JWT Bearer token verification & isolation
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── measurementRoutes.js
│   │   └── reportRoutes.js
│   ├── test/
│   │   ├── test_api.js           # 14 automated integration & security tests
│   │   └── seed_demo.js          # Realistic 25-point indoor survey seed script
│   ├── .env                      # Local credentials (ignored by git)
│   ├── .env.example              # Configuration template
│   ├── package.json
│   └── server.js                 # Express server & static web server
│
├── web/
│   ├── css/
│   │   └── style.css             # Vanilla CSS design system & print styling
│   ├── js/
│   │   ├── api.js                # Shared client API, JWT auth, navbar, toasts
│   │   ├── dashboard.js          # Dashboard stat cards & recent log logic
│   │   ├── measurements.js       # Filter, edit modal & delete modal logic
│   │   ├── heatmap.js            # Heatmap.js grid coordinate mapping & inspector
│   │   ├── heatmap.min.js        # Offline Heatmap.js library (v2.0.5)
│   │   └── reports.js            # Report generator, modal viewer & PDF print
│   ├── index.html                # Project landing page
│   ├── login.html                # Login page with demo quick-fill
│   ├── register.html             # User registration with role selection
│   ├── dashboard.html            # Key metrics & quick actions
│   ├── measurements.html         # User measurements management
│   ├── heatmap.html              # Dynamic Heatmap.js visualizer
│   ├── reports.html              # Optimization reports & PDF export
│   └── profile.html              # Account info & statistics
│
├── android/
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/com/wifi/signalmapper/
│   │   │   │   ├── MainActivity.java    # Single-screen UI & Measure & Save flow
│   │   │   │   ├── WifiScanner.java     # WifiManager RSSI & status classifier
│   │   │   │   └── ApiClient.java       # Asynchronous HTTP REST client
│   │   │   ├── res/
│   │   │   │   ├── layout/
│   │   │   │   │   └── activity_main.xml # Clean wireframe layout
│   │   │   │   ├── values/
│   │   │   │   │   ├── colors.xml
│   │   │   │   │   ├── strings.xml
│   │   │   │   │   └── styles.xml
│   │   │   │   └── drawable/
│   │   │   └── AndroidManifest.xml      # Wi-Fi permissions & cleartext HTTP
│   │   └── build.gradle
│   ├── gradle/wrapper/
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradlew
│   └── gradlew.bat
│
├── database/
│   └── schema.sql                # SQL schema (Users, Measurements, Reports)
│
├── .gitignore
└── README.md
```
