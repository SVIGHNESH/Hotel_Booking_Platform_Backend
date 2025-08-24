const nodemailer = require('nodemailer');
const logger = require('./logger');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send email utility
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `Hotel Booking Portal <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      html: options.html,
      text: options.text
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${options.email}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error('Email sending failed:', error);
    throw new Error('Email could not be sent');
  }
};

// Email templates
const emailTemplates = {
  // Welcome email template
  welcome: (name, verificationLink) => ({
    subject: 'Welcome to Hotel Booking Portal - Verify Your Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <h1 style="color: #007bff; margin: 0;">Hotel Booking Portal</h1>
        </div>
        <div style="padding: 30px 20px;">
          <h2 style="color: #333;">Welcome, ${name}!</h2>
          <p style="color: #666; line-height: 1.6;">
            Thank you for joining Hotel Booking Portal. To complete your registration and start booking amazing hotels, 
            please verify your email address by clicking the button below.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" 
               style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${verificationLink}">${verificationLink}</a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This verification link will expire in 24 hours.
          </p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>© 2024 Hotel Booking Portal. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  // Password reset template
  passwordReset: (name, resetLink) => ({
    subject: 'Reset Your Password - Hotel Booking Portal',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <h1 style="color: #007bff; margin: 0;">Hotel Booking Portal</h1>
        </div>
        <div style="padding: 30px 20px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p style="color: #666; line-height: 1.6;">
            Hi ${name},<br><br>
            You have requested to reset your password. Click the button below to set a new password:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${resetLink}">${resetLink}</a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This reset link will expire in 1 hour. If you didn't request this reset, please ignore this email.
          </p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>© 2024 Hotel Booking Portal. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  // Booking confirmation template
  bookingConfirmation: (customerName, booking) => ({
    subject: `Booking Confirmed - ${booking.bookingReference}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Booking Confirmed!</h1>
          <p style="margin: 10px 0 0 0;">Reference: ${booking.bookingReference}</p>
        </div>
        <div style="padding: 30px 20px;">
          <h2 style="color: #333;">Hi ${customerName},</h2>
          <p style="color: #666; line-height: 1.6;">
            Great news! Your hotel booking has been confirmed. Here are your booking details:
          </p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Booking Details</h3>
            <p><strong>Hotel:</strong> ${booking.hotelName}</p>
            <p><strong>Check-in:</strong> ${new Date(booking.checkIn).toLocaleDateString()}</p>
            <p><strong>Check-out:</strong> ${new Date(booking.checkOut).toLocaleDateString()}</p>
            <p><strong>Guests:</strong> ${booking.guests.adults} Adult(s)${booking.guests.children > 0 ? `, ${booking.guests.children} Child(ren)` : ''}</p>
            <p><strong>Rooms:</strong> ${booking.numberOfRooms}</p>
            <p><strong>Total Amount:</strong> $${booking.totalAmount}</p>
          </div>
          <p style="color: #666; line-height: 1.6;">
            We're excited for your stay! If you have any questions, please don't hesitate to contact us.
          </p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>© 2024 Hotel Booking Portal. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  // Hotel verification approved
  hotelVerificationApproved: (hotelName) => ({
    subject: 'Your Hotel Has Been Verified!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Congratulations!</h1>
          <p style="margin: 10px 0 0 0;">Your hotel has been verified</p>
        </div>
        <div style="padding: 30px 20px;">
          <p style="color: #666; line-height: 1.6;">
            Great news! Your hotel "${hotelName}" has been successfully verified and is now live on our platform. 
            You can start receiving bookings from customers right away.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/hotel/dashboard" 
               style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Go to Dashboard
            </a>
          </div>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>© 2024 Hotel Booking Portal. All rights reserved.</p>
        </div>
      </div>
    `
  })
};

// Send welcome email
const sendWelcomeEmail = async (email, name, verificationToken) => {
  const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  const template = emailTemplates.welcome(name, verificationLink);
  
  return await sendEmail({
    email,
    subject: template.subject,
    html: template.html
  });
};

// Send password reset email
const sendPasswordResetEmail = async (email, name, resetToken) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const template = emailTemplates.passwordReset(name, resetLink);
  
  return await sendEmail({
    email,
    subject: template.subject,
    html: template.html
  });
};

// Send booking confirmation email
const sendBookingConfirmationEmail = async (email, customerName, bookingDetails) => {
  const template = emailTemplates.bookingConfirmation(customerName, bookingDetails);
  
  return await sendEmail({
    email,
    subject: template.subject,
    html: template.html
  });
};

// Send hotel verification email
const sendHotelVerificationEmail = async (email, hotelName) => {
  const template = emailTemplates.hotelVerificationApproved(hotelName);
  
  return await sendEmail({
    email,
    subject: template.subject,
    html: template.html
  });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendBookingConfirmationEmail,
  sendHotelVerificationEmail
};
