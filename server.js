require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('./utils/logger');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        body: req.method === 'POST' ? req.body : undefined,
        query: req.query,
        params: req.params
    });
    next();
});

// Initialize Razorpay with better error handling
let razorpay;
try {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials are missing');
  }
  
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID.trim(),
    key_secret: process.env.RAZORPAY_KEY_SECRET.trim()
  });
  
  logger.info('Razorpay initialized successfully with key_id:', process.env.RAZORPAY_KEY_ID);
} catch (error) {
  logger.error('Failed to initialize Razorpay:', error);
  process.exit(1); // Exit if we can't initialize Razorpay
}

// Create order endpoint
app.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR' } = req.body;

    const options = {
      amount: amount * 100, // Convert to smallest currency unit (paise)
      currency,
      receipt: 'order_' + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    logger.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify payment endpoint
app.post('/verify-payment', async (req, res) => {
  logger.info('Received payment verification request:', req.body);
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
      logger.error('Missing required parameters');
      return res.status(400).json({
        verified: false,
        error: 'Missing required parameters'
      });
    }

    logger.info('Payment IDs:', {
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      amount: amount
    });

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest('hex');

    logger.info('Signature verification:', {
      received: razorpay_signature,
      expected: expectedSign,
      matches: razorpay_signature === expectedSign
    });

    if (razorpay_signature === expectedSign) {
      try {
        logger.info('Attempting to capture payment:', razorpay_payment_id, 'for amount:', amount);
        
        // First, fetch the payment to check its status
        const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
        logger.info('Payment details:', paymentDetails);
        
        if (paymentDetails.status === 'authorized') {
          // Only attempt to capture if payment is in authorized state
          const payment = await razorpay.payments.capture(razorpay_payment_id, amount);
          logger.info('Payment captured successfully:', payment);
          
          res.json({
            verified: true,
            captured: true,
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
            payment_details: payment
          });
        } else if (paymentDetails.status === 'captured') {
          // Payment was already captured
          logger.info('Payment was already captured');
          res.json({
            verified: true,
            captured: true,
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
            payment_details: paymentDetails
          });
        } else {
          throw new Error(`Payment in unexpected state: ${paymentDetails.status}`);
        }
      } catch (captureError) {
        logger.error('Payment capture error:', captureError);
        res.status(500).json({
          verified: true,
          captured: false,
          error: captureError.message || 'Payment verified but capture failed'
        });
      }
    } else {
      res.status(400).json({
        verified: false,
        error: 'Invalid signature'
      });
    }
  } catch (error) {
    logger.error('Payment verification error:', error);
    res.status(500).json({
      verified: false,
      error: 'Internal server error'
    });
  }
});

// Get all payments endpoint
app.get('/payments', async (req, res) => {
  try {
    // Verify Razorpay instance
    if (!razorpay) {
      throw new Error('Razorpay is not initialized');
    }

    const options = {
      from: Math.floor((Date.now() - (30 * 24 * 60 * 60 * 1000)) / 1000),
      to: Math.floor(Date.now() / 1000),
      count: 50,
      skip: 0
    };

    logger.info('Fetching payments with options:', options);

    // Make the API call with a timeout
    const fetchPromise = razorpay.payments.all(options);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timed out')), 10000)
    );

    const payments = await Promise.race([fetchPromise, timeoutPromise]);

    if (!payments) {
      throw new Error('No response from Razorpay');
    }

    logger.info('Successfully fetched payments:', {
      count: payments.count,
      hasItems: Array.isArray(payments.items),
      itemsCount: payments.items ? payments.items.length : 0
    });

    res.json({
      success: true,
      data: {
        count: payments.count,
        items: payments.items || []
      }
    });
  } catch (error) {
    logger.error('Detailed error in fetching payments:', {
      message: error.message,
      name: error.name,
      code: error.code,
      statusCode: error.statusCode,
      error: error.error,
      stack: error.stack
    });

    // Check for specific error types
    if (error.statusCode === 401) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Razorpay credentials'
      });
    }

    if (error.message === 'Request timed out') {
      return res.status(504).json({
        success: false,
        error: 'Request to Razorpay timed out'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch payments',
      details: error.error || error.description || null
    });
  }
});

// Get single payment endpoint
app.get('/payments/:paymentId', async (req, res) => {
  try {
    const payment = await razorpay.payments.fetch(req.params.paymentId);
    res.json({
      success: true,
      payment
    });
  } catch (error) {
    logger.error('Error fetching payment:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment details' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
    logger.info('Health check requested');
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString() 
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Global error handler:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
    });
    
    res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: err.message 
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    logger.info(`Server started`, {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        time: new Date().toISOString()
    });
    
    logger.info('Available routes:', {
        routes: [
            'POST /create-order - Create a new order',
            'POST /verify-payment - Verify and capture payment',
            'GET /payments - Get all payments',
            'GET /payments/:paymentId - Get single payment',
            'GET /health - Health check'
        ]
    });
});
