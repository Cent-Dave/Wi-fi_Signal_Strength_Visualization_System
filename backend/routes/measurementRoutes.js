const express = require('express');
const router = express.Router();
const measurementController = require('../controllers/measurementController');
const authMiddleware = require('../middleware/authMiddleware');

// All measurement endpoints are protected by JWT authentication
router.use(authMiddleware);

// POST /api/measurements - Create measurement (from Android app or client)
router.post('/', measurementController.createMeasurement);

// GET /api/measurements - List all measurements for authenticated user
router.get('/', measurementController.getMeasurements);

// GET /api/measurements/:id - Get single measurement by ID
router.get('/:id', measurementController.getMeasurementById);

// PUT /api/measurements/:id - Update measurement (grid location / RSSI)
router.put('/:id', measurementController.updateMeasurement);

// DELETE /api/measurements - Clear all measurements for authenticated user (Reset Heatmap)
router.delete('/', measurementController.clearMeasurements);

// POST /api/measurements/clear - Alternative route to clear all measurements
router.post('/clear', measurementController.clearMeasurements);

// DELETE /api/measurements/:id - Delete single measurement
router.delete('/:id', measurementController.deleteMeasurement);

module.exports = router;

