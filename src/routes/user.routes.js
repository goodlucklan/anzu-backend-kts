import { Router } from "express";
import db from "../../database/pg.sql.js";
const router = Router();

router.get("/users/:name", async (req, res) => {
  const { name } = req.params;
  const result = await db`SELECT * FROM users WHERE name like ${
    "%" + name + "%"
  }`;
  res.send(result);
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
  const result = await db`
  INSERT INTO "listplayers"(name, konamiid, idtournament)
  VALUES (${name}, ${konamiid}, ${idtournament})
`;
  console.log("result", result);
  res.send("probando");
});

router.put("/upgradeResultPlayerInTournament", async (req, res) => {
  const { konamiid, idtournament, victory, defeat, draw } = req.body;
  const result = await db`
  UPDATE "listplayers"
      SET victory = ${victory}, defeat = ${defeat}, draw = ${draw}
      WHERE konamiid = ${konamiid} AND idtournament = ${idtournament}
`;
  console.log(result);
  res.send("Update values");
});

export default router;
