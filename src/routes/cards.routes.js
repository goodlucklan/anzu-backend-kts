import { Router } from "express";
import db from "../../database/pg.sql.js";
const router = Router();

router.get("/getCards", async (req, res) => {
  try {
    const cardsResult = await db.query(`select * from cards`);
    res.send({
      message: "Cartas encontradas",
      data: cardsResult.rows,
    });
    return cardsResult.rows;
  } catch (error) {
    console.error("Error al buscar cartas:", error);
    res.status(500).send("Error en el servidor");
  }
});

export default router;
