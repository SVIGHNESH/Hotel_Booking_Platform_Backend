const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true
  },
  roomType: {
    type: String,
    required: [true, 'Room type is required'],
    enum: [
      'Single', 'Double', 'Twin', 'Triple', 'Quad',
      'Suite', 'Presidential Suite', 'Deluxe',
      'Standard', 'Economy', 'Family Room'
    ]
  },
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [100, 'Room name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Room description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    publicId: {
      type: String,
      required: true
    },
    caption: {
      type: String,
      maxlength: 200
    }
  }],
  amenities: [{
    type: String,
    enum: [
      'WiFi', 'Air Conditioning', 'TV', 'Mini Bar',
      'Safe', 'Balcony', 'Kitchenette', 'Coffee Machine',
      'Hair Dryer', 'Iron', 'Bathtub', 'Shower',
      'Work Desk', 'Sofa', 'Ocean View', 'City View'
    ]
  }],
  size: {
    value: {
      type: Number,
      min: 1
    },
    unit: {
      type: String,
      enum: ['sqft', 'sqm'],
      default: 'sqft'
    }
  },
  bedConfiguration: [{
    type: {
      type: String,
      enum: ['Single', 'Double', 'Queen', 'King', 'Sofa Bed'],
      required: true
    },
    count: {
      type: Number,
      required: true,
      min: 1
    }
  }],
  pricing: {
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: 0
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD']
    },
    taxes: {
      type: Number,
      default: 0,
      min: 0,
      max: 100 // percentage
    },
    serviceFee: {
      type: Number,
      default: 0,
      min: 0
    },
    discounts: [{
      type: {
        type: String,
        enum: ['early_bird', 'last_minute', 'extended_stay', 'seasonal']
      },
      value: {
        type: Number,
        min: 0,
        max: 100 // percentage
      },
      validFrom: Date,
      validTo: Date,
      minStay: {
        type: Number,
        default: 1
      }
    }]
  },
  capacity: {
    adults: {
      type: Number,
      required: [true, 'Adult capacity is required'],
      min: 1,
      max: 10
    },
    children: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    infants: {
      type: Number,
      default: 0,
      min: 0,
      max: 2
    }
  },
  totalRooms: {
    type: Number,
    required: [true, 'Total rooms count is required'],
    min: 1
  },
  status: {
    type: String,
    enum: ['ready', 'occupied', 'maintenance', 'blocked', 'cleaning'],
    default: 'ready'
  },
  floor: {
    type: Number,
    min: 0
  },
  smokingAllowed: {
    type: Boolean,
    default: false
  },
  accessibility: {
    wheelchairAccessible: {
      type: Boolean,
      default: false
    },
    hearingAccessible: {
      type: Boolean,
      default: false
    },
    visuallyAccessible: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create compound index for efficient queries
roomSchema.index({ hotelId: 1, isActive: 1 });
roomSchema.index({ roomType: 1, 'pricing.basePrice': 1 });

module.exports = mongoose.model('Room', roomSchema);
