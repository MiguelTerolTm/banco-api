import { Router } from "express";
import { transferir } from "../controllers/transferencia.controller.js";

const router = Router();

router.post("/", transferir);

export default router;