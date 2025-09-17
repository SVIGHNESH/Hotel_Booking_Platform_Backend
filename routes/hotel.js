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
    // Normalize incoming payload from frontend shape to backend schema
    const payload = { ...req.body };

    // Frontend user may send policies.checkIn / policies.checkOut or custom fields
    if (payload.policies) {
      if (payload.policies.checkIn) payload.checkInTime = payload.policies.checkIn;
      if (payload.policies.checkOut) payload.checkOutTime = payload.policies.checkOut;
      // Map additional nested policies to existing schema fields
      if (payload.policies.cancellationPolicy) {
        payload.policies.cancellation = payload.policies.cancellationPolicy;
        delete payload.policies.cancellationPolicy;
      }
      if (payload.policies.petPolicy) {
        payload.policies.pets = typeof payload.policies.petPolicy === 'string' ? payload.policies.petPolicy : 'Pets policy updated';
        delete payload.policies.petPolicy;
      }
      if (payload.policies.smokingPolicy) {
        // No direct field; ignore or extend schema later
        delete payload.policies.smokingPolicy;
      }
      // Remove unmapped keys to avoid strict mode issues
      if (payload.policies.checkIn) delete payload.policies.checkIn;
      if (payload.policies.checkOut) delete payload.policies.checkOut;
    }

    // Ensure priceRange has required fields
    if (payload.priceRange) {
      if (payload.priceRange.min == null) payload.priceRange.min = 0;
      if (payload.priceRange.max == null) payload.priceRange.max = payload.priceRange.min;
      if (!payload.priceRange.currency) payload.priceRange.currency = 'INR';
    }

    // Normalize amenities values (frontend may send variants not in enum)
    if (Array.isArray(payload.amenities)) {
      const allowed = new Set([
        'WiFi','Parking','Pool','Gym','Spa','Restaurant','Bar','Room Service','Laundry','Pet Friendly','Business Center','Conference Room','Airport Shuttle','Concierge','Air Conditioning','Heating'
      ]);
      const mapping = {
        'Free WiFi': 'WiFi',
        'Swimming Pool': 'Pool',
        'Fitness Center': 'Gym',
        'Laundry Service': 'Laundry',
        'Bar/Lounge': 'Bar',
        'Conference Room': 'Conference Room',
        'Pet Friendly': 'Pet Friendly',
        'Airport Shuttle': 'Airport Shuttle'
      };
      payload.amenities = payload.amenities
        .map(a => mapping[a] || a)
        .filter(a => allowed.has(a))
        .filter((v,i,arr) => arr.indexOf(v) === i);
    }

    // If address sent without coordinates, prevent overwriting existing coordinates with undefined
    if (payload.address && (!payload.address.coordinates || !payload.address.coordinates.coordinates)) {
      delete payload.address.coordinates; // keep existing
    }

    const hotel = await Hotel.findOneAndUpdate(
      { userId: req.user._id },
      payload,
      { new: true, runValidators: true }
    );

    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Hotel profile not found' });
    }

    res.json({ success: true, message: 'Hotel profile updated successfully', data: hotel });
  } catch (error) {
    logger.error('Update hotel profile error:', error);
    res.status(500).json({ success: false, message: 'Server error updating hotel profile' });
  }
});

// @route   GET /api/hotel/bookings
// @desc    Get hotel bookings
// @access  Private (Hotel)
// Helper: map backend status (snake_case) to frontend (kebab-case)
const mapStatusForFrontend = (status) => {
  const mapping = {
    'checked_in': 'checked-in',
    'checked_out': 'checked-out',
    'no_show': 'no-show'
  };
  return mapping[status] || status; // pending, confirmed, rejected, cancelled, completed unchanged (or mapped directly)
};

// Helper: normalize status coming from frontend to backend format
const normalizeStatusFromFrontend = (status) => {
  const mapping = {
    'checked-in': 'checked_in',
    'checked-out': 'checked_out',
    'no-show': 'no_show'
  };
  return mapping[status] || status;
};

