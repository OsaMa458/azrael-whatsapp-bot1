/**
 * AZRAEL — WhatsApp Group Management Bot with Baileys
 * Optimized for Railway deployment
 */

const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const express = require('express');
const { Boom } = require('@hapi/boom');
const path = require('path');

// Load config
const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Create a proper logger object
const logger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => logger
};

// Helpers
function normNumber(n) {
  let s = ('' + n).replace(/\D/g,'');
  if (s.length === 10 && s.startsWith('03')) s = '92' + s.slice(1);
  return s + '@s.whatsapp.net';
}

const OWNER = normNumber(cfg.owner);
const BOT_NAME = cfg.botName || 'AZRAEL-GROUP';
let warnings = {};
const WARN_FILE = './warnings.json';

// Load warnings if exists
try { 
  if (fs.existsSync(WARN_FILE)) warnings = JSON.parse(fs.readFileSync(WARN_FILE, 'utf8')); 
} catch(e){ 
  console.warn('load warns err', e && e.message); 
}

function saveWarnings(){ 
  fs.writeFileSync(WARN_FILE, JSON.stringify(warnings, null, 2)); 
}

// Logging
function logEvent(text) {
  if (!cfg.logging || !cfg.logging.enabled) return;
  const line = `[${new Date().toISOString()}] ${text}\n`;
  fs.appendFileSync(cfg.logging.file || 'moderation_log.txt', line);
}

// Warnings
async function addWarning(chatId, participantId, reason, sock) {
  if (!warnings[participantId]) warnings[participantId] = { count: 0, lastReason: '' };
  warnings[participantId].count += 1;
  warnings[participantId].lastReason = reason;
  saveWarnings();
  const cnt = warnings[participantId].count;
  
  await sock.sendMessage(chatId, {
    text: `⚠️ Warning ${cnt}/${cfg.warnLimit} — @${participantId.replace('@s.whatsapp.net','')}\nReason: ${reason}`,
    mentions: [participantId]
  });
  
  logEvent(`WARN ${participantId} (${cnt}): ${reason}`);
  if (cnt >= (cfg.warnLimit || 3)) {
    await sock.sendMessage(chatId, {
      text: `🚫 User ${participantId.replace('@s.whatsapp.net','')} reached warning limit. Consider taking action.`
    });
  }
}

// Flood control
const floodMap = {};
function recordMessageForFlood(userId) {
  const now = Date.now();
  if (!floodMap[userId]) floodMap[userId] = [];
  floodMap[userId].push(now);
  const windowMs = (cfg.floodControl?.windowSeconds || 10) * 1000;
  floodMap[userId] = floodMap[userId].filter(t => t > now - windowMs);
  return floodMap[userId].length;
}

// Karachi time
function getKarachiHour() {
  return new Date().getUTCHours() + 5;
}

