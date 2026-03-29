const express = require('express');
const bcrypt  = require('bcrypt');
const cors    = require('cors');
const path    = require('path');
const pool    = require('./db');

const app  = express();
const PORT = 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve HTML files

// =============================================================
// ADMIN ROUTES
// =============================================================

// GET /admin/login — load admin login page
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'Login_admin.html'));
});

// GET /password/:raw — generate hashed password (ใช้ตอนสร้าง admin)
app.get('/password/:raw', async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.params.raw, 10);
    res.send(hash);
  } catch {
    res.status(500).send('Server error');
  }
});

// POST /admin/signin — admin login
app.post('/admin/signin', async (req, res) => {
  const { admin_id, password } = req.body;

  if (!admin_id || !password) {
    return res.status(400).send('Missing username or password');
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM admin WHERE username = ?',
      [admin_id]
    );

    if (rows.length === 0) {
      return res.status(401).send('Wrong name');
    }

    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (!match) {
      return res.status(401).send('Wrong ID');
    }

    res.send('/admin/dashboard.html');

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// GET /admin/logout
app.get('/admin/logout', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'Login_admin.html'));
});

// =============================================================
// COOKS ROUTES
// =============================================================

// GET /cooks/register — load register page
app.get('/cooks/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cooks', 'register_cook.html'));
});

// POST /cooks/register — register new cook
app.post('/cooks/register', async (req, res) => {
  const { cook_id, name, password } = req.body;

  if (!cook_id || !name || !password) {
    return res.status(400).send('Missing fields');
  }

  try {
    // เช็ค employee_id ซ้ำ
    const [existing] = await pool.query(
      'SELECT cook_id FROM cook WHERE employee_id = ?',
      [cook_id]
    );
    if (existing.length > 0) {
      return res.status(409).send('ID already exists');
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO cook (employee_id, name, password_hash) VALUES (?, ?, ?)',
      [cook_id, name, hash]
    );

    res.send('Registered');

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// GET /cooks/login — load login page
app.get('/cooks/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cooks', 'Login_cooks.html'));
});

// POST /cooks/login — cook sign in
app.post('/cooks/login', async (req, res) => {
  const { cook_id, password } = req.body;

  if (!cook_id || !password) {
    return res.status(400).send('Missing fields');
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM cook WHERE employee_id = ? AND is_active = 1',
      [cook_id]
    );

    if (rows.length === 0) {
      return res.status(401).send('Wrong ID');
    }

    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (!match) {
      return res.status(401).send('Wrong password');
    }

    res.send('/cooks/dashboard.html');

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// =============================================================
// CUSTOMERS ROUTES
// =============================================================

// GET /customers/login — load login page
app.get('/customers/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customers', 'Login_customers.html'));
});

// POST /customers/login — customer login with username + table_number
app.post('/customers/login', async (req, res) => {
  const { username, table_number } = req.body;

  if (!username || !table_number) {
    return res.status(400).send('Missing username or table');
  }

  try {
    // หา table_id จาก table_number
    const [tables] = await pool.query(
      'SELECT table_id FROM `table` WHERE table_number = ?',
      [table_number]
    );
    if (tables.length === 0) {
      return res.status(400).send('Table not found');
    }

    const table_id = tables[0].table_id;

    // สร้าง customer record
    await pool.query(
      'INSERT INTO customer (username, table_id) VALUES (?, ?)',
      [username, table_id]
    );

    // อัปเดตสถานะโต๊ะเป็น occupied
    await pool.query(
      'UPDATE `table` SET status = "occupied" WHERE table_id = ?',
      [table_id]
    );

    res.send('Menu_customers.html');

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// GET /customers/logout
app.get('/customers/logout', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customers', 'Login_customers.html'));
});

// GET /customers/orders — load check page หรือ get orders by table
app.get('/customers/orders', async (req, res) => {
  const { table, status } = req.query;

  // ถ้าไม่มี query param → ส่งหน้า HTML
  if (!table) {
    return res.status(400).send('Missing table parameter');
  }

  try {
    // JOIN order_item + menu_item เพื่อดึงชื่อเมนู
    let sql = `
      SELECT
        oi.order_item_id AS order_id,
        t.table_number,
        mi.menu_id,
        mi.name AS menu_name,
        oi.price,
        o.status
      FROM \`order\` o
      JOIN \`table\`     t  ON o.table_id = t.table_id
      JOIN order_item   oi ON o.order_id  = oi.order_id
      JOIN menu_item    mi ON oi.menu_id  = mi.menu_id
      WHERE t.table_number = ?
    `;
    const params = [table];

    if (status) {
      sql += ' AND o.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY o.order_time DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// GET /customers/orders/:id — get single order detail
app.get('/customers/orders/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT
        oi.order_item_id AS order_id,
        t.table_number,
        mi.name AS menu_name,
        oi.price,
        o.status
       FROM \`order\` o
       JOIN \`table\`    t  ON o.table_id = t.table_id
       JOIN order_item  oi ON o.order_id  = oi.order_id
       JOIN menu_item   mi ON oi.menu_id  = mi.menu_id
       WHERE oi.order_item_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).send('Order not found');
    }

    res.json(rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// =============================================================
// START SERVER
// =============================================================
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
