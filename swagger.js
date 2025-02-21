const swaggerJsdoc = require('swagger-jsdoc');

// Pre-generate and cache the Swagger documentation
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Email Sending API',
      version: '1.0.0',
      description: 'API for sending emails with attachments',
    },
    servers: [
      {
        url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
        description: process.env.VERCEL_URL ? 'Production server' : 'Development server'
      }
    ],
  },
  apis: ['./index.js'],
};

// Generate the documentation once at startup
const swaggerSpec = swaggerJsdoc(options);

// Export the pre-generated documentation
module.exports = swaggerSpec;