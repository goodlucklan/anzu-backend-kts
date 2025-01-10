import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";
import dotenv from "dotenv";

dotenv.config();
const app = express();

app.use(userRoutes);
app.use(
  cors({
    origin: "http://localhost:5173", // Permitir solo tu frontend local
    methods: ["GET", "POST", "PUT", "DELETE"], // Métodos permitidos
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.listen(process.env.PORT, () => {
  console.log(`SERVER IS RUNNING IN PORT ${process.env.PORT}`);
});
