const mongoose = require('mongoose');

const grievanceSchema = new mongoose.Schema({
  grievanceNumber: {
    type: String,
    unique: true,
    required: true
  },
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
    ref: 'Booking'
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  category: {
    type: String,
    enum: [
      'booking_issue',
      'payment_problem', 
      'service_quality',
      'cleanliness',
      'staff_behavior',
      'amenities',
      'safety_security',
      'accessibility',
      'noise_complaint',
      'billing_dispute',
      'cancellation_refund',
      'other'
    ],
    required: [true, 'Category is required']
  },
  subcategory: {
    type: String,
    maxlength: 100
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'acknowledged', 'in_progress', 'resolved', 'closed', 'escalated'],
    default: 'open'
  },
  severity: {
    type: String,
    enum: ['minor', 'moderate', 'major', 'critical'],
    default: 'moderate'
  },
  attachments: [{
    url: {
      type: String,
      required: true
    },
    publicId: {
      type: String,
      required: true
    },
    filename: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      enum: ['image', 'document', 'video']
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  timeline: [{
    action: {
      type: String,
      enum: [
        'created',
        'acknowledged',
        'assigned',
        'in_progress',
        'customer_response',
        'hotel_response', 
        'admin_response',
        'escalated',
        'resolved',
        'closed',
        'reopened'
      ],
      required: true
    },
    description: {
      type: String,
      required: true
    },
    performedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      role: {
        type: String,
        enum: ['customer', 'hotel', 'admin'],
        required: true
      },
      name: {
        type: String,
        required: true
      }
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    attachments: [{
      url: String,
      publicId: String,
      filename: String
    }]
  }],
  assignedTo: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['hotel', 'admin']
    },
    assignedAt: Date,
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  resolution: {
    summary: {
      type: String,
      maxlength: 1000
    },
    actionTaken: {
      type: String,
      maxlength: 1000
    },
    compensationOffered: {
      type: {
        type: String,
        enum: ['none', 'refund', 'discount', 'voucher', 'free_service', 'other']
      },
      amount: {
        type: Number,
        min: 0
      },
      description: String
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  customerSatisfaction: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: {
      type: String,
      maxlength: 500
    },
    submittedAt: Date
  },
  escalation: {
    level: {
      type: Number,
      default: 0,
      min: 0,
      max: 3
    },
    reason: String,
    escalatedAt: Date,
    escalatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  tags: [{
    type: String,
    maxlength: 50
  }],
  isUrgent: {
    type: Boolean,
    default: false
  },
  dueDate: Date,
  reminderSent: {
    type: Boolean,
    default: false
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate grievance number before saving
grievanceSchema.pre('save', function(next) {
  if (!this.grievanceNumber) {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 4);
    this.grievanceNumber = `GRV${year}${timestamp}${random}`.toUpperCase();
  }
  
  this.lastUpdated = new Date();
  next();
});

// Add timeline entry when status changes
grievanceSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    const statusMap = {
      'acknowledged': 'Grievance acknowledged by support team',
      'in_progress': 'Investigation started',
      'resolved': 'Grievance has been resolved',
      'closed': 'Grievance has been closed',
      'escalated': 'Grievance has been escalated'
    };
    
    if (statusMap[this.status]) {
      this.timeline.push({
        action: this.status,
        description: statusMap[this.status],
        performedBy: {
          userId: this._updatedBy || this.assignedTo?.userId,
          role: 'admin',
          name: 'System'
        }
      });
    }
  }
  next();
});

// Create indexes
grievanceSchema.index({ customerId: 1, createdAt: -1 });
grievanceSchema.index({ hotelId: 1, status: 1 });
grievanceSchema.index({ category: 1, priority: 1 });
grievanceSchema.index({ status: 1, createdAt: -1 });
grievanceSchema.index({ grievanceNumber: 1 });

module.exports = mongoose.model('Grievance', grievanceSchema);
