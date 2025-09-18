const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const fs = require('fs');

// Determine if Cloudinary is properly configured
const cloudConfigured = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// Configure Cloudinary only if env vars present
if (cloudConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Helper: local disk storage fallback (development) when Cloudinary not configured
const makeLocalStorage = (subfolder) => {
  const baseDir = path.join(__dirname, '..', 'uploads', subfolder);
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, baseDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${Date.now()}_${safeBase}${ext}`);
    }
  });
};

// Factory for CloudinaryStorage or fallback
const storageFactory = (folder, width, height) => {
  if (!cloudConfigured) return makeLocalStorage(folder);
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `hotel-booking/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width, height, crop: 'limit', quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    }
  });
};

// Cloudinary or local storage for hotel images
const hotelImageStorage = storageFactory('hotels', 1200, 800);
const roomImageStorage = storageFactory('rooms', 1000, 700);
const reviewImageStorage = storageFactory('reviews', 800, 600);
const profileImageStorage = (() => {
  if (!cloudConfigured) return makeLocalStorage('profiles');
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'hotel-booking/profiles',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    }
  });
})();
const documentStorage = (() => {
  if (!cloudConfigured) return makeLocalStorage('documents');
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'hotel-booking/documents',
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
      resource_type: 'auto'
    }
  });
})();

// File filter function
const fileFilter = (allowedTypes) => (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) return cb(null, true);
  cb(new Error(`Invalid file type. Only ${allowedTypes.join(', ')} are allowed.`), false);
};

// Common limits
const baseLimits = { fileSize: 5 * 1024 * 1024 };

const hotelImageUpload = multer({
  storage: hotelImageStorage,
  limits: { ...baseLimits, files: 10 },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const roomImageUpload = multer({
  storage: roomImageStorage,
  limits: { ...baseLimits, files: 8 },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const reviewImageUpload = multer({
  storage: reviewImageStorage,
  limits: { fileSize: 3 * 1024 * 1024, files: 5 },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const profileImageUpload = multer({
  storage: profileImageStorage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'])
});

// Helper functions (Cloudinary only when configured)
const deleteImage = async (publicId) => {
  if (!cloudConfigured) return { skipped: true, reason: 'cloudinary_not_configured' };
  try { return await cloudinary.uploader.destroy(publicId); } catch (error) { console.error('Error deleting image from Cloudinary:', error); throw error; }
};

const deleteImages = async (publicIds) => {
  if (!cloudConfigured) return { skipped: true, reason: 'cloudinary_not_configured' };
  try { return await cloudinary.api.delete_resources(publicIds); } catch (error) { console.error('Error deleting images from Cloudinary:', error); throw error; }
};

const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  return filename.split('.')[0];
};

const uploadMultipleImages = async (files, folder) => {
  if (!cloudConfigured) {
    // Simulate success using local file paths
    return files.map(f => ({ url: f.path, publicId: path.basename(f.path, path.extname(f.path)) }));
  }
  const uploadPromises = files.map(file => cloudinary.uploader.upload(file.path, {
    folder: `hotel-booking/${folder}`,
    transformation: [
      { width: 1000, height: 700, crop: 'limit', quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }));
  try {
    const results = await Promise.all(uploadPromises);
    return results.map(r => ({ url: r.secure_url, publicId: r.public_id }));
  } catch (error) {
    console.error('Error uploading images:', error);
    throw error;
  }
};

module.exports = {
  cloudinary,
  cloudConfigured,
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
