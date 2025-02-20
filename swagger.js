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
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
  },
  apis: ['./index.js'],
};

const specs = swaggerJsdoc(options);
module.exports = specs;