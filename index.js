require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const https = require('https');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();

// Swagger definition
/**
 * @swagger
 * components:
 *   schemas:
 *     EmailRequest:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - subject
 *         - message
 *       properties:
 *         name:
 *           type: string
 *           example: John Doe
 *         email:
 *           type: string
 *           format: email
 *           example: john@example.com
 *         subject:
 *           type: string
 *           example: Meeting Request
 *         message:
 *           type: string
 *           example: Hello, I would like to schedule a meeting.
 *         attachments:
 *           type: array
 *           items:
 *             type: string
 *             format: binary
 *         smtp_host:
 *           type: string
 *           description: SMTP server hostname
 *           example: smtp.example.com
 *         smtp_port:
 *           type: integer
 *           description: SMTP server port
 *           example: 587
 *         smtp_secure:
 *           type: boolean
 *           description: Use secure SMTP connection
 *           example: true
 *         smtp_user:
 *           type: string
 *           description: SMTP username
 *           example: user@example.com
 *         smtp_pass:
 *           type: string
 *           format: password
 *           description: SMTP password
 *           example: your-smtp-password
 *   responses:
 *     Success:
 *       description: Operation completed successfully
 *       content:
 *         text/html:
 *           schema:
 *             type: string
 *     Error:
 *       description: Operation failed
 *       content:
 *         text/html:
 *           schema:
 *             type: string
 */

const swaggerDocs = require('./swagger');

// Serve Swagger UI with optimized middleware for serverless environment
app.use('/api-docs', (req, res, next) => {
  // Set CORS headers for Swagger UI
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Cache-Control', 'public, max-age=0');
  next();
}, swaggerUi.serve);

// Serve Swagger UI with pre-generated docs
app.get('/api-docs', swaggerUi.setup(swaggerDocs, {
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true
  }
}));

// Vercel handles HTTPS automatically
const useHTTPS = false;

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
app.use(express.static(path.join(__dirname, 'public')));

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
/**
 * @swagger
 * /:
 *   get:
 *     tags: [Email]
 *     summary: Get email form
 *     description: Returns the HTML page containing the email form
 *     responses:
 *       200:
 *         description: HTML page successfully returned
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */

/**
 * @swagger
 * /send-email:
 *   post:
 *     tags: [Email]
 *     summary: Send email with attachments
 *     description: Sends an email with optional file attachments
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/EmailRequest'
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       400:
 *         $ref: '#/components/responses/Error'
 *       500:
 *         $ref: '#/components/responses/Error'
 */
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