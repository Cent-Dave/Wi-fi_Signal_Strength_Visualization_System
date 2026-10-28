-- Wi-Fi Signal Strength Visualization System Database Schema
-- Database Name: wifi_signal_mapper

CREATE DATABASE IF NOT EXISTS wifi_signal_mapper;
USE wifi_signal_mapper;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS Users (
    userId INT(11) NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Measurements Table
-- Note: signalStrength stores RSSI in dBm (e.g. -45, -60, -78)
-- measurementPoint stores grid coordinates (e.g. A1, B3, E5)
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

-- 3. Reports Table
-- Note: Stores report summary information generated from Measurements
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