let sock;
let currentQR = '';

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();
  
  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, {}),
    },
    printQRInTerminal: false,
    logger: logger
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n\n🔐 QR Code received, generating image...');
      
      try {
        // Generate QR code as data URL
        const qrImageUrl = await qrcode.toDataURL(qr);
        currentQR = qrImageUrl;
        
        console.log('✅ QR Code image generated successfully!');
        console.log('📱 Open the web dashboard to scan the QR code');
        
        // Get public URL for Railway
        const publicUrl = process.env.RAILWAY_STATIC_URL || 
                         process.env.RAILWAY_PUBLIC_DOMAIN || 
                         `http://localhost:${PORT}`;
        console.log(`🌐 Dashboard: ${publicUrl}`);
      } catch (error) {
        console.error('❌ Error generating QR code:', error.message);
        // Fallback to terminal QR
        const qrcodeTerminal = require('qrcode-terminal');
        qrcodeTerminal.generate(qr, { small: true });
        console.log('\n📱 Scan the QR code above with WhatsApp -> Linked Devices\n');
      }
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 5000);
      }
    } else if (connection === 'open') {
      console.log(`\n✅ ${BOT_NAME} is ready and online!`);
      currentQR = ''; // Clear QR after successful connection
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Message handling
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    try {
      // Check if message is from group
      const chatId = msg.key.remoteJid;
      if (!chatId.endsWith('@g.us')) return;

      const body = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || '';

      if (!body.trim()) return;

      const senderId = msg.key.participant || msg.key.remoteJid;
      const whitelisted = (cfg.whitelist || []).includes(senderId);

      // Flood control
      if (cfg.floodControl?.enabled) {
        const count = recordMessageForFlood(senderId);
        if (count > (cfg.floodControl.maxMessagesPerWindow || 6)) {
          await sock.sendMessage(chatId, { text: '⚠️ Please avoid spamming.' });
          await addWarning(chatId, senderId, 'Flooding messages', sock);
          return;
        }
      }

      // Quiet hours
      if (cfg.quietHours?.enabled && !whitelisted && senderId !== OWNER) {
        const hour = getKarachiHour();
        const start = cfg.quietHours.startHourKarachi;
        const end = cfg.quietHours.endHourKarachi;
        const inQuiet = (start <= end) ? (hour >= start && hour < end) : (hour >= start || hour < end);
        
        if (inQuiet) {
          await sock.sendMessage(chatId, { 
            text: cfg.quietHours.reminderMessage || '🔕 Quiet hours active. Please avoid sending messages.' 
          });
          return;
        }
      }

      // Check for links
      const hasLink = /(https?:\/\/|www\.)/i.test(body);

      if (!whitelisted && senderId !== OWNER) {
        if (cfg.instantWarnOnLink && hasLink) {
          await addWarning(chatId, senderId, 'Shared link', sock);
          return;
        }
      }

      // Owner commands
      if (body.startsWith('!') && senderId === OWNER) {
        const parts = body.split(/\s+/);
        const cmd = parts[0].toLowerCase();

        if (cmd === '!rules') {
          await sock.sendMessage(chatId, { text: cfg.groupRulesText });
        }
        else if (cmd === '!status') {
          await sock.sendMessage(chatId, { 
            text: `${BOT_NAME} is online. Warnings stored: ${Object.keys(warnings).length}` 
          });
        }
        else if (cmd === '!warnreset') {
          warnings = {}; 
          saveWarnings(); 
          await sock.sendMessage(chatId, { text: '✅ All warnings cleared.' });
        }
        else if (cmd === '!whitelist' && parts[1]) {
          const sub = parts[1].toLowerCase();
          if (sub === 'add' && parts[2]) {
            const num = normNumber(parts[2]);
            if (!cfg.whitelist.includes(num)) {
              cfg.whitelist.push(num);
              fs.writeFileSync('./config.json', JSON.stringify(cfg, null, 2));
              await sock.sendMessage(chatId, { 
                text: `✅ ${num.replace('@s.whatsapp.net','')} added to whitelist.` 
              });
            } else {
              await sock.sendMessage(chatId, { 
                text: `ℹ️ ${num.replace('@s.whatsapp.net','')} is already in whitelist.` 
              });
            }
          } else if (sub === 'remove' && parts[2]) {
            const num = normNumber(parts[2]);
            cfg.whitelist = cfg.whitelist.filter(w => w !== num);
            fs.writeFileSync('./config.json', JSON.stringify(cfg, null, 2));
            await sock.sendMessage(chatId, { 
              text: `✅ ${num.replace('@s.whatsapp.net','')} removed from whitelist.` 
            });
          } else if (sub === 'list') {
            const list = (cfg.whitelist || []).map(x => x.replace('@s.whatsapp.net','')).join('\n') || 'No users in whitelist';
            await sock.sendMessage(chatId, { text: `📋 Whitelist users:\n${list}` });
          } else {
            await sock.sendMessage(chatId, { text: 'Usage: !whitelist add/remove/list <number>' });
          }
        }
        else if (cmd === '!warn' && parts[1]) {
          const target = normNumber(parts[1]);
          const reason = parts.slice(2).join(' ') || 'No reason provided';
          await addWarning(chatId, target, reason, sock);
        }
        else {
          await sock.sendMessage(chatId, { 
            text: '❌ Unknown command. Available: !rules, !status, !warnreset, !whitelist, !warn' 
          });
        }
        return;
      }

    } catch(e) { 
      console.warn('Message handling error:', e.message); 
    }
  });

  // Group participants update
  sock.ev.on('group-participants.update', async (update) => {
    try {
      const { id, participants, action } = update;
      
      if (action === 'add') {
        for (let participant of participants) {
          await sock.sendMessage(id, {
            text: `🎓 Welcome @${participant.replace('@s.whatsapp.net','')} to ${cfg.groupName || 'the group'}!\nPlease read rules: type !rules`,
            mentions: [participant]
          });
        }
      } else if (action === 'remove') {
        for (let participant of participants) {
          await sock.sendMessage(id, {
            text: `👋 Goodbye @${participant.replace('@s.whatsapp.net','')}`,
            mentions: [participant]
          });
        }
      }
    } catch(e) {
      console.warn('Group participants update error:', e.message);
    }
  });
}

