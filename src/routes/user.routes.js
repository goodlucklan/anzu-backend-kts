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

router.post("/createListPlayers", async (req, res) => {
  const { participants } = req.body;
  if (!Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({
      message: "La lista de participantes es inválida o está vacía.",
    });
  }
  const values = participants
    .map(
      ({ konamiid, name, idtournament }) =>
        `(${idtournament}, '${konamiid}', '${name}')`
    )
    .join(", ");
  console.log(values);
  res.send("probando");
});

export default router;
