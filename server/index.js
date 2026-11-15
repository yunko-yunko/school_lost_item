import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import mysql from 'mysql2/promise';
import { connectionOptions, databaseName } from './db.js';
import { imageExtension, imageUpload, isUploadFilename, removeImage, saveImage, uploadDirectory } from './uploads.js';

const app = express();
const db = mysql.createPool({ ...connectionOptions, database: databaseName });
const sessions = new Map();
const sessionDuration = 8 * 60 * 60 * 1000;
const cookieName = 'school_session';
const cookieOptions = { httpOnly: true, sameSite: 'strict', path: '/api' };

const profileColumns = 'id, username, email, student_id, created_at, updated_at';
const itemColumns = 'item.id, item.uploader_id, item.title, item.description, item.`locate`, item.image_url, item.created_at, item.updated_at';
const itemOrder = 'ORDER BY item.created_at DESC, item.id DESC';
const itemsWithUploaders = `
  SELECT ${itemColumns}, uploader.username AS uploader_name
  FROM lost_items AS item
  LEFT JOIN users AS uploader ON item.uploader_id = uploader.id
`;

app.disable('x-powered-by');
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '64kb' }));

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requiredText(value, label, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || [...text].length > maxLength) {
    throw new RequestError(400, `‘${label}’ 값을 1~${maxLength}자로 입력해 주세요.`);
  }
  return text;
}

function emailInput(value) {
  const email = requiredText(value, '이메일', 255);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError(400, '이메일 형식을 확인해 주세요.');
  }
  return email;
}

function profileInput(body) {
  return [
    requiredText(body?.username, '이름', 50),
    emailInput(body?.email),
    requiredText(body?.student_id, '학번', 20),
  ];
}

function itemInput(body) {
  return [
    requiredText(body?.title, '물건 이름', 100),
    requiredText(body?.description, '설명', 1000),
    requiredText(body?.locate, '장소', 255),
  ];
}

function parseImage(req, res, next) {
  imageUpload(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return next(new RequestError(413, '이미지 파일은 5MB까지 올릴 수 있습니다.'));
    }
    if (error) {
      return next(new RequestError(400, '이미지는 한 장만 올릴 수 있습니다. 입력한 내용을 확인해 주세요.'));
    }
    next();
  });
}

function validateImage(file) {
  if (!file) return null;
  const extension = imageExtension(file.buffer);
  if (!extension) throw new RequestError(400, 'JPG, PNG, WebP 이미지 파일을 선택해 주세요.');
  return extension;
}

function itemId(value) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || id < 1 || id > 4_294_967_295) {
    throw new RequestError(404, '분실물 글을 찾을 수 없습니다.');
  }
  return id;
}

function sessionToken(req) {
  const name = `${cookieName}=`;
  const cookie = req.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(name));
  return cookie?.slice(name.length);
}

function clearSession(req, res) {
  sessions.delete(sessionToken(req));
  res.clearCookie(cookieName, cookieOptions);
}

function notLoggedIn(req, res) {
  clearSession(req, res);
  throw new RequestError(401, '로그인이 필요합니다.');
}

function requireLogin(req, res, next) {
  const session = sessions.get(sessionToken(req));
  if (!session || session.expiresAt <= Date.now()) {
    return notLoggedIn(req, res);
  }
  req.userId = session.userId;
  next();
}

async function getProfile(id) {
  const [[profile]] = await db.execute(`SELECT ${profileColumns} FROM users WHERE id = ?`, [id]);
  return profile;
}

async function getItem(connection, id) {
  const [[item]] = await connection.execute(
    `SELECT ${itemColumns} FROM lost_items AS item WHERE item.id = ?`,
    [id],
  );
  return item;
}

async function lockOwnedItem(connection, id, userId) {
  const [[item]] = await connection.execute(
    'SELECT uploader_id, image_url FROM lost_items WHERE id = ? FOR UPDATE',
    [id],
  );
  if (!item) throw new RequestError(404, '분실물 글을 찾을 수 없습니다.');
  if (item.uploader_id !== userId) {
    throw new RequestError(403, '본인이 등록한 분실물 글만 수정하거나 삭제할 수 있습니다.');
  }
  return item;
}

async function mutateItem(action) {
  const connection = await db.getConnection();
  const images = { created: null, obsolete: null };
  let commitStarted = false;
  let result;
  try {
    await connection.beginTransaction();
    result = await action(connection, images);
    commitStarted = true;
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      connection.destroy();
    }
    // A connection error during COMMIT can leave its outcome unknown.
    if (!commitStarted) await removeImage(images.created);
    throw error;
  } finally {
    connection.release();
  }
  await removeImage(images.obsolete);
  return result;
}

app.post('/api/auth/register', async (req, res) => {
  const [username, email, studentId] = profileInput(req.body);
  const password = req.body?.password;
  if (typeof password !== 'string' || [...password].length < 8 || bcrypt.truncates(password)) {
    throw new RequestError(400, '비밀번호를 8자 이상, UTF-8 기준 72바이트 이내로 입력해 주세요.');
  }

  const hash = await bcrypt.hash(password, 10);
  const [result] = await db.execute(
    'INSERT INTO users (username, email, password, student_id) VALUES (?, ?, ?, ?)',
    [username, email, hash, studentId],
  );
  res.status(201).json(await getProfile(result.insertId));
});

