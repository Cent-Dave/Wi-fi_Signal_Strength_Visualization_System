const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');

// All report endpoints are protected by JWT authentication
router.use(authMiddleware);

// POST /api/reports - Generate a new report from current measurements
router.post('/', reportController.generateReport);

// GET /api/reports - List all reports for authenticated user
router.get('/', reportController.getReports);

// GET /api/reports/:id - Get detailed report by ID
router.get('/:id', reportController.getReportById);

// DELETE /api/reports/:id - Delete report by ID
router.delete('/:id', reportController.deleteReport);

module.exports = router;
