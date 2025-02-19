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
VALUES ($1)`,
    [name];
  res.send("tournmanet created");
});

router.post("/addPlayerInTournament", async (req, res) => {
  try {
    const { konamiid, name, idtournament } = req.body;

    // Obtener información del torneo
    const tournamentResult = await db.query(
      `SELECT * FROM "Tournament" WHERE id = $1`,
      [idtournament]
    );

    if (tournamentResult.rows.length === 0) {
      return res.status(404).send("Torneo no encontrado");
    }

    const { participants, maxPlayers } = tournamentResult.rows[0];
    const maxPlayersNumber = parseInt(maxPlayers, 10); // Convertir maxPlayers de VARCHAR a número

    if (participants >= maxPlayersNumber) {
      return res
        .status(400)
        .send("El torneo ya alcanzó el número máximo de jugadores");
    }

    // Insertar jugador en el torneo
    await db.query(
      `INSERT INTO "listplayers" (name, konamiid, idtournament) VALUES ($1, $2, $3)`,
      [name, konamiid, idtournament]
    );

    // Obtener el número de participantes actualizado
    const countResult = await db.query(
      `SELECT COUNT(*) FROM listplayers WHERE idtournament = $1`,
      [idtournament]
    );

    const count = parseInt(countResult.rows[0].count, 10);

    // Actualizar el número de participantes en la tabla "Tournament"
    await db.query(`UPDATE "Tournament" SET participants = $1 WHERE id = $2`, [
      count,
      idtournament,
    ]);

    res.send("Jugador agregado correctamente");
  } catch (error) {
    console.error("Error al agregar jugador:", error);
    res.status(500).send("Error en el servidor");
  }
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
