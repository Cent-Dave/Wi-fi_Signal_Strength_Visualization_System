const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const os = require('os');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const { initDatabase } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const measurementRoutes = require('./routes/measurementRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable Cross-Origin Resource Sharing
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static web application files from the "web" directory
const webDir = path.join(__dirname, '..', 'web');
app.use(express.static(webDir));

// API Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Wi-Fi Signal Strength Visualization System API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/measurements', measurementRoutes);
app.use('/api/reports', reportRoutes);

// Fallback for SPA/direct navigation to web pages
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API endpoint not found.' });
  }
  // If requesting a route that is not an asset or API, default to index.html
  res.sendFile(path.join(webDir, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An unexpected server error occurred.'
  });
});

// Helper function to resolve local LAN IPv4 address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Start Server after Database Initialization
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      const localIp = getLocalIpAddress();
      console.log('================================================================');
      console.log(' Wi-Fi Signal Strength Visualization System - Backend API');
      console.log('================================================================');
      console.log(` Web Frontend & API: http://localhost:${PORT}`);
      console.log(` Local Network IP:   http://${localIp}:${PORT}`);
      console.log(` Health Check:       http://localhost:${PORT}/api/health`);
      console.log(` Android Endpoint:   POST http://${localIp}:${PORT}/api/measurements`);
      console.log('================================================================');
    });
  } catch (error) {
    console.error('Failed to start server due to database connection error:', error.message);
    process.exit(1);
  }
}

startServer();
