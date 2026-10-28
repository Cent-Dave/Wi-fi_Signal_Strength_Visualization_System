const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware
 * Protects endpoints by verifying JWT from Authorization header
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.'
    });
  }

  // Support "Bearer <token>" or raw token
  const parts = authHeader.split(' ');
  const token = parts.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : parts[0];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Malformed authorization header.'
    });
  }

  try {
    const secret = process.env.JWT_SECRET || 'wifi_signal_mapper_super_secure_jwt_secret_2026_final_year_project';
    const decoded = jwt.verify(token, secret);

    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload.'
      });
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.'
    });
  }
}

module.exports = authMiddleware;