router.get('/bookings', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;

    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Hotel profile not found' });
    }

    let query = { hotelId: hotel._id };
    if (status) {
      query.status = normalizeStatusFromFrontend(status);
    }
    if (startDate && endDate) {
      query['bookingDetails.checkIn'] = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: 'customerId',
        select: 'firstName lastName phone userId',
        populate: { path: 'userId', select: 'email' }
      })
      .populate('roomId', 'roomType name');

    const total = await Booking.countDocuments(query);

    // Transform bookings into frontend-friendly structure
    const transformed = bookings.map(b => {
      // derived guest breakdown (preserve structure expected by older frontend code)
      const guestsObj = {
        adults: b.bookingDetails?.guests?.adults || 0,
        children: b.bookingDetails?.guests?.children || 0,
        infants: b.bookingDetails?.guests?.infants || 0
      };

      const totalGuests = guestsObj.adults + guestsObj.children + guestsObj.infants;

      const transformedBooking = {
        // new / canonical fields
        id: b._id.toString(),
        bookingNumber: b.bookingReference,
        bookingDate: b.createdAt,
        checkIn: b.bookingDetails?.checkIn,
        checkOut: b.bookingDetails?.checkOut,
        checkInDate: b.bookingDetails?.checkIn, // calendar compatibility
        checkOutDate: b.bookingDetails?.checkOut,
        nights: b.bookingDetails?.totalNights,
        status: mapStatusForFrontend(b.status),
        totalAmount: b.pricing?.totalAmount,
        amountPaid: b.pricing?.totalAmount, // assuming paid fully when stored so far
        paymentStatus: b.pricing?.paymentStatus || 'pending',
        source: 'website',
        guestsCount: totalGuests,
        customer: {
          name: `${b.customerId?.firstName || ''} ${b.customerId?.lastName || ''}`.trim(),
          email: b.customerId?.userId?.email || 'n/a',
          phone: b.customerId?.phone
        },
        room: {
          number: b.roomId?.name || 'N/A',
          type: b.roomId?.roomType || 'N/A'
        },
        roomId: b.roomId?._id?.toString(),
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        // preserve full booking object for clients that expect it
        raw: b
      };

      // Backward-compatible (legacy) fields that older frontend pages expect
      transformedBooking._id = b._id; // original ObjectId (helpful for some UI code)
      transformedBooking.bookingId = b.bookingReference;
      transformedBooking.customerName = transformedBooking.customer.name || '';
      transformedBooking.customerEmail = transformedBooking.customer.email || '';
      transformedBooking.customerPhone = transformedBooking.customer.phone || '';
      transformedBooking.roomNumber = transformedBooking.room.number;
      transformedBooking.roomType = transformedBooking.room.type;
      transformedBooking.guests = guestsObj;
      transformedBooking.bookingSource = transformedBooking.source;
      transformedBooking.specialRequests = b.specialRequests || '';
      transformedBooking.totalAmount = transformedBooking.totalAmount || 0;
      transformedBooking.amountPaid = transformedBooking.amountPaid || 0;

      return transformedBooking;
    });

    res.json({
      success: true,
      data: {
        bookings: transformed,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalBookings: total,
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      },
      // Backward compatibility for existing frontend code using data.bookings OR top-level bookings
      bookings: transformed
    });
  } catch (error) {
    logger.error('Get hotel bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching bookings' });
  }
});

// Booking action handlers to align with frontend endpoints
const validActionStatusMap = {
  confirm: 'confirmed',
  'check-in': 'checked_in',
  'check-out': 'checked_out'
};

router.post('/bookings/:id/:action', requireHotelVerification, validateObjectId, async (req, res) => {
  try {
    const { action } = req.params;
    if (!Object.keys(validActionStatusMap).includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid booking action' });
    }

    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Hotel profile not found' });
    }

    const booking = await Booking.findOne({ _id: req.params.id, hotelId: hotel._id });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Basic state guardrails
    if (action === 'confirm' && booking.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending bookings can be confirmed' });
    }
    if (action === 'check-in' && !['confirmed', 'checked_in'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Booking must be confirmed before check-in' });
    }
    if (action === 'check-out' && booking.status !== 'checked_in') {
      return res.status(400).json({ success: false, message: 'Booking must be checked-in before check-out' });
    }

    booking.status = validActionStatusMap[action];
    if (action === 'confirm') booking.confirmedAt = new Date();
    if (action === 'check-in') booking.checkInDetails.actualCheckIn = new Date();
    if (action === 'check-out') booking.checkOutDetails.actualCheckOut = new Date();

    await booking.save();

    res.json({ success: true, message: `Booking ${action} successful`, status: mapStatusForFrontend(booking.status) });
  } catch (error) {
    logger.error('Booking action error:', error);
    res.status(500).json({ success: false, message: 'Server error processing booking action' });
  }
});

// Dedicated cancel endpoint matching frontend expectation
router.post('/bookings/:id/cancel', requireHotelVerification, validateObjectId, async (req, res) => {
  try {
    const { reason, refundAmount } = req.body;
    const hotel = await Hotel.findOne({ userId: req.user._id });
    if (!hotel) return res.status(404).json({ success: false, message: 'Hotel profile not found' });

    const booking = await Booking.findOne({ _id: req.params.id, hotelId: hotel._id });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Only pending or confirmed bookings can be cancelled' });
    }

    booking.status = 'cancelled';
    booking.cancellation.isCancelled = true;
    booking.cancellation.cancelledAt = new Date();
    booking.cancellation.cancelledBy = 'hotel';
    booking.cancellation.reason = reason || 'Cancelled by hotel';
    if (refundAmount !== undefined) {
      booking.cancellation.refundAmount = refundAmount;
      booking.cancellation.refundStatus = refundAmount > 0 ? 'pending' : undefined;
    }
    await booking.save();

    res.json({ success: true, message: 'Booking cancelled successfully', status: 'cancelled' });
  } catch (error) {
    logger.error('Cancel booking error:', error);
    res.status(500).json({ success: false, message: 'Server error cancelling booking' });
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

    // Normalize legacy amenity labels coming from older frontend builds
    if (Array.isArray(req.body.amenities)) {
      const amenityMap = {
        'AC': 'Air Conditioning',
        'Room Service': undefined, // not in enum; drop
        'Jacuzzi': 'Bathtub' // approximate mapping if desired
      };
      req.body.amenities = req.body.amenities
        .map(a => amenityMap[a] === undefined ? a : amenityMap[a])
        .filter(a => a) // remove any explicitly dropped values
        .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe
    }

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
router.post('/profile/images', hotelImageUpload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No images uploaded' });
    }
    const imagePaths = req.files.map(file => file.path);
    const hotel = await Hotel.findOneAndUpdate(
      { userId: req.user._id },
      { $push: { images: { $each: imagePaths } } },
      { new: true }
    );
    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Hotel profile not found' });
    }
    res.json({ success: true, message: 'Images uploaded successfully', data: { images: hotel.images } });
  } catch (error) {
    logger.error('Hotel image upload error:', error);
    res.status(500).json({ success: false, message: 'Server error uploading images' });
  }
});

module.exports = router;
