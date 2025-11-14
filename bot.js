/**
 * AZRAEL — WhatsApp Group Management Bot
 * FIXED VERSION - Proper logger implementation
 */

const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');
const pino = require('pino');

console.log('🚀 Starting AZRAEL WhatsApp Bot...');

// Load config
const cfg = {
  owner: "923299132452",
  botName: "AZRAEL-GROUP",
  groupName: "VU (ALL SEM) STUDENTS 🤯 💯 ✅",
  groupRulesText: "📌 All Subjects Assignment Available\n📌 All Subjects GDB Solution Available\n📌 All Subjects Quiz Available\n📌 Lecture Views Assistance\n🎯 With 80 to 100% Guaranteed Marks\n\nGroup Rules:\n✅ No one, except the admins, can share links.\n✅ Avoid off-topic conversations in the chat.\n✅ Behave respectfully; misbehavior is not allowed.\n✅ Do not send private messages to anyone, whether they are boys or girls, without their permission.\n✅ Share only study-related content like assignments, quizzes, GDBs, and past papers.\n\n📌 Note: If no one is helping you in the group, you can mention or DM the admin for any help regarding study.",
  warnLimit: 3,
  instantWarnOnLink: true,
  floodControl: { enabled: true, maxMessagesPerWindow: 6, windowSeconds: 10 },
  quietHours: { enabled: true, startHourKarachi: 0, endHourKarachi: 5 }
};

// PROPER LOGGER - This fixes the error
const logger = pino({
  level: 'silent',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: true
    }
  }
});

let sock;

async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger: logger // Use the proper logger
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
        
        // Generate QR code in terminal
        qrcode.generate(qr, { small: true }, function (qrcode) {
          console.log(qrcode);
        });
        
        console.log('\n================================');
        console.log('⏰ QR Code expires in 30 seconds');
        console.log('📱 If it expires, the bot will auto-generate a new one');
        console.log('================================\n');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('🔌 Connection closed, reconnecting...');
        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 5000);
        }
      } else if (connection === 'open') {
        console.log(`\n✅ ${cfg.botName} is ready and online!`);
        console.log('🤖 Bot is now moderating your groups...');
        console.log('📝 Available commands: !rules, !status');
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
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || '';

        if (!body.trim()) return;

        const senderId = msg.key.participant || msg.key.remoteJid;

        // Owner commands
        if (body.startsWith('!') && senderId === (cfg.owner + '@s.whatsapp.net')) {
          const cmd = body.toLowerCase().trim();
          
          if (cmd === '!rules') {
            await sock.sendMessage(chatId, { text: cfg.groupRulesText });
            console.log('📜 Rules command executed');
          }
          else if (cmd === '!status') {
            await sock.sendMessage(chatId, { 
              text: `✅ ${cfg.botName} is online and active!\n🤖 Bot is working properly.` 
            });
            console.log('📊 Status command executed');
          }
          else if (cmd === '!help') {
            await sock.sendMessage(chatId, { 
              text: `Available Commands:\n!rules - Show group rules\n!status - Check bot status\n!help - Show this help` 
            });
          }
        }

        // Auto-response for testing
        if (body.toLowerCase().includes('bot test')) {
          await sock.sendMessage(chatId, { 
            text: `🤖 ${cfg.botName} is working! I can read messages and respond.` 
          });
        }

      } catch(e) { 
        console.warn('Message handling error:', e.message); 
      }
    });

    // Group participants update - Welcome messages
    sock.ev.on('group-participants.update', async (update) => {
      try {
        const { id, participants, action } = update;
        
        if (action === 'add') {
          for (let participant of participants) {
            await sock.sendMessage(id, {
              text: `🎓 Welcome @${participant.replace('@s.whatsapp.net','')} to ${cfg.groupName}!\n\nPlease read the group rules by typing: !rules`,
              mentions: [participant]
            });
            console.log(`👋 Welcome message sent to ${participant}`);
          }
        } else if (action === 'remove') {
          for (let participant of participants) {
            console.log(`👋 ${participant} left the group`);
          }
        }
      } catch(e) {
        console.warn('Group participants update error:', e.message);
      }
    });

  } catch (error) {
    console.error('❌ Failed to connect to WhatsApp:', error.message);
    console.log('🔄 Retrying in 10 seconds...');
    setTimeout(connectToWhatsApp, 10000);
  }
}

// Start the bot
connectToWhatsApp();

// Basic web server to keep Railway happy
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'AZRAEL WhatsApp Bot is Running', 
    bot: cfg.botName,
    features: ['Group Moderation', 'Auto Welcome', 'Rules Enforcement', 'Link Protection'],
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'AZRAEL WhatsApp Bot',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Basic web server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down bot gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down bot gracefully...');
  process.exit(0);
});
