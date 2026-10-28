/**
 * Seed Script for University Project Defense & Demo
 * Populates realistic indoor Wi-Fi survey measurements across the 5x5 grid (A1 to E5)
 * for a demo student account:
 * Email: student@university.edu
 * Password: Project2026!
 */

const bcrypt = require('bcryptjs');
const { pool, initDatabase } = require('../config/db');

async function seed() {
  console.log('====================================================');
  console.log(' Seeding Demo Data for Project Defense');
  console.log('====================================================\n');

  try {
    await initDatabase();

    const email = 'student@university.edu';
    const username = 'Defense Demo Student';
    const rawPass = 'Project2026!';

    // 1. Create or get demo user
    let [users] = await pool.execute('SELECT userId FROM Users WHERE email = ?', [email]);
    let userId;

    if (users.length === 0) {
      const hash = await bcrypt.hash(rawPass, 10);
      const [res] = await pool.execute(
        'INSERT INTO Users (username, email, password, createdAt) VALUES (?, ?, ?, NOW())',
        [username, email, hash]
      );
      userId = res.insertId;
      console.log(`[Seed] Created demo user "${username}" (ID: ${userId})`);
    } else {
      userId = users[0].userId;
      console.log(`[Seed] Using existing demo user "${username}" (ID: ${userId})`);
    }

    // Clear previous demo measurements and reports for this user
    await pool.execute('DELETE FROM Measurements WHERE userId = ?', [userId]);
    await pool.execute('DELETE FROM Reports WHERE userId = ?', [userId]);

    // 2. Realistic indoor signal survey data
    // Assuming Access Point located at grid point A1 / B1
    const surveyPoints = [
      // Row 1 (Near Access Point - Strong signal)
      { point: 'A1', rssi: -40 },
      { point: 'B1', rssi: -44 },
      { point: 'C1', rssi: -52 },
      { point: 'D1', rssi: -62 },
      { point: 'E1', rssi: -71 },

      // Row 2 (Good to Fair)
      { point: 'A2', rssi: -46 },
      { point: 'B2', rssi: -48 },
      { point: 'C2', rssi: -58 },
      { point: 'D2', rssi: -67 },
      { point: 'E2', rssi: -76 },

      // Row 3 (Fair to Weak)
      { point: 'A3', rssi: -53 },
      { point: 'B3', rssi: -55 },
      { point: 'C3', rssi: -65 },
      { point: 'D3', rssi: -74 },
      { point: 'E3', rssi: -82 },

      // Row 4 (Weakening due to distance & obstacles)
      { point: 'A4', rssi: -60 },
      { point: 'B4', rssi: -64 },
      { point: 'C4', rssi: -73 },
      { point: 'D4', rssi: -80 },
      { point: 'E4', rssi: -86 },

      // Row 5 (Furthest corner - Dead zone)
      { point: 'A5', rssi: -68 },
      { point: 'B5', rssi: -72 },
      { point: 'C5', rssi: -81 },
      { point: 'D5', rssi: -88 },
      { point: 'E5', rssi: -92 }
    ];

    for (let i = 0; i < surveyPoints.length; i++) {
      const p = surveyPoints[i];
      // Stagger times slightly
      const minute = (10 + i) % 60;
      const timeStr = `10:${minute < 10 ? '0' + minute : minute}:00`;

      await pool.execute(
        `INSERT INTO Measurements (userId, signalStrength, measurementPoint, measurementDate, measurementTime)
         VALUES (?, ?, ?, CURDATE(), ?)`,
        [userId, p.rssi, p.point, timeStr]
      );
    }
    console.log(`[Seed] Inserted ${surveyPoints.length} indoor grid measurements across A1 to E5.`);

    // 3. Generate initial report
    const summaryData = {
      networkName: 'Campus_ComputerLab_5G',
      totalMeasurements: surveyPoints.length,
      averageRssi: -65,
      overallQuality: 'Fair',
      strongestPoint: { point: 'A1', rssi: -40 },
      weakestPoint: { point: 'E5', rssi: -92 },
      qualityDistribution: {
        strong: 4,
        good: 4,
        fair: 7,
        weak: 5,
        veryWeak: 5
      },
      weakZones: ['E3', 'D4', 'E4', 'C5', 'D5', 'E5'],
      optimizationTips: [
        'Identified 6 low-signal zone(s) at grid points in the eastern section: E3, D4, E4, C5, D5, E5.',
        'Consider repositioning the Wi-Fi Access Point from corner A1 towards central coordinates C3 to achieve symmetrical coverage.',
        'Deploy a secondary 5GHz Wi-Fi mesh node adjacent to grid location D4 to eliminate the dead zones in rows 4 and 5.'
      ],
      measurements: surveyPoints.map((p, idx) => {
        let status = 'Strong';
        if (p.rssi < -80) status = 'Very Weak';
        else if (p.rssi < -70) status = 'Weak';
        else if (p.rssi < -60) status = 'Fair';
        else if (p.rssi < -50) status = 'Good';

        const minute = (10 + idx) % 60;
        return {
          measurementId: idx + 1,
          signalStrength: p.rssi,
          measurementPoint: p.point,
          signalStatus: status,
          measurementDate: new Date().toISOString().split('T')[0],
          measurementTime: `10:${minute < 10 ? '0' + minute : minute}:00`
        };
      })
    };

    await pool.execute(
      `INSERT INTO Reports (userId, reportTitle, reportSummary, generatedDate, generatedTime)
       VALUES (?, ?, ?, CURDATE(), CURTIME())`,
      [userId, 'Initial Campus Lab Indoor Wi-Fi Survey Report', JSON.stringify(summaryData)]
    );
    console.log('[Seed] Generated initial optimization report.');

    console.log('\n====================================================');
    console.log('  Demo Account Ready:');
    console.log('  Email:    student@university.edu');
    console.log('  Password: Project2026!');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('[Seed Error]', err);
    process.exit(1);
  }
}

seed();
