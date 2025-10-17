const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const PORT = process.env.PORT || 5000;

// Debug environment variables
console.log('🔧 Environment Variables:');
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '***hidden***' : 'undefined');
console.log('EMAIL_HOST:', process.env.EMAIL_HOST);
console.log('RECIPIENT_EMAIL:', process.env.RECIPIENT_EMAIL);

// Hardcoded values for testing
const EMAIL_USER = process.env.EMAIL_USER || 'customer-service@erthfc.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'Ejc9c123@#';
const EMAIL_HOST = process.env.EMAIL_HOST || 'mail.spacemail.com';
const EMAIL_PORT = process.env.EMAIL_PORT || 465;
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true' || true;
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || 'customer-service@erthfc.com';
const RESERVE_EMAIL = 'alshraky3@gmail.com';

console.log('🔧 Using values:');
console.log('EMAIL_USER:', EMAIL_USER);
console.log('EMAIL_PASS:', EMAIL_PASS ? '***hidden***' : 'undefined');
console.log('EMAIL_HOST:', EMAIL_HOST);
console.log('RECIPIENT_EMAIL:', RECIPIENT_EMAIL);

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
  res.json({ message: 'Earth Footprint Backend API is running!' });
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

    res.json({ 
      success: true, 
      message: language === 'ar' 
        ? 'تم إرسال الرسالة بنجاح!' 
        : 'Message sent successfully!' 
    });

  } catch (error) {
    console.error('Email error:', error);
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

    res.json({ 
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
    console.log(`Server is running`);
});
