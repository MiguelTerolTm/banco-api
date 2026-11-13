import { Schema, model } from "mongoose";

interface ICliente {
  nombre: string;
  email: string;
  dni: string;
  creadoEn: Date;
}

const clienteSchema = new Schema<ICliente>(
  {
    nombre: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    dni: { type: String, required: true, unique: true, uppercase: true, trim: true },
    creadoEn: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const Cliente = model<ICliente>("Cliente", clienteSchema, "clientes");