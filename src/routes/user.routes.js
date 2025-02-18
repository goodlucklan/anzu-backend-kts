import { Router } from "express";
import db from "../../database/pg.sql.js";
const router = Router();

router.get("/users/:name", async (req, res) => {
  const { name } = req.params;
  const result = await db.query(
    "SELECT * FROM users WHERE name ILIKE $1",
    [`%${name}%`] // Use parameterized query to avoid SQL injection
  );
  res.send(result.rows);
});

router.get("/tournament", async (req, res) => {
  res.send("Tournament created");
});

router.post("/createTournament", async (req, res) => {
  const { name } = req.body;
  await db`INSERT INTO "Tournament"(name)
VALUES (${name});`;
  res.send("tournmanet created");
});

router.post("/addPlayerInTournament", async (req, res) => {
  const { konamiid, name, idtournament } = req.body;
  await db`
  INSERT INTO "listplayers"(name, konamiid, idtournament)
  VALUES (${name}, ${konamiid}, ${idtournament})
`;
  const count =
    await db`SELECT COUNT(*) FROM listplayers WHERE idtournament = ${idtournament}`;

  await db`UPDATE "Tournament" SET participants = ${parseInt(
    count[0].count,
    10
  )} WHERE id = ${idtournament}`;
  res.send("probando");
});

router.put("/upgradeResultPlayerInTournament", async (req, res) => {
  const { konamiid, idtournament, victory, defeat, draw } = req.body;
  await db`
  UPDATE "listplayers"
      SET victory = ${victory}, defeat = ${defeat}, draw = ${draw}
      WHERE konamiid = ${konamiid} AND idtournament = ${idtournament}
`;
  res.send("Update values");
});

export default router;
