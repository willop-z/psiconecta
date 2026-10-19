// Carga las variables del archivo .env (usuario, contraseña, etc.)
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const multer = require("multer");
const open = require("open");
const { enviarCorreoVerificacion } = require("./services/correo");

const app = express();

const session = require("express-session");

// Solo se aceptan estos tipos de archivo
const TIPOS_PERMITIDOS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png"
};

// Los archivos se guardan en backend/uploads con un nombre aleatorio
const almacenamiento = multer.diskStorage({
    destination: path.join(__dirname, "uploads"),
    filename: function (req, file, cb) {
        const extension = TIPOS_PERMITIDOS[file.mimetype];
        cb(null, crypto.randomBytes(16).toString("hex") + extension);
    }
});

const subida = multer({
    storage: almacenamiento,
    limits: { fileSize: 5 * 1024 * 1024 }, // máximo 5 MB por archivo
    fileFilter: function (req, file, cb) {
        if (TIPOS_PERMITIDOS[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error("TIPO_NO_PERMITIDO"));
        }
    }
});

const camposDocumentos = subida.fields([
    { name: "docTarjeta", maxCount: 1 },
    { name: "docCarta", maxCount: 1 },
    { name: "docAval", maxCount: 1 }
]);

// Qué documentos exige cada tipo de psicólogo
const DOCUMENTOS_POR_TIPO = {
    profesional: [{ campo: "docTarjeta", tipo: "tarjeta_profesional" }],
    practicante: [
        { campo: "docCarta", tipo: "carta_universidad" },
        { campo: "docAval", tipo: "aval_universidad" }
    ]
};

// Borra del disco los archivos de un registro que falló
function borrarArchivos(archivos) {
    Object.values(archivos || {}).flat().forEach(function (archivo) {
        fs.unlink(archivo.path, function () {});
    });
}

// Permite leer los datos JSON que envía el frontend con fetch()
app.use(express.json());

// Sesiones: el servidor recuerda quién inició sesión mediante una cookie
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 2 * 60 * 60 * 1000 // 2 horas
    }
}));

// Página de inicio de cada rol (a donde se manda a quien entra a una página que no le corresponde)
const PAGINA_INICIO = {
    consultante: "/pag-consultante.html",
    psicologo: "/pag-profesional.html",
    admin: "/admin.html"
};

// Guardia: deja pasar solo a quien tenga sesión y uno de los roles permitidos
function exigirRol(...rolesPermitidos) {
    return function (req, res, next) {
        const usuario = req.session.usuario;
        const esApi = req.originalUrl.startsWith("/api/");

        if (!usuario) {
            if (esApi) return res.status(401).json({ mensaje: "Debes iniciar sesión" });
            return res.redirect("/login.html");
        }
        if (!rolesPermitidos.includes(usuario.rol)) {
            if (esApi) return res.status(403).json({ mensaje: "No tienes permiso para esto" });
            return res.redirect(PAGINA_INICIO[usuario.rol]);
        }
        next();
    };
}

// Páginas privadas y el rol que puede verlas
const PAGINAS_PRIVADAS = {
    "/admin.html": "admin",
    "/pag-consultante.html": "consultante",
    "/pag-perfil.html": "consultante",
    "/pag-profesional.html": "psicologo"
};

// Lo que cualquiera puede abrir sin iniciar sesión
const PAGINAS_PUBLICAS = ["", "/index.html", "/login.html", "/consultante.html", "/profesional.html"];
const CARPETAS_PUBLICAS = ["/css/", "/js/", "/images/"];

