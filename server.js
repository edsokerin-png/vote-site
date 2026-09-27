const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const EMAIL_PASS  = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: ADMIN_EMAIL, pass: EMAIL_PASS },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('public'));

const VOTES_FILE  = path.join(__dirname, 'votes.json');
const EMAILS_FILE = path.join(__dirname, 'emails.json');

function initFiles() {
  if (!fs.existsSync(VOTES_FILE))
    fs.writeFileSync(VOTES_FILE, JSON.stringify({ ronaldo: 52, messi: 44 }, null, 2));
  if (!fs.existsSync(EMAILS_FILE))
    fs.writeFileSync(EMAILS_FILE, JSON.stringify([], null, 2));
}
initFiles();

const readVotes   = () => JSON.parse(fs.readFileSync(VOTES_FILE));
const writeVotes  = v => fs.writeFileSync(VOTES_FILE, JSON.stringify(v, null, 2));
const readEmails  = () => JSON.parse(fs.readFileSync(EMAILS_FILE));
const writeEmails = e => fs.writeFileSync(EMAILS_FILE, JSON.stringify(e, null, 2));

app.get('/ping', (req, res) => res.status(200).send('pong'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', async (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Введите корректный email' });
  }

  const emails = readEmails();
  if (emails.some(e => e.email === email)) {
    return res.status(400).json({ error: 'Этот email уже голосовал' });
  }

  res.cookie('voter_email', email, { maxAge: 30 * 60 * 1000, sameSite: 'lax' });
  res.json({ success: true });

  if (!ADMIN_EMAIL || !EMAIL_PASS) {
    console.error('ADMIN_EMAIL или EMAIL_PASS не заданы');
    return;
  }

  transporter.sendMail({
    from: `"Vote Site" <${ADMIN_EMAIL}>`,
    to: ADMIN_EMAIL,
    subject: `👤 Новый вход на сайт голосования`,
    html: `
      <h2>Новый пользователь вошёл на сайт</h2>
      <p><b>Email:</b> ${email}</p>
      <p><b>Время:</b> ${new Date().toLocaleString('ru-RU')}</p>
      <p><b>IP:</b> ${req.ip}</p>
    `
  })
  .then(() => console.log('Письмо о входе отправлено'))
  .catch(err => console.error('Ошибка email:', err.message));
});

app.get('/api/votes', (req, res) => res.json(readVotes()));

app.post('/api/vote', async (req, res) => {
  const { vote } = req.body;
  const email = req.cookies.voter_email;

  if (!email) return res.status(401).json({ error: 'Сначала войдите через email' });
  if (!vote || !['ronaldo', 'messi'].includes(vote))
    return res.status(400).json({ error: 'Неверные данные' });

  const emails = readEmails();
  if (emails.some(e => e.email === email))
    return res.status(400).json({ error: 'Этот email уже голосовал' });

  const votes = readVotes();
  votes[vote]++;
  writeVotes(votes);

  emails.push({ email, vote, time: new Date().toISOString(), ip: req.ip });
  writeEmails(emails);

  res.clearCookie('voter_email');
  res.json({ success: true, votes });

  if (!ADMIN_EMAIL || !EMAIL_PASS) return;

  transporter.sendMail({
    from: `"Vote Site" <${ADMIN_EMAIL}>`,
    to: ADMIN_EMAIL,
    subject: `🗳️ Голос за ${vote === 'ronaldo' ? 'Роналду' : 'Месси'}`,
    html: `
      <h2>Новый голос!</h2>
      <p><b>Голос за:</b> ${vote === 'ronaldo' ? 'Роналду' : 'Месси'}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Время:</b> ${new Date().toLocaleString('ru-RU')}</p>
      <p><b>IP:</b> ${req.ip}</p>
    `
  })
  .then(() => console.log('Письмо о голосе отправлено'))
  .catch(err => console.error('Ошибка email:', err.message));
});

app.get('/admin', (req, res) => {
  const votes = readVotes();
  const emails = readEmails();
  const rows = emails.map((e, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${e.email}</td>
      <td>${e.vote === 'ronaldo' ? 'Роналду' : 'Месси'}</td>
      <td>${new Date(e.time).toLocaleString('ru-RU')}</td>
      <td>${e.ip || '-'}</td>
    </tr>`).join('');

  res.send(`
    <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Админ-панель</title>
    <style>
      body { font-family: Arial; background: #111; color: #eee; padding: 20px; }
      h1 { color: #ffd700; font-size: 22px; }
      .stats { display: flex; gap: 12px; margin: 20px 0; flex-wrap: wrap; }
      .stat { background: #222; padding: 12px 20px; border-radius: 10px; font-size: 14px; }
      .stat b { font-size: 22px; color: #ffd700; display: block; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #1a1a1a; font-size: 12px; }
      th, td { padding: 8px; border: 1px solid #333; text-align: left; }
      th { background: #222; color: #ffd700; }
    </style></head><body>
      <h1>Админ-панель</h1>
      <div class="stats">
        <div class="stat">Роналду <b>${votes.ronaldo}</b></div>
        <div class="stat">Месси <b>${votes.messi}</b></div>
        <div class="stat">Всего <b>${emails.length}</b></div>
      </div>
      <h2>Все голоса</h2>
      <table>
        <tr><th>#</th><th>Email</th><th>Голос</th><th>Время</th><th>IP</th></tr>
        ${rows || '<tr><td colspan="5">Пока нет голосов</td></tr>'}
      </table>
    </body></html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
