const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wifi_signal_mapper',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
  dateStrings: true
});

/**
 * Initializes database and creates tables if they do not exist
 */
async function initDatabase() {
  try {
    // First, test or create database using a direct connection without DB selected
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT, 10) || 3306
    });

    const dbName = process.env.DB_NAME || 'wifi_signal_mapper';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.end();

    // Now test pool connection and create tables if not present
    const testConn = await pool.getConnection();
    console.log(`[Database] Connected to MySQL database "${dbName}" successfully.`);

    // 1. Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Users (
        userId INT(11) NOT NULL AUTO_INCREMENT,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Measurements Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Measurements (
        measurementId INT(11) NOT NULL AUTO_INCREMENT,
        userId INT(11) NOT NULL,
        signalStrength INT(11) NOT NULL,
        measurementPoint VARCHAR(100) NOT NULL,
        measurementDate DATE NOT NULL,
        measurementTime TIME NOT NULL,
        PRIMARY KEY (measurementId),
        FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Reports Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Reports (
        reportId INT(11) NOT NULL AUTO_INCREMENT,
        userId INT(11) NOT NULL,
        reportTitle VARCHAR(100) NOT NULL,
        reportSummary TEXT,
        generatedDate DATE NOT NULL,
        generatedTime TIME NOT NULL,
        PRIMARY KEY (reportId),
        FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    testConn.release();
    console.log('[Database] Tables verified and ready (Users, Measurements, Reports).');
    return true;
  } catch (error) {
    console.error('[Database] Connection or initialization failed:', error.message);
    throw error;
  }
}

module.exports = {
  pool,
  initDatabase
};