// Revisa cada petición antes de entregar páginas
app.use(function (req, res, next) {
    let ruta;
    try {
        ruta = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, "/"))
            .toLowerCase()
            .split(":")[0]
            .replace(/[. ]+$/, "")
            .replace(/\/+$/, "");
    } catch (error) {
        return res.status(400).send("Dirección no válida");
    }

    // Las rutas del servidor (API, verificación y documentos) tienen su propia lógica
    if (ruta.startsWith("/api/") || ruta === "/verificar" || ruta.startsWith("/uploads")) {
        return next();
    }

    // Páginas privadas: se revisa la sesión y el rol
    const rol = PAGINAS_PRIVADAS[ruta];
    if (rol) {
        res.set("Cache-Control", "no-store");
        return exigirRol(rol)(req, res, next);
    }

    // Páginas y carpetas públicas
    const esPublica = PAGINAS_PUBLICAS.includes(ruta) ||
        CARPETAS_PUBLICAS.some(function (carpeta) { return ruta.startsWith(carpeta); });
    if (esPublica) return next();

    // Todo lo demás se bloquea
    res.status(404).send("Página no encontrada");
});

// TEMPORAL: publica los documentos subidos para que el administrador pueda verlos.
// Quien tenga el enlace puede abrirlos; se reemplaza por una ruta protegida cuando existan las sesiones.
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

// -------------------------------------------------------------------------------------------------- ruta registro de consultantes
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
        // Envía el correo de verificación (no bloquea la respuesta si falla)
        try {
            await enviarCorreoVerificacion(correo, nombre, tokenVerificacion);
        } catch (errorCorreo) {
            console.log("No se pudo enviar el correo de verificación:", errorCorreo.message);
        }
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

// -------------------------------------------------------------------------------------------------- ruta registro psicólogo/practicante
app.post("/api/registro/psicologo", function (req, res) {
    camposDocumentos(req, res, async function (errorSubida) {

        // 1. Errores al recibir los archivos
        if (errorSubida) {
            if (errorSubida.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({ mensaje: "Cada archivo debe pesar máximo 5 MB" });
            }
            if (errorSubida.message === "TIPO_NO_PERMITIDO") {
                return res.status(400).json({ mensaje: "Solo se permiten archivos PDF, JPG o PNG" });
            }
            return res.status(400).json({ mensaje: "No se pudieron recibir los documentos" });
        }

        const archivos = req.files || {};
        const { nombre, correo, contrasena, confirmarContrasena, tipo } = req.body;

        // 2. Validar los datos de texto
        if (!nombre || !correo || !contrasena || !confirmarContrasena || !tipo) {
            borrarArchivos(archivos);
            return res.status(400).json({ mensaje: "Faltan datos" });
        }
        if (contrasena.length < 8) {
            borrarArchivos(archivos);
            return res.status(400).json({ mensaje: "La contraseña debe tener mínimo 8 caracteres" });
        }
        if (contrasena !== confirmarContrasena) {
            borrarArchivos(archivos);
            return res.status(400).json({ mensaje: "Las contraseñas no coinciden" });
        }
        if (!DOCUMENTOS_POR_TIPO[tipo]) {
            borrarArchivos(archivos);
            return res.status(400).json({ mensaje: "Tipo de profesional no válido" });
        }

        // 3. Validar que estén los documentos que exige ese tipo
        const requeridos = DOCUMENTOS_POR_TIPO[tipo];
        const faltan = requeridos.some(function (doc) {
            return !archivos[doc.campo];
        });
        if (faltan) {
            borrarArchivos(archivos);
            return res.status(400).json({ mensaje: "Debes cargar todos los documentos requeridos" });
        }

        // Descarta los archivos que este tipo de profesional no necesita
        const camposUsados = requeridos.map(function (doc) { return doc.campo; });
        Object.keys(archivos).forEach(function (campo) {
            if (!camposUsados.includes(campo)) {
                borrarArchivos({ [campo]: archivos[campo] });
            }
        });

        // 4. Proteger la contraseña y generar el token de verificación
        const contrasenaHash = await bcrypt.hash(contrasena, 10);
        const tokenVerificacion = crypto.randomBytes(32).toString("hex");

        // 5. Guardar en USUARIO, PSICOLOGO y DOCUMENTO (todo o nada)
        const cx = await conexion.getConnection();
        try {
            await cx.beginTransaction();

            const [usuario] = await cx.execute(
                "INSERT INTO USUARIO (nombre, correo, `contraseña`, rol, token_verificacion) VALUES (?, ?, ?, 'psicologo', ?)",
                [nombre, correo, contrasenaHash, tokenVerificacion]
            );

            const [psicologo] = await cx.execute(
                "INSERT INTO PSICOLOGO (usuario_id, tipo) VALUES (?, ?)",
                [usuario.insertId, tipo]
            );

            for (const doc of requeridos) {
                const archivo = archivos[doc.campo][0];
                await cx.execute(
                    "INSERT INTO DOCUMENTO (psicologo_id, tipo, archivo_url) VALUES (?, ?, ?)",
                    [psicologo.insertId, doc.tipo, archivo.filename]
                );
            }

            await cx.commit();

            try {
                await enviarCorreoVerificacion(correo, nombre, tokenVerificacion);
            } catch (errorCorreo) {
                console.log("No se pudo enviar el correo de verificación:", errorCorreo.message);
            }

            res.status(201).json({ mensaje: "Cuenta creada. Un administrador revisará tus documentos. Falta verificar tu correo." });
        } catch (error) {
            await cx.rollback();
            borrarArchivos(archivos);
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ mensaje: "Ese correo ya está registrado" });
            }
            console.log("Error en registro de psicólogo:", error.message);
            res.status(500).json({ mensaje: "No se pudo crear la cuenta" });
        } finally {
            cx.release();
        }
    });
});

