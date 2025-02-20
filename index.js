require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();

// HTTPS configuration
const useHTTPS = process.env.NODE_ENV === 'production';
if (useHTTPS) {
  try {
    const options = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH)
    };
    const httpsServer = https.createServer(options, app);
    httpsServer.listen(443, () => {
      console.log('HTTPS Server running on port 443');
    });
  } catch (error) {
    console.error('Failed to start HTTPS server:', error);
    process.exit(1);
  }
}

// Multer config with memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Security middleware
app.use((req, res, next) => {
  if (useHTTPS && !req.secure) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'");
  next();
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/send-email', upload.array('attachments'), async (req, res) => {
  try {
    const { name, email, message, subject, recipients } = req.body;
    const files = req.files || [];

    // Validate input
    if (!name || !email || !message || !subject || !recipients) {
      throw new Error('All fields are required');
    }

    // Parse and validate recipients
    const recipientList = recipients.split(',').map(email => email.trim());
    if (recipientList.length === 0) {
      throw new Error('At least one recipient is required');
    }
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const recipientEmail of recipientList) {
      if (!emailRegex.test(recipientEmail)) {
        throw new Error(`Invalid email format: ${recipientEmail}`);
      }
    }

    let transportConfig;

    // Check if OAuth2 credentials are available
    if (process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET && process.env.OAUTH_REFRESH_TOKEN) {
      transportConfig = {
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.SMTP_USER,
          clientId: process.env.OAUTH_CLIENT_ID,
          clientSecret: process.env.OAUTH_CLIENT_SECRET,
          refreshToken: process.env.OAUTH_REFRESH_TOKEN,
          accessToken: process.env.OAUTH_ACCESS_TOKEN,
          expires: parseInt(process.env.OAUTH_EXPIRES_IN || '3600', 10)
        }
      };
    } else {
      // Fall back to SMTP configuration
      transportConfig = {
        host: req.body.smtp_host || process.env.SMTP_HOST,
        port: parseInt(req.body.smtp_port || process.env.SMTP_PORT, 10),
        secure: req.body.smtp_secure !== undefined ? req.body.smtp_secure === 'true' : process.env.SMTP_SECURE === 'true',
        auth: {
          user: req.body.smtp_user || process.env.SMTP_USER,
          pass: req.body.smtp_pass || process.env.SMTP_PASS
        }
      };
    }

    const transporter = nodemailer.createTransport(transportConfig);

    // Prepare email
    const mailOptions = {
      from: `"${name}" <${req.body.smtp_user || process.env.SMTP_USER}>`,
      to: recipientList.join(', '),
      subject: `${subject} [From: ${email}]`,
      text: message,
      attachments: files.map(file => ({
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype
      }))
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    // Success response
    res.send(`
      <script>
        alert("Email sent successfully!");
        window.location.href = "/";
      </script>
    `);

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send(`
      <script>
        alert("Error: ${error.message.replace(/"/g, '\\"')}");
        window.location.href = "/";
      </script>
    `);
  }
});

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}${useHTTPS ? ' with HTTPS' : ''}`);
});