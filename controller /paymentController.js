const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID.trim(),
    key_secret: process.env.RAZORPAY_KEY_SECRET.trim()
});

logger.info('Razorpay initialized with key:', { key_id: process.env.RAZORPAY_KEY_ID });

// Create order
exports.createOrder = async (req, res) => {
    try {
        const { amount, currency = 'INR' } = req.body;
        logger.info('Creating order', { amount, currency });

        const options = {
            amount: amount * 100,
            currency,
            receipt: 'order_' + Date.now(),
        };

        const order = await razorpay.orders.create(options);
        logger.info('Order created successfully', order);
        res.json(order);
    } catch (error) {
        logger.error('Error creating order', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
};

// Verify and capture payment
exports.verifyAndCapturePayment = async (req, res) => {
    logger.info('=== Payment Verification and Capture Started ===');
    logger.debug('Request body received', req.body);
    
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount
        } = req.body;

        // Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
            const missingParams = {
                hasOrderId: !!razorpay_order_id,
                hasPaymentId: !!razorpay_payment_id,
                hasSignature: !!razorpay_signature,
                hasAmount: !!amount
            };
            logger.error('Missing required parameters', missingParams);
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        // Step 1: Verify signature
        const sign = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET.trim())
            .update(sign)
            .digest('hex');

        logger.debug('Signature verification', {
            received: razorpay_signature,
            expected: expectedSign,
            matches: razorpay_signature === expectedSign
        });

        if (razorpay_signature !== expectedSign) {
            logger.error('Signature verification failed');
            return res.status(400).json({
                success: false,
                error: 'Invalid signature'
            });
        }

        // Step 2: Fetch payment details
        logger.info('Fetching payment details', { paymentId: razorpay_payment_id });
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        logger.debug('Payment details received', payment);

        // Step 3: Check payment status
        if (payment.status === 'captured') {
            logger.info('Payment was already captured', { paymentId: razorpay_payment_id });
            return res.json({
                success: true,
                message: 'Payment already captured',
                payment
            });
        }

        if (payment.status !== 'authorized') {
            logger.error('Payment in invalid state', { status: payment.status });
            return res.status(400).json({
                success: false,
                error: `Payment in invalid state: ${payment.status}`
            });
        }

        // Step 4: Capture the payment
        logger.info('Attempting to capture payment', {
            paymentId: razorpay_payment_id,
            amount: amount,
            currency: payment.currency
        });

        const capturedPayment = await razorpay.payments.capture(
            razorpay_payment_id,
            amount,
            { currency: payment.currency }
        );

        logger.info('Payment captured successfully', capturedPayment);
        logger.info('=== Payment Verification and Capture Completed ===');

        res.json({
            success: true,
            message: 'Payment captured successfully',
            payment: capturedPayment
        });

    } catch (error) {
        logger.error('Payment Processing Error', {
            message: error.message,
            code: error.code,
            description: error.description,
            metadata: error.metadata,
            stack: error.stack
        });

        if (error.error && error.error.description) {
            return res.status(400).json({
                success: false,
                error: error.error.description
            });
        }

        if (error.code === 'BAD_REQUEST_ERROR') {
            return res.status(400).json({
                success: false,
                error: error.description || 'Invalid request parameters'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Payment processing failed',
            details: error.description || null
        });
    }
};

// Get all payments
exports.getAllPayments = async (req, res) => {
    try {
        const options = {
            from: Math.floor((Date.now() - (30 * 24 * 60 * 60 * 1000)) / 1000),
            to: Math.floor(Date.now() / 1000),
            count: 50,
            skip: 0
        };

        logger.info('Fetching all payments', options);
        const payments = await razorpay.payments.all(options);

        if (!payments) {
            throw new Error('No response from Razorpay');
        }

        logger.info('Payments fetched successfully', {
            count: payments.count,
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
        logger.error('Error fetching payments', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch payments'
        });
    }
};

// Get single payment
exports.getPayment = async (req, res) => {
    try {
        logger.info('Fetching single payment', { paymentId: req.params.paymentId });
        const payment = await razorpay.payments.fetch(req.params.paymentId);
        logger.info('Payment fetched successfully', payment);
        
        res.json({
            success: true,
            payment
        });
    } catch (error) {
        logger.error('Error fetching payment', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment details'
        });
    }
};
