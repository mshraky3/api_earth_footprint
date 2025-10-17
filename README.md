# Earth Footprint Backend API

Simple Express server for handling contact forms and email sending.

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create .env file:**
   ```bash
   cp env.example .env
   ```

3. **Configure your email settings in .env:**
   ```env
   EMAIL_SERVICE=gmail
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   RECIPIENT_EMAIL=your-email@gmail.com
   PORT=5000
   ```

4. **Start the server:**
   ```bash
   npm run dev
   ```

## 📧 Email Setup

### For Gmail:
1. Enable 2-factor authentication
2. Generate an "App Password"
3. Use the app password in EMAIL_PASS

### For Other Providers:
- **Outlook**: Use `hotmail` as EMAIL_SERVICE
- **Yahoo**: Use `yahoo` as EMAIL_SERVICE
- **Custom SMTP**: Configure manually

## 🔗 API Endpoints

### POST /api/contact
Send contact form emails.

**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "message": "Hello, I'm interested in your services.",
  "language": "en"
}
```

### POST /api/newsletter
Subscribe to newsletter.

**Body:**
```json
{
  "email": "john@example.com",
  "language": "en"
}
```

## 🌐 CORS Enabled
The server is configured to accept requests from your React frontend.

## 📝 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| EMAIL_SERVICE | Email provider | gmail |
| EMAIL_USER | Your email | your-email@gmail.com |
| EMAIL_PASS | App password | your-app-password |
| RECIPIENT_EMAIL | Where to send emails | your-email@gmail.com |
| PORT | Server port | 5000 |
