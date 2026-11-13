import { Request, Response } from "express";
import { Cliente } from "../models/clientes.models.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dniRegex = /^\d{8}[A-Za-z]$/;
const idRegex = /^[0-9a-fA-F]{24}$/;

function esTexto(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim() !== "";
}

export async function crearCliente(req: Request, res: Response) {
  try {
    const { nombre, email, dni } = req.body ?? {};

    if (!esTexto(nombre) || !esTexto(email) || !esTexto(dni)) {
      return res.status(400).json({ error: "nombre, email y dni son obligatorios" });
    }
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: "El email no es valido" });
    }
    if (!dniRegex.test(dni.trim())) {
      return res.status(400).json({ error: "El dni debe tener 8 numeros y una letra" });
    }

    const cliente = await Cliente.create({ nombre, email, dni });
    return res.status(201).json(cliente);
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(409).json({ error: "Ya existe un cliente con ese email o dni" });
    }
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}

export async function listarClientes(req: Request, res: Response) {
  try {
    const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
    const limite = req.query.limite === undefined ? 20 : Number(req.query.limite);

    if (!Number.isInteger(pagina) || pagina < 1) {
      return res.status(400).json({ error: "pagina no es valida" });
    }
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      return res.status(400).json({ error: "limite debe estar entre 1 y 100" });
    }

    const totalElementos = await Cliente.countDocuments();
    const datos = await Cliente.find()
      .sort({ creadoEn: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite);

    return res.json({
      datos,
      pagina,
      limite,
      totalElementos,
      totalPaginas: Math.ceil(totalElementos / limite),
    });
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}

export async function obtenerCliente(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    if (!idRegex.test(id)) {
      return res.status(400).json({ error: "El id no es valido" });
    }

    const cliente = await Cliente.findById(id);
    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }
    return res.json(cliente);
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}

export async function modificarCliente(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    if (!idRegex.test(id)) {
      return res.status(400).json({ error: "El id no es valido" });
    }

    const { nombre, email, dni } = req.body ?? {};

    if (dni !== undefined) {
      return res.status(400).json({ error: "El dni no se puede modificar" });
    }
    if (nombre === undefined && email === undefined) {
      return res.status(400).json({ error: "Indica nombre o email" });
    }

    const cambios: { nombre?: string; email?: string } = {};

    if (nombre !== undefined) {
      if (!esTexto(nombre)) {
        return res.status(400).json({ error: "El nombre no es valido" });
      }
      cambios.nombre = nombre.trim();
    }
    if (email !== undefined) {
      if (!esTexto(email) || !emailRegex.test(email.trim())) {
        return res.status(400).json({ error: "El email no es valido" });
      }
      cambios.email = email.trim().toLowerCase();
    }

    const cliente = await Cliente.findByIdAndUpdate(id, cambios, { new: true });
    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }
    return res.json(cliente);
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(409).json({ error: "Ya existe un cliente con ese email" });
    }
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}