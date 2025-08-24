const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Customer = require('../models/Customer');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Grievance = require('../models/Grievance');

const { auth, authorize } = require('../middleware/auth');
const { 
  customerProfileValidation, 
  bookingValidation, 
  reviewValidation, 
  grievanceValidation,
  searchValidation,
  validateObjectId 
} = require('../middleware/validation');
const { profileImageUpload, reviewImageUpload } = require('../utils/upload');
const { sendBookingConfirmationEmail } = require('../utils/email');
const logger = require('../utils/logger');

// Apply auth and customer role to all routes
router.use(auth);
router.use(authorize('customer'));

// @route   GET /api/customer/profile
// @desc    Get customer profile
// @access  Private (Customer)
router.get('/profile', async (req, res) => {
  try {
    const customer = await Customer.findOne({ userId: req.user._id }).populate('userId', 'email isVerified createdAt');
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    res.json({
      success: true,
      data: customer
    });

  } catch (error) {
    logger.error('Get customer profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching customer profile'
    });
  }
});

// @route   PUT /api/customer/profile
// @desc    Update customer profile
// @access  Private (Customer)
router.put('/profile', customerProfileValidation, async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { userId: req.user._id },
      { ...req.body },
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: customer
    });

  } catch (error) {
    logger.error('Update customer profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating customer profile'
    });
  }
});

// @route   POST /api/customer/profile/image
// @desc    Upload customer profile image
// @access  Private (Customer)
router.post('/profile/image', profileImageUpload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const customer = await Customer.findOneAndUpdate(
      { userId: req.user._id },
      { profileImage: req.file.path },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        profileImage: req.file.path
      }
    });

  } catch (error) {
    logger.error('Upload profile image error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading profile image'
    });
  }
});

// @route   GET /api/customer/hotels/search
// @desc    Search hotels with filters
// @access  Private (Customer)
router.get('/hotels/search', searchValidation, async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radius = 10,
      checkIn,
      checkOut,
      guests = 1,
      rooms = 1,
      minPrice,
      maxPrice,
      amenities,
      rating,
      sortBy = 'rating',
      page = 1,
      limit = 10
    } = req.query;

    let query = {
      isActive: true,
      isVerified: true
    };

    // Location-based search
    if (latitude && longitude) {
      query['address.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseFloat(radius) * 1000 // Convert km to meters
        }
      };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query['priceRange.min'] = {};
      if (minPrice) query['priceRange.min'].$gte = parseFloat(minPrice);
      if (maxPrice) query['priceRange.max'].$lte = parseFloat(maxPrice);
    }

    // Amenities filter
    if (amenities) {
      const amenitiesArray = amenities.split(',');
      query.amenities = { $in: amenitiesArray };
    }

    // Rating filter
    if (rating) {
      query['rating.average'] = { $gte: parseFloat(rating) };
    }

    // Sorting options
    let sortOptions = {};
    switch (sortBy) {
      case 'price_low':
        sortOptions = { 'priceRange.min': 1 };
        break;
      case 'price_high':
        sortOptions = { 'priceRange.min': -1 };
        break;
      case 'rating':
        sortOptions = { 'rating.average': -1, 'rating.totalReviews': -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      default:
        sortOptions = { 'rating.average': -1 };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get hotels
    const hotels = await Hotel.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-verificationDocuments');

    // Get total count for pagination
    const total = await Hotel.countDocuments(query);

    // If dates are provided, check room availability
    let hotelsWithAvailability = hotels;
    if (checkIn && checkOut && rooms && guests) {
      hotelsWithAvailability = await Promise.all(
        hotels.map(async (hotel) => {
          const availableRooms = await Room.find({
            hotelId: hotel._id,
            isActive: true,
            'capacity.adults': { $gte: parseInt(guests) }
          });

          // Check availability for each room type
          const roomsWithAvailability = await Promise.all(
            availableRooms.map(async (room) => {
              const bookedRooms = await Booking.aggregate([
                {
                  $match: {
                    roomId: room._id,
                    status: { $in: ['confirmed', 'pending'] },
                    $or: [
                      {
                        'bookingDetails.checkIn': {
                          $lt: new Date(checkOut),
                          $gte: new Date(checkIn)
                        }
                      },
                      {
                        'bookingDetails.checkOut': {
                          $gt: new Date(checkIn),
                          $lte: new Date(checkOut)
                        }
                      }
                    ]
                  }
                },
                {
                  $group: {
                    _id: null,
                    totalBooked: { $sum: '$bookingDetails.numberOfRooms' }
                  }
                }
              ]);

              const bookedCount = bookedRooms[0]?.totalBooked || 0;
              const availableCount = room.totalRooms - bookedCount;

              return {
                ...room.toObject(),
                availableRooms: Math.max(0, availableCount)
              };
            })
          );

          return {
            ...hotel.toObject(),
            availableRooms: roomsWithAvailability.filter(room => room.availableRooms > 0)
          };
        })
      );

      // Filter out hotels with no available rooms
      hotelsWithAvailability = hotelsWithAvailability.filter(
        hotel => hotel.availableRooms && hotel.availableRooms.length > 0
      );
    }

    res.json({
      success: true,
      data: {
        hotels: hotelsWithAvailability,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalHotels: total,
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        },
        filters: {
          location: latitude && longitude ? { latitude, longitude, radius } : null,
          priceRange: { min: minPrice, max: maxPrice },
          amenities: amenities ? amenities.split(',') : [],
          rating,
          dates: checkIn && checkOut ? { checkIn, checkOut } : null,
          guests: parseInt(guests),
          rooms: parseInt(rooms)
        }
      }
    });

  } catch (error) {
    logger.error('Hotel search error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during hotel search'
    });
  }
});

