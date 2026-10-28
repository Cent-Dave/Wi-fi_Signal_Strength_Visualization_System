const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

/**
 * Register a new user
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const { username, email, password } = req.body;

    // Basic validation
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, message: 'Username is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const trimmedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    // Check if email already exists
    const [existing] = await pool.execute('SELECT userId FROM Users WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const [result] = await pool.execute(
      'INSERT INTO Users (username, email, password, createdAt) VALUES (?, ?, ?, NOW())',
      [trimmedUsername, normalizedEmail, hashedPassword]
    );

    return res.status(201).json({
      success: true,
      message: 'User registered successfully. You can now log in.',
      userId: result.insertId,
      username: trimmedUsername,
      email: normalizedEmail
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during registration.'
    });
  }
}

/**
 * Log in an existing user
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query user
    const [rows] = await pool.execute(
      'SELECT userId, username, email, password, createdAt FROM Users WHERE email = ?',
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = rows[0];

    // Verify password with bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Sign JWT
    const secret = process.env.JWT_SECRET || 'wifi_signal_mapper_super_secure_jwt_secret_2026_final_year_project';
    const token = jwt.sign(
      {
        userId: user.userId,
        username: user.username,
        email: user.email
      },
      secret,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during login.'
    });
  }
}

/**
 * Logout
 * POST /api/auth/logout
 */
function logout(req, res) {
  // Client discards stored JWT token
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
}

/**
 * Get current user profile and overview
 * GET /api/auth/profile
 */
async function getProfile(req, res) {
  try {
    const userId = req.user.userId;

    const [userRows] = await pool.execute(
      'SELECT userId, username, email, createdAt FROM Users WHERE userId = ?',
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Count measurements and reports for this user
    const [measurementCount] = await pool.execute(
      'SELECT COUNT(*) as totalMeasurements, AVG(signalStrength) as avgRssi FROM Measurements WHERE userId = ?',
      [userId]
    );

    const [reportCount] = await pool.execute(
      'SELECT COUNT(*) as totalReports FROM Reports WHERE userId = ?',
      [userId]
    );

    const user = userRows[0];
    const stats = measurementCount[0];
    const reports = reportCount[0];

    return res.status(200).json({
      success: true,
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        totalMeasurements: stats.totalMeasurements || 0,
        averageRssi: stats.avgRssi !== null ? Math.round(stats.avgRssi) : null,
        totalReports: reports.totalReports || 0
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error fetching user profile.'
    });
  }
}

module.exports = {
  register,
  login,
  logout,
  getProfile
};
