import pg from "pg";

const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

const sql = new pg.Pool({
  host: PGHOST,
  database: PGDATABASE,
  username: PGUSER,
  password: PGPASSWORD,
  port: 5432,
  ssl: {
    require: true,
  },
});

export default sql;