// @route   GET /api/customer/hotels/:id
// @desc    Get hotel details
// @access  Private (Customer)
router.get('/hotels/:id', validateObjectId, async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id)
      .select('-verificationDocuments')
      .populate('userId', 'email createdAt');

    if (!hotel || !hotel.isActive || !hotel.isVerified) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }

    // Get hotel rooms
    const rooms = await Room.find({
      hotelId: hotel._id,
      isActive: true
    });

    // Get recent reviews
    const reviews = await Review.find({
      hotelId: hotel._id,
      isApproved: true
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('customerId', 'firstName lastName')
      .select('-customerId.userId');

    res.json({
      success: true,
      data: {
        hotel,
        rooms,
        reviews
      }
    });

  } catch (error) {
    logger.error('Get hotel details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching hotel details'
    });
  }
});

// @route   GET /api/customer/rooms/availability
// @desc    Check room availability
// @access  Private (Customer)
router.get('/rooms/availability', async (req, res) => {
  try {
    const { hotelId, roomId, checkIn, checkOut, rooms = 1 } = req.query;

    if (!hotelId || !checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: 'Hotel ID, check-in date, and check-out date are required'
      });
    }

    let query = { hotelId, isActive: true };
    if (roomId) {
      query._id = roomId;
    }

    const availableRooms = await Room.find(query);

    const roomsWithAvailability = await Promise.all(
      availableRooms.map(async (room) => {
        // Get bookings for this room in the date range
        const bookedRooms = await Booking.aggregate([
          {
            $match: {
              roomId: room._id,
              status: { $in: ['confirmed', 'pending'] },
              $or: [
                {
                  'bookingDetails.checkIn': {
                    $lt: new Date(checkOut),
                    $gte: new Date(checkIn)
                  }
                },
                {
                  'bookingDetails.checkOut': {
                    $gt: new Date(checkIn),
                    $lte: new Date(checkOut)
                  }
                }
              ]
            }
          },
          {
            $group: {
              _id: null,
              totalBooked: { $sum: '$bookingDetails.numberOfRooms' }
            }
          }
        ]);

        const bookedCount = bookedRooms[0]?.totalBooked || 0;
        const availableCount = Math.max(0, room.totalRooms - bookedCount);

        return {
          ...room.toObject(),
          availableRooms: availableCount,
          isAvailable: availableCount >= parseInt(rooms)
        };
      })
    );

    res.json({
      success: true,
      data: roomsWithAvailability
    });

  } catch (error) {
    logger.error('Check room availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error checking room availability'
    });
  }
});

