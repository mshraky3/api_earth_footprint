import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

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
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL;
const RESERVE_EMAIL = process.env.RESERVE_EMAIL;

// Debug environment variables
console.log('Environment variables check:', {
  EMAIL_USER: EMAIL_USER ? 'SET' : 'MISSING',
  EMAIL_PASS: EMAIL_PASS ? 'SET' : 'MISSING', 
  EMAIL_HOST: EMAIL_HOST ? 'SET' : 'MISSING',
  RECIPIENT_EMAIL: RECIPIENT_EMAIL ? 'SET' : 'MISSING',
  RESERVE_EMAIL: RESERVE_EMAIL ? 'SET' : 'MISSING'
});

// Validate required environment variables
if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_HOST || !RECIPIENT_EMAIL || !RESERVE_EMAIL) {
  console.error('❌ Missing required environment variables for email configuration');
  console.error('Required: EMAIL_USER, EMAIL_PASS, EMAIL_HOST, RECIPIENT_EMAIL, RESERVE_EMAIL');
  console.error('⚠️  Server will start but email functionality will be disabled');
}


// Middleware
app.use(cors());
app.use(express.json());

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

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Earth Footprint Backend API is running!',
    endpoints: {
      contact: '/api/contact',
      newsletter: '/api/newsletter',
      debug: '/api/debug'
    },
    status: 'active'
  });
});

// Debug endpoint to check environment variables
app.get('/api/debug', (req, res) => {
  res.json({
    environment: {
      EMAIL_USER: EMAIL_USER ? 'SET' : 'MISSING',
      EMAIL_PASS: EMAIL_PASS ? 'SET' : 'MISSING',
      EMAIL_HOST: EMAIL_HOST ? 'SET' : 'MISSING',
      RECIPIENT_EMAIL: RECIPIENT_EMAIL ? 'SET' : 'MISSING',
      RESERVE_EMAIL: RESERVE_EMAIL ? 'SET' : 'MISSING'
    },
    nodeEnv: process.env.NODE_ENV
  });
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, service, message, language } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({ 
        error: 'Name, email, and message are required' 
      });
    }

    // Check if email configuration is available
    if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_HOST || !RECIPIENT_EMAIL || !RESERVE_EMAIL) {
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
      <p><strong>الخدمة المطلوبة:</strong> ${service || 'غير محدد'}</p>
      <p><strong>الرسالة:</strong></p>
      <p>${message}</p>
      <hr>
      <p><em>تم الإرسال من موقع بصمة الأرض</em></p>
    `;

    // Email options - send to both main and reserve email
    const mailOptions = {
      from: EMAIL_USER,
      to: `${RECIPIENT_EMAIL}, ${RESERVE_EMAIL}`,
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
    if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_HOST || !RECIPIENT_EMAIL || !RESERVE_EMAIL) {
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

    const mailOptions = {
      from: EMAIL_USER,
      to: `${RECIPIENT_EMAIL}, ${RESERVE_EMAIL}`,
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
