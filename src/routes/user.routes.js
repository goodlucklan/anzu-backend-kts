import { Router } from "express";
import db from "../../database/pg.sql.js";
const router = Router();

router.get("/users/:name", async (req, res) => {
  const { name } = await req.params;
  console.log("name", name);
  const result = await db`SELECT * from users`;
  res.send(result);
});

router.get("/tournament", async (req, res) => {
  res.send("Tournament created");
});

export default router;
