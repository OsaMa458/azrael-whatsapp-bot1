/**
 * AZRAEL — WhatsApp Group Management Bot
 * Working version for Railway
 */

console.log('🚀 Starting AZRAEL WhatsApp Bot...');

const express = require('express');
const app = express();

// Basic route to test if server works
app.get('/', (req, res) => {
  const publicUrl = process.env.RAILWAY_STATIC_URL || 
                   process.env.RAILWAY_PUBLIC_DOMAIN || 
                   `http://localhost:${process.env.PORT || 3000}`;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>AZRAEL Bot</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .status { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>AZRAEL WhatsApp Bot</h1>
        <div class="status">
            <h3>✅ Server is running!</h3>
            <p>Public URL: ${publicUrl}</p>
            <p>If you can see this, the basic server is working.</p>
        </div>
        <p>Next step: WhatsApp connection will be added once basic setup is confirmed.</p>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'AZRAEL Bot Server is running',
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 3000
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  
  // Log public URL if available
  const publicUrl = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
  if (publicUrl) {
    console.log(`🌍 Public URL: https://${publicUrl}`);
  }
});

// Basic error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
