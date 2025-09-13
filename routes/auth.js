const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Hotel = require('../models/Hotel');
const { generateToken, generateResetToken } = require('../utils/jwt');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/email');
const { userRegistrationValidation, userLoginValidation } = require('../middleware/validation');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', userRegistrationValidation, async (req, res) => {
  try {
    const { email, password, role, firstName, lastName, phone, hotelName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create user
    const user = new User({
      email,
      password,
      role,
      verificationToken: crypto.randomBytes(32).toString('hex')
    });

    await user.save();

    // Create role-specific profile
    if (role === 'customer') {
      const customer = new Customer({
        userId: user._id,
        firstName,
        lastName,
        phone
      });
      await customer.save();
    } else if (role === 'hotel') {
      const hotel = new Hotel({
        userId: user._id,
        name: hotelName,
        description: 'Hotel description to be updated',
        address: {
          street: 'To be updated',
          city: 'To be updated',
          state: 'To be updated',
          country: 'To be updated',
          zipCode: 'To be updated',
          coordinates: {
            type: 'Point',
            coordinates: [0, 0]
          }
        },
        contactInfo: {
          phone,
          email
        },
        priceRange: {
          min: 0,
          max: 1000
        }
      });
      await hotel.save();
    }

    // Send welcome email
    try {
      const name = role === 'customer' ? `${firstName} ${lastName}` : hotelName;
      await sendWelcomeEmail(email, name, user.verificationToken);
    } catch (emailError) {
      logger.error('Failed to send welcome email:', emailError);
      // Don't fail registration if email fails
    }

    // Generate token
    const token = generateToken({
      id: user._id,
      role: user.role
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email.',
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified
        },
        token
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', userLoginValidation, async (req, res) => {
  try {
    const { email, password } = req.body;
    logger.info('Login attempt', { email });

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      logger.warn('Login failed - user not found', { email });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      logger.warn('Login failed - inactive account', { userId: user._id });
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated. Please contact support.'
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.warn('Login failed - bad password', { userId: user._id });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken({
      id: user._id,
      role: user.role
    });

    logger.info('Login success', { userId: user._id, role: user.role });
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          lastLogin: user.lastLogin
        },
        token
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify user email
// @access  Public
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Find user with verification token
    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    // Update user as verified
    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during email verification'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists or not
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const { resetToken, hashedToken } = generateResetToken();
    
    // Save reset token and expiry
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email
    try {
      let name = user.email;
      
      // Get user's name from profile
      if (user.role === 'customer') {
        const customer = await Customer.findOne({ userId: user._id });
        if (customer) {
          name = `${customer.firstName} ${customer.lastName}`;
        }
      } else if (user.role === 'hotel') {
        const hotel = await Hotel.findOne({ userId: user._id });
        if (hotel) {
          name = hotel.name;
        }
      }

      await sendPasswordResetEmail(email, name, resetToken);
    } catch (emailError) {
      logger.error('Failed to send password reset email:', emailError);
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email'
      });
    }

    res.json({
      success: true,
      message: 'Password reset email sent successfully'
    });

  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset request'
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset user password
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    logger.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Get user with password
    const user = await User.findById(req.user.id);
    
    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password change'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    let userData = {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
      isVerified: req.user.isVerified,
      isActive: req.user.isActive,
      lastLogin: req.user.lastLogin
    };

    // Get role-specific profile data
    if (req.user.role === 'customer') {
      const customer = await Customer.findOne({ userId: req.user._id });
      if (customer) {
        userData.profile = customer;
      }
    } else if (req.user.role === 'hotel') {
      const hotel = await Hotel.findOne({ userId: req.user._id });
      if (hotel) {
        userData.profile = hotel;
      }
    }

    res.json({
      success: true,
      data: userData
    });

  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user data'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client should remove token)
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // In a real implementation, you might want to blacklist the token
    // or store it in a redis cache of invalidated tokens
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

module.exports = router;
