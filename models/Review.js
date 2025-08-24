const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
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
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true // One review per booking
  },
  ratings: {
    overall: {
      type: Number,
      required: [true, 'Overall rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5']
    },
    cleanliness: {
      type: Number,
      min: 1,
      max: 5
    },
    service: {
      type: Number,
      min: 1,
      max: 5
    },
    location: {
      type: Number,
      min: 1,
      max: 5
    },
    value: {
      type: Number,
      min: 1,
      max: 5
    },
    amenities: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  title: {
    type: String,
    required: [true, 'Review title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  comment: {
    type: String,
    required: [true, 'Review comment is required'],
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    minlength: [10, 'Comment must be at least 10 characters long']
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
  pros: [{
    type: String,
    maxlength: 100
  }],
  cons: [{
    type: String,
    maxlength: 100
  }],
  stayType: {
    type: String,
    enum: ['Business', 'Leisure', 'Family', 'Couple', 'Solo', 'Group'],
    required: true
  },
  roomType: {
    type: String,
    required: true
  },
  stayDuration: {
    nights: {
      type: Number,
      required: true,
      min: 1
    },
    checkIn: {
      type: Date,
      required: true
    },
    checkOut: {
      type: Date,
      required: true
    }
  },
  response: {
    message: {
      type: String,
      maxlength: [500, 'Response cannot exceed 500 characters']
    },
    respondedAt: Date,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  helpfulVotes: {
    count: {
      type: Number,
      default: 0,
      min: 0
    },
    voters: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer'
    }]
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isApproved: {
    type: Boolean,
    default: true
  },
  moderationNotes: {
    type: String,
    maxlength: 300
  },
  source: {
    type: String,
    enum: ['website', 'mobile_app', 'email'],
    default: 'website'
  }
}, {
  timestamps: true
});

// Validate that booking exists and belongs to customer
reviewSchema.pre('save', async function(next) {
  if (this.isNew) {
    const Booking = mongoose.model('Booking');
    const booking = await Booking.findOne({
      _id: this.bookingId,
      customerId: this.customerId,
      hotelId: this.hotelId,
      status: { $in: ['completed', 'checked_out'] }
    });
    
    if (!booking) {
      return next(new Error('Invalid booking or booking not eligible for review'));
    }
    
    // Set stay duration from booking
    this.stayDuration.nights = booking.bookingDetails.totalNights;
    this.stayDuration.checkIn = booking.bookingDetails.checkIn;
    this.stayDuration.checkOut = booking.bookingDetails.checkOut;
  }
  next();
});

// Update hotel rating after review save/update
reviewSchema.post('save', async function() {
  await updateHotelRating(this.hotelId);
});

reviewSchema.post('findOneAndUpdate', async function(doc) {
  if (doc) {
    await updateHotelRating(doc.hotelId);
  }
});

reviewSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    await updateHotelRating(doc.hotelId);
  }
});

// Function to update hotel rating
async function updateHotelRating(hotelId) {
  const Review = mongoose.model('Review');
  const Hotel = mongoose.model('Hotel');
  
  const result = await Review.aggregate([
    {
      $match: {
        hotelId: hotelId,
        isApproved: true
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$ratings.overall' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);
  
  const rating = result[0] || { averageRating: 0, totalReviews: 0 };
  
  await Hotel.findByIdAndUpdate(hotelId, {
    'rating.average': Math.round(rating.averageRating * 10) / 10,
    'rating.totalReviews': rating.totalReviews
  });
}

// Create indexes
reviewSchema.index({ hotelId: 1, isApproved: 1, createdAt: -1 });
reviewSchema.index({ customerId: 1, createdAt: -1 });
reviewSchema.index({ 'ratings.overall': -1 });

module.exports = mongoose.model('Review', reviewSchema);
