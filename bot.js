/**
 * AZRAEL — WhatsApp Group Management Bot
 * HEROKU COMPATIBLE VERSION
 */

const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');

console.log('🚀 Starting AZRAEL WhatsApp Bot on Heroku...');

// Simple logger that works with Heroku
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

// Configuration
const config = {
  owner: "923299132452",
  botName: "AZRAEL-GROUP",
  groupName: "VU (ALL SEM) STUDENTS 🤯 💯 ✅",
  groupRulesText: "📌 All Subjects Assignment Available\n📌 All Subjects GDB Solution Available\n📌 All Subjects Quiz Available\n📌 Lecture Views Assistance\n🎯 With 80 to 100% Guaranteed Marks\n\nGroup Rules:\n✅ No one, except the admins, can share links.\n✅ Avoid off-topic conversations in the chat.\n✅ Behave respectfully; misbehavior is not allowed.\n✅ Do not send private messages to anyone, whether they are boys or girls, without their permission.\n✅ Share only study-related content like assignments, quizzes, GDBs, and past papers.\n\n📌 Note: If no one is helping you in the group, you can mention or DM the admin for any help regarding study.",
  warnLimit: 3,
  instantWarnOnLink: true,
  floodControl: { enabled: true, maxMessagesPerWindow: 6, windowSeconds: 10 },
  quietHours: { enabled: true, startHourKarachi: 0, endHourKarachi: 5 }
};

let sock;

async function connectToWhatsApp() {
  try {
    console.log('🔗 Connecting to WhatsApp...');
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger: logger
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('\n\n🔐 ================================');
        console.log('📱 WHATSAPP QR CODE - SCAN NOW!');
        console.log('================================');
        console.log('Instructions:');
        console.log('1. Open WhatsApp → Settings → Linked Devices');
        console.log('2. Tap Link a Device');
        console.log('3. Scan the QR code below');
        console.log('================================\n');
        
        // Generate QR code
        qrcode.generate(qr, { small: true });
        
        console.log('\n================================');
        console.log('⏰ QR Code expires in 30 seconds');
        console.log('================================\n');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('🔌 Connection closed, reconnecting in 5 seconds...');
        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 5000);
        }
      } else if (connection === 'open') {
        console.log(`\n✅ ${config.botName} is ready and online!`);
        console.log('🤖 Bot is now moderating your groups...');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Message handling
    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      try {
        const chatId = msg.key.remoteJid;
        if (!chatId.endsWith('@g.us')) return;

        const body = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || '';

        if (!body.trim()) return;

        const senderId = msg.key.participant || msg.key.remoteJid;

        // Owner commands
        if (body.startsWith('!') && senderId === (config.owner + '@s.whatsapp.net')) {
          const cmd = body.toLowerCase().trim();
          
          if (cmd === '!rules') {
            await sock.sendMessage(chatId, { text: config.groupRulesText });
            console.log('📜 Rules command executed');
          }
          else if (cmd === '!status') {
            await sock.sendMessage(chatId, { 
              text: `✅ ${config.botName} is online!\n🏠 Hosted on Heroku\n🤖 Bot is working properly.` 
            });
            console.log('📊 Status command executed');
          }
          else if (cmd === '!ping') {
            await sock.sendMessage(chatId, { 
              text: `🏓 Pong! ${config.botName} is alive and kicking!` 
            });
          }
        }

      } catch(e) { 
        console.warn('Message error:', e.message); 
      }
    });

    // Welcome messages
    sock.ev.on('group-participants.update', async (update) => {
      try {
        const { id, participants, action } = update;
        
        if (action === 'add') {
          for (let participant of participants) {
            await sock.sendMessage(id, {
              text: `🎓 Welcome @${participant.replace('@s.whatsapp.net','')} to ${config.groupName}!\n\nPlease read rules by typing: !rules`,
              mentions: [participant]
            });
            console.log(`👋 Welcome message sent to ${participant}`);
          }
        }
      } catch(e) {
        console.warn('Welcome message error:', e.message);
      }
    });

  } catch (error) {
    console.error('❌ Connection error:', error.message);
    console.log('🔄 Retrying in 10 seconds...');
    setTimeout(connectToWhatsApp, 10000);
  }
}

// Start bot
connectToWhatsApp();

// Basic web server for Heroku
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>AZRAEL WhatsApp Bot</title></head>
      <body>
        <h1>🤖 AZRAEL WhatsApp Bot</h1>
        <p>Status: ✅ Running on Heroku</p>
        <p>Check Heroku logs for QR code to connect WhatsApp</p>
        <p>Bot: ${config.botName}</p>
        <p>Owner: ${config.owner}</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});
