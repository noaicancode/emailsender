const swaggerJsdoc = require('swagger-jsdoc');

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
        url: process.env.NODE_ENV === 'production' ? 'https://smtp-api.vercel.app' : 'http://localhost:3000',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
  },
  apis: ['./index.js'],
};

const specs = swaggerJsdoc(options);
module.exports = specs;