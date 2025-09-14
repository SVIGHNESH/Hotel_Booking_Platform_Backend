const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(value) {
        return value < new Date();
      },
      message: 'Date of birth must be in the past'
    }
  },
  address: {
    street: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      trim: true
    },
    zipCode: {
      type: String,
      trim: true
    }
  },
  preferences: {
    // Allow a flexible location shape to support either numeric lat/long
    // or GeoJSON Point objects (some existing deployments created a
    // 2dsphere index on this field). Using Mixed prevents Mongoose from
    // stripping GeoJSON objects and avoids insert-time index errors.
    location: {
      type: mongoose.Schema.Types.Mixed,
      default: { radius: 10 }
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    }
  },
  profileImage: {
    type: String,
    default: null
  },
  loyaltyPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel'
  }]
}, {
  timestamps: true
});

// Note: we intentionally avoid creating a 2dsphere index here to prevent
// errors when documents are inserted without numeric coordinates. If you
// need geospatial queries, create a proper 2dsphere index in the DB with
// correct documents (e.g., {'preferences.location': { type: 'Point', coordinates: [lon, lat] }}).

module.exports = mongoose.model('Customer', customerSchema);
