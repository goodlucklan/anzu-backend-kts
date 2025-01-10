import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// Configuración de CORS debe ir antes de las rutas
app.use(
  cors({
    origin: "http://localhost:5173", // Permitir solo tu frontend local
    methods: ["GET", "POST", "PUT", "DELETE"], // Métodos permitidos
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Rutas deben ir después de configurar CORS
app.use(userRoutes);

app.listen(process.env.PORT, () => {
  console.log(`SERVER IS RUNNING IN PORT ${process.env.PORT}`);
});
