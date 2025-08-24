const express = require('express');
const router = express.Router();

const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Review = require('../models/Review');

const { auth, authorize, requireHotelVerification } = require('../middleware/auth');
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
router.put('/profile', requireHotelVerification, hotelProfileValidation, async (req, res) => {
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
router.put('/bookings/:id/status', requireHotelVerification, validateObjectId, async (req, res) => {
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

// TEMPORARY: Auto-verify hotel for testing
router.post('/verify-for-testing', async (req, res) => {
  try {
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    hotel.isVerified = true;
    hotel.verifiedAt = new Date();
    await hotel.save();

    res.json({
      success: true,
      message: 'Hotel verified for testing'
    });
  } catch (error) {
    logger.error('Auto-verify hotel error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/hotel/rooms
// @desc    Get hotel rooms
// @access  Private (Hotel)
router.get('/rooms', async (req, res) => {
  try {
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    const { page = 1, limit = 10, roomType, isAvailable } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { hotelId: hotel._id };
    if (roomType) query.roomType = roomType;
    if (isAvailable !== undefined) query.isAvailable = isAvailable === 'true';

    const rooms = await Room.find(query)
      .sort({ name: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Room.countDocuments(query);

    res.json({
      success: true,
      data: {
        rooms,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalRooms: total,
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get hotel rooms error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching rooms'
    });
  }
});

// @route   POST /api/hotel/rooms
// @desc    Add new room
// @access  Private (Hotel)
router.post('/rooms', requireHotelVerification, roomValidation, async (req, res) => {
  try {
    logger.info('Adding room request:', { userId: req.user._id, body: req.body });
    
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      logger.error('Hotel profile not found for user:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    logger.info('Hotel found:', { hotelId: hotel._id, name: hotel.name });

    // Check if room name already exists for this hotel
    const existingRoom = await Room.findOne({
      hotelId: hotel._id,
      name: req.body.name
    });

    if (existingRoom) {
      logger.warn('Room name already exists:', { hotelId: hotel._id, roomName: req.body.name });
      return res.status(400).json({
        success: false,
        message: 'Room name already exists for this hotel'
      });
    }

    const roomData = {
      ...req.body,
      hotelId: hotel._id
    };

    logger.info('Creating room with data:', roomData);

    const room = new Room(roomData);
    await room.save();

    logger.info('Room created successfully:', { roomId: room._id, name: room.name });

    res.status(201).json({
      success: true,
      message: 'Room added successfully',
      data: room
    });

  } catch (error) {
    logger.error('Add room error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding room',
      error: error.message
    });
  }
});

// @route   PUT /api/hotel/rooms/:id
// @desc    Update room
// @access  Private (Hotel)
router.put('/rooms/:id', requireHotelVerification, validateObjectId, roomValidation, async (req, res) => {
  try {
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    // Check if room belongs to this hotel
    const room = await Room.findOne({
      _id: req.params.id,
      hotelId: hotel._id
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if room number conflicts with another room (if room number is being changed)
    if (req.body.roomNumber && req.body.roomNumber !== room.roomNumber) {
      const existingRoom = await Room.findOne({
        hotelId: hotel._id,
        roomNumber: req.body.roomNumber,
        _id: { $ne: req.params.id }
      });

      if (existingRoom) {
        return res.status(400).json({
          success: false,
          message: 'Room number already exists for this hotel'
        });
      }
    }

    const updatedRoom = await Room.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Room updated successfully',
      data: updatedRoom
    });

  } catch (error) {
    logger.error('Update room error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating room'
    });
  }
});

// @route   DELETE /api/hotel/rooms/:id
// @desc    Delete room
// @access  Private (Hotel)
router.delete('/rooms/:id', requireHotelVerification, validateObjectId, async (req, res) => {
  try {
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    // Check if room belongs to this hotel
    const room = await Room.findOne({
      _id: req.params.id,
      hotelId: hotel._id
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if room has active bookings
    const activeBookings = await Booking.countDocuments({
      roomId: req.params.id,
      status: { $in: ['pending', 'confirmed'] },
      'bookingDetails.checkOut': { $gte: new Date() }
    });

    if (activeBookings > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete room with active bookings'
      });
    }

    await Room.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Room deleted successfully'
    });

  } catch (error) {
    logger.error('Delete room error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting room'
    });
  }
});

// @route   PUT /api/hotel/rooms/:id/availability
// @desc    Toggle room availability
// @access  Private (Hotel)
router.put('/rooms/:id/availability', requireHotelVerification, validateObjectId, async (req, res) => {
  try {
    const { isAvailable } = req.body;
    
    if (isAvailable === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Availability status is required'
      });
    }

    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    const room = await Room.findOneAndUpdate(
      { _id: req.params.id, hotelId: hotel._id },
      { isAvailable },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    res.json({
      success: true,
      message: `Room ${isAvailable ? 'activated' : 'deactivated'} successfully`,
      data: room
    });

  } catch (error) {
    logger.error('Toggle room availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating room availability'
    });
  }
});

// @route   POST /api/hotel/rooms/:id/images
// @desc    Upload room images
// @access  Private (Hotel)
router.post('/rooms/:id/images', requireHotelVerification, validateObjectId, roomImageUpload.array('images', 5), async (req, res) => {
  try {
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    const room = await Room.findOne({
      _id: req.params.id,
      hotelId: hotel._id
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images uploaded'
      });
    }

    const imagePaths = req.files.map(file => file.path);
    room.images = [...(room.images || []), ...imagePaths];
    await room.save();

    res.json({
      success: true,
      message: 'Room images uploaded successfully',
      data: {
        images: imagePaths,
        totalImages: room.images.length
      }
    });

  } catch (error) {
    logger.error('Upload room images error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading room images'
    });
  }
});

// @route   GET /api/hotel/reviews
// @desc    Get hotel reviews
// @access  Private (Hotel)
router.get('/reviews', async (req, res) => {
  try {
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    const { page = 1, limit = 10, rating } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { hotelId: hotel._id };
    if (rating) query.rating = parseInt(rating);

    const reviews = await Review.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('customerId', 'firstName lastName')
      .populate('bookingId', 'bookingDetails.checkIn bookingDetails.checkOut');

    const total = await Review.countDocuments(query);

    // Calculate rating statistics
    const ratingStats = await Review.aggregate([
      { $match: { hotelId: hotel._id } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratings: {
            $push: '$rating'
          }
        }
      },
      {
        $addFields: {
          ratingDistribution: {
            5: { $size: { $filter: { input: '$ratings', cond: { $eq: ['$$this', 5] } } } },
            4: { $size: { $filter: { input: '$ratings', cond: { $eq: ['$$this', 4] } } } },
            3: { $size: { $filter: { input: '$ratings', cond: { $eq: ['$$this', 3] } } } },
            2: { $size: { $filter: { input: '$ratings', cond: { $eq: ['$$this', 2] } } } },
            1: { $size: { $filter: { input: '$ratings', cond: { $eq: ['$$this', 1] } } } }
          }
        }
      }
    ]);

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
        },
        statistics: ratingStats[0] || {
          averageRating: 0,
          totalReviews: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        }
      }
    });

  } catch (error) {
    logger.error('Get hotel reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching reviews'
    });
  }
});

// @route   POST /api/hotel/profile/images
// @desc    Upload hotel images
// @access  Private (Hotel)
router.post('/profile/images', requireHotelVerification, hotelImageUpload.array('images', 10), async (req, res) => {
  try {
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel profile not found'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images uploaded'
      });
    }

    const imagePaths = req.files.map(file => file.path);
    hotel.images = [...(hotel.images || []), ...imagePaths];
    await hotel.save();

    res.json({
      success: true,
      message: 'Hotel images uploaded successfully',
      data: {
        images: imagePaths,
        totalImages: hotel.images.length
      }
    });

  } catch (error) {
    logger.error('Upload hotel images error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading hotel images'
    });
  }
});

module.exports = router;
