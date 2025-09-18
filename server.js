const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customer');
const hotelRoutes = require('./routes/hotel');
const adminRoutes = require('./routes/admin');

const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express()
// Enable trust proxy for environments (e.g., local dev with some proxies, future deployment behind reverse proxy)
app.set('trust proxy', 1);
// Security middleware
app.use(helmet());
// Environment flag
const isDev = (process.env.NODE_ENV || 'development') !== 'production';

// CORS: allow configured frontend plus common localhost variants
const allowedOrigins = new Set([
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
]);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // non-browser or same-origin
    if (isDev && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      if (!allowedOrigins.has(origin)) {
        logger.info('CORS auto-allow (dev localhost)', { origin });
        allowedOrigins.add(origin);
      }
      return callback(null, true);
    }
    if (allowedOrigins.has(origin)) return callback(null, true);
    logger.warn('CORS blocked origin', { origin });
    return callback(null, false);
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Prefer real IP from Express, fallback to remote address
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }
});
app.use(limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Static serving for uploaded images (local fallback / development)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/hotel', hotelRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hotel-booking-portal')
  .then(() => {
    logger.info('Connected to MongoDB');
    
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error('Database connection failed:', error);
    process.exit(1);
  });

module.exports = app;
