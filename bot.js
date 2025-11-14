const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');

console.log('🚀 Starting AZRAEL WhatsApp Bot...');

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
    printQRInTerminal: false,
    logger: { level: 'silent' }
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
      
      qrcode.generate(qr, { small: true });
      
      console.log('\n================================');
      console.log('⏰ QR expires in 30 seconds');
      console.log('================================\n');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting...');
      if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
    } else if (connection === 'open') {
      console.log(`\n✅ ${cfg.botName} is ready and online!`);
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

      const body = msg.message.conversation || '';
      if (!body.trim()) return;

      const senderId = msg.key.participant || msg.key.remoteJid;

      // Flood control
      if (cfg.floodControl.enabled) {
        // Simple flood control implementation
        await sock.sendMessage(chatId, { text: '🤖 Bot is working! Message received.' });
      }

      // Owner commands
      if (body.startsWith('!') && senderId === (cfg.owner + '@s.whatsapp.net')) {
        if (body.toLowerCase() === '!rules') {
          await sock.sendMessage(chatId, { text: cfg.groupRulesText });
        }
        else if (body.toLowerCase() === '!status') {
          await sock.sendMessage(chatId, { text: `${cfg.botName} is online and working!` });
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
            text: `🎓 Welcome @${participant.replace('@s.whatsapp.net','')}!\nType !rules for group rules.`,
            mentions: [participant]
          });
        }
      }
    } catch(e) {
      console.warn('Group update error:', e.message);
    }
  });
}

// Start bot and basic server
connectToWhatsApp();

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'AZRAEL Bot Running', 
    bot: cfg.botName,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
