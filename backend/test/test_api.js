/**
 * Automated Integration Test Suite for Wi-Fi Signal Strength Visualization System
 * Verifies:
 * 1. User Registration & duplicate email rejection
 * 2. Login & JWT authentication
 * 3. Invalid credentials rejection
 * 4. Measurement creation (valid RSSI and grid point)
 * 5. Input validation on measurement (missing RSSI, invalid values)
 * 6. Listing measurements (isolated to authenticated user)
 * 7. Measurement update (ownership verified)
 * 8. User isolation (User B cannot view, edit, or delete User A's measurements)
 * 9. Measurement deletion
 * 10. Report generation (summary computation, weak zones, tips)
 * 11. Report retrieval & isolation
 */

const { pool } = require('../config/db');

const BASE_URL = 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, data };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('====================================================');
  console.log(' Starting Automated API & Security Test Suite');
  console.log('====================================================\n');

  const timestamp = Date.now();
  const userA = {
    username: 'Alice Admin',
    email: `alice_${timestamp}@test.edu`,
    password: 'Password123!'
  };

  const userB = {
    username: 'Bob Student',
    email: `bob_${timestamp}@test.edu`,
    password: 'Password456!'
  };

  let tokenA = '';
  let tokenB = '';
  let userAId = null;
  let userBId = null;
  let measurement1Id = null;
  let report1Id = null;

  try {
    // 1. Health check
    console.log('1. Verifying API Health Endpoint:');
    const health = await request('/health');
    assert(health.status === 200 && health.data.status === 'OK', 'API server is healthy');

    // 2. User A Registration
    console.log('\n2. User A Registration:');
    const regA = await request('/auth/register', { method: 'POST', body: userA });
    assert(regA.status === 201 && regA.data.success, 'User A registered successfully');
    userAId = regA.data.userId;

    // 3. Duplicate Email Rejection
    console.log('\n3. Duplicate Email Rejection:');
    const dupReg = await request('/auth/register', { method: 'POST', body: userA });
    assert(dupReg.status === 409, 'Duplicate email registration rejected with 409 Conflict');

    // 4. User A Login
    console.log('\n4. User A Login:');
    const loginA = await request('/auth/login', {
      method: 'POST',
      body: { email: userA.email, password: userA.password }
    });
    assert(loginA.status === 200 && !!loginA.data.token, 'User A logged in and received JWT');
    tokenA = loginA.data.token;

    // 5. Invalid Password Rejection
    console.log('\n5. Invalid Password Rejection:');
    const badLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: userA.email, password: 'WrongPassword' }
    });
    assert(badLogin.status === 401, 'Login with incorrect password rejected with 401');

    // 6. User B Registration & Login
    console.log('\n6. User B Setup (for isolation testing):');
    const regB = await request('/auth/register', { method: 'POST', body: userB });
    assert(regB.status === 201, 'User B registered successfully');
    userBId = regB.data.userId;

    const loginB = await request('/auth/login', {
      method: 'POST',
      body: { email: userB.email, password: userB.password }
    });
    assert(loginB.status === 200 && !!loginB.data.token, 'User B logged in');
    tokenB = loginB.data.token;

    // 7. Measurement Creation (as from Android App)
    console.log('\n7. Measurement Creation (Simulating Android App):');
    const m1 = await request('/measurements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { signalStrength: -45, measurementPoint: 'B3' }
    });
    assert(m1.status === 201 && m1.data.measurement.signalStrength === -45, 'Measurement at B3 created with RSSI -45');
    assert(m1.data.measurement.signalStatus === 'Strong', 'Signal correctly classified as "Strong"');
    measurement1Id = m1.data.measurement.measurementId;

    // Add more measurements for User A to simulate an indoor survey
    const points = [
      { signalStrength: -52, measurementPoint: 'A1' }, // Good
      { signalStrength: -65, measurementPoint: 'C2' }, // Fair
      { signalStrength: -78, measurementPoint: 'D4' }, // Weak
      { signalStrength: -85, measurementPoint: 'E5' }  // Very Weak
    ];
    for (const p of points) {
      await request('/measurements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: p
      });
    }

    // 8. Measurement Validation (Missing RSSI or invalid point)
    console.log('\n8. Measurement Validation Tests:');
    const invalidM = await request('/measurements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { signalStrength: 'invalid', measurementPoint: 'A1' }
    });
    assert(invalidM.status === 400, 'Invalid RSSI value rejected with 400');

    // 9. List User A Measurements
    console.log('\n9. List User A Measurements:');
    const listA = await request('/measurements', {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(listA.status === 200 && listA.data.count === 5, 'User A retrieved exactly their 5 measurements');

    // 10. User Isolation Test (User B has 0 measurements initially)
    console.log('\n10. User Isolation Tests (Privacy & Ownership):');
    const listB = await request('/measurements', {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert(listB.status === 200 && listB.data.count === 0, 'User B sees 0 measurements (User A data is isolated)');

    // User B tries to view User A's measurement
    const viewOther = await request(`/measurements/${measurement1Id}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert(viewOther.status === 403, 'User B viewing User A measurement rejected with 403 Forbidden');

    // User B tries to update User A's measurement
    const editOther = await request(`/measurements/${measurement1Id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: { signalStrength: -30, measurementPoint: 'A1' }
    });
    assert(editOther.status === 403, 'User B editing User A measurement rejected with 403 Forbidden');

    // User B tries to delete User A's measurement
    const delOther = await request(`/measurements/${measurement1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert(delOther.status === 403, 'User B deleting User A measurement rejected with 403 Forbidden');

    // 11. User A Updates Their Own Measurement
    console.log('\n11. User A Updates Measurement:');
    const updateA = await request(`/measurements/${measurement1Id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { signalStrength: -48, measurementPoint: 'B4' }
    });
    assert(updateA.status === 200 && updateA.data.measurement.measurementPoint === 'B4', 'User A updated measurement point to B4');
    assert(updateA.data.measurement.signalStrength === -48, 'User A updated RSSI to -48');

    // 12. Generate Report
    console.log('\n12. Generate Wi-Fi Optimization Report:');
    const reportRes = await request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        reportTitle: 'University Lab Wi-Fi Optimization Report',
        networkName: 'Campus_Guest_5G'
      }
    });
    assert(reportRes.status === 201 && reportRes.data.success, 'Report created successfully');
    assert(reportRes.data.report.reportSummary.totalMeasurements === 5, 'Report summarized 5 measurements correctly');
    assert(reportRes.data.report.reportSummary.weakZones.length > 0, 'Report identified weak zones');
    report1Id = reportRes.data.report.reportId;

    // 13. Report Retrieval & Isolation
    console.log('\n13. Report Retrieval & Isolation:');
    const reportsA = await request('/reports', {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(reportsA.status === 200 && reportsA.data.count === 1, 'User A retrieved 1 report');

    const reportsB = await request('/reports', {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert(reportsB.status === 200 && reportsB.data.count === 0, 'User B sees 0 reports');

    const reportDetail = await request(`/reports/${report1Id}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(reportDetail.status === 200 && reportDetail.data.report.measurements.length === 5, 'Report details include full measurement breakdown');

    // 14. Measurement Deletion
    console.log('\n14. User A Deletes Measurement:');
    const delA = await request(`/measurements/${measurement1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(delA.status === 200, 'User A deleted their measurement successfully');

    const verifyDel = await request(`/measurements/${measurement1Id}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(verifyDel.status === 404, 'Deleted measurement no longer exists (404)');

    console.log('\n15. Clear All Measurements (Clear Heatmap / Start New Survey):');
    const clearRes = await request('/measurements', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(clearRes.status === 200, 'User A cleared all measurements successfully');
    assert(clearRes.data.success === true, 'Response indicates success');

    const listAfterClear = await request('/measurements', {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(listAfterClear.data.count === 0, 'Measurement count is now 0 after clearing');

    console.log('\n16. Historical Report Preservation (Verifying Survey Log Stays Intact):');
    const reportAfterClear = await request(`/reports/${report1Id}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(reportAfterClear.status === 200, 'Report still fetched successfully');
    assert(
      reportAfterClear.data.report.measurements && reportAfterClear.data.report.measurements.length === 5,
      'Report permanently preserved all 5 survey measurements in Survey Measurement Log even after clearing heatmap'
    );

    console.log('\n====================================================');
    console.log('  🎉 ALL AUTOMATED INTEGRATION TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    process.exit(1);
  } finally {
    // Teardown: Clean up temporary test users so they never linger in the database
    try {
      const testIds = [userAId, userBId].filter(Boolean);
      if (testIds.length > 0) {
        await pool.query('DELETE FROM Users WHERE userId IN (?)', [testIds]);
      }
      await pool.end();
    } catch (cleanupErr) {
      // Ignore cleanup error
    }
  }
}

runTests();
