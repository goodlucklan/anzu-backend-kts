import { Router } from "express";
import db from "../../database/pg.sql.js";
const router = Router();

router.get("/users/:name", async (req, res) => {
  const { name } = req.params;
  // console.log("name", name);
  if (name) {
    const result =
      await db`SELECT * from users where name like '%${name.toString()}%'`;

    res.send(result);
  }
});

router.get("/tournament", async (req, res) => {
  res.send("Tournament created");
});

export default router;
