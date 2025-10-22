import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import axios from 'axios';
import dotenv from 'dotenv';
import googleMapsService from './services/googleMapsService.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Email configuration - all values must be provided via environment variables
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT || 465;
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true' || true;
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || 'fahad.admin@erthfc.com';
const RESERVE_EMAIL = process.env.RESERVE_EMAIL;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'customer-service@erthfc.com';

// Debug environment variables
console.log('Environment variables check:', {
  EMAIL_USER: EMAIL_USER ? 'SET' : 'MISSING',
  EMAIL_PASS: EMAIL_PASS ? 'SET' : 'MISSING', 
  EMAIL_HOST: EMAIL_HOST ? 'SET' : 'MISSING',
  RECIPIENT_EMAIL: RECIPIENT_EMAIL ? 'SET' : 'MISSING',
  RESERVE_EMAIL: RESERVE_EMAIL ? 'SET' : 'MISSING'
});

// Validate required environment variables
if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_HOST || !RECIPIENT_EMAIL) {
  console.error('❌ Missing required environment variables for email configuration');
  console.error('Required: EMAIL_USER, EMAIL_PASS, EMAIL_HOST, RECIPIENT_EMAIL');
  console.error('⚠️  Server will start but email functionality will be disabled');
}


// Middleware
app.use(cors({
  origin: [
    'https://erthfc.com',
    'https://www.erthfc.com',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());

// Compression middleware
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes cache
  res.setHeader('Vary', 'Accept-Encoding');
  next();
});

// Create transporter for nodemailer
const createTransporter = () => {
  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: parseInt(EMAIL_PORT),
    secure: EMAIL_SECURE,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Axios-based email service for external API integrations
const emailService = {
  // Send email via external API (for future integrations)
  sendEmailViaAPI: async (emailData) => {
    try {
      // This is a placeholder for future external email API integrations
      // You can integrate with services like SendGrid, Mailgun, etc.
      const response = await axios.post('https://api.example.com/send-email', emailData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EMAIL_API_KEY || ''}`
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error('External email API error:', error.message);
      throw error;
    }
  },

  // Validate email using external service
  validateEmail: async (email) => {
    try {
      // This is a placeholder for email validation services
      const response = await axios.get(`https://api.example.com/validate-email/${email}`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('Email validation error:', error.message);
      return { valid: true }; // Fallback to valid if service is down
    }
  }
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Earth Footprint Backend API is running!',
    endpoints: {
      contact: '/api/contact',
      newsletter: '/api/newsletter',
      reviews: '/api/reviews'
    },
    status: 'active',
    liveScraping: true
  });
});


