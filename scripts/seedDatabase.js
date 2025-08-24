const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Hotel = require('../models/Hotel');

// Default admin credentials
const DEFAULT_ADMIN = {
  email: 'admin@hotelbooking.com',
  password: 'admin123',
  role: 'admin'
};

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hotel-booking-portal');
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: DEFAULT_ADMIN.email });
    if (!existingAdmin) {
      // Create admin user
      const adminUser = new User({
        email: DEFAULT_ADMIN.email,
        password: DEFAULT_ADMIN.password,
        role: DEFAULT_ADMIN.role,
        isVerified: true,
        isActive: true
      });

      await adminUser.save();
      console.log('✅ Admin user created successfully!');
      console.log('📧 Email:', DEFAULT_ADMIN.email);
      console.log('🔒 Password:', DEFAULT_ADMIN.password);
    } else {
      console.log('Admin user already exists');
      console.log('Email:', DEFAULT_ADMIN.email);
      console.log('Password: (unchanged)');
    }

    // Create test customer user
    const testCustomerEmail = 'customer@example.com';
    const testCustomerPassword = 'customer123';

    const existingCustomer = await User.findOne({ email: testCustomerEmail });
    if (!existingCustomer) {
      const customerUser = new User({
        email: testCustomerEmail,
        password: testCustomerPassword,
        role: 'customer',
        isVerified: true,
        isActive: true,
        firstName: 'John',
        lastName: 'Doe',
        phone: '9876543210'
      });

      await customerUser.save();
      console.log('✅ Test customer created successfully!');
      console.log('📧 Email:', testCustomerEmail);
      console.log('🔒 Password:', testCustomerPassword);
    } else {
      console.log('Test customer already exists');
      console.log('Email:', testCustomerEmail);
      console.log('Password: (unchanged)');
    }

    // Create test hotel for verification
    const testHotelEmail = 'testhotel@example.com';
    const testHotelPassword = 'hotel123';

    const existingHotel = await User.findOne({ email: testHotelEmail });
    if (!existingHotel) {
      // Create hotel user
      const hotelUser = new User({
        email: testHotelEmail,
        password: testHotelPassword,
        role: 'hotel',
        isVerified: true,
        isActive: true
      });

      await hotelUser.save();

      // Create hotel profile
      const hotel = new Hotel({
        userId: hotelUser._id,
        name: 'Test Grand Hotel',
        description: 'A luxury hotel for testing verification workflow',
        address: {
          street: '123 Test Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          country: 'India',
          zipCode: '400001',
          coordinates: {
            type: 'Point',
            coordinates: [72.8777, 19.0760]
          }
        },
        contactInfo: {
          phone: '9876543210',
          email: testHotelEmail,
          website: 'https://testgrandhotel.com'
        },
        amenities: ['WiFi', 'Pool', 'Spa', 'Restaurant', 'Bar'],
        policies: {
          checkIn: '14:00',
          checkOut: '11:00',
          cancellation: 'Free cancellation up to 24 hours before check-in'
        },
        priceRange: {
          min: 2500,
          max: 15000
        },
        rating: {
          average: 0,
          count: 0
        },
        isVerified: false, // This will be pending verification
        verificationStatus: 'approved', // Set as approved for testing
        isActive: true
      });

      await hotel.save();

      // Create some sample rooms for the approved hotel
      const Room = require('../models/Room');
      
      const rooms = [
        {
          hotelId: hotel._id,
          name: 'Deluxe Room',
          description: 'Spacious room with city view and modern amenities',
          type: 'deluxe',
          maxOccupancy: 2,
          pricePerNight: 3500,
          amenities: ['AC', 'TV', 'WiFi', 'Mini Bar'],
          images: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'],
          isAvailable: true,
          totalRooms: 10
        },
        {
          hotelId: hotel._id,
          name: 'Executive Suite',
          description: 'Luxurious suite with separate living area and premium amenities',
          type: 'suite',
          maxOccupancy: 4,
          pricePerNight: 6500,
          amenities: ['AC', 'TV', 'WiFi', 'Mini Bar', 'Balcony', 'Room Service'],
          images: ['https://images.unsplash.com/photo-1590490360182-c33d57733427?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'],
          isAvailable: true,
          totalRooms: 5
        }
      ];

      // Save rooms to the hotel
      const savedRooms = await Room.insertMany(rooms);
      
      // Update hotel with room references
      hotel.rooms = savedRooms.map(room => room._id);
      await hotel.save();

      console.log('🏨 Test hotel user created successfully!');
      console.log('📧 Email:', testHotelEmail);
      console.log('🔒 Password:', testHotelPassword);
      console.log('🔄 Status: Pending Verification');
    } else {
      console.log('Test hotel user already exists');
      console.log('Email:', testHotelEmail);
      console.log('Password: (unchanged)');
    }

    console.log('✅ Database seeded successfully!');
    console.log('');
    console.log('⚠️  Please change the default password after first login!');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run if script is called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
