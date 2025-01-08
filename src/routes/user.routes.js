import { Router } from "express";

const router = Router();

router.get("/user", (req, res) => {
  res.send("obteniendo usuarios");
});

export default router;
