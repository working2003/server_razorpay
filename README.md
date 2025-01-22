# Razorpay Server Integration

This is the backend server implementation for Razorpay payment integration.

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
- Copy `.env.example` to `.env`
- Update the following variables in `.env`:
  - `RAZORPAY_KEY_ID`: Your Razorpay API Key ID
  - `RAZORPAY_KEY_SECRET`: Your Razorpay API Key Secret
  - `PORT`: Server port (default: 5000)

3. Start the server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### 1. Create Order
- **URL**: `/create-order`
- **Method**: POST
- **Body**:
  ```json
  {
    "amount": 1000,
    "currency": "INR"
  }
  ```

### 2. Verify Payment
- **URL**: `/verify-payment`
- **Method**: POST
- **Body**:
  ```json
  {
    "razorpay_order_id": "order_id",
    "razorpay_payment_id": "payment_id",
    "razorpay_signature": "signature"
  }
  ```

### 3. Get Payment Details
- **URL**: `/payment/:paymentId`
- **Method**: GET

## Security
- Always keep your Razorpay API keys secure
- Never commit `.env` file to version control
- Use HTTPS in production
- Implement rate limiting for production use
