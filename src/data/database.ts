import mongoose from "mongoose";

export async function conectarBD() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("Falta MONGO_URI en el .env");
  }
  await mongoose.connect(uri);
  console.log("Mongo conectado");
}