// Live Google Maps Reviews endpoint
app.get('/api/reviews', async (req, res) => {
  try {
    console.log('🔄 Fetching live Google Maps reviews...');
    const reviews = await googleMapsService.getReviews();
    
    res.json({
      success: true,
      data: reviews,
      count: reviews.length,
      timestamp: new Date().toISOString(),
      source: 'live_scraping'
    });
  } catch (error) {
    console.error('Live reviews API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live reviews',
      details: error.message
    });
  }
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, service, message, language, jobTitle, officeName } = req.body;

    // Service name mapping to Arabic
    const serviceNames = {
      'permits': 'التصاريح البيئية',
      'reports': 'التقارير البيئية الدورية',
      'assessment': 'تقييم الأثر البيئي',
      'audit': 'التدقيق البيئي',
      'management': 'خطط الإدارة البيئية',
      'rehabilitation': 'خطط إعادة التأهيل البيئي',
      'consulting': 'الاستشارات الفنية المتخصصة',
      'mawan': 'إصدار تصريح موان',
      'other': 'خدمة أخرى'
    };

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({ 
        error: 'Name, email, and message are required' 
      });
    }

    // Validate email format using axios (optional external validation)
    try {
      const emailValidation = await emailService.validateEmail(email);
      if (!emailValidation.valid) {
        return res.status(400).json({ 
          error: 'Invalid email address' 
        });
      }
    } catch (validationError) {
      console.log('Email validation service unavailable, proceeding with basic validation');
    }

    // Check if email configuration is available
    if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_HOST || !RECIPIENT_EMAIL) {
      console.log('Email configuration missing:', {
        EMAIL_USER: !!EMAIL_USER,
        EMAIL_PASS: !!EMAIL_PASS,
        EMAIL_HOST: !!EMAIL_HOST,
        RECIPIENT_EMAIL: !!RECIPIENT_EMAIL,
        RESERVE_EMAIL: !!RESERVE_EMAIL
      });
      return res.status(500).json({ 
        error: 'Email service not configured. Please contact administrator.',
        debug: 'Missing environment variables'
      });
    }

    // Create transporter
    const transporter = createTransporter();

    // Email content - always in Arabic for business emails
    const subject = `رسالة جديدة من ${name} - بصمة الأرض`;

    const emailContent = `
      <h2>رسالة جديدة من موقع بصمة الأرض</h2>
      <p><strong>الاسم:</strong> ${name}</p>
      <p><strong>البريد الإلكتروني:</strong> ${email}</p>
      <p><strong>الهاتف:</strong> ${phone || 'غير محدد'}</p>
      <p><strong>المسمى الوظيفي:</strong> ${jobTitle || 'غير محدد'}</p>
      <p><strong>اسم المكتب:</strong> ${officeName || 'غير محدد'}</p>
      <p><strong>الخدمة المطلوبة:</strong> ${serviceNames[service] || service || 'غير محدد'}</p>
      <p><strong>الرسالة:</strong></p>
      <p>${message}</p>
      <hr>
      <p><em>تم الإرسال من موقع بصمة الأرض</em></p>
    `;

    // Email options - send to main email and reserve email if available
    const toEmails = RESERVE_EMAIL ? `${RECIPIENT_EMAIL}, ${RESERVE_EMAIL}` : RECIPIENT_EMAIL;
    const mailOptions = {
      from: `"بصمة الأرض" <${SENDER_EMAIL}>`,
      to: toEmails,
      subject: subject,
      html: emailContent
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.status(200).json({ 
      success: true, 
      message: language === 'ar' 
        ? 'تم إرسال الرسالة بنجاح!' 
        : 'Message sent successfully!' 
    });

  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message 
    });
  }
});

// Newsletter subscription endpoint
app.post('/api/newsletter', async (req, res) => {
  try {
    const { email, language } = req.body;

    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required' 
      });
    }

    // Check if email configuration is available
    if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_HOST || !RECIPIENT_EMAIL) {
      return res.status(500).json({ 
        error: 'Email service not configured. Please contact administrator.' 
      });
    }

    const transporter = createTransporter();

    const subject = 'اشتراك جديد في النشرة الإخبارية - بصمة الأرض';

    const emailContent = `
      <h2>اشتراك جديد في النشرة الإخبارية</h2>
      <p><strong>البريد الإلكتروني:</strong> ${email}</p>
      <p><em>تم الاشتراك من موقع بصمة الأرض</em></p>
    `;

    const toEmails = RESERVE_EMAIL ? `${RECIPIENT_EMAIL}, ${RESERVE_EMAIL}` : RECIPIENT_EMAIL;
    const mailOptions = {
      from: `"بصمة الأرض" <${SENDER_EMAIL}>`,
      to: toEmails,
      subject: subject,
      html: emailContent
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ 
      success: true, 
      message: language === 'ar' 
        ? 'تم الاشتراك في النشرة الإخبارية بنجاح!' 
        : 'Successfully subscribed to newsletter!' 
    });

  } catch (error) {
    console.error('Newsletter error:', error);
    res.status(500).json({ 
      error: 'Failed to subscribe to newsletter',
      details: error.message 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (EMAIL_HOST && RECIPIENT_EMAIL && RESERVE_EMAIL) {
    console.log(`📧 Email service: ${EMAIL_HOST}`);
    console.log(`📬 Sending emails to: ${RECIPIENT_EMAIL}, ${RESERVE_EMAIL}`);
  } else {
    console.log(`⚠️  Email service: Not configured (set environment variables)`);
  }
});
