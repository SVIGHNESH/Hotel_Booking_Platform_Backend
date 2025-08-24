const express = require('express');
const router = express.Router();

const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Review = require('../models/Review');

const { auth, authorize } = require('../middleware/auth');
const { 
  hotelProfileValidation, 
  roomValidation,
  validateObjectId 
} = require('../middleware/validation');
const { hotelImageUpload, roomImageUpload } = require('../utils/upload');
const logger = require('../utils/logger');

// Apply auth and hotel role to all routes
router.use(auth);
router.use(authorize('hotel'));

// @route   GET /api/hotel/profile
// @desc    Get hotel profile
// @access  Private (Hotel)
router.get('/profile', async (req, res) => {
  try {
    const hotel = await Hotel.findOne({ userId: req.user._id });
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    res.json({
      success: true,
      data: hotel
    });

  } catch (error) {
    logger.error('Get hotel profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching hotel profile'
    });
  }
});

// @route   PUT /api/hotel/profile
// @desc    Update hotel profile
// @access  Private (Hotel)
router.put('/profile', hotelProfileValidation, async (req, res) => {
  try {
    const hotel = await Hotel.findOneAndUpdate(
      { userId: req.user._id },
      { ...req.body },
      { new: true, runValidators: true }
    );

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Hotel profile updated successfully',
      data: hotel
    });

  } catch (error) {
    logger.error('Update hotel profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating hotel profile'
    });
  }
});

// @route   GET /api/hotel/bookings
// @desc    Get hotel bookings
// @access  Private (Hotel)
router.get('/bookings', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;

    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    let query = { hotelId: hotel._id };
    
    if (status) {
      query.status = status;
    }

    if (startDate && endDate) {
      query['bookingDetails.checkIn'] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('customerId', 'firstName lastName phone')
      .populate('roomId', 'roomType name');

    const total = await Booking.countDocuments(query);

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
    logger.error('Get hotel bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bookings'
    });
  }
});

// @route   PUT /api/hotel/bookings/:id/status
// @desc    Update booking status
// @access  Private (Hotel)
router.put('/bookings/:id/status', validateObjectId, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['confirmed', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be confirmed or rejected.'
      });
    }

    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    const booking = await Booking.findOne({
      _id: req.params.id,
      hotelId: hotel._id,
      status: 'pending'
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or already processed'
      });
    }

    booking.status = status;
    if (status === 'confirmed') {
      booking.confirmedAt = new Date();
    }

    await booking.save();

    res.json({
      success: true,
      message: `Booking ${status} successfully`,
      data: booking
    });

  } catch (error) {
    logger.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating booking status'
    });
  }
});

// TODO: Add remaining hotel routes for rooms, reviews, analytics, etc.

module.exports = router;
