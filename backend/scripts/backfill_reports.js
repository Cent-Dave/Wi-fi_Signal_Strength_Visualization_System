const { pool } = require('../config/db');

function getSignalStatus(rssi) {
  const val = Number(rssi);
  if (val >= -50) return 'Strong';
  if (val >= -60) return 'Good';
  if (val >= -70) return 'Fair';
  if (val >= -80) return 'Weak';
  return 'Very Weak';
}

async function backfill() {
  try {
    const [reports] = await pool.execute('SELECT reportId, userId, reportSummary FROM Reports');
    console.log('Total reports found:', reports.length);

    for (const r of reports) {
      let summary = {};
      try {
        summary = JSON.parse(r.reportSummary);
      } catch (e) {
        summary = {};
      }

      if (!summary.measurements || summary.measurements.length === 0) {
        const [measurements] = await pool.execute(
          'SELECT measurementId, signalStrength, measurementPoint, measurementDate, measurementTime FROM Measurements WHERE userId = ? ORDER BY measurementPoint ASC',
          [r.userId]
        );

        if (measurements.length > 0) {
          summary.measurements = measurements.map(m => ({
            measurementId: m.measurementId,
            signalStrength: m.signalStrength,
            measurementPoint: m.measurementPoint,
            signalStatus: getSignalStatus(m.signalStrength),
            measurementDate: m.measurementDate,
            measurementTime: m.measurementTime
          }));

          await pool.execute(
            'UPDATE Reports SET reportSummary = ? WHERE reportId = ?',
            [JSON.stringify(summary), r.reportId]
          );
          console.log(`[Backfill] Report #${r.reportId} (User #${r.userId}) successfully saved snapshot with ${measurements.length} measurements.`);
        } else {
          console.log(`[Backfill] Report #${r.reportId} (User #${r.userId}): no live measurements to backfill.`);
        }
      } else {
        console.log(`[Backfill] Report #${r.reportId} already has ${summary.measurements.length} measurements.`);
      }
    }

    console.log('Finished backfill.');
    process.exit(0);
  } catch (err) {
    console.error('Backfill error:', err);
    process.exit(1);
  }
}

backfill();
