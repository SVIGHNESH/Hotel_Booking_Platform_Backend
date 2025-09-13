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

// @route   GET /api/admin/hotels/pending
// @desc    Get pending hotel verifications
// @access  Private (Admin)
router.get('/hotels/pending', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const pendingHotels = await Hotel.find({ isVerified: false })
      .populate('userId', 'email createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Hotel.countDocuments({ isVerified: false });

    res.json({
      success: true,
      data: {
        hotels: pendingHotels,
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
    logger.error('Get pending hotels error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching pending hotels'
    });
  }
});

// @route   GET /api/admin/hotels
// @desc    Get all hotels with verification status
// @access  Private (Admin)
router.get('/hotels', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {};
    if (status === 'verified') filter.isVerified = true;
    if (status === 'pending') filter.isVerified = false;

    const hotels = await Hotel.find(filter)
      .populate('userId', 'email createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Hotel.countDocuments(filter);

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

// @route   GET /api/admin/hotels/:id
// @desc    Get hotel details for verification
// @access  Private (Admin)
router.get('/hotels/:id', validateObjectId, async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id)
      .populate('userId', 'email createdAt lastLogin');

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }

    res.json({
      success: true,
      data: hotel
    });

  } catch (error) {
    logger.error('Get hotel details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching hotel details'
    });
  }
});

// @route   PUT /api/admin/hotels/:id/verify
// @desc    Verify or reject hotel
// @access  Private (Admin)
router.put('/hotels/:id/verify', validateObjectId, async (req, res) => {
  try {
    const { isVerified, rejectionReason } = req.body;

    if (isVerified === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Verification status is required'
      });
    }

    const updateData = { 
      isVerified,
      verifiedAt: isVerified ? new Date() : undefined,
      verifiedBy: req.user._id
    };

    // If rejecting, add rejection reason
    if (!isVerified && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
      updateData.rejectedAt = new Date();
    }

    const hotel = await Hotel.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('userId', 'email');

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }

    // TODO: Send email notification to hotel about verification status
    // await sendVerificationEmail(hotel.userId.email, isVerified, rejectionReason);

    res.json({
      success: true,
      message: `Hotel ${isVerified ? 'verified' : 'rejected'} successfully`,
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

// @route   PUT /api/admin/hotels/:id/status
// @desc    Activate/Deactivate hotel
// @access  Private (Admin)
router.put('/hotels/:id/status', validateObjectId, async (req, res) => {
  try {
    const { isActive } = req.body;

    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Active status is required'
      });
    }

    const hotel = await Hotel.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).populate('userId', 'email');

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }

    res.json({
      success: true,
      message: `Hotel ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: hotel
    });

  } catch (error) {
    logger.error('Update hotel status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating hotel status'
    });
  }
});

// @route   GET /api/admin/bookings
// @desc    Get all bookings for admin review
// @access  Private (Admin)
router.get('/bookings', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, hotelId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {};
    if (status) filter.status = status;
    if (hotelId) filter.hotelId = hotelId;

    const bookings = await Booking.find(filter)
      .populate('customerId', 'firstName lastName email')
      .populate('hotelId', 'name address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalBookings: total,
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get admin bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bookings'
    });
  }
});

// @route   GET /api/admin/reviews
// @desc    Get all reviews for moderation
// @access  Private (Admin)
router.get('/reviews', async (req, res) => {
  try {
    const { page = 1, limit = 10, rating } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {};
    if (rating) filter.rating = parseInt(rating);

    const reviews = await Review.find(filter)
      .populate('customerId', 'firstName lastName')
      .populate('hotelId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments(filter);

    res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalReviews: total,
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get admin reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching reviews'
    });
  }
});

// @route   GET /api/admin/grievances
// @desc    Get all grievances for resolution
// @access  Private (Admin)
router.get('/grievances', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {};
    if (status) filter.status = status;

    const grievances = await Grievance.find(filter)
      .populate('customerId', 'firstName lastName email')
      .populate('hotelId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Grievance.countDocuments(filter);

    res.json({
      success: true,
      data: {
        grievances,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalGrievances: total,
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get admin grievances error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching grievances'
    });
  }
});

// @route   PUT /api/admin/grievances/:id/status
// @desc    Update grievance status
// @access  Private (Admin)
router.put('/grievances/:id/status', validateObjectId, async (req, res) => {
  try {
    const { status, response } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const grievance = await Grievance.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        ...(response && { adminResponse: response, respondedAt: new Date() })
      },
      { new: true }
    );

    if (!grievance) {
      return res.status(404).json({
        success: false,
        message: 'Grievance not found'
      });
    }

    res.json({
      success: true,
      message: 'Grievance status updated successfully',
      data: grievance
    });

  } catch (error) {
    logger.error('Update grievance status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating grievance status'
    });
  }
});

// @route   GET /api/admin/analytics
// @desc    Get analytics data for admin dashboard
// @access  Private (Admin)
router.get('/analytics', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      totalRevenue,
      totalBookings,
      newCustomers,
      newHotels,
      avgRating
    ] = await Promise.all([
      Booking.aggregate([
        { $match: { createdAt: { $gte: startDate }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.totalAmount' } } }
      ]),
      Booking.countDocuments({ createdAt: { $gte: startDate } }),
      User.countDocuments({ role: 'customer', createdAt: { $gte: startDate } }),
      Hotel.countDocuments({ createdAt: { $gte: startDate } }),
      Review.aggregate([
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        revenue: totalRevenue[0]?.total || 0,
        bookings: totalBookings,
        newCustomers,
        newHotels,
        averageRating: avgRating[0]?.avgRating || 0,
        period
      }
    });

  } catch (error) {
    logger.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching analytics'
    });
  }
});

// TODO: Add remaining admin routes for bookings, reviews, grievances, analytics

module.exports = router;