// @route   POST /api/customer/bookings
// @desc    Create a new booking
// @access  Private (Customer)
router.post('/bookings', bookingValidation, async (req, res) => {
  try {
    // Get customer profile
    const customer = await Customer.findOne({ userId: req.user._id });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    // Verify room exists and is available
    const room = await Room.findById(req.body.roomId);
    if (!room || !room.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Room not found or not available'
      });
    }

    // Check room availability
    const { checkIn, checkOut, numberOfRooms } = req.body.bookingDetails;
    const bookedRooms = await Booking.aggregate([
      {
        $match: {
          roomId: room._id,
          status: { $in: ['confirmed', 'pending'] },
          $or: [
            {
              'bookingDetails.checkIn': {
                $lt: new Date(checkOut),
                $gte: new Date(checkIn)
              }
            },
            {
              'bookingDetails.checkOut': {
                $gt: new Date(checkIn),
                $lte: new Date(checkOut)
              }
            }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalBooked: { $sum: '$bookingDetails.numberOfRooms' }
        }
      }
    ]);

    const bookedCount = bookedRooms[0]?.totalBooked || 0;
    const availableCount = room.totalRooms - bookedCount;

    if (availableCount < numberOfRooms) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableCount} rooms available for selected dates`
      });
    }

    // Calculate pricing
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    const roomPrice = room.pricing.basePrice * nights * numberOfRooms;
    const taxes = roomPrice * (room.pricing.taxes / 100);
    const serviceFee = room.pricing.serviceFee || 0;
    const totalAmount = roomPrice + taxes + serviceFee;

    // Create booking
    const booking = new Booking({
      customerId: customer._id,
      hotelId: room.hotelId,
      roomId: room._id,
      bookingDetails: req.body.bookingDetails,
      guestDetails: req.body.guestDetails,
      contactDetails: req.body.contactDetails,
      pricing: {
        roomPrice,
        taxes,
        serviceFee,
        totalAmount,
        currency: room.pricing.currency
      },
      specialRequests: req.body.specialRequests
    });

    await booking.save();

    // Populate booking with hotel and room details
    await booking.populate([
      { path: 'hotelId', select: 'name address contactInfo' },
      { path: 'roomId', select: 'roomType name' }
    ]);

    // Send confirmation email
    try {
      const bookingDetails = {
        bookingReference: booking.bookingReference,
        hotelName: booking.hotelId.name,
        checkIn: booking.bookingDetails.checkIn,
        checkOut: booking.bookingDetails.checkOut,
        guests: booking.bookingDetails.guests,
        numberOfRooms: booking.bookingDetails.numberOfRooms,
        totalAmount: booking.pricing.totalAmount
      };

      await sendBookingConfirmationEmail(
        req.body.contactDetails.email,
        `${customer.firstName} ${customer.lastName}`,
        bookingDetails
      );
    } catch (emailError) {
      logger.error('Failed to send booking confirmation email:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    });

  } catch (error) {
    logger.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating booking'
    });
  }
});

// @route   GET /api/customer/bookings
// @desc    Get customer bookings
// @access  Private (Customer)
router.get('/bookings', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    // Get customer profile
    const customer = await Customer.findOne({ userId: req.user._id });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    let query = { customerId: customer._id };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('hotelId', 'name address images contactInfo')
      .populate('roomId', 'roomType name images');

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
    logger.error('Get customer bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bookings'
    });
  }
});

// @route   GET /api/customer/bookings/:id
// @desc    Get booking details
// @access  Private (Customer)
router.get('/bookings/:id', validateObjectId, async (req, res) => {
  try {
    const customer = await Customer.findOne({ userId: req.user._id });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    const booking = await Booking.findOne({
      _id: req.params.id,
      customerId: customer._id
    })
      .populate('hotelId', 'name address images contactInfo amenities')
      .populate('roomId', 'roomType name description images amenities');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.json({
      success: true,
      data: booking
    });

  } catch (error) {
    logger.error('Get booking details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching booking details'
    });
  }
});

// @route   PUT /api/customer/bookings/:id/cancel
// @desc    Cancel a booking
// @access  Private (Customer)
router.put('/bookings/:id/cancel', validateObjectId, async (req, res) => {
  try {
    const customer = await Customer.findOne({ userId: req.user._id });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    const booking = await Booking.findOne({
      _id: req.params.id,
      customerId: customer._id
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking can be cancelled
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Booking cannot be cancelled'
      });
    }

    // Check cancellation policy (24 hours before check-in)
    const checkInDate = new Date(booking.bookingDetails.checkIn);
    const now = new Date();
    const timeDiff = checkInDate.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);

    let refundAmount = 0;
    if (hoursDiff > 24) {
      refundAmount = booking.pricing.totalAmount * 0.8; // 80% refund
    } else if (hoursDiff > 12) {
      refundAmount = booking.pricing.totalAmount * 0.5; // 50% refund
    }

    // Update booking
    booking.status = 'cancelled';
    booking.cancellation = {
      isCancelled: true,
      cancelledAt: new Date(),
      cancelledBy: 'customer',
      reason: req.body.reason || 'Cancelled by customer',
      refundAmount,
      refundStatus: refundAmount > 0 ? 'pending' : 'not_applicable'
    };

    await booking.save();

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking,
        refundAmount,
        refundPolicy: hoursDiff > 24 ? '80% refund' : hoursDiff > 12 ? '50% refund' : 'No refund'
      }
    });

  } catch (error) {
    logger.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error cancelling booking'
    });
  }
});

module.exports = router;
