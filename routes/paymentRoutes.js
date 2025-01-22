const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Payment routes
router.post('/create-order', paymentController.createOrder);
router.post('/verify-payment', paymentController.verifyAndCapturePayment);
router.get('/payments', paymentController.getAllPayments);
router.get('/payments/:paymentId', paymentController.getPayment);

module.exports = router;
