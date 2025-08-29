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

// QUICK ACTIONS SECTION
// @route POST /api/customer/favorites/:hotelId/toggle
// @desc  Add or remove a hotel from favorites
// @access Private (Customer)
router.post('/favorites/:hotelId/toggle', validateObjectId, async (req, res) => {
  try {
    const { hotelId } = req.params;
    const customer = await Customer.findOne({ userId: req.user._id });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer profile not found' });

    const hotel = await Hotel.findById(hotelId);
    if (!hotel || !hotel.isVerified || !hotel.isActive) {
      return res.status(404).json({ success: false, message: 'Hotel not found or unavailable' });
    }

    const index = customer.favorites.findIndex(id => id.toString() === hotelId);
    let action;
    if (index >= 0) {
      customer.favorites.splice(index, 1);
      action = 'removed';
    } else {
      customer.favorites.push(hotelId);
      action = 'added';
    }
    await customer.save();

    res.json({ success: true, message: `Favorite ${action}`, data: { favorites: customer.favorites, action } });
  } catch (error) {
    logger.error('Toggle favorite error:', error);
    res.status(500).json({ success: false, message: 'Server error toggling favorite' });
  }
});

// @route GET /api/customer/favorites
// @desc  Get favorite hotels
// @access Private (Customer)
router.get('/favorites', async (req, res) => {
  try {
    const customer = await Customer.findOne({ userId: req.user._id }).populate({
      path: 'favorites',
      match: { isVerified: true, isActive: true },
      select: 'name address images rating priceRange'
    });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer profile not found' });

    res.json({ success: true, data: customer.favorites || [] });
  } catch (error) {
    logger.error('Get favorites error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving favorites' });
  }
});

// @route POST /api/customer/bookings/:id/rebook
// @desc  Quick rebook a previous booking (same hotel + room type if still exists)
// @access Private (Customer)
router.post('/bookings/:id/rebook', validateObjectId, async (req, res) => {
  try {
    const original = await Booking.findById(req.params.id);
    if (!original || original.customerId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Original booking not found' });
    }
    // Basic rebook: create a pending booking 30 days from now for same nights
    const nights = original.bookingDetails.totalNights || 1;
    const start = new Date();
    start.setDate(start.getDate() + 30);
    const end = new Date(start);
    end.setDate(start.getDate() + nights);

    const newBooking = new Booking({
      customerId: original.customerId,
      hotelId: original.hotelId,
      roomId: original.roomId,
      bookingDetails: {
        checkIn: start,
        checkOut: end,
        guests: original.bookingDetails.guests,
        numberOfRooms: original.bookingDetails.numberOfRooms,
        totalNights: nights
      },
      guestDetails: original.guestDetails,
      contactDetails: original.contactDetails,
      pricing: {
        roomPrice: original.pricing.roomPrice,
        taxes: original.pricing.taxes,
        serviceFee: original.pricing.serviceFee,
        discount: original.pricing.discount,
        totalAmount: original.pricing.totalAmount,
        currency: original.pricing.currency,
        paymentStatus: 'pending'
      },
      status: 'pending'
    });
    await newBooking.save();
    res.status(201).json({ success: true, message: 'Rebooked successfully', data: newBooking });
  } catch (error) {
    logger.error('Rebook error:', error);
    res.status(500).json({ success: false, message: 'Server error rebooking' });
  }
});

// @route POST /api/customer/bookings/:id/cancel
// @desc  Customer cancels an upcoming booking
// @access Private (Customer)
router.post('/bookings/:id/cancel', validateObjectId, async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id).populate('customerId');
    if (!booking || booking.customerId.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Only pending or confirmed bookings can be cancelled' });
    }
    booking.status = 'cancelled';
    booking.cancellation.isCancelled = true;
    booking.cancellation.cancelledAt = new Date();
    booking.cancellation.cancelledBy = 'customer';
    booking.cancellation.reason = reason || 'Cancelled by customer';
    await booking.save();
    res.json({ success: true, message: 'Booking cancelled', data: { status: 'cancelled' } });
  } catch (error) {
    logger.error('Customer cancel booking error:', error);
    res.status(500).json({ success: false, message: 'Server error cancelling booking' });
  }
});

// @route POST /api/customer/support/ticket
// @desc  Create a support ticket (stub for future enhancement)
// @access Private (Customer)
router.post('/support/ticket', async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required' });
    }
    // For now just echo back. In future, persist to Grievance or Support collection.
    res.status(201).json({ success: true, message: 'Support request received', data: { subject, message, createdAt: new Date() } });
  } catch (error) {
    logger.error('Create support ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error creating support ticket' });
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

