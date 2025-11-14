const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting AZRAEL Bot Server...');

// Basic routes
app.get('/', (req, res) => {
  console.log('📄 Root route accessed');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>AZRAEL Bot - WORKING</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 40px 20px;
                background: #667eea;
                color: white;
                text-align: center;
            }
            .container {
                background: rgba(255,255,255,0.1);
                padding: 30px;
                border-radius: 15px;
            }
            .status {
                background: #28a745;
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;
                font-size: 1.2em;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 AZRAEL WhatsApp Bot</h1>
            <div class="status">
                <h2>✅ SERVER IS WORKING!</h2>
                <p>If you can see this, your deployment is successful!</p>
            </div>
            <p>Server Time: ${new Date().toISOString()}</p>
            <p>Port: ${PORT}</p>
            <p>Next: We'll add WhatsApp QR code functionality</p>
        </div>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  console.log('🏥 Health check accessed');
  res.json({
    status: 'OK',
    message: 'AZRAEL Bot Server is running',
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Start server - CRITICAL: Use '0.0.0.0' for Railway
app.listen(PORT, '0.0.0.0', () => {
  console.log('===================================');
  console.log('✅ SERVER STARTED SUCCESSFULLY!');
  console.log(`✅ Port: ${PORT}`);
  console.log(`✅ URL: https://arrael-whatsapp-bot1.up.railway.app`);
  console.log('===================================');
});

// Error handling
process.on('uncaughtException', (error) => {
  console.log('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
