const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// User validation rules
const userRegistrationValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('role')
    .isIn(['customer', 'hotel'])
    .withMessage('Role must be either customer or hotel'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid phone number'),
  // Hotel-specific validation
  body('hotelName')
    .if(body('role').equals('hotel'))
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Hotel name must be between 2 and 100 characters'),
  handleValidationErrors
];

const userLoginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Customer validation rules
const customerProfileValidation = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date of birth'),
  handleValidationErrors
];

// Hotel validation rules
const hotelProfileValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Hotel name must be between 2 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('address.street')
    .trim()
    .notEmpty()
    .withMessage('Street address is required'),
  body('address.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  body('address.state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  body('address.country')
    .trim()
    .notEmpty()
    .withMessage('Country is required'),
  body('address.zipCode')
    .trim()
    .notEmpty()
    .withMessage('ZIP code is required'),
  body('address.coordinates.coordinates')
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage('Coordinates must be an array of [longitude, latitude]'),
  body('address.coordinates.coordinates.*')
    .optional()
    .isNumeric()
    .withMessage('Coordinates must be numeric'),
  body('contactInfo.phone')
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('contactInfo.email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('contactInfo.website')
    .optional()
    .isURL()
    .withMessage('Please provide a valid website URL'),
  handleValidationErrors
];

// Room validation rules
const roomValidation = [
  body('roomType')
    .isIn(['Single', 'Double', 'Twin', 'Triple', 'Quad', 'Suite', 'Presidential Suite', 'Deluxe', 'Standard', 'Economy', 'Family Room'])
    .withMessage('Invalid room type'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Room name must be between 2 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  body('pricing.basePrice')
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number'),
  body('capacity.adults')
    .isInt({ min: 1, max: 10 })
    .withMessage('Adult capacity must be between 1 and 10'),
  body('capacity.children')
    .optional()
    .isInt({ min: 0, max: 5 })
    .withMessage('Children capacity must be between 0 and 5'),
  body('totalRooms')
    .isInt({ min: 1 })
    .withMessage('Total rooms must be at least 1'),
  handleValidationErrors
];

// Booking validation rules
const bookingValidation = [
  body('roomId')
    .isMongoId()
    .withMessage('Invalid room ID'),
  body('bookingDetails.checkIn')
    .isISO8601()
    .withMessage('Check-in date must be a valid date')
    .custom((value) => {
      const today = new Date(); today.setHours(0,0,0,0);
      const checkIn = new Date(value); checkIn.setHours(0,0,0,0);
      if (checkIn < today) {
        throw new Error('Check-in date cannot be in the past');
      }
      return true;
    }),
  body('bookingDetails.checkOut')
    .isISO8601()
    .withMessage('Check-out date must be a valid date')
    .custom((value, { req }) => {
      const checkInRaw = req.body.bookingDetails?.checkIn;
      if (!checkInRaw) return false;
      const checkIn = new Date(checkInRaw); checkIn.setHours(0,0,0,0);
      const checkOut = new Date(value); checkOut.setHours(0,0,0,0);
      if (checkOut <= checkIn) {
        throw new Error('Check-out date must be after check-in date');
      }
      return true;
    }),
  body('bookingDetails.guests.adults')
    .isInt({ min: 1 })
    .withMessage('At least one adult is required'),
  body('bookingDetails.guests.children')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Children count must be non-negative'),
  body('bookingDetails.numberOfRooms')
    .isInt({ min: 1 })
    .withMessage('At least one room is required'),
  body('contactDetails.email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('contactDetails.phone')
    .matches(/^[+]?\d[\d\s\-]{6,15}$/)
    .withMessage('Please provide a valid phone number (digits, spaces, hyphens allowed)'),
  handleValidationErrors
];

// Review validation rules
const reviewValidation = [
  body('bookingId')
    .isMongoId()
    .withMessage('Invalid booking ID'),
  body('ratings.overall')
    .isInt({ min: 1, max: 5 })
    .withMessage('Overall rating must be between 1 and 5'),
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('comment')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Comment must be between 10 and 1000 characters'),
  body('stayType')
    .isIn(['Business', 'Leisure', 'Family', 'Couple', 'Solo', 'Group'])
    .withMessage('Invalid stay type'),
  handleValidationErrors
];

// Grievance validation rules
const grievanceValidation = [
  body('hotelId')
    .isMongoId()
    .withMessage('Invalid hotel ID'),
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Subject must be between 5 and 200 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category')
    .isIn([
      'booking_issue', 'payment_problem', 'service_quality', 'cleanliness',
      'staff_behavior', 'amenities', 'safety_security', 'accessibility',
      'noise_complaint', 'billing_dispute', 'cancellation_refund', 'other'
    ])
    .withMessage('Invalid category'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority'),
  handleValidationErrors
];

// Search validation rules
const searchValidation = [
  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  query('radius')
    .optional()
    .isFloat({ min: 1, max: 100 })
    .withMessage('Radius must be between 1 and 100 km'),
  query('checkIn')
    .optional()
    .isISO8601()
    .withMessage('Check-in date must be a valid date'),
  query('checkOut')
    .optional()
    .isISO8601()
    .withMessage('Check-out date must be a valid date'),
  query('guests')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Number of guests must be at least 1'),
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be non-negative'),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be non-negative'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

// ID parameter validation
const validateObjectId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  handleValidationErrors
];

module.exports = {
  userRegistrationValidation,
  userLoginValidation,
  customerProfileValidation,
  hotelProfileValidation,
  roomValidation,
  bookingValidation,
  reviewValidation,
  grievanceValidation,
  searchValidation,
  validateObjectId,
  handleValidationErrors
};
