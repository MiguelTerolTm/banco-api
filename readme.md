## Requisitos

- Node.js 20 o superior
- MongoDB con replica set (hace falta para las transacciones de las transferencias)

## Configuracion

Copia `.env.example` a `.env` y cambia los valores si hace falta:

```
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/banco_api?replicaSet=rs0
```

## Levantar MongoDB

En `/etc/mongod.conf` tiene que estar:
replication:
  replSetName: rs0

Despues:

sudo systemctl start mongod
mongosh --eval "rs.initiate()"

(el `rs.initiate()` solo se hace la primera vez)

## Instalar y arrancar

npm install
npm run dev

Para compilar y arrancar la version final:

npm run build
npm start
