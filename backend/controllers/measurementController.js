const { pool } = require('../config/db');

/**
 * Helper to compute human-readable signal status from RSSI (dBm)
 * Thresholds:
 * -30 to -50   -> Strong
 * -51 to -60   -> Good
 * -61 to -70   -> Fair
 * -71 to -80   -> Weak
 * Below -80    -> Very Weak
 */
function getSignalStatus(rssi) {
  const val = Number(rssi);
  if (val >= -50) return 'Strong';
  if (val >= -60) return 'Good';
  if (val >= -70) return 'Fair';
  if (val >= -80) return 'Weak';
  return 'Very Weak';
}

/**
 * Normalizes negative Wi-Fi RSSI into a [0, 100] intensity scale
 * calibrated to standard indoor Wi-Fi thresholds:
 * >= -50 dBm (Strong)   -> 85 to 100 (Green)
 * -51 to -60 dBm (Good) -> 65 to 84  (Lime)
 * -61 to -70 dBm (Fair) -> 45 to 64  (Yellow)
 * -71 to -80 dBm (Weak) -> 25 to 44  (Orange)
 * < -80 dBm (Very Weak) -> 5 to 24   (Red)
 */
function calculateHeatmapIntensity(rssi) {
  const val = Number(rssi);
  if (isNaN(val)) return 0;
  if (val >= -50) {
    const clamped = Math.min(-30, val);
    return Math.round(85 + ((clamped - (-50)) / 20) * 15);
  } else if (val >= -60) {
    return Math.round(65 + ((val - (-60)) / 10) * 20);
  } else if (val >= -70) {
    return Math.round(45 + ((val - (-70)) / 10) * 20);
  } else if (val >= -80) {
    return Math.round(25 + ((val - (-80)) / 10) * 20);
  } else {
    const clamped = Math.max(-95, val);
    return Math.round(Math.max(5, 25 - ((-80 - clamped) / 15) * 20));
  }
}

/**
 * Valid grid points (A1 to E5)
 */
const VALID_GRID_REGEX = /^[A-E][1-5]$/i;

/**
 * Create a new measurement (invoked primarily by Android app)
 * POST /api/measurements
 */
async function createMeasurement(req, res) {
  try {
    const userId = req.user.userId;
    const { signalStrength, measurementPoint } = req.body;

    // Validation
    if (signalStrength === undefined || signalStrength === null || signalStrength === '') {
      return res.status(400).json({
        success: false,
        message: 'Signal strength (RSSI) is required.'
      });
    }

    const rssi = parseInt(signalStrength, 10);
    if (isNaN(rssi) || rssi > 0 || rssi < -120) {
      return res.status(400).json({
        success: false,
        message: 'Signal strength must be a valid negative integer (e.g. between -120 and 0 dBm).'
      });
    }

    if (!measurementPoint || !measurementPoint.toString().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Grid location (measurementPoint) is required (e.g., A1, B3, E5).'
      });
    }

    const gridPoint = measurementPoint.toString().trim().toUpperCase();

    // Insert measurement with automatically generated server date and time
    const [result] = await pool.execute(
      `INSERT INTO Measurements (userId, signalStrength, measurementPoint, measurementDate, measurementTime)
       VALUES (?, ?, ?, CURDATE(), CURTIME())`,
      [userId, rssi, gridPoint]
    );

    // Fetch the newly created record
    const [rows] = await pool.execute(
      'SELECT measurementId, userId, signalStrength, measurementPoint, measurementDate, measurementTime FROM Measurements WHERE measurementId = ?',
      [result.insertId]
    );

    const record = rows[0];

    return res.status(201).json({
      success: true,
      message: 'Measurement saved successfully.',
      measurement: {
        ...record,
        signalStatus: getSignalStatus(record.signalStrength),
        intensity: calculateHeatmapIntensity(record.signalStrength)
      }
    });
  } catch (error) {
    console.error('Create measurement error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while saving measurement.'
    });
  }
}

/**
 * Get all measurements belonging to the authenticated user
 * GET /api/measurements
 */
async function getMeasurements(req, res) {
  try {
    const userId = req.user.userId;

    const [rows] = await pool.execute(
      `SELECT measurementId, userId, signalStrength, measurementPoint, measurementDate, measurementTime
       FROM Measurements
       WHERE userId = ?
       ORDER BY measurementDate DESC, measurementTime DESC, measurementId DESC`,
      [userId]
    );

    // Add readable signal status and intensity normalized for heatmap
    const measurements = rows.map(m => ({
      ...m,
      signalStatus: getSignalStatus(m.signalStrength),
      intensity: calculateHeatmapIntensity(m.signalStrength)
    }));

    return res.status(200).json({
      success: true,
      count: measurements.length,
      measurements
    });
  } catch (error) {
    console.error('Get measurements error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching measurements.'
    });
  }
}

/**
 * Get single measurement by ID with ownership verification
 * GET /api/measurements/:id
 */
