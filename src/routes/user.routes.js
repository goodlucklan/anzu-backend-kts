import { Router } from "express";
import db from "../../database/pg.sql.js";
const router = Router();

router.get("/users/:konamiid", async (req, res) => {
  const { konamiid } = req.params;
  const result = await db`SELECT * FROM users WHERE konamiid= ${konamiid};`;
  res.send(result);
});

router.get("/tournament", async (req, res) => {
  res.send("Tournament created");
});

export default router;
