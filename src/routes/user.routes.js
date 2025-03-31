import { Router } from "express";
import bcrypt from "bcrypt";
import db from "../../database/pg.sql.js";
const router = Router();

/** Users */
router.get("/users/:name", async (req, res) => {
  const { name } = req.params;
  const result = await db.query(
    "SELECT * FROM users WHERE name ILIKE $1",
    [`%${name}%`] // Use parameterized query to avoid SQL injection
  );
  res.send(result.rows);
});

router.post("/users/add", async (req, res) => {
  try {
    const { name, konamiid, email, password } = req.body;
    console.log("add", req.body);
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO "users"(name, konamiid, email, password, create_at) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [name, konamiid, email, hashedPassword]
    );
    res.send(result);
  } catch (error) {
    console.error("Error en el registro:", error);
    res.status(500).send("Error en el servidor");
  }
});

router.post("/auth", async (req, res) => {
  const { email, password } = req.body;
  const result = await db.query(`SELECT * FROM "users" WHERE email = $1`, [
    email,
  ]);
  if (result.rows.length === 0) {
    return res.status(401).json({ message: "Usuario no encontrado" });
  }
  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password);
  // Guardar sesión del usuario
  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    konamiid: user.konamiid,
  };

  res.json({ message: "Login exitoso", user: req.session.user });
  if (!match) {
    return res.status(401).json({ message: "Contraseña incorrecta" });
  }
});

router.get("/tournament", async (req, res) => {
  res.send("Tournament created");
});

router.post("/createTournament", async (req, res) => {
  const { name } = req.body;
  const result = await db.query(`INSERT INTO "Tournament"(name) VALUES ($1)`, [
    name,
  ]);
  res.send(result.rows);
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

router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error al cerrar sesión");
    }
    res.json({ message: "Sesión cerrada correctamente" });
  });
});

export default router;