// -------------------------------------------------------------------------------------------------- ruta verificación de cuenta (enlace del correo)
app.get("/verificar", async function (req, res) {
    const token = req.query.token;

    if (!token) {
        return res.status(400).send("Enlace de verificación no válido.");
    }

    try {
        const [resultado] = await conexion.execute(
            "UPDATE USUARIO SET verificado = TRUE, token_verificacion = NULL WHERE token_verificacion = ?",
            [token]
        );

        if (resultado.affectedRows === 0) {
            return res.status(400).send("El enlace no es válido o ya fue usado.");
        }

        res.send(`
            <h1>¡Cuenta verificada!</h1>
            <p>Ya puedes iniciar sesión.</p>
            <a href="/login.html">Ir a iniciar sesión</a>
        `);
    } catch (error) {
        console.log("Error al verificar:", error.message);
        res.status(500).send("No se pudo verificar la cuenta.");
    }
});

// -------------------------------------------------------------------------------------------------- ruta inicio de sesión
app.post("/api/login", async function (req, res) {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena) {
        return res.status(400).json({ mensaje: "Faltan datos" });
    }

    try {
        const [filas] = await conexion.execute(
            "SELECT id, nombre, `contraseña` AS hash, rol, verificado FROM USUARIO WHERE correo = ?",
            [correo]
        );

        // Mismo mensaje si el correo no existe o la contraseña falla
        if (filas.length === 0) {
            return res.status(401).json({ mensaje: "Correo o contraseña incorrectos" });
        }

        const usuario = filas[0];
        const coincide = await bcrypt.compare(contrasena, usuario.hash);
        if (!coincide) {
            return res.status(401).json({ mensaje: "Correo o contraseña incorrectos" });
        }

        if (!usuario.verificado) {
            return res.status(403).json({ mensaje: "Debes verificar tu correo antes de iniciar sesión" });
        }

        req.session.usuario = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
        res.json({ mensaje: "Inicio de sesión exitoso", nombre: usuario.nombre, rol: usuario.rol });
    } catch (error) {
        console.log("Error en login:", error.message);
        res.status(500).json({ mensaje: "No se pudo iniciar sesión" });
    }
});

// Dice quién tiene la sesión iniciada (las páginas la usan para mostrar el nombre)
app.get("/api/sesion", function (req, res) {
    if (!req.session.usuario) {
        return res.status(401).json({ mensaje: "No hay sesión iniciada" });
    }
    const { nombre, rol } = req.session.usuario;
    res.json({ nombre, rol });
});

// -------------------------------------------------------------------------------------------------- Rutas del Administrador
// PROVISIONAL: estas rutas todavía no verifican quién las llama; se protegen cuando existan las sesiones.

// 1. Obtener todos los documentos pendientes de verificación
app.get("/api/admin/documentos-pendientes", async function (req, res) {
    try {
        const query = `
            SELECT 
                d.id AS documento_id,
                u.nombre AS psicologo_nombre,
                p.tipo AS psicologo_tipo,
                d.tipo AS documento_tipo,
                d.archivo_url,
                d.estado AS documento_estado,
                p.id AS psicologo_id
            FROM DOCUMENTO d
            JOIN PSICOLOGO p ON d.psicologo_id = p.id
            JOIN USUARIO u ON p.usuario_id = u.id
            WHERE d.estado = 'pendiente' OR d.estado IS NULL
            ORDER BY d.id DESC
        `;
        const [filas] = await conexion.query(query);
        res.json(filas);
    } catch (error) {
        console.error("Error al obtener documentos pendientes:", error);
        res.status(500).json({ mensaje: "Error al obtener la lista de documentos" });
    }
});

// 2. Aprobar un documento y actualizar el estado del psicólogo
app.put("/api/admin/documentos/:id/aprobar", async function (req, res) {
    const documentoId = req.params.id;
    const cx = await conexion.getConnection();

    try {
        await cx.beginTransaction();

        // Actualizar el estado del documento a 'aprobado'
        const [doc] = await cx.execute(
            "SELECT psicologo_id FROM DOCUMENTO WHERE id = ?",
            [documentoId]
        );

        if (doc.length === 0) {
            await cx.rollback();
            return res.status(404).json({ mensaje: "Documento no encontrado" });
        }

        const psicologoId = doc[0].psicologo_id;

        await cx.execute(
            "UPDATE DOCUMENTO SET estado = 'aprobado' WHERE id = ?",
            [documentoId]
        );

        // Si todos los documentos de este psicólogo ya fueron aprobados, se aprueba al psicólogo
        const [pendientes] = await cx.execute(
            "SELECT id FROM DOCUMENTO WHERE psicologo_id = ? AND (estado = 'pendiente' OR estado IS NULL)",
            [psicologoId]
        );

        if (pendientes.length === 0) {
            await cx.execute(
                "UPDATE PSICOLOGO SET estado_verificacion = 'aprobado' WHERE id = ?",
                [psicologoId]
            );
        }

        await cx.commit();
        res.json({ mensaje: "Documento aprobado correctamente" });
    } catch (error) {
        await cx.rollback();
        console.error("Error al aprobar documento:", error);
        res.status(500).json({ mensaje: "Error al procesar la aprobación" });
    } finally {
        cx.release();
    }
});

// 3. Rechazar un documento
app.put("/api/admin/documentos/:id/rechazar", async function (req, res) {
    const documentoId = req.params.id;
    const cx = await conexion.getConnection();

    try {
        await cx.beginTransaction();

        const [doc] = await cx.execute(
            "SELECT psicologo_id FROM DOCUMENTO WHERE id = ?",
            [documentoId]
        );

        if (doc.length === 0) {
            await cx.rollback();
            return res.status(404).json({ mensaje: "Documento no encontrado" });
        }

        const psicologoId = doc[0].psicologo_id;

        // Cambiar estado del documento a 'rechazado'
        await cx.execute(
            "UPDATE DOCUMENTO SET estado = 'rechazado' WHERE id = ?",
            [documentoId]
        );

        // Cambiar estado de verificación del psicólogo a 'rechazado'
        await cx.execute(
            "UPDATE PSICOLOGO SET estado_verificacion = 'rechazado' WHERE id = ?",
            [psicologoId]
        );

        await cx.commit();
        res.json({ mensaje: "Documento rechazado" });
    } catch (error) {
        await cx.rollback();
        console.error("Error al rechazar documento:", error);
        res.status(500).json({ mensaje: "Error al procesar el rechazo" });
    } finally {
        cx.release();
    }
});

// Enciende el servidor
app.listen(process.env.PORT, function () {
    console.log("Servidor listo en http://localhost:" + process.env.PORT);
    open("http://localhost:" + process.env.PORT);
});