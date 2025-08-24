const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Hotel = require('../models/Hotel');

// Verify JWT token
const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user still exists
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Token is no longer valid.' 
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({ 
          success: false, 
          message: 'Account has been deactivated.' 
        });
      }

      req.user = user;
      next();
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token.' 
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during authentication.' 
    });
  }
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. Please authenticate.' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. ${req.user.role} role is not authorized for this action.` 
      });
    }

    next();
  };
};

// Optional auth - doesn't fail if no token provided
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    } catch (jwtError) {
      // Token is invalid, but we continue without user
    }
    
    next();
  } catch (error) {
    // Continue without authentication on error
    next();
  }
};

// Check if hotel is verified (for hotel role users)
const requireHotelVerification = async (req, res, next) => {
  try {
    // Only apply this check to hotel role users
    if (req.user.role !== 'hotel') {
      return next();
    }

    // Find the hotel associated with this user
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found. Please complete your hotel registration.'
      });
    }

    // Check if hotel is verified
    if (!hotel.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Your hotel is pending admin verification. You cannot perform this action until your hotel is approved.',
        verificationStatus: 'pending'
      });
    }

    // Check if hotel is active
    if (!hotel.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your hotel account has been deactivated. Please contact support.',
        verificationStatus: 'deactivated'
      });
    }

    // Add hotel info to request for easy access
    req.hotel = hotel;
    next();
  } catch (error) {
    console.error('Hotel verification middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during hotel verification check.'
    });
  }
};

module.exports = {
  auth,
  authorize,
  optionalAuth,
  requireHotelVerification
};
