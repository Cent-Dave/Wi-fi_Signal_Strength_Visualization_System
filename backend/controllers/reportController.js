const { pool } = require('../config/db');
const { getSignalStatus } = require('./measurementController');

/**
 * Generate practical indoor Wi-Fi optimization recommendations
 */
function generateOptimizationTips(weakPoints, avgRssi, qualityCounts, total) {
  const tips = [];

  if (weakPoints.length === 0 && avgRssi >= -60) {
    tips.push('Excellent indoor Wi-Fi coverage detected across all measured grid points.');
    tips.push('Maintain current Access Point (AP) positioning and transmit power settings.');
  } else {
    if (weakPoints.length > 0) {
      tips.push(`Identified ${weakPoints.length} low-signal zone(s) at grid point(s): ${weakPoints.join(', ')}.`);
      tips.push('Consider repositioning the Wi-Fi Access Point closer to the center of the indoor floor plan to minimize attenuation from internal walls.');
      tips.push('If walls or structural obstacles cannot be moved, deploy a Wi-Fi mesh node or range extender adjacent to grid locations ' + weakPoints.slice(0, 2).join(' and ') + '.');
    }
    if (avgRssi < -68) {
      tips.push('Overall average signal is below recommended thresholds for high-bandwidth streaming or video conferencing (-67 dBm).');
      tips.push('Check router channel interference and switch to an uncrowded 5GHz channel (or channels 1, 6, 11 on 2.4GHz).');
    }
    const poorRatio = ((qualityCounts.weak + qualityCounts.veryWeak) / total) * 100;
    if (poorRatio > 35) {
      tips.push(`Over ${Math.round(poorRatio)}% of measured points have substandard signal. Upgrading to a high-gain antenna or dual-band Wi-Fi 6 router is strongly recommended.`);
    }
  }

  return tips;
}

/**
 * Generate a new report based on user's measurements
 * POST /api/reports
 */
async function generateReport(req, res) {
  try {
    const userId = req.user.userId;
    const { reportTitle, networkName } = req.body;

    // Fetch user's measurements
    const [measurements] = await pool.execute(
      `SELECT measurementId, signalStrength, measurementPoint, measurementDate, measurementTime
       FROM Measurements
       WHERE userId = ?
       ORDER BY measurementPoint ASC`,
      [userId]
    );

    if (measurements.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate report: No measurements recorded yet. Please take measurements using the Android app first.'
      });
    }

    const total = measurements.length;
    let sumRssi = 0;
    let minRecord = measurements[0];
    let maxRecord = measurements[0];

    const qualityCounts = {
      strong: 0,
      good: 0,
      fair: 0,
      weak: 0,
      veryWeak: 0
    };

    const weakPoints = [];

    measurements.forEach(m => {
      const rssi = m.signalStrength;
      sumRssi += rssi;

      if (rssi < minRecord.signalStrength) minRecord = m;
      if (rssi > maxRecord.signalStrength) maxRecord = m;

      const status = getSignalStatus(rssi);
      if (status === 'Strong') qualityCounts.strong++;
      else if (status === 'Good') qualityCounts.good++;
      else if (status === 'Fair') qualityCounts.fair++;
      else if (status === 'Weak') {
        qualityCounts.weak++;
        weakPoints.push(m.measurementPoint);
      } else {
        qualityCounts.veryWeak++;
        weakPoints.push(m.measurementPoint);
      }
    });

    const avgRssi = Math.round(sumRssi / total);
    const overallStatus = getSignalStatus(avgRssi);
    const tips = generateOptimizationTips(weakPoints, avgRssi, qualityCounts, total);

    const ssid = networkName ? networkName.trim() : 'Detected Wi-Fi Network';
    const title = reportTitle && reportTitle.trim()
      ? reportTitle.trim()
      : `Wi-Fi Signal Strength Optimization Report (${ssid})`;

    // Format immutable snapshot of survey measurements for this report
    const measurementSnapshot = measurements.map(m => ({
      measurementId: m.measurementId,
      signalStrength: m.signalStrength,
      measurementPoint: m.measurementPoint,
      signalStatus: getSignalStatus(m.signalStrength),
      measurementDate: m.measurementDate,
      measurementTime: m.measurementTime
    }));

    // Construct comprehensive report summary text
    const summaryData = {
      networkName: ssid,
      totalMeasurements: total,
      averageRssi: avgRssi,
      overallQuality: overallStatus,
      strongestPoint: { point: maxRecord.measurementPoint, rssi: maxRecord.signalStrength },
      weakestPoint: { point: minRecord.measurementPoint, rssi: minRecord.signalStrength },
      qualityDistribution: {
        strong: qualityCounts.strong,
        good: qualityCounts.good,
        fair: qualityCounts.fair,
        weak: qualityCounts.weak,
        veryWeak: qualityCounts.veryWeak
      },
      weakZones: weakPoints,
      optimizationTips: tips,
      measurements: measurementSnapshot
    };

    const summaryJson = JSON.stringify(summaryData);

    // Save into Reports table
    const [result] = await pool.execute(
      `INSERT INTO Reports (userId, reportTitle, reportSummary, generatedDate, generatedTime)
       VALUES (?, ?, ?, CURDATE(), CURTIME())`,
      [userId, title, summaryJson]
    );

    // Retrieve inserted report
    const [reportRows] = await pool.execute(
      'SELECT reportId, userId, reportTitle, reportSummary, generatedDate, generatedTime FROM Reports WHERE reportId = ?',
      [result.insertId]
    );

    const createdReport = reportRows[0];
    let parsedSummary;
    try {
      parsedSummary = JSON.parse(createdReport.reportSummary);
    } catch {
      parsedSummary = createdReport.reportSummary;
    }

    return res.status(201).json({
      success: true,
      message: 'Report generated successfully.',
      report: {
        ...createdReport,
        reportSummary: parsedSummary,
        measurementsCount: total
      }
    });
  } catch (error) {
    console.error('Generate report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while generating report.'
    });
  }
}

