# 🌍 Earth Footprint Backend

Simple, single-file backend API for Earth Footprint Environmental Consultations.

## 📁 Structure

```
backend/
├── app.js              # Single application file
├── package.json        # Dependencies
├── vercel.json         # Vercel configuration
└── env.vercel.example  # Environment variables template
```

## 🚀 Features

- ✅ **Contact Form API**: `/api/contact`
- ✅ **Newsletter API**: `/api/newsletter`
- ✅ **CORS Enabled**: All origins allowed
- ✅ **Email Integration**: Nodemailer with SMTP
- ✅ **Dual Email**: Sends to main + reserve email
- ✅ **Arabic Content**: All emails in Arabic

## 🔧 Environment Variables

```env
EMAIL_USER=customer-service@erthfc.com
EMAIL_PASS=Ejc9c123@#
EMAIL_HOST=mail.spacemail.com
EMAIL_PORT=465
EMAIL_SECURE=true
RECIPIENT_EMAIL=customer-service@erthfc.com
```

## 📡 API Endpoints

### Contact Form

```bash
POST /api/contact
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "service": "Environmental Permits",
  "message": "Hello, I need help with...",
  "language": "ar"
}
```

### Newsletter

```bash
POST /api/newsletter
Content-Type: application/json

{
  "email": "john@example.com",
  "language": "ar"
}
```

## 🚀 Deployment

1. **Deploy to Vercel**:

   ```bash
   npm i -g vercel
   cd backend
   vercel
   ```

2. **Add Environment Variables** in Vercel Dashboard

3. **Test API**:
   ```bash
   curl -X POST https://your-app.vercel.app/api/contact \
     -H "Content-Type: application/json" \
     -d '{"name":"Test","email":"test@example.com","message":"Test"}'
   ```

## 📧 Email Configuration

- **SMTP Server**: mail.spacemail.com:465
- **Security**: SSL/TLS
- **Recipients**: customer-service@erthfc.com, alshraky3@gmail.com
- **Language**: All emails sent in Arabic

---

**Simple, Clean, Production-Ready! 🚀**
