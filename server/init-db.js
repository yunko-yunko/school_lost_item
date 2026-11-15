import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { connectionOptions, databaseName } from './db.js';

try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const connection = await mysql.createConnection({ ...connectionOptions, multipleStatements: true });
  try {
    await connection.query(schema);
    const [imageColumns] = await connection.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'lost_items' AND COLUMN_NAME = 'image_url'`,
      [databaseName],
    );
    if (!imageColumns.length) {
      try {
        await connection.query('ALTER TABLE lost_items ADD COLUMN image_url VARCHAR(2048) NULL AFTER `locate`');
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
    console.log(`${databaseName} 데이터베이스 준비 완료`);
  } finally {
    await connection.end();
  }
} catch (error) {
  console.error(`데이터베이스 초기화 실패 (${error.code ?? error.name}). MySQL이 켜져 있는지 확인해 주세요.`);
  process.exitCode = 1;
}