/**
 * Get all reports for the authenticated user
 * GET /api/reports
 */
async function getReports(req, res) {
  try {
    const userId = req.user.userId;

    const [rows] = await pool.execute(
      `SELECT reportId, userId, reportTitle, reportSummary, generatedDate, generatedTime
       FROM Reports
       WHERE userId = ?
       ORDER BY generatedDate DESC, generatedTime DESC, reportId DESC`,
      [userId]
    );

    const reports = rows.map(r => {
      let parsed = null;
      try {
        parsed = JSON.parse(r.reportSummary);
      } catch {
        parsed = r.reportSummary;
      }
      return {
        ...r,
        summaryDetails: parsed
      };
    });

    return res.status(200).json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    console.error('Get reports error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching reports.'
    });
  }
}

/**
 * Get report details by ID
 * GET /api/reports/:id
 */
async function getReportById(req, res) {
  try {
    const userId = req.user.userId;
    const reportId = parseInt(req.params.id, 10);

    if (isNaN(reportId)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID.' });
    }

    const [rows] = await pool.execute(
      'SELECT reportId, userId, reportTitle, reportSummary, generatedDate, generatedTime FROM Reports WHERE reportId = ?',
      [reportId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    const report = rows[0];

    // Ownership check
    if (report.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You do not have permission to access this report.'
      });
    }

    let parsedSummary;
    try {
      parsedSummary = JSON.parse(report.reportSummary);
    } catch {
      parsedSummary = report.reportSummary;
    }

    // Preserve historical survey measurement log snapshot
    let reportMeasurements = [];
    if (parsedSummary && Array.isArray(parsedSummary.measurements) && parsedSummary.measurements.length > 0) {
      reportMeasurements = parsedSummary.measurements;
    } else {
      // Fallback for older legacy reports created before snapshotting
      const [liveMeasurements] = await pool.execute(
        `SELECT measurementId, signalStrength, measurementPoint, measurementDate, measurementTime
         FROM Measurements
         WHERE userId = ?
         ORDER BY measurementPoint ASC`,
        [userId]
      );
      reportMeasurements = liveMeasurements.map(m => ({
        ...m,
        signalStatus: getSignalStatus(m.signalStrength)
      }));
    }

    return res.status(200).json({
      success: true,
      report: {
        ...report,
        reportSummary: parsedSummary,
        measurements: reportMeasurements
      }
    });
  } catch (error) {
    console.error('Get report by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching report details.'
    });
  }
}

/**
 * Delete a report
 * DELETE /api/reports/:id
 */
async function deleteReport(req, res) {
  try {
    const userId = req.user.userId;
    const reportId = parseInt(req.params.id, 10);

    if (isNaN(reportId)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID.' });
    }

    const [rows] = await pool.execute(
      'SELECT reportId, userId FROM Reports WHERE reportId = ?',
      [reportId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    if (rows[0].userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You can only delete your own reports.'
      });
    }

    await pool.execute('DELETE FROM Reports WHERE reportId = ? AND userId = ?', [reportId, userId]);

    return res.status(200).json({
      success: true,
      message: 'Report deleted successfully.',
      reportId
    });
  } catch (error) {
    console.error('Delete report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while deleting report.'
    });
  }
}

module.exports = {
  generateReport,
  getReports,
  getReportById,
  deleteReport
};