async function getMeasurementById(req, res) {
  try {
    const userId = req.user.userId;
    const measurementId = parseInt(req.params.id, 10);

    if (isNaN(measurementId)) {
      return res.status(400).json({ success: false, message: 'Invalid measurement ID.' });
    }

    const [rows] = await pool.execute(
      'SELECT measurementId, userId, signalStrength, measurementPoint, measurementDate, measurementTime FROM Measurements WHERE measurementId = ?',
      [measurementId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Measurement not found.' });
    }

    const measurement = rows[0];

    // Ownership check
    if (measurement.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You do not have permission to view this measurement.'
      });
    }

    return res.status(200).json({
      success: true,
      measurement: {
        ...measurement,
        signalStatus: getSignalStatus(measurement.signalStrength),
        intensity: calculateHeatmapIntensity(measurement.signalStrength)
      }
    });
  } catch (error) {
    console.error('Get measurement by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching measurement.'
    });
  }
}

/**
 * Update an existing measurement (Grid location and/or RSSI)
 * PUT /api/measurements/:id
 */
async function updateMeasurement(req, res) {
  try {
    const userId = req.user.userId;
    const measurementId = parseInt(req.params.id, 10);

    if (isNaN(measurementId)) {
      return res.status(400).json({ success: false, message: 'Invalid measurement ID.' });
    }

    // Check existing record and ownership
    const [rows] = await pool.execute(
      'SELECT * FROM Measurements WHERE measurementId = ?',
      [measurementId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Measurement not found.' });
    }

    const existing = rows[0];
    if (existing.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You can only edit your own measurements.'
      });
    }

    const { signalStrength, measurementPoint } = req.body;

    // Validate if provided
    let newRssi = existing.signalStrength;
    if (signalStrength !== undefined && signalStrength !== null && signalStrength !== '') {
      const parsed = parseInt(signalStrength, 10);
      if (isNaN(parsed) || parsed > 0 || parsed < -120) {
        return res.status(400).json({
          success: false,
          message: 'Signal strength must be a valid negative integer (e.g. between -120 and 0 dBm).'
        });
      }
      newRssi = parsed;
    }

    let newGridPoint = existing.measurementPoint;
    if (measurementPoint !== undefined && measurementPoint !== null && measurementPoint.toString().trim() !== '') {
      newGridPoint = measurementPoint.toString().trim().toUpperCase();
    }

    await pool.execute(
      `UPDATE Measurements 
       SET signalStrength = ?, measurementPoint = ?
       WHERE measurementId = ? AND userId = ?`,
      [newRssi, newGridPoint, measurementId, userId]
    );

    // Fetch updated record
    const [updatedRows] = await pool.execute(
      'SELECT measurementId, userId, signalStrength, measurementPoint, measurementDate, measurementTime FROM Measurements WHERE measurementId = ?',
      [measurementId]
    );

    const updated = updatedRows[0];

    return res.status(200).json({
      success: true,
      message: 'Measurement updated successfully.',
      measurement: {
        ...updated,
        signalStatus: getSignalStatus(updated.signalStrength),
        intensity: calculateHeatmapIntensity(updated.signalStrength)
      }
    });
  } catch (error) {
    console.error('Update measurement error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating measurement.'
    });
  }
}

/**
 * Delete a measurement
 * DELETE /api/measurements/:id
 */
async function deleteMeasurement(req, res) {
  try {
    const userId = req.user.userId;
    const measurementId = parseInt(req.params.id, 10);

    if (isNaN(measurementId)) {
      return res.status(400).json({ success: false, message: 'Invalid measurement ID.' });
    }

    // Check ownership
    const [rows] = await pool.execute(
      'SELECT * FROM Measurements WHERE measurementId = ?',
      [measurementId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Measurement not found.' });
    }

    const existing = rows[0];
    if (existing.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You can only delete your own measurements.'
      });
    }

    await pool.execute(
      'DELETE FROM Measurements WHERE measurementId = ? AND userId = ?',
      [measurementId, userId]
    );

    return res.status(200).json({
      success: true,
      message: 'Measurement deleted successfully.',
      measurementId
    });
  } catch (error) {
    console.error('Delete measurement error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while deleting measurement.'
    });
  }
}

/**
 * Clear all measurements belonging to the authenticated user (Clear Heatmap / Start New Survey)
 * DELETE /api/measurements
 * POST /api/measurements/clear
 */
async function clearMeasurements(req, res) {
  try {
    const userId = req.user.userId;

    const [result] = await pool.execute(
      'DELETE FROM Measurements WHERE userId = ?',
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: 'All measurements cleared successfully. You can now start a new heatmap survey.',
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Clear measurements error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while clearing measurements.'
    });
  }
}

module.exports = {
  createMeasurement,
  getMeasurements,
  getMeasurementById,
  updateMeasurement,
  deleteMeasurement,
  clearMeasurements,
  getSignalStatus
};

