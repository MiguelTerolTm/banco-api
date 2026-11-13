import { Router } from "express";
import { crearCliente, listarClientes, obtenerCliente, modificarCliente } from "../controllers/cliente.controller.js";

const router = Router();

router.post("/", crearCliente);
router.get("/", listarClientes);
router.get("/:id", obtenerCliente);
router.patch("/:id", modificarCliente);

export default router;