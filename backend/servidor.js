// Carga las variables del archivo .env (usuario, contraseña, etc.)
require("dotenv").config();

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

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

// Calcula la edad a partir de la fecha de nacimiento (formato AAAA-MM-DD)
function calcularEdad(fechaTexto) {
    const partes = fechaTexto.split("-").map(Number);
    const anio = partes[0];
    const mes = partes[1];
    const dia = partes[2];

    const hoy = new Date();
    let edad = hoy.getFullYear() - anio;

    const yaCumplio =
        hoy.getMonth() + 1 > mes ||
        (hoy.getMonth() + 1 === mes && hoy.getDate() >= dia);

    if (!yaCumplio) {
        edad--;
    }
    return edad;
    }

// Ruta de registro de consultantes
    app.post("/api/registro/consultante", async function (req, res) {
    const { nombre, correo, contrasena, confirmarContrasena, fechaNacimiento } = req.body;

  // 1. Validar que lleguen todos los datos
    if (!nombre || !correo || !contrasena || !confirmarContrasena || !fechaNacimiento) {
        return res.status(400).json({ mensaje: "Faltan datos" });
    }

  // 2. Validar la contraseña
    if (contrasena.length < 8) {
        return res.status(400).json({ mensaje: "La contraseña debe tener mínimo 8 caracteres" });
    }
    if (contrasena !== confirmarContrasena) {
        return res.status(400).json({ mensaje: "Las contraseñas no coinciden" });
    }

  // 3. Validar la fecha y la mayoría de edad
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) {
        return res.status(400).json({ mensaje: "Fecha de nacimiento no válida" });
    }
    if (calcularEdad(fechaNacimiento) < 18) {
        return res.status(400).json({ mensaje: "El servicio es solo para mayores de 18 años" });
    }

  // 4. Proteger la contraseña con hash y generar el token de verificación
    const contrasenaHash = await bcrypt.hash(contrasena, 10);
    const tokenVerificacion = crypto.randomBytes(32).toString("hex");

  // 5. Guardar en USUARIO y CONSULTANTE (si falla una, se deshace la otra)
    const cx = await conexion.getConnection();
    try {
        await cx.beginTransaction();

    const [resultado] = await cx.execute(
        "INSERT INTO USUARIO (nombre, correo, `contraseña`, rol, token_verificacion) VALUES (?, ?, ?, 'consultante', ?)",
        [nombre, correo, contrasenaHash, tokenVerificacion]
    );

    await cx.execute(
        "INSERT INTO CONSULTANTE (usuario_id, fecha_nacimiento) VALUES (?, ?)",
        [resultado.insertId, fechaNacimiento]
    );

        await cx.commit();
        res.status(201).json({ mensaje: "Cuenta creada. Falta verificar tu correo." });
        } catch (error) {
        await cx.rollback();
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ mensaje: "Ese correo ya está registrado" });
        }
        console.log("Error en registro:", error.message);
        res.status(500).json({ mensaje: "No se pudo crear la cuenta" });
        } finally {
        cx.release();
        }
});

// Enciende el servidor
app.listen(process.env.PORT, function () {
    console.log("Servidor listo en http://localhost:" + process.env.PORT);
});