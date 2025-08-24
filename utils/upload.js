const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage for hotel images
const hotelImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'hotel-booking/hotels',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1200, height: 800, crop: 'limit', quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Cloudinary storage for room images
const roomImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'hotel-booking/rooms',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1000, height: 700, crop: 'limit', quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Cloudinary storage for review images
const reviewImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'hotel-booking/reviews',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 800, height: 600, crop: 'limit', quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Cloudinary storage for profile images
const profileImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'hotel-booking/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Cloudinary storage for documents
const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'hotel-booking/documents',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    resource_type: 'auto'
  }
});

// File filter function
const fileFilter = (allowedTypes) => {
  return (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only ${allowedTypes.join(', ')} are allowed.`), false);
    }
  };
};

// Multer configurations
const hotelImageUpload = multer({
  storage: hotelImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 10
  },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const roomImageUpload = multer({
  storage: roomImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 8
  },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const reviewImageUpload = multer({
  storage: reviewImageStorage,
  limits: {
    fileSize: 3 * 1024 * 1024, // 3MB
    files: 5
  },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const profileImageUpload = multer({
  storage: profileImageStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1
  },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const documentUpload = multer({
  storage: documentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'])
});

// Helper functions
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    throw error;
  }
};

const deleteImages = async (publicIds) => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds);
    return result;
  } catch (error) {
    console.error('Error deleting images from Cloudinary:', error);
    throw error;
  }
};

// Extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  return filename.split('.')[0];
};

// Upload multiple images utility
const uploadMultipleImages = async (files, folder) => {
  const uploadPromises = files.map(file => 
    cloudinary.uploader.upload(file.path, {
      folder: `hotel-booking/${folder}`,
      transformation: [
        { width: 1000, height: 700, crop: 'limit', quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    })
  );
  
  try {
    const results = await Promise.all(uploadPromises);
    return results.map(result => ({
      url: result.secure_url,
      publicId: result.public_id
    }));
  } catch (error) {
    console.error('Error uploading images:', error);
    throw error;
  }
};

module.exports = {
  cloudinary,
  hotelImageUpload,
  roomImageUpload,
  reviewImageUpload,
  profileImageUpload,
  documentUpload,
  deleteImage,
  deleteImages,
  getPublicIdFromUrl,
  uploadMultipleImages
};