// @route   GET /api/customer/hotels
// @desc    Get all approved hotels
// @access  Private (Customer)
router.get('/hotels', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      location,
      minPrice,
      maxPrice,
      minRating
    } = req.query;

    const skip = (page - 1) * limit;
    const filter = { 
      isVerified: true,
      isActive: true 
    };

    // Add location filter if provided
    if (location) {
      filter.$or = [
        { 'address.city': { $regex: location, $options: 'i' } },
        { 'address.state': { $regex: location, $options: 'i' } },
        { name: { $regex: location, $options: 'i' } }
      ];
    }

    // Add price range filter (correct nested field usage)
    if (minPrice) {
      filter['priceRange.min'] = { ...(filter['priceRange.min']||{}), $gte: parseFloat(minPrice) };
    }
    if (maxPrice) {
      filter['priceRange.max'] = { ...(filter['priceRange.max']||{}), $lte: parseFloat(maxPrice) };
    }

    // Add rating filter
    if (minRating) {
      filter['rating.average'] = { $gte: parseFloat(minRating) };
    }

    const hotels = await Hotel.find(filter)
      .select('-__v')
      .sort({ 'rating.average': -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get rooms for each hotel (respect available inventory)
    const hotelsWithRooms = await Promise.all(hotels.map(async (hotel) => {
      const rooms = await Room.find({ hotelId: hotel._id });
      return {
        ...hotel.toObject(),
        rooms: rooms || []
      };
    }));

    const total = await Hotel.countDocuments(filter);

    res.json({
      success: true,
      data: hotelsWithRooms,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get hotels error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving hotels'
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

// @route   POST /api/customer/bookings/quote
// @desc    Get a price quote (no persistence)
// @access  Private (Customer)
router.post('/bookings/quote', async (req, res) => {
  try {
    const { roomId, bookingDetails, promoCode } = req.body;
    if (!roomId || !bookingDetails?.checkIn || !bookingDetails?.checkOut || !bookingDetails?.numberOfRooms) {
      return res.status(400).json({ success: false, message: 'Missing required fields for quote' });
    }
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    const nights = Math.ceil((new Date(bookingDetails.checkOut) - new Date(bookingDetails.checkIn)) / (1000*60*60*24));
    const base = room.pricing.basePrice * nights * bookingDetails.numberOfRooms;
    const taxes = base * (room.pricing.taxes / 100);
    const serviceFee = room.pricing.serviceFee || 0;
    let discountAmount = 0;
    if (promoCode && promoCode.toUpperCase() === 'WELCOME10') {
      discountAmount = Math.min(base * 0.10, 500); // 10% up to 500
    }
    const total = base + taxes + serviceFee - discountAmount;
    const depositAmount = Math.round(total * 0.20); // 20% deposit
    res.json({ success: true, data: { nights, base, taxes, serviceFee, discountAmount, total, currency: room.pricing.currency, depositAmount } });
  } catch (error) {
    logger.error('Price quote error:', error);
    res.status(500).json({ success: false, message: 'Server error generating quote' });
  }
});

// @route   PUT /api/customer/bookings/:id/modify
// @desc    Modify booking dates & guests (revalidate & reprice)
// @access  Private (Customer)
router.put('/bookings/:id/modify', validateObjectId, async (req, res) => {
  try {
    const { bookingDetails } = req.body;
    if (!bookingDetails?.checkIn || !bookingDetails?.checkOut) {
      return res.status(400).json({ success: false, message: 'New check-in/out required' });
    }
    const booking = await Booking.findById(req.params.id).populate('roomId');
    if (!booking || booking.customerId.toString() !== (await Customer.findOne({ userId: req.user._id }))._id.toString()) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (!['pending','confirmed'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Only pending/confirmed bookings can be modified' });
    }
    // Availability check for new range
    const nights = Math.ceil((new Date(bookingDetails.checkOut) - new Date(bookingDetails.checkIn)) / (1000*60*60*24));
    if (nights <= 0) return res.status(400).json({ success: false, message: 'Invalid date range' });
    const room = booking.roomId;
    const bookedRooms = await Booking.aggregate([
      { $match: { roomId: room._id, _id: { $ne: booking._id }, status: { $in: ['confirmed','pending'] }, $or: [ { 'bookingDetails.checkIn': { $lt: new Date(bookingDetails.checkOut), $gte: new Date(bookingDetails.checkIn) } }, { 'bookingDetails.checkOut': { $gt: new Date(bookingDetails.checkIn), $lte: new Date(bookingDetails.checkOut) } } ] } },
      { $group: { _id: null, totalBooked: { $sum: '$bookingDetails.numberOfRooms' } } }
    ]);
    const alreadyBooked = bookedRooms[0]?.totalBooked || 0;
    const available = room.totalRooms - alreadyBooked;
    const requestedRooms = bookingDetails.numberOfRooms || booking.bookingDetails.numberOfRooms;
    if (available < requestedRooms) {
      return res.status(400).json({ success: false, message: `Only ${available} rooms available for new dates` });
    }
    // Reprice
    const base = room.pricing.basePrice * nights * requestedRooms;
    const taxes = base * (room.pricing.taxes / 100);
    const serviceFee = room.pricing.serviceFee || 0;
    const totalAmount = base + taxes + serviceFee;
    booking.bookingDetails.checkIn = new Date(bookingDetails.checkIn);
    booking.bookingDetails.checkOut = new Date(bookingDetails.checkOut);
    booking.bookingDetails.numberOfRooms = requestedRooms;
    booking.bookingDetails.totalNights = nights;
    booking.pricing.roomPrice = base;
    booking.pricing.taxes = taxes;
    booking.pricing.serviceFee = serviceFee;
    booking.pricing.totalAmount = totalAmount;
    await booking.save();
    res.json({ success: true, message: 'Booking modified', data: booking });
  } catch (error) {
    logger.error('Modify booking error:', error);
    res.status(500).json({ success: false, message: 'Server error modifying booking' });
  }
});

// @route   POST /api/customer/bookings/:id/promo
// @desc    Apply promo code (updates discount & total)
// @access  Private (Customer)
router.post('/bookings/:id/promo', validateObjectId, async (req, res) => {
  try {
    const { code } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!['pending','confirmed'].includes(booking.status)) return res.status(400).json({ success: false, message: 'Cannot apply promo to this booking status' });
    let discountAmount = 0;
    if (code && code.toUpperCase() === 'WELCOME10') {
      discountAmount = Math.min(booking.pricing.roomPrice * 0.10, 500);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid promo code' });
    }
    booking.pricing.discount = { amount: discountAmount, reason: code.toUpperCase() };
    booking.pricing.totalAmount = booking.pricing.roomPrice + booking.pricing.taxes + booking.pricing.serviceFee - discountAmount;
    await booking.save();
    res.json({ success: true, message: 'Promo applied', data: { totalAmount: booking.pricing.totalAmount, discountAmount } });
  } catch (error) {
    logger.error('Apply promo error:', error);
    res.status(500).json({ success: false, message: 'Server error applying promo' });
  }
});

// @route   POST /api/customer/bookings/:id/deposit
// @desc    Record deposit payment (placeholder for Stripe integration)
// @access  Private (Customer)
router.post('/bookings/:id/deposit', validateObjectId, async (req, res) => {
  try {
    const { amount } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.pricing.depositPaid) return res.status(400).json({ success: false, message: 'Deposit already paid' });
    if (amount == null || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid deposit amount' });
    // Placeholder: in real integration, verify Stripe PaymentIntent success
    booking.pricing.depositAmount = amount;
    booking.pricing.depositPaid = true;
    booking.pricing.paymentStatus = 'partially_paid';
    await booking.save();
    res.json({ success: true, message: 'Deposit recorded', data: { paymentStatus: booking.pricing.paymentStatus } });
  } catch (error) {
    logger.error('Deposit error:', error);
    res.status(500).json({ success: false, message: 'Server error recording deposit' });
  }
});

// @route   POST /api/customer/bookings/:id/request
// @desc    Add additional / housekeeping request
// @access  Private (Customer)
router.post('/bookings/:id/request', validateObjectId, async (req, res) => {
  try {
    const { requestType = 'special', note } = req.body;
    if (!note) return res.status(400).json({ success: false, message: 'Note is required' });
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    booking.additionalRequests.push({ requestType, note });
    await booking.save();
    res.json({ success: true, message: 'Request added', data: booking.additionalRequests.slice(-1)[0] });
  } catch (error) {
    logger.error('Add booking request error:', error);
    res.status(500).json({ success: false, message: 'Server error adding request' });
  }
});

// @route   PUT /api/customer/bookings/:id/status
// @desc    Update status (e.g., mark no_show) - limited statuses
// @access  Private (Customer)
router.put('/bookings/:id/status', validateObjectId, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['no_show'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Status not allowed' });
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    booking.status = status === 'no_show' ? 'no_show' : booking.status;
    await booking.save();
    res.json({ success: true, message: 'Status updated', data: { status: booking.status } });
  } catch (error) {
    logger.error('Update booking status error:', error);
    res.status(500).json({ success: false, message: 'Server error updating status' });
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