app.post('/api/auth/login', async (req, res) => {
  const email = emailInput(req.body?.email);
  const password = req.body?.password;
  if (typeof password !== 'string' || !password || bcrypt.truncates(password)) {
    throw new RequestError(400, '비밀번호를 확인해 주세요.');
  }

  const [[user]] = await db.execute(
    `SELECT ${profileColumns}, password FROM users WHERE email = ?`,
    [email],
  );
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new RequestError(401, '이메일 또는 비밀번호가 일치하지 않습니다.');
  }

  sessions.delete(sessionToken(req));
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, expiresAt: now + sessionDuration });
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionDuration });
  const { password: hash, ...profile } = user;
  res.json(profile);
});

app.post('/api/auth/logout', (req, res) => {
  clearSession(req, res);
  res.status(204).end();
});

app.get('/api/users/me', requireLogin, async (req, res) => {
  const profile = await getProfile(req.userId);
  if (!profile) return notLoggedIn(req, res);
  res.json(profile);
});

app.get('/api/users/me/items', requireLogin, async (req, res) => {
  const [items] = await db.execute(
    `SELECT ${itemColumns} FROM lost_items AS item WHERE item.uploader_id = ? ${itemOrder}`,
    [req.userId],
  );
  res.json(items);
});

app.patch('/api/users/me', requireLogin, async (req, res) => {
  await db.execute('UPDATE users SET username = ?, email = ?, student_id = ? WHERE id = ?', [
    ...profileInput(req.body),
    req.userId,
  ]);
  const profile = await getProfile(req.userId);
  if (!profile) return notLoggedIn(req, res);
  res.json(profile);
});

app.delete('/api/users/me', requireLogin, async (req, res) => {
  await db.execute('DELETE FROM users WHERE id = ?', [req.userId]);
  for (const [token, session] of sessions) {
    if (session.userId === req.userId) sessions.delete(token);
  }
  clearSession(req, res);
  res.status(204).end();
});

app.get('/api/items', async (req, res) => {
  const [items] = await db.query(`SELECT ${itemColumns} FROM lost_items AS item ${itemOrder}`);
  res.json(items);
});

app.get('/api/items/with-uploaders', async (req, res) => {
  const [items] = await db.query(`${itemsWithUploaders} ${itemOrder}`);
  res.json(items);
});

app.get('/api/items/:id', async (req, res) => {
  const [[item]] = await db.execute(
    `${itemsWithUploaders} WHERE item.id = ?`,
    [itemId(req.params.id)],
  );
  if (!item) throw new RequestError(404, '분실물 글을 찾을 수 없습니다.');
  res.json(item);
});

app.get('/api/uploads/:filename', (req, res, next) => {
  const { filename } = req.params;
  if (!isUploadFilename(filename)) throw new RequestError(404, '이미지를 찾을 수 없습니다.');
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(filename, { root: uploadDirectory }, (error) => {
    if (error?.status === 404) return next(new RequestError(404, '이미지를 찾을 수 없습니다.'));
    if (error) next(error);
  });
});

app.post('/api/items', requireLogin, parseImage, async (req, res) => {
  const input = itemInput(req.body);
  const extension = validateImage(req.file);
  const item = await mutateItem(async (connection, images) => {
    const [[user]] = await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.userId]);
    if (!user) return notLoggedIn(req, res);
    if (extension) images.created = await saveImage(req.file.buffer, extension);
    const [result] = await connection.execute(
      'INSERT INTO lost_items (uploader_id, title, description, `locate`, image_url) VALUES (?, ?, ?, ?, ?)',
      [req.userId, ...input, images.created],
    );
    return getItem(connection, result.insertId);
  });
  res.status(201).json(item);
});

app.patch('/api/items/:id', requireLogin, parseImage, async (req, res) => {
  const id = itemId(req.params.id);
  const input = itemInput(req.body);
  const extension = validateImage(req.file);
  const removeExisting = req.body?.remove_image === 'true';
  const item = await mutateItem(async (connection, images) => {
    const existing = await lockOwnedItem(connection, id, req.userId);
    let imageUrl = existing.image_url;
    if (extension || removeExisting) {
      if (extension) images.created = await saveImage(req.file.buffer, extension);
      imageUrl = images.created;
      images.obsolete = existing.image_url;
    }
    await connection.execute(
      'UPDATE lost_items SET title = ?, description = ?, `locate` = ?, image_url = ? WHERE id = ? AND uploader_id = ?',
      [...input, imageUrl, id, req.userId],
    );
    return getItem(connection, id);
  });
  res.json(item);
});

app.delete('/api/items/:id', requireLogin, async (req, res) => {
  const id = itemId(req.params.id);
  await mutateItem(async (connection, images) => {
    const item = await lockOwnedItem(connection, id, req.userId);
    await connection.execute('DELETE FROM lost_items WHERE id = ? AND uploader_id = ?', [id, req.userId]);
    images.obsolete = item.image_url;
  });
  res.status(204).end();
});

app.use((req, res) => res.status(404).json({ message: '요청한 경로를 찾을 수 없습니다.' }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof RequestError) return res.status(error.status).json({ message: error.message });
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: '이미 등록된 이메일 또는 학번입니다.' });
  }
  if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
    return res.status(400).json({ message: '입력한 내용을 확인해 주세요.' });
  }
  console.error(error.code ?? error.name);
  res.status(500).json({ message: '요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.' });
});

app.listen(3001, '127.0.0.1', (error) => {
  if (error) {
    console.error(`분실물 서버 시작 실패 (${error.code ?? error.name}).`);
    process.exitCode = 1;
    return;
  }
  console.log('분실물 서버 실행 중 http://127.0.0.1:3001');
});
