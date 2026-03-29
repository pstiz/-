const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     'localhost',
  user:     'root',       // TODO: เปลี่ยนเป็น user MySQL ของคุณ
  password: '',           // TODO: เปลี่ยนเป็น password MySQL ของคุณ
  database: 'database_webdev_course',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
