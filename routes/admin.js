const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Customer = require('../models/Customer');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Grievance = require('../models/Grievance');

const { auth, authorize } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validation');
const logger = require('../utils/logger');

// Apply auth and admin role to all routes
router.use(auth);
router.use(authorize('admin'));

// @route   GET /api/admin/dashboard
// @desc    Get dashboard statistics
// @access  Private (Admin)
router.get('/dashboard', async (req, res) => {
  try {
    const stats = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'hotel' }),
      Hotel.countDocuments({ isVerified: true }),
      Hotel.countDocuments({ isVerified: false }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'pending' }),
      Review.countDocuments(),
      Grievance.countDocuments({ status: { $ne: 'closed' } })
    ]);

    const dashboardStats = {
      totalCustomers: stats[0],
      totalHotels: stats[1],
      verifiedHotels: stats[2],
      pendingVerifications: stats[3],
      totalBookings: stats[4],
      pendingBookings: stats[5],
      totalReviews: stats[6],
      openGrievances: stats[7]
    };

    res.json({
      success: true,
      data: dashboardStats
    });

  } catch (error) {
    logger.error('Get admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching dashboard statistics'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users
// @access  Private (Admin)
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 10, role, status } = req.query;

    let query = {};
    if (role) query.role = role;
    if (status) query.isActive = status === 'active';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password');

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalUsers: total,
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching users'
    });
  }
});

// @route   PUT /api/admin/users/:id/status
// @desc    Update user status
// @access  Private (Admin)
router.put('/users/:id/status', validateObjectId, async (req, res) => {
  try {
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: user
    });

  } catch (error) {
    logger.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating user status'
    });
  }
});

// @route   GET /api/admin/hotels
// @desc    Get all hotels
// @access  Private (Admin)
router.get('/hotels', async (req, res) => {
  try {
    const { page = 1, limit = 10, verified } = req.query;

    let query = {};
    if (verified !== undefined) query.isVerified = verified === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const hotels = await Hotel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'email createdAt');

    const total = await Hotel.countDocuments(query);

    res.json({
      success: true,
      data: {
        hotels,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalHotels: total,
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get hotels error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching hotels'
    });
  }
});

// @route   PUT /api/admin/hotels/:id/verify
// @desc    Verify hotel
// @access  Private (Admin)
router.put('/hotels/:id/verify', validateObjectId, async (req, res) => {
  try {
    const { isVerified } = req.body;

    const hotel = await Hotel.findByIdAndUpdate(
      req.params.id,
      { isVerified },
      { new: true }
    );

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }

    res.json({
      success: true,
      message: `Hotel ${isVerified ? 'verified' : 'unverified'} successfully`,
      data: hotel
    });

  } catch (error) {
    logger.error('Verify hotel error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error verifying hotel'
    });
  }
});

// TODO: Add remaining admin routes for bookings, reviews, grievances, analytics

module.exports = router;
