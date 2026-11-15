export const databaseName = 'school_lost_item';

export const connectionOptions = {
  host: '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: 'root',
  password: process.env.DB_PASSWORD ?? '1234',
  charset: 'utf8mb4',
};
