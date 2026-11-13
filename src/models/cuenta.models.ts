import { randomInt } from "node:crypto";
import { Schema, Types, model } from "mongoose";

// pasa letras a numeros (A=10 ... Z=35)
function letrasANumeros(texto: string) {
  let resultado = "";
  for (const c of texto.toUpperCase()) {
    if (c >= "0" && c <= "9") {
      resultado += c;
    } else {
      resultado += String(c.charCodeAt(0) - 55);
    }
  }
  return resultado;
}

// modulo 97 por trozos (digito a digito) porque el numero es muy grande
function modulo97(numero: string) {
  let resto = 0;
  for (const digito of numero) {
    resto = (resto * 10 + Number(digito)) % 97;
  }
  return resto;
}

export function generarIban() {
  let bban = "";
  for (let i = 0; i < 20; i++) {
    bban += String(randomInt(0, 10));
  }
  const resto = modulo97(letrasANumeros(bban + "ES00"));
  const control = String(98 - resto).padStart(2, "0");
  return "ES" + control + bban;
}

export function ibanValido(iban: unknown) {
  if (typeof iban !== "string" || !/^ES\d{22}$/.test(iban)) {
    return false;
  }
  const movido = iban.slice(4) + iban.slice(0, 4);
  return modulo97(letrasANumeros(movido)) === 1;
}

interface ICuenta {
  iban: string;
  clienteId: Types.ObjectId;
  tipo: string;
  saldo: number;
  descubiertoMax: number;
  estado: string;
  creadaEn: Date;
}

const cuentaSchema = new Schema<ICuenta>(
  {
    iban: { type: String, required: true, unique: true },
    clienteId: { type: Schema.Types.ObjectId, ref: "Cliente", required: true, index: true },
    tipo: { type: String, enum: ["corriente", "ahorro"], required: true },
    saldo: { type: Number, default: 0, validate: Number.isInteger },
    descubiertoMax: { type: Number, required: true, validate: Number.isInteger },
    estado: { type: String, enum: ["activa", "bloqueada", "cerrada"], default: "activa" },
    creadaEn: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const Cuenta = model<ICuenta>("Cuenta", cuentaSchema, "cuentas");