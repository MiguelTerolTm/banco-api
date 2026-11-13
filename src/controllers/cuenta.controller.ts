import { Request, Response } from "express";
import mongoose, { ClientSession, Types } from "mongoose";
import { Cliente } from "../models/clientes.models.js";
import { Cuenta, generarIban } from "../models/cuenta.models.js";
import { Movimiento } from "../models/moviemiento.models.js";

const idRegex = /^[0-9a-fA-F]{24}$/;
const tiposCuenta = ["corriente", "ahorro"];
const estados = ["activa", "bloqueada", "cerrada"];
const tiposMovimiento = ["ingreso", "retirada", "transferencia_emitida", "transferencia_recibida", "comision"];
const limiteDiario = 100000;

// a que estados se puede pasar desde cada estado
const transiciones: Record<string, string[]> = {
  activa: ["bloqueada", "cerrada"],
  bloqueada: ["activa", "cerrada"],
  cerrada: [],
};

type Resultado = { status: number; body: unknown };

// lo que ha sacado la cuenta hoy (retiradas y transferencias emitidas)
export async function retiradoHoy(cuentaId: Types.ObjectId, session: ClientSession) {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);

  const movimientos = await Movimiento.find({
    cuentaId,
    tipo: { $in: ["retirada", "transferencia_emitida"] },
    fecha: { $gte: inicio },
  }).session(session);

  let total = 0;
  for (const m of movimientos) {
    total += -m.importe;
  }
  return total;
}

