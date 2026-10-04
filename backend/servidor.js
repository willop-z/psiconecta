// Carga las variables del archivo .env (usuario, contraseña, etc.)
require("dotenv").config();

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();

// Permite leer los datos JSON que envía el frontend con fetch()
app.use(express.json());

// Entrega las páginas de la carpeta frontend (una carpeta arriba de backend)
app.use(express.static(path.join(__dirname, "../frontend")));

// Conexión a MySQL: los datos vienen del .env, no están escritos aquí
const conexion = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

// Prueba de conexión al arrancar el servidor
conexion.query("SELECT 1")
    .then(function () {
    console.log("Conexión exitosa a la base de datos psiconecta");
    })
    .catch(function (error) {
    console.log("Error de conexión:", error.message);
    });

// Ruta de prueba: devuelve las áreas de interés guardadas en la base de datos
app.get("/api/areas", async function (req, res) {
    try {
    const [filas] = await conexion.query(
        "SELECT id, nombre FROM AREA_INTERES ORDER BY nombre"
    );
    res.json(filas);
    } catch (error) {
    res.status(500).json({ mensaje: "Error: " + error.message });
    }
});

// Enciende el servidor
app.listen(process.env.PORT, function () {
    console.log("Servidor listo en http://localhost:" + process.env.PORT);
});