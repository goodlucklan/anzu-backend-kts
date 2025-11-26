import pg from "pg";

const sql = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
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