export async function crearCuenta(req: Request, res: Response) {
  try {
    const { clienteId, tipo } = req.body ?? {};

    if (typeof clienteId !== "string" || !idRegex.test(clienteId)) {
      return res.status(400).json({ error: "clienteId no es valido" });
    }
    if (!tiposCuenta.includes(tipo)) {
      return res.status(400).json({ error: "tipo debe ser corriente o ahorro" });
    }

    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const abiertas = await Cuenta.countDocuments({ clienteId: cliente._id, estado: { $ne: "cerrada" } });
    if (abiertas >= 3) {
      return res.status(409).json({ error: "El cliente ya tiene 3 cuentas abiertas" });
    }

    const descubiertoMax = tipo === "corriente" ? 50000 : 0;

    // si el iban esta repetido se prueba con otro
    for (let i = 0; i < 5; i++) {
      try {
        const cuenta = await Cuenta.create({
          iban: generarIban(),
          clienteId: cliente._id,
          tipo,
          saldo: 0,
          descubiertoMax,
          estado: "activa",
        });
        return res.status(201).json(cuenta);
      } catch (error) {
        if ((error as any).code !== 11000) throw error;
      }
    }

    return res.status(500).json({ error: "No se pudo generar un iban" });
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}

export async function listarCuentas(req: Request, res: Response) {
  try {
    const { clienteId, tipo, estado } = req.query;
    const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
    const limite = req.query.limite === undefined ? 20 : Number(req.query.limite);

    if (!Number.isInteger(pagina) || pagina < 1) {
      return res.status(400).json({ error: "pagina no es valida" });
    }
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      return res.status(400).json({ error: "limite debe estar entre 1 y 100" });
    }

    const filtro: Record<string, any> = {};

    if (clienteId !== undefined) {
      if (typeof clienteId !== "string" || !idRegex.test(clienteId)) {
        return res.status(400).json({ error: "clienteId no es valido" });
      }
      filtro.clienteId = new Types.ObjectId(clienteId);
    }
    if (tipo !== undefined) {
      if (!tiposCuenta.includes(String(tipo))) {
        return res.status(400).json({ error: "tipo no es valido" });
      }
      filtro.tipo = String(tipo);
    }
    if (estado !== undefined) {
      if (!estados.includes(String(estado))) {
        return res.status(400).json({ error: "estado no es valido" });
      }
      filtro.estado = String(estado);
    }

    const totalElementos = await Cuenta.countDocuments(filtro);
    const datos = await Cuenta.find(filtro)
      .sort({ creadaEn: -1 })
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

export async function obtenerCuenta(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    if (!idRegex.test(id)) {
      return res.status(400).json({ error: "El id no es valido" });
    }

    const cuenta = await Cuenta.findById(id);
    if (!cuenta) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    const cliente = await Cliente.findById(cuenta.clienteId);

    return res.json({
      ...cuenta.toJSON(),
      titular: { nombre: cliente?.nombre, email: cliente?.email },
    });
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}

export async function cambiarEstado(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    if (!idRegex.test(id)) {
      return res.status(400).json({ error: "El id no es valido" });
    }

    const { estado } = req.body ?? {};
    if (!estados.includes(estado)) {
      return res.status(400).json({ error: "Estado no existe" });
    }

    const resultado = await mongoose.connection.transaction(async (session): Promise<Resultado> => {
      const cuenta = await Cuenta.findById(id).session(session);
      if (!cuenta) {
        return { status: 404, body: { error: "Cuenta no encontrada" } };
      }

      if (!transiciones[cuenta.estado].includes(estado)) {
        return {
          status: 409,
          body: { error: "No se puede pasar de " + cuenta.estado + " a " + estado },
        };
      }
      if (estado === "cerrada" && cuenta.saldo !== 0) {
        return {
          status: 409,
          body: { error: "No se puede cerrar con saldo distinto de 0 (saldo actual: " + cuenta.saldo + ")" },
        };
      }

      cuenta.estado = estado;
      await cuenta.save({ session });
      return { status: 200, body: cuenta };
    });

    return res.status(resultado.status).json(resultado.body);
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}

export async function ingresar(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    if (!idRegex.test(id)) {
      return res.status(400).json({ error: "El id no es valido" });
    }

    const { importe, concepto, categoria } = req.body ?? {};

    if (!Number.isInteger(importe) || importe <= 0) {
      return res.status(400).json({ error: "El importe debe ser un entero mayor que 0" });
    }
    if (typeof concepto !== "string" || concepto.trim() === "") {
      return res.status(400).json({ error: "El concepto es obligatorio" });
    }
    const cat = typeof categoria === "string" && categoria.trim() !== "" ? categoria.trim() : "otros";

    const resultado = await mongoose.connection.transaction(async (session): Promise<Resultado> => {
      const cuenta = await Cuenta.findById(id).session(session);
      if (!cuenta) {
        return { status: 404, body: { error: "Cuenta no encontrada" } };
      }
      if (cuenta.estado === "cerrada") {
        return { status: 409, body: { error: "La cuenta esta cerrada" } };
      }

      cuenta.saldo += importe;
      await cuenta.save({ session });

      const [movimiento] = await Movimiento.create(
        [
          {
            cuentaId: cuenta._id,
            tipo: "ingreso",
            importe,
            saldoResultante: cuenta.saldo,
            concepto: concepto.trim(),
            categoria: cat,
          },
        ],
        { session }
      );
      return { status: 201, body: movimiento };
    });

    return res.status(resultado.status).json(resultado.body);
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}

export async function retirar(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    if (!idRegex.test(id)) {
      return res.status(400).json({ error: "El id no es valido" });
    }

    const { importe, concepto, categoria } = req.body ?? {};

    if (!Number.isInteger(importe) || importe <= 0) {
      return res.status(400).json({ error: "El importe debe ser un entero mayor que 0" });
    }
    if (typeof concepto !== "string" || concepto.trim() === "") {
      return res.status(400).json({ error: "El concepto es obligatorio" });
    }
    const cat = typeof categoria === "string" && categoria.trim() !== "" ? categoria.trim() : "otros";

    const resultado = await mongoose.connection.transaction(async (session): Promise<Resultado> => {
      const cuenta = await Cuenta.findById(id).session(session);
      if (!cuenta) {
        return { status: 404, body: { error: "Cuenta no encontrada" } };
      }
      if (cuenta.estado !== "activa") {
        return { status: 409, body: { error: "La cuenta esta " + cuenta.estado + ", no admite retiradas" } };
      }

      const disponible = cuenta.saldo + cuenta.descubiertoMax;
      if (importe > disponible) {
        return {
          status: 409,
          body: {
            error:
              "Saldo insuficiente: disponible " + disponible + " centimos (incluido descubierto), solicitado " + importe,
          },
        };
      }

      const retirado = await retiradoHoy(cuenta._id, session);
      if (retirado + importe > limiteDiario) {
        return {
          status: 409,
          body: { error: "Limite diario superado: hoy ya se han retirado " + retirado + " centimos (maximo " + limiteDiario + ")" },
        };
      }

      cuenta.saldo -= importe;
      await cuenta.save({ session });

      const [movimiento] = await Movimiento.create(
        [
          {
            cuentaId: cuenta._id,
            tipo: "retirada",
            importe: -importe,
            saldoResultante: cuenta.saldo,
            concepto: concepto.trim(),
            categoria: cat,
          },
        ],
        { session }
      );
      return { status: 201, body: movimiento };
    });

    return res.status(resultado.status).json(resultado.body);
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}

export async function verMovimientos(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    if (!idRegex.test(id)) {
      return res.status(400).json({ error: "El id no es valido" });
    }

    const cuenta = await Cuenta.findById(id);
    if (!cuenta) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    const { tipo, categoria, desde, hasta, orden } = req.query;
    const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
    const limite = req.query.limite === undefined ? 20 : Number(req.query.limite);

    if (!Number.isInteger(pagina) || pagina < 1) {
      return res.status(400).json({ error: "pagina no es valida" });
    }
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      return res.status(400).json({ error: "limite debe estar entre 1 y 100" });
    }

    const filtro: Record<string, any> = { cuentaId: cuenta._id };

    if (tipo !== undefined) {
      const lista = String(tipo).split(",");
      for (const t of lista) {
        if (!tiposMovimiento.includes(t)) {
          return res.status(400).json({ error: "tipo no es valido: " + t });
        }
      }
      filtro.tipo = { $in: lista };
    }

    if (categoria !== undefined) {
      filtro.categoria = String(categoria);
    }

    if (desde !== undefined || hasta !== undefined) {
      filtro.fecha = {};
      if (desde !== undefined) {
        const d = new Date(String(desde));
        if (isNaN(d.getTime())) {
          return res.status(400).json({ error: "desde no es una fecha valida" });
        }
        filtro.fecha.$gte = d;
      }
      if (hasta !== undefined) {
        const h = new Date(String(hasta));
        if (isNaN(h.getTime())) {
          return res.status(400).json({ error: "hasta no es una fecha valida" });
        }
        // se suma un dia para incluir todo el dia de hasta
        h.setUTCDate(h.getUTCDate() + 1);
        filtro.fecha.$lt = h;
      }
    }

    let sentido: 1 | -1 = -1;
    if (orden === "fecha") {
      sentido = 1;
    } else if (orden !== undefined && orden !== "-fecha") {
      return res.status(400).json({ error: "orden debe ser fecha o -fecha" });
    }

    const totalElementos = await Movimiento.countDocuments(filtro);
    const datos = await Movimiento.find(filtro)
      .sort({ fecha: sentido, _id: sentido })
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