import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import { conectarBD } from "./data/database.js";
import { Cliente } from "./models/clientes.models.js";
import { Cuenta } from "./models/cuenta.models.js";
import { Movimiento } from "./models/moviemiento.models.js";
import clienteRouter from "./routes/cliente.router.js";
import cuentaRouter from "./routes/cuenta.router.js";
import transferenciaRouter from "./routes/transferencia.router.js";

const app = express();
app.use(express.json());

app.use("/clientes", clienteRouter);
app.use("/cuentas", cuentaRouter);
app.use("/transferencias", transferenciaRouter);

// errores generales (por ejemplo un json mal escrito)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El JSON no es valido" });
  }
  console.log("Error:", err);
  return res.status(500).json({ error: "Error inesperado" });
});

const puerto = Number(process.env.PORT) || 3000;

async function main() {
  await conectarBD();
  // espera a que se creen los indices unicos
  await Cliente.init();
  await Cuenta.init();
  await Movimiento.init();
  app.listen(puerto, () => {
    console.log("Servidor en puerto", puerto);
  });
}

main().catch((error) => {
  console.log("Error al arrancar:", error);
  process.exit(1);
});