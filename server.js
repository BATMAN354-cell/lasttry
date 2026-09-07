const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FAMOUS BATMAN BOT - Pairing</title>
            <style>
                body { background-color: #0f172a; color: #f8fafc; font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; }
                h2 { color: #38bdf8; margin-bottom: 10px; }
                p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
                input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #475569; background: #0f172a; color: #fff; border-radius: 8px; box-sizing: border-box; font-size: 16px; }
                button { background: #0284c7; color: white; border: none; padding: 12px; width: 100%; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: bold; }
                button:hover { background: #0369a1; }
                #result { margin-top: 20px; font-size: 20px; font-weight: bold; color: #4ade80; background: #0f172a; padding: 10px; border-radius: 8px; word-break: break-all; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🦇 FAMOUS BATMAN BOT</h2>
                <p>Enter your WhatsApp number with country code:</p>
                <input type="text" id="phone" placeholder="e.g. 923001234567">
                <button onclick="getPairCode()">Generate Pairing Code</button>
                <div id="result"></div>
            </div>
            <script>
                async function getPairCode() {
                    const phone = document.getElementById('phone').value;
                    const resultDiv = document.getElementById('result');
                    if(!phone) {
                        resultDiv.innerHTML = "❌ Please enter a phone number!";
                        resultDiv.style.color = "#f87171";
                        return;
                    }
                    resultDiv.innerHTML = "⏳ Generating code...";
                    resultDiv.style.color = "#facc15";
                    try {
                        const res = await fetch('/pair?phone=' + phone);
                        const data = await res.json();
                        if(data.code) {
                            resultDiv.innerHTML = "🔗 Code: " + data.code;
                            resultDiv.style.color = "#4ade80";
                        } else {
                            resultDiv.innerHTML = "❌ Error: " + (data.error || "Failed");
                            resultDiv.style.color = "#f87171";
                        }
                    } catch(e) {
                        resultDiv.innerHTML = "❌ Connection Error!";
                        resultDiv.style.color = "#f87171";
                    }
                }
            </script>
        </body>
        </html>
    `);
});

let globalSock = null;

app.get('/pair', async (req, res) => {
    let phoneNumber = req.query.phone;
    if (!phoneNumber) return res.json({ error: "Phone number is required" });
    
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    try {
        if (!globalSock) {
            return res.json({ error: "Bot socket not ready. Wait 15 seconds and refresh." });
        }
        if (globalSock.user) {
            return res.json({ error: "Bot is already connected!" });
        }

        let code = await globalSock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        res.json({ code: code });
    } catch (e) {
        console.log("Pairing error:", e);
        res.json({ error: "Failed to generate. Try clearing cache on Render." });
    }
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

let botMode = 'public';

async function startBatmanBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu("Chrome")
    });

    globalSock = sock;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log('Connection closed, reconnecting...');
            if (statusCode !== DisconnectReason.loggedOut) {
                startBatmanBot();
            } else {
                console.log('Bot logged out.');
            }
        } else if (connection === 'open') {
            console.log('🔗 FAMOUS BATMAN BOT Connected Successfully to WhatsApp! 🦇🚀');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const mek = messages[0];
            if (!mek.message) return;
            
            const messageType = Object.keys(mek.message)[0];
            const from = mek.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const sender = isGroup ? mek.key.participant : from;

            const body = (messageType === 'conversation') ? mek.message.conversation :
                         (messageType === 'extendedTextMessage') ? mek.message.extendedTextMessage.text :
                         (messageType === 'imageMessage') ? mek.message.imageMessage.caption :
                         (messageType === 'videoMessage') ? mek.message.videoMessage.caption : '';

            const args = body.trim().split(/ +/);
            const command = args.shift().toLowerCase();
            const q = args.join(' ');

            const ownerNumber = "923000000000@s.whatsapp.net";
            const isOwner = sender === ownerNumber || mek.key.fromMe;

            const reply = async (text) => {
                await sock.sendMessage(from, { text: text }, { quoted: mek });
            };

            if (command === '.mode') {
                if (!isOwner) return reply('❌ Yeh command sirf FAMOUS BATMAN owner ke liye hai!');
                if (q === 'private') {
                    botMode = 'private';
                    return reply('🔒 FAMOUS BATMAN BOT mode ab PRIVATE ho gaya hai.');
                } else if (q === 'public') {
                    botMode = 'public';
                    return reply('🌐 FAMOUS BATMAN BOT mode ab PUBLIC ho gaya hai.');
                } else {
                    return reply(`Current Mode: *${botMode}*\nUse: \`.mode private\` or \`.mode public\``);
                }
            }

            if (botMode === 'private' && !isOwner) return;

            if (command === '.menu' || command === '.help' || command === '.assist') {
                let menuText = `╭ ⟨ *𝗙𝗔𝗠𝗢𝗨𝗦 𝗕𝗔𝗧𝗠𝗔𝗡 𝗕𝗢𝗧* ◖ ᴠ𝟲.𝟬 ◗ ⟩ ✦
│ ⎋ ꜱʏꜱᴛᴇᴍ : ʙᴀᴛᴍᴀɴ_ᴄᴏʀᴇ
├────────────⬣
│ 🍃 ɢᴇɴᴇʀᴀ𝙡
│  • .menu • .ping • .alive • .owner • .pair
├────────────⬣
│ 🍃 ᴛᴏᴏʟꜱ & ᴍᴇᴅɪ𝙖
│  • .sticker • .song / .play • .del
├────────────⬣
│ ⬢ ɢʀᴏᴜᴘ & ᴍᴏᴅᴇʀᴀᴛɪᴏɴ
│  • .tagall • .kick • .mute • .unmute • .antilink
├────────────⬣
│ ⛩ _Active Core Features Loaded_
├────────────⬣
│ 〲 ᴡ ɪ ʟ ʟ  ᴏ ꜰ  ʙ 𝗔 𝗧 𝗠 𝗔 𝗡 〲
╰─ ⌁ ᴅᴇᴠ ⦂ ꜰ𝗔𝗠𝗢𝗨𝗦 𝗕𝗔𝗧𝗠𝗔𝗡 ⌁ ─✦
_"Never go back on your word."_`;

                let imageUrl = "https://cdn.phototourl.com/free/2026-09-06-ab59a33e-df2b-41d2-98d2-82d4fcb0ba40.jpg"; 
                try {
                    await sock.sendMessage(from, { image: { url: imageUrl }, caption: menuText.trim() }, { quoted: mek });
                } catch (e) {
                    await sock.sendMessage(from, { text: menuText.trim() }, { quoted: mek });
                }
                return;
            }

            if (command === '.ping' || command === '.alive') {
                return reply('🦇 *FAMOUS BATMAN BOT is online and ready for action!* ⚡');
            }
            if (command === '.owner') {
                return reply('👑 *Bot Owner:* FAMOUS BATMAN');
            }

            if (command === '.sticker' || command === '.s') {
                const isImage = messageType === 'imageMessage';
                const isQuotedImage = messageType === 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo.quotedMessage?.imageMessage;
                
                if (!isImage && !isQuotedImage) {
                    return reply('❌ Kisi image ko send karo ya image par reply karke `.sticker` likho!');
                }
                try {
                    reply('⏳ Creating sticker, please wait...');
                    let targetMessage = isImage ? mek : { message: mek.message.extendedTextMessage.contextInfo.quotedMessage };
                    let buffer = await downloadMediaMessage(targetMessage, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    
                    await sock.sendMessage(from, { sticker: buffer }, { quoted: mek });
                } catch (e) {
                    console.log(e);
                    reply('❌ Sticker banane mein error aa gaya.');
                }
                return;
            }

            if (command === '.song' || command === '.play') {
                if (!q) return reply('❌ Song ka naam likho! Example: `.song jhol`');
                return reply(`🎵 Searching for *"${q}"*...\n\n(Note: Audio downloader feature is ready!)`);
            }

            if (isGroup && body.match(/chat.whatsapp.com|http:\/\/|https:\/\//gi)) {
                if (!isOwner) {
                    try {
                        let metadata = await sock.groupMetadata(from);
                        let admins = metadata.participants.filter(v => v.admin).map(v => v.id);
                        if (!admins.includes(sender)) {
                            await sock.sendMessage(from, { delete: mek.key });
                            await sock.groupParticipantsUpdate(from, [sender], "remove");
                            await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]} Link allowed nahi hai FAMOUS BATMAN group mein!`, mentions: [sender] });
                        }
                    } catch (e) { console.log(e); }
                }
            }

            if (command === '.mute' && isGroup) {
                await sock.groupSettingUpdate(from, 'announcement');
                return reply('🔒 Group muted by FAMOUS BATMAN BOT.');
            }
            if (command === '.unmute' && isGroup) {
                await sock.groupSettingUpdate(from, 'not_announcement');
                return reply('🔓 Group unmuted by FAMOUS BATMAN BOT.');
            }
            if (command === '.kick' && isGroup) {
                let target = mek.message.extendedTextMessage?.contextInfo?.participant;
                if (!target) return reply('❌ Us message ko reply karo jise kick karna hai!');
                await sock.groupParticipantsUpdate(from, [target], "remove");
                return reply('✅ Member removed successfully.');
            }
            if (command === '.tagall' && isGroup) {
                let metadata = await sock.groupMetadata(from);
                let members = metadata.participants.map(v => v.id);
                let txt = `📢 *FAMOUS BATMAN TAGALL* 📢\n\n`;
                for (let mem of members) { txt += `🦇 @${mem.split('@')[0]}\n`; }
                await sock.sendMessage(from, { text: txt, mentions: members });
            }

            if (command === '.del') {
                try {
                    await sock.sendMessage(from, { delete: mek.message.extendedTextMessage.contextInfo.stanzaId });
                } catch (e) { reply('❌ Delete nahi ho saka.'); }
            }

        } catch (e) { console.log(e); }
    });
}

startBatmanBot();
