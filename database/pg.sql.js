"use server";

import { neon } from "@neondatabase/serverless";
const sql = neon(
  "postgresql://AnzuStore_owner:avcBzZK5Se2F@ep-icy-snow-a5f2vudg.us-east-2.aws.neon.tech/AnzuStore?sslmode=require"
);

export default sql;
