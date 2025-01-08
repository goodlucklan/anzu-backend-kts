import { Router } from "express";
import db from "../../database/pg.sql.js";
const router = Router();

router.get("/users/:name", async (req, res) => {
  const { name } = req.params;

  const result = await db`SELECT * from users where name like '%${name}%'`;

  res.send(result);
});

export default router;
