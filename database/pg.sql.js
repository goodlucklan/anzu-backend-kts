import pg from "pg";

const sql = new pg.Pool({
  // connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: false,
});
// const sql = new pg.Pool({
//   host: PGHOST,
//   database: PGDATABASE,
//   username: PGUSER,
//   password: PGPASSWORD,
//   port: 5432,
//   // ssl: false, PARA LOCAL
//   ssl: {
//     rejectUnauthorized: false,
//   },
// });

export default sql;
