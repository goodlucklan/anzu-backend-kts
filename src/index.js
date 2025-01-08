import express from "express";
import http from "http";
import userRoutes from "./routes/user.routes.js";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config();
const app = express();

const sql = neon(process.env.DATABASE_URL);

const requestHandler = async (req, res) => {
  const result = await sql`SELECT version()`;
  const { version } = result[0];
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(version);
};

app.use(userRoutes);

http.createServer(requestHandler).listen(process.env.PORT, () => {
  console.log(`SERVER IS RUNNING IN PORT ${process.env.PORT}`);
});
