const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  bookingReference: {
    type: String,
    unique: true,
    required: true
  },
  bookingDetails: {
    checkIn: {
      type: Date,
      required: [true, 'Check-in date is required'],
      validate: {
        validator: function(value) {
          return value >= new Date().setHours(0, 0, 0, 0);
        },
        message: 'Check-in date cannot be in the past'
      }
    },
    checkOut: {
      type: Date,
      required: [true, 'Check-out date is required'],
      validate: {
        validator: function(value) {
          return value > this.bookingDetails.checkIn;
        },
        message: 'Check-out date must be after check-in date'
      }
    },
    guests: {
      adults: {
        type: Number,
        required: [true, 'Number of adults is required'],
        min: [1, 'At least one adult is required']
      },
      children: {
        type: Number,
        default: 0,
        min: 0
      },
      infants: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    numberOfRooms: {
      type: Number,
      required: [true, 'Number of rooms is required'],
      min: [1, 'At least one room is required']
    },
    totalNights: {
      type: Number,
      required: true,
      min: 1
    }
  },
  guestDetails: [{
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    age: {
      type: Number,
      min: 0,
      max: 120
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other']
    }
  }],
  contactDetails: {
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: true
    },
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String
    }
  },
  pricing: {
    roomPrice: {
      type: Number,
      required: true,
      min: 0
    },
    taxes: {
      type: Number,
      default: 0,
      min: 0
    },
    serviceFee: {
      type: Number,
      default: 0,
      min: 0
    },
    discount: {
      amount: {
        type: Number,
        default: 0,
        min: 0
      },
      reason: String
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'partially_paid', 'refunded', 'failed'],
      default: 'pending'
    },
    paymentMethod: {
      type: String,
      enum: ['credit_card', 'debit_card', 'paypal', 'stripe', 'bank_transfer']
    },
    stripePaymentIntentId: String
    ,
    depositAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    depositPaid: {
      type: Boolean,
      default: false
    }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'cancelled', 'checked_in', 'checked_out', 'completed', 'no_show'],
    default: 'pending'
  },
  specialRequests: {
    type: String,
    maxlength: [500, 'Special requests cannot exceed 500 characters']
  },
  cancellation: {
    isCancelled: {
      type: Boolean,
      default: false
    },
    cancelledAt: Date,
    cancelledBy: {
      type: String,
      enum: ['customer', 'hotel', 'admin']
    },
    reason: String,
    refundAmount: {
      type: Number,
      min: 0
    },
    refundStatus: {
      type: String,
      enum: ['pending', 'processed', 'failed']
    }
  },
  checkInDetails: {
    actualCheckIn: Date,
    checkInNotes: String
  },
  checkOutDetails: {
    actualCheckOut: Date,
    checkOutNotes: String,
    damageCharges: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  confirmedAt: Date,
  notifications: [{
    type: {
      type: String,
      enum: ['booking_confirmed', 'payment_received', 'check_in_reminder', 'check_out_reminder', 'cancellation']
    },
    sentAt: Date,
    method: {
      type: String,
      enum: ['email', 'sms']
    }
  }]
  ,
  additionalRequests: [{
    requestType: {
      type: String,
      enum: ['special', 'housekeeping', 'other'],
      default: 'special'
    },
    note: {
      type: String,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Generate booking reference and compute total nights before validation
// so required fields derived from provided dates are present during
// Mongoose validation.
bookingSchema.pre('validate', function(next) {
  if (!this.bookingReference) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    this.bookingReference = `HB${timestamp}${random}`.toUpperCase();
  }
  
  // Calculate total nights
  if (this.bookingDetails.checkIn && this.bookingDetails.checkOut) {
    const diffTime = this.bookingDetails.checkOut - this.bookingDetails.checkIn;
    this.bookingDetails.totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  next();
});

// Create indexes for efficient queries
bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ hotelId: 1, 'bookingDetails.checkIn': 1 });
bookingSchema.index({ status: 1, 'bookingDetails.checkIn': 1 });
bookingSchema.index({ bookingReference: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
