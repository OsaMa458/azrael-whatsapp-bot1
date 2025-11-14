/**
 * AZRAEL — WhatsApp Group Management Bot
 * Terminal QR Code Version
 */

const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');

console.log('🚀 Starting AZRAEL WhatsApp Bot...');

// Load config
const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

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

let sock;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();
  
  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, {}),
    },
    printQRInTerminal: false, // We'll handle QR ourselves
    logger: {
      level: 'silent',
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
      child: () => logger
    }
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n\n🔐 ================================');
      console.log('📱 WHATSAPP QR CODE - SCAN NOW!');
      console.log('================================');
      console.log('Instructions:');
      console.log('1. Open WhatsApp on your phone');
      console.log('2. Tap Settings → Linked Devices');
      console.log('3. Tap Link a Device');
      console.log('4. Scan this QR code with your camera');
      console.log('================================\n');
      
      // Generate QR code in terminal
      qrcode.generate(qr, { small: true }, function (qrcode) {
        console.log(qrcode);
      });
      
      console.log('\n================================');
      console.log('⏰ QR Code expires in 30 seconds');
      console.log('================================\n');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting...');
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 5000);
      }
    } else if (connection === 'open') {
      console.log(`\n✅ ${BOT_NAME} is ready and online!`);
      console.log('🤖 Bot is now moderating your groups...');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Message handling (your existing functionality)
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    try {
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
          return;
        }
      }

      // Check for links
      const hasLink = /(https?:\/\/|www\.)/i.test(body);

      if (!whitelisted && senderId !== OWNER) {
        if (cfg.instantWarnOnLink && hasLink) {
          await sock.sendMessage(chatId, { 
            text: `⚠️ Link sharing not allowed by regular members.` 
          });
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
            text: `${BOT_NAME} is online. Warnings: ${Object.keys(warnings).length}` 
          });
        }
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
      }
    } catch(e) {
      console.warn('Group participants update error:', e.message);
    }
  });
}

// Start the bot
connectToWhatsApp();

// Keep the process alive
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'AZRAEL Bot is running', 
    bot: BOT_NAME,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Basic server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  saveWarnings();
  process.exit(0);
});