// Keep-alive server
const app = express();

// Serve static files if needed
app.use(express.static('public'));

app.get('/', (req, res) => {
  let qrHtml = '';
  if (currentQR) {
    qrHtml = `
      <div style="margin: 20px 0; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center;">
        <h3 style="color: #25D366; margin-bottom: 15px;">📱 Scan QR Code to Connect WhatsApp</h3>
        <img src="${currentQR}" alt="WhatsApp QR Code" style="max-width: 300px; width: 100%; border: 2px solid #25D366; border-radius: 10px;" />
        <div style="margin-top: 15px; background: #f8f9fa; padding: 15px; border-radius: 5px;">
          <h4>Instructions:</h4>
          <ol style="text-align: left; display: inline-block;">
            <li>Open WhatsApp on your phone</li>
            <li>Tap <strong>Settings</strong> → <strong>Linked Devices</strong></li>
            <li>Tap <strong>Link a Device</strong></li>
            <li>Point your phone at this QR code to scan</li>
          </ol>
        </div>
        <p style="margin-top: 10px; color: #666; font-size: 12px;">
          QR code will expire in 30 seconds. Refresh page if needed.
        </p>
      </div>
    `;
  } else {
    qrHtml = `
      <div style="margin: 20px 0; padding: 15px; background: #d4edda; color: #155724; border-radius: 5px;">
        <h3>✅ WhatsApp Connected</h3>
        <p>Your WhatsApp is successfully connected to ${BOT_NAME}.</p>
      </div>
    `;
  }
  
  // Get public URL for display
  const publicUrl = process.env.RAILWAY_STATIC_URL || 
                   process.env.RAILWAY_PUBLIC_DOMAIN || 
                   `http://localhost:${PORT}`;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${BOT_NAME} Group Bot</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
          }
          .container {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #f0f0f0;
          }
          .header h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2.2em;
          }
          .header p {
            color: #666;
            font-size: 1.1em;
          }
          .status-card {
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            background: #f8f9fa;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
          }
          .info-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
          }
          .info-item h4 {
            color: #333;
            margin-bottom: 5px;
          }
          .info-item p {
            color: #666;
            font-size: 1.1em;
          }
          .url-info {
            background: #e7f3ff;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${BOT_NAME}</h1>
            <p>WhatsApp Group Management Bot</p>
            <div class="url-info">
              <strong>Public URL:</strong> ${publicUrl}
            </div>
          </div>
          
          ${qrHtml}
          
          <div class="info-grid">
            <div class="info-item">
              <h4>📊 Status</h4>
              <p>${currentQR ? 'Waiting for QR Scan' : 'Connected & Running'}</p>
            </div>
            <div class="info-item">
              <h4>⚠️ Warnings</h4>
              <p>${Object.keys(warnings).length} stored</p>
            </div>
            <div class="info-item">
              <h4>👥 Group</h4>
              <p>${cfg.groupName || 'Not specified'}</p>
            </div>
            <div class="info-item">
              <h4>👑 Owner</h4>
              <p>${cfg.owner}</p>
            </div>
          </div>
          
          <div class="status-card">
            <h4>Bot Features:</h4>
            <ul style="margin-left: 20px; margin-top: 10px; color: #555;">
              <li>Group moderation and rules enforcement</li>
              <li>Warning system with ${cfg.warnLimit} warning limit</li>
              <li>Automatic link protection</li>
              <li>Flood control system</li>
              <li>Quiet hours (${cfg.quietHours?.startHourKarachi || 0}:00 - ${cfg.quietHours?.endHourKarachi || 5}:00 Karachi Time)</li>
              <li>Welcome and goodbye messages</li>
            </ul>
          </div>
        </div>
        
        <script>
          // Auto-refresh page every 10 seconds if QR code is displayed
          if (${currentQR ? 'true' : 'false'}) {
            setTimeout(() => {
              window.location.reload();
            }, 10000);
          }
        </script>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ${BOT_NAME} server running on port ${PORT}`);
  
  // Get public URL for Railway
  const publicUrl = process.env.RAILWAY_STATIC_URL || 
                   process.env.RAILWAY_PUBLIC_DOMAIN || 
                   `http://localhost:${PORT}`;
  console.log(`🌐 Public Dashboard: ${publicUrl}`);
  
  console.log('\n📱 QR Code will appear on the web dashboard when ready...\n');
  connectToWhatsApp();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  saveWarnings();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  saveWarnings();
  process.exit(0);
});
