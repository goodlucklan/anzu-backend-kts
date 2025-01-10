import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";
import dotenv from "dotenv";

dotenv.config();
const app = express();

app.use(userRoutes);
app.use(cors());
app.listen(process.env.PORT, () => {
  console.log(`SERVER IS RUNNING IN PORT ${process.env.PORT}`);
});
