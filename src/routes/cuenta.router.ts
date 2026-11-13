import { Router } from "express";
import {
  crearCuenta,
  listarCuentas,
  obtenerCuenta,
  cambiarEstado,
  verMovimientos,
  ingresar,
  retirar,
} from "../controllers/cuenta.controller.js";

const router = Router();

router.post("/", crearCuenta);
router.get("/", listarCuentas);
router.get("/:id", obtenerCuenta);
router.patch("/:id/estado", cambiarEstado);
router.get("/:id/movimientos", verMovimientos);
router.post("/:id/ingresos", ingresar);
router.post("/:id/retiradas", retirar);

export default router;