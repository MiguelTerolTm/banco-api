import { Schema, Types, model } from "mongoose";

interface IMovimiento {
  cuentaId: Types.ObjectId;
  tipo: string;
  importe: number;
  saldoResultante: number;
  concepto: string;
  categoria: string;
  transferenciaId?: Types.ObjectId;
  fecha: Date;
}

const movimientoSchema = new Schema<IMovimiento>(
  {
    cuentaId: { type: Schema.Types.ObjectId, ref: "Cuenta", required: true },
    tipo: {
      type: String,
      enum: ["ingreso", "retirada", "transferencia_emitida", "transferencia_recibida", "comision"],
      required: true,
    },
    importe: { type: Number, required: true, validate: Number.isInteger },
    saldoResultante: { type: Number, required: true, validate: Number.isInteger },
    concepto: { type: String, required: true },
    categoria: { type: String, default: "otros" },
    transferenciaId: { type: Schema.Types.ObjectId },
    fecha: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

movimientoSchema.index({ cuentaId: 1, fecha: -1 });

export const Movimiento = model<IMovimiento>("Movimiento", movimientoSchema, "movimientos");