import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { Cuenta, ibanValido } from "../models/cuenta.models.js";
import { Movimiento } from "../models/moviemiento.models.js";
import { retiradoHoy } from "./cuenta.controller.js";

const limiteDiario = 100000;

type Resultado = { status: number; body: unknown };

// 0,5% del importe, minimo 100, redondeado hacia arriba (solo con enteros)
function calcularComision(importe: number) {
  const medio = importe * 5;
  let comision = Math.floor(medio / 1000);
  if (medio % 1000 !== 0) {
    comision++;
  }
  return Math.max(comision, 100);
}

export async function transferir(req: Request, res: Response) {
  try {
    const { ibanOrigen, ibanDestino, importe, concepto, categoria } = req.body ?? {};

    if (!Number.isInteger(importe) || importe <= 0) {
      return res.status(400).json({ error: "El importe debe ser un entero mayor que 0" });
    }
    if (typeof concepto !== "string" || concepto.trim() === "") {
      return res.status(400).json({ error: "El concepto es obligatorio" });
    }
    if (!ibanValido(ibanOrigen)) {
      return res.status(400).json({ error: "El IBAN de origen no es valido" });
    }
    if (!ibanValido(ibanDestino)) {
      return res.status(400).json({ error: "El IBAN de destino no es valido" });
    }
    if (ibanOrigen === ibanDestino) {
      return res.status(400).json({ error: "Los IBAN no pueden ser iguales" });
    }
    const cat = typeof categoria === "string" && categoria.trim() !== "" ? categoria.trim() : "otros";

    const resultado = await mongoose.connection.transaction(async (session): Promise<Resultado> => {
      const origen = await Cuenta.findOne({ iban: ibanOrigen }).session(session);
      if (!origen) {
        return { status: 404, body: { error: "La cuenta de origen no existe" } };
      }
      const destino = await Cuenta.findOne({ iban: ibanDestino }).session(session);
      if (!destino) {
        return { status: 404, body: { error: "La cuenta de destino no existe" } };
      }

      if (origen.estado !== "activa") {
        return { status: 409, body: { error: "La cuenta de origen esta " + origen.estado } };
      }
      if (destino.estado === "cerrada") {
        return { status: 409, body: { error: "La cuenta de destino esta cerrada" } };
      }

      // gratis si es el mismo cliente
      let comision = 0;
      if (!origen.clienteId.equals(destino.clienteId)) {
        comision = calcularComision(importe);
      }
      const total = importe + comision;

      const disponible = origen.saldo + origen.descubiertoMax;
      if (total > disponible) {
        return {
          status: 409,
          body: {
            error:
              "Saldo insuficiente: disponible " + disponible + " centimos (incluido descubierto), solicitado " + total,
          },
        };
      }

      const retirado = await retiradoHoy(origen._id, session);
      if (retirado + importe > limiteDiario) {
        return {
          status: 409,
          body: { error: "Limite diario superado: hoy ya se han sacado " + retirado + " centimos (maximo " + limiteDiario + ")" },
        };
      }

      const transferenciaId = new Types.ObjectId();
      const fecha = new Date();

      origen.saldo -= importe;
      const saldoTrasEmitida = origen.saldo;
      origen.saldo -= comision;
      destino.saldo += importe;

      await origen.save({ session });
      await destino.save({ session });

      const movimientos: any[] = [
        {
          cuentaId: origen._id,
          tipo: "transferencia_emitida",
          importe: -importe,
          saldoResultante: saldoTrasEmitida,
          concepto: concepto.trim(),
          categoria: cat,
          transferenciaId,
          fecha,
        },
      ];
      if (comision > 0) {
        movimientos.push({
          cuentaId: origen._id,
          tipo: "comision",
          importe: -comision,
          saldoResultante: origen.saldo,
          concepto: "Comision de " + concepto.trim(),
          categoria: "comisiones",
          transferenciaId,
          fecha,
        });
      }
      movimientos.push({
        cuentaId: destino._id,
        tipo: "transferencia_recibida",
        importe,
        saldoResultante: destino.saldo,
        concepto: concepto.trim(),
        categoria: cat,
        transferenciaId,
        fecha,
      });

      await Movimiento.create(movimientos, { session, ordered: true });

      return {
        status: 201,
        body: {
          transferenciaId,
          importe,
          comision,
          saldoOrigen: origen.saldo,
          saldoDestino: destino.saldo,
          concepto: concepto.trim(),
          categoria: cat,
          fecha,
        },
      };
    });

    return res.status(resultado.status).json(resultado.body);
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}