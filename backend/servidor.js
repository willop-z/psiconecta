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

// -------------------------------------------------tipos de archivo que puede subir el profesional en el registro
const TIPOS_PERMITIDOS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png"
};

// ---------------------------------------------- los archivos se guardan en backend/uploads con nombre aleatorio
const almacenamiento = multer.diskStorage({
    destination: path.join(__dirname, "uploads"),
    filename: function (req, file, cb) {
        const extension = TIPOS_PERMITIDOS[file.mimetype];
        cb(null, crypto.randomBytes(16).toString("hex") + extension);
    }
});

const subida = multer({
    storage: almacenamiento,
    limits: { fileSize: 5 * 1024 * 1024 }, // ---------------máximo 5MB por archivo
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

// ------------------------------------------ los documentos que se piden según el profesional
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

//------------------------------------- página de inicio de cada rol, igual si intenta entrar a una página que no le corresponde
const PAGINA_INICIO = {
    consultante: "/pag-consultante.html",
    psicologo: "/pag-profesional.html",
    admin: "/admin.html"
};

// --------------------------------------------- permite pasar solo a quien tenga sesión y uno de los roles permitidos
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

//---------------------------------------------------páginas privadas y el rol que puede verlas
const PAGINAS_PRIVADAS = {
    "/admin.html": "admin",
    "/pag-consultante.html": "consultante",
    "/pag-perfil.html": "consultante",
    "/pag-profesional.html": "psicologo"
};

//------------------------------------------------ páginas abiertas que puede acceder cualquier persona sin sesión
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

//--------------------------------------- para calcular la edad con la fecha de nacimiento (formato AAAA-MM-DD)
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

  // 1. valida que se llenen todos los espacios
    if (!nombre || !correo || !contrasena || !confirmarContrasena || !fechaNacimiento) {
        return res.status(400).json({ mensaje: "Faltan datos" });
    }

  // 2. valida que ambas contraseñas coicidan y sean < 8 caracteres
    if (contrasena.length < 8) {
        return res.status(400).json({ mensaje: "La contraseña debe tener mínimo 8 caracteres" });
    }
    if (contrasena !== confirmarContrasena) {
        return res.status(400).json({ mensaje: "Las contraseñas no coinciden" });
    }

  // 3. valida fecha de nacimiento y que sea >= 18años
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) {
        return res.status(400).json({ mensaje: "Fecha de nacimiento no válida" });
    }
    if (calcularEdad(fechaNacimiento) < 18) {
        return res.status(400).json({ mensaje: "El servicio es solo para mayores de 18 años" });
    }

  // 4. proteger la contraseña con hash y generar el token de verificación
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
        res.status(201).json({ mensaje: "Cuenta creada. Falta verificar tu correo (recuerda verificar la carpeta de spam)." });
        } catch (error) {
        await cx.rollback();
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ mensaje: "El correo ingresado ya se encuentra registrado" });
        }
        console.log("Error en registro:", error.message);
        res.status(500).json({ mensaje: "No se pudo crear la cuenta" });
        } finally {
        cx.release();
        }
});

// ------------------------------------------------------------------------------------- ruta registro psicólogo/practicante
app.post("/api/registro/psicologo", function (req, res) {
    camposDocumentos(req, res, async function (errorSubida) {

        // 1. posibles errores al momento de subir los archivos
        if (errorSubida) {
            if (errorSubida.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({ mensaje: "Cada archivo debe pesar máximo 5 MB" });
            }
            if (errorSubida.message === "TIPO_NO_PERMITIDO") {
                return res.status(400).json({ mensaje: "Solo se permiten archivos en formato .PDF, .JPG o .PNG" });
            }
            return res.status(400).json({ mensaje: "No se pudieron recibir los documentos" });
        }

        const archivos = req.files || {};
        const { nombre, correo, contrasena, confirmarContrasena, tipo } = req.body;

        // 2. valida los campos de texto
        if (!nombre || !correo || !contrasena || !confirmarContrasena || !tipo) {
            borrarArchivos(archivos);
            return res.status(400).json({ mensaje: "Faltan campos por diligenciar" });
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

        // 3. valida que se suban los archivos según el tipo profesional
        const requeridos = DOCUMENTOS_POR_TIPO[tipo];
        const faltan = requeridos.some(function (doc) {
            return !archivos[doc.campo];
        });
        if (faltan) {
            borrarArchivos(archivos);
            return res.status(400).json({ mensaje: "Debes cargar todos los documentos requeridos" });
        }

        // descarta los archivos que este tipo de profesional no necesita
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

            res.status(201).json({ mensaje: "La cuenta ha sido creada con éxito, falta verificar tu correo (recuerda verificar la carpeta de spam). Un administrador revisará tus documentos para aprobarlos." });
        } catch (error) {
            await cx.rollback();
            borrarArchivos(archivos);
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ mensaje: "El correo ingresado ya se encuentra registrado" });
            }
            console.log("Error en registro de psicólogo:", error.message);
            res.status(500).json({ mensaje: "No se pudo crear la cuenta" });
        } finally {
            cx.release();
        }
    });
});

// --------------------------------------------------------------------- ruta verificación de cuenta (enlace del correo)
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
            return res.status(400).send("El enlace no es válido o ya fue usado");
        }

        res.send(`
            <h1>¡Cuenta verificada!</h1>
            <p>Ya puedes iniciar sesión con el correo y contraseña registrados.</p>
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
        return res.status(400).json({ mensaje: "Faltan campos por diligenciar" });
    }

    try {
        const [filas] = await conexion.execute(
            "SELECT id, nombre, `contraseña` AS hash, rol, verificado FROM USUARIO WHERE correo = ?",
            [correo]
        );

        // Mismo mensaje si el correo no existe o la contraseña falla
        if (filas.length === 0) {
            return res.status(401).json({ mensaje: "El correo o la contraseña ingresados no coinciden con los registrados" });
        }

        const usuario = filas[0];
        const coincide = await bcrypt.compare(contrasena, usuario.hash);
        if (!coincide) {
            return res.status(401).json({ mensaje: "El correo o la contraseña ingresados no coinciden con los registrados" });
        }

        if (!usuario.verificado) {
            return res.status(403).json({ mensaje: "Debes verificar tu correo para poder iniciar sesión" });
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

// --------------------------------------------------------------------------datos del profesional que tiene sesión iniciada
app.get("/api/profesional/perfil", exigirRol("psicologo"), async function (req, res) {
    try {
        const [filas] = await conexion.execute(
            `SELECT u.nombre, p.tipo, p.estado_verificacion,
                    p.anios_experiencia, p.especialidad, p.biografia
                FROM PSICOLOGO p
                JOIN USUARIO u ON u.id = p.usuario_id
                WHERE u.id = ?`,
            [req.session.usuario.id]
        );

        if (filas.length === 0) {
            return res.status(404).json({ mensaje: "Perfil no encontrado" });
        }
        const [areas] = await conexion.execute(
            "SELECT area_interes_id FROM PSICOLOGO_AREA_INTERES WHERE psicologo_id = (SELECT id FROM PSICOLOGO WHERE usuario_id = ?)",
            [req.session.usuario.id]
        );
        res.json({
            ...filas[0],
            areas: areas.map(function (fila) { return fila.area_interes_id; })
        });
    } catch (error) {
        console.log("Error al leer el perfil:", error.message);
        res.status(500).json({ mensaje: "No se pudo cargar el perfil" });
    }
});

// -------------------------------------------------guarda el perfil del psicólogo que tiene sesión iniciada y las áreas de interes

app.put("/api/profesional/perfil", exigirRol("psicologo"), async function (req, res) {
    const texto = function (valor) {
        return typeof valor === "string" ? valor.trim() : "";
    };

    const especialidad = texto(req.body.especialidad);
    const biografia = texto(req.body.biografia);
    const aniosRecibidos = req.body.aniosExperiencia;

    // Años de experiencia: opcional, pero si viene debe ser un entero razonable
    let anios = null;
    if (aniosRecibidos !== "" && aniosRecibidos !== null && aniosRecibidos !== undefined) {
        anios = Number(aniosRecibidos);
        if (!Number.isInteger(anios) || anios < 0 || anios > 60) {
            return res.status(400).json({ mensaje: "Los años de experiencia deben ser un número entero entre 0 y 60" });
        }
    }
    if (especialidad.length > 150) {
        return res.status(400).json({ mensaje: "La especialidad puede tener máximo 150 caracteres" });
    }
    if (biografia.length > 1000) {
        return res.status(400).json({ mensaje: "La biografía puede tener máximo 1000 caracteres" });
    }

    // Áreas de interés: una lista de ids, sin repetidos
    if (!Array.isArray(req.body.areas)) {
        return res.status(400).json({ mensaje: "Áreas de interés no válidas" });
    }
    const areas = [...new Set(req.body.areas.map(Number))];
    if (!areas.every(function (id) { return Number.isInteger(id) && id > 0; })) {
        return res.status(400).json({ mensaje: "Áreas de interés no válidas" });
    }

    const cx = await conexion.getConnection();
    try {
        const [filas] = await cx.execute(
            "SELECT id, estado_verificacion FROM PSICOLOGO WHERE usuario_id = ?",
            [req.session.usuario.id]
        );
        if (filas.length === 0) {
            return res.status(404).json({ mensaje: "Perfil no encontrado" });
        }
        if (filas[0].estado_verificacion !== "aprobado") {
            return res.status(403).json({ mensaje: "Tu cuenta debe estar aprobada para editar el perfil" });
        }
        const psicologoId = filas[0].id;

        await cx.beginTransaction();

        await cx.execute(
            "UPDATE PSICOLOGO SET anios_experiencia = ?, especialidad = ?, biografia = ? WHERE id = ?",
            [anios, especialidad || null, biografia || null, psicologoId]
        );

        // -------------------------------------------para actualizar las áreas que seleccione el profesional
        await cx.execute("DELETE FROM PSICOLOGO_AREA_INTERES WHERE psicologo_id = ?", [psicologoId]);
        for (const areaId of areas) {
            await cx.execute(
                "INSERT INTO PSICOLOGO_AREA_INTERES (psicologo_id, area_interes_id) VALUES (?, ?)",
                [psicologoId, areaId]
            );
        }

        await cx.commit();
        res.json({ mensaje: "Perfil guardado" });
    } catch (error) {
        await cx.rollback();
        if (error.code === "ER_NO_REFERENCED_ROW_2") {
            return res.status(400).json({ mensaje: "Alguna de las áreas de interés no existe" });
        }
        console.log("Error al guardar el perfil:", error.message);
        res.status(500).json({ mensaje: "No se pudo guardar el perfil" });
    } finally {
        cx.release();
    }
});

// -------------------------------------------------------------- Disponibilidad del psicólogo (CRUD)
const DIAS_VALIDOS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const DURACION_MINIMA = 70; //----------------cada cita reserva un bloque de 1 h 10 min

// ------------------------------------------------------- READ: citas del psicólogo desde hoy en adelante
app.get("/api/profesional/citas", exigirRol("psicologo"), async function (req, res) {
    try {
        const psicologoId = await obtenerPsicologoAprobado(req.session.usuario.id);
        if (!psicologoId) {
            return res.status(403).json({ mensaje: "Tu cuenta debe estar aprobada" });
        }

        const [filas] = await conexion.execute(
            `SELECT c.id, u.nombre AS consultante,
                    DATE_FORMAT(c.fecha_hora, '%d/%m/%Y') AS fecha,
                    DATE_FORMAT(c.fecha_hora, '%H:%i') AS hora,
                    c.estado
                FROM CITA c
                JOIN CONSULTANTE co ON co.id = c.consultante_id
                JOIN USUARIO u ON u.id = co.usuario_id
                WHERE c.psicologo_id = ? AND c.fecha_hora >= CURDATE()
                ORDER BY c.fecha_hora`,
            [psicologoId]
        );
        res.json(filas);
    } catch (error) {
        console.log("Error al leer las citas:", error.message);
        res.status(500).json({ mensaje: "No se pudieron cargar las citas" });
    }
});

// ---------------------------------------------------------------Búsqueda de psicólogos para el consultante (solo aprobados, con filtros opcionales)
app.get("/api/psicologos", exigirRol("consultante"), async function (req, res) {
    const tipo = req.query.tipo || "";
    const area = req.query.area ? Number(req.query.area) : null;

    if (tipo && !["profesional", "practicante"].includes(tipo)) {
        return res.status(400).json({ mensaje: "Tipo de profesional no válido" });
    }
    if (req.query.area && (!Number.isInteger(area) || area <= 0)) {
        return res.status(400).json({ mensaje: "Área de interés no válida" });
    }

    // Las condiciones se van armando según los filtros que lleguen
    const condiciones = ["p.estado_verificacion = 'aprobado'", "u.verificado = TRUE"];
    const parametros = [];

    if (tipo) {
        condiciones.push("p.tipo = ?");
        parametros.push(tipo);
    }
    if (area) {
        condiciones.push("EXISTS (SELECT 1 FROM PSICOLOGO_AREA_INTERES f WHERE f.psicologo_id = p.id AND f.area_interes_id = ?)");
        parametros.push(area);
    }

    try {
        const [filas] = await conexion.execute(
            `SELECT p.id, u.nombre, p.tipo,
                    GROUP_CONCAT(a.nombre ORDER BY a.nombre SEPARATOR '||') AS areas
                FROM PSICOLOGO p
                JOIN USUARIO u ON u.id = p.usuario_id
                LEFT JOIN PSICOLOGO_AREA_INTERES pa ON pa.psicologo_id = p.id
                LEFT JOIN AREA_INTERES a ON a.id = pa.area_interes_id
                WHERE ${condiciones.join(" AND ")}
                GROUP BY p.id, u.nombre, p.tipo
                ORDER BY u.nombre`,
            parametros
        );

        res.json(filas.map(function (fila) {
            return {
                id: fila.id,
                nombre: fila.nombre,
                tipo: fila.tipo,
                areas: fila.areas ? fila.areas.split("||") : []
            };
        }));
    } catch (error) {
        console.log("Error en la búsqueda de psicólogos:", error.message);
        res.status(500).json({ mensaje: "No se pudo realizar la búsqueda" });
    }
});

// --------------------------------------------------------------- Perfil de un psicólogo aprobado, para que lo vea el consultante
app.get("/api/psicologos/:id", exigirRol("consultante"), async function (req, res) {
    const id = leerId(req.params.id);
    if (!id) {
        return res.status(400).json({ mensaje: "Perfil no válido" });
    }

    try {
        const [filas] = await conexion.execute(
            `SELECT p.id, u.nombre, p.tipo,
                    p.anios_experiencia AS aniosExperiencia, p.especialidad, p.biografia
                FROM PSICOLOGO p
                JOIN USUARIO u ON u.id = p.usuario_id
                WHERE p.id = ? AND p.estado_verificacion = 'aprobado' AND u.verificado = TRUE`,
            [id]
        );
        if (filas.length === 0) {
            return res.status(404).json({ mensaje: "No encontramos este perfil" });
        }

        const [areas] = await conexion.execute(
            `SELECT a.nombre
                FROM PSICOLOGO_AREA_INTERES pa
                JOIN AREA_INTERES a ON a.id = pa.area_interes_id
                WHERE pa.psicologo_id = ?
                ORDER BY a.nombre`,
            [id]
        );

        const [horarios] = await conexion.execute(
            `SELECT dia,
                    TIME_FORMAT(hora_inicio, '%H:%i') AS horaInicio,
                    TIME_FORMAT(hora_fin, '%H:%i') AS horaFin
                FROM DISPONIBILIDAD
                WHERE psicologo_id = ?
                ORDER BY FIELD(dia, 'lunes','martes','miercoles','jueves','viernes','sabado','domingo'), hora_inicio`,
            [id]
        );

        res.json({
            ...filas[0],
            areas: areas.map(function (fila) { return fila.nombre; }),
            horarios: horarios
        });
    } catch (error) {
        console.log("Error al leer el perfil del psicólogo:", error.message);
        res.status(500).json({ mensaje: "No se pudo cargar el perfil" });
    }
});

// --------------------------------------------------------------------------------- AGENDAMIENTO DE CITAS
const DURACION_CITA = 70;      // minutos que reserva cada cita
const DIAS_ANTICIPACION = 30;  // hasta cuántos días adelante se puede agendar
const NOMBRES_DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

// Convierte "AAAA-MM-DD" en una fecha a las 00:00 (hora local); devuelve null si no es una fecha real
function leerFecha(texto) {
    if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
    const [anio, mes, dia] = texto.split("-").map(Number);
    const fecha = new Date(anio, mes - 1, dia);
    // JavaScript "corrige" fechas inventadas como 2026-02-31 en vez de fallar, así que se comprueba
    if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return null;
    return fecha;
}

// Convierte minutos desde medianoche en "HH:MM" (510 pasa a "08:30")
function aHora(minutos) {
    const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
    const mm = String(minutos % 60).padStart(2, "0");
    return hh + ":" + mm;
}

// Calcula los horarios libres de un psicólogo en una fecha; devuelve una lista de "HH:MM"
async function calcularHorariosLibres(cx, psicologoId, fechaTexto, fecha) {
    const dia = NOMBRES_DIAS_SEMANA[fecha.getDay()];

    // 1. Las ventanas que el psicólogo definió para ese día de la semana
    const [ventanas] = await cx.execute(
        `SELECT TIME_FORMAT(hora_inicio, '%H:%i') AS horaInicio,
                TIME_FORMAT(hora_fin, '%H:%i') AS horaFin
            FROM DISPONIBILIDAD
            WHERE psicologo_id = ? AND dia = ?
            ORDER BY hora_inicio`,
        [psicologoId, dia]
    );
    if (ventanas.length === 0) return [];

    // 2. Las citas que ya ocupan tiempo ese día (las canceladas liberan el horario)
    const [ocupadas] = await cx.execute(
        `SELECT TIME_FORMAT(fecha_hora, '%H:%i') AS hora, duracion_minutos AS duracion
            FROM CITA
            WHERE psicologo_id = ? AND DATE(fecha_hora) = ? AND estado <> 'cancelada'`,
        [psicologoId, fechaTexto]
    );
    const bloqueos = ocupadas.map(function (cita) {
        return { inicio: aMinutos(cita.hora), fin: aMinutos(cita.hora) + cita.duracion };
    });

    // 3. Si la fecha es hoy, no se ofrecen horas que ya pasaron
    const ahora = new Date();
    const esHoy = fecha.toDateString() === ahora.toDateString();
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

    // 4. Cada ventana se parte en bloques de 70 minutos, y se descartan los que chocan con una cita
    const libres = [];
    for (const ventana of ventanas) {
        const finVentana = aMinutos(ventana.horaFin);
        for (let inicio = aMinutos(ventana.horaInicio); inicio + DURACION_CITA <= finVentana; inicio += DURACION_CITA) {
            const fin = inicio + DURACION_CITA;
            if (esHoy && inicio <= minutosAhora) continue;

            const chocaConUnaCita = bloqueos.some(function (bloqueo) {
                return inicio < bloqueo.fin && fin > bloqueo.inicio;
            });
            if (!chocaConUnaCita) libres.push(aHora(inicio));
        }
    }
    return libres;
}

// Horarios libres de un psicólogo en una fecha (?fecha=AAAA-MM-DD)
app.get("/api/psicologos/:id/horarios", exigirRol("consultante"), async function (req, res) {
    const id = leerId(req.params.id);
    const fecha = leerFecha(req.query.fecha);
    if (!id || !fecha) {
        return res.status(400).json({ mensaje: "Datos no válidos" });
    }

    // Solo se puede agendar desde hoy hasta DIAS_ANTICIPACION días adelante
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + DIAS_ANTICIPACION);
    if (fecha < hoy || fecha > limite) {
        return res.status(400).json({ mensaje: "Elige una fecha entre hoy y los próximos " + DIAS_ANTICIPACION + " días" });
    }

    try {
        // El psicólogo debe estar aprobado y con el correo verificado
        const [psicologos] = await conexion.execute(
            `SELECT p.id FROM PSICOLOGO p
                JOIN USUARIO u ON u.id = p.usuario_id
                WHERE p.id = ? AND p.estado_verificacion = 'aprobado' AND u.verificado = TRUE`,
            [id]
        );
        if (psicologos.length === 0) {
            return res.status(404).json({ mensaje: "No encontramos este perfil" });
        }

        const horarios = await calcularHorariosLibres(conexion, id, req.query.fecha, fecha);
        res.json(horarios);
    } catch (error) {
        console.log("Error al calcular los horarios:", error.message);
        res.status(500).json({ mensaje: "No se pudieron cargar los horarios" });
    }
});

// Convierte "08:30" en minutos desde medianoche (510)
function aMinutos(hora) {
    const partes = hora.split(":").map(Number);
    return partes[0] * 60 + partes[1];
}

// Devuelve el id de PSICOLOGO si la cuenta existe y está aprobada; si no, null
async function obtenerPsicologoAprobado(usuarioId) {
    const [filas] = await conexion.execute(
        "SELECT id FROM PSICOLOGO WHERE usuario_id = ? AND estado_verificacion = 'aprobado'",
        [usuarioId]
    );
    return filas.length > 0 ? filas[0].id : null;
}

// Revisa que la ventana sea válida; devuelve el mensaje de error, o null si está bien
function validarVentana(dia, horaInicio, horaFin) {
    if (!DIAS_VALIDOS.includes(dia)) return "Día no válido";

    const formato = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (typeof horaInicio !== "string" || typeof horaFin !== "string" ||
        !formato.test(horaInicio) || !formato.test(horaFin)) {
        return "Las horas no son válidas";
    }

    const duracion = aMinutos(horaFin) - aMinutos(horaInicio);
    if (duracion <= 0) return "La hora de fin debe ser posterior a la de inicio";
    if (duracion < DURACION_MINIMA) return "La ventana debe durar al menos 70 minutos";
    return null;
}

// READ: lista las ventanas del psicólogo que tiene la sesión iniciada
app.get("/api/profesional/disponibilidad", exigirRol("psicologo"), async function (req, res) {
    try {
        const psicologoId = await obtenerPsicologoAprobado(req.session.usuario.id);
        if (!psicologoId) {
            return res.status(403).json({ mensaje: "Tu cuenta debe estar aprobada" });
        }

        const [filas] = await conexion.execute(
            `SELECT id, dia,
                    TIME_FORMAT(hora_inicio, '%H:%i') AS horaInicio,
                    TIME_FORMAT(hora_fin, '%H:%i') AS horaFin
                FROM DISPONIBILIDAD
                WHERE psicologo_id = ?
                ORDER BY FIELD(dia, 'lunes','martes','miercoles','jueves','viernes','sabado','domingo'), hora_inicio`,
            [psicologoId]
        );
        res.json(filas);
    } catch (error) {
        console.log("Error al leer la disponibilidad:", error.message);
        res.status(500).json({ mensaje: "No se pudo cargar la disponibilidad" });
    }
});

// CREATE: agrega una ventana de horario
app.post("/api/profesional/disponibilidad", exigirRol("psicologo"), async function (req, res) {
    const { dia, horaInicio, horaFin } = req.body;

    const errorValidacion = validarVentana(dia, horaInicio, horaFin);
    if (errorValidacion) {
        return res.status(400).json({ mensaje: errorValidacion });
    }

    try {
        const psicologoId = await obtenerPsicologoAprobado(req.session.usuario.id);
        if (!psicologoId) {
            return res.status(403).json({ mensaje: "Tu cuenta debe estar aprobada" });
        }

        //------------------------------------------------------para que no se cree una disponibilidad con un horario ya seleccionado
        const [cruces] = await conexion.execute(
            "SELECT id FROM DISPONIBILIDAD WHERE psicologo_id = ? AND dia = ? AND hora_inicio < ? AND hora_fin > ?",
            [psicologoId, dia, horaFin + ":00", horaInicio + ":00"]
        );
        if (cruces.length > 0) {
            return res.status(409).json({ mensaje: "El horario seleccionado se cruza con alguna hora ya asignada" });
        }

        const [resultado] = await conexion.execute(
            "INSERT INTO DISPONIBILIDAD (psicologo_id, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)",
            [psicologoId, dia, horaInicio + ":00", horaFin + ":00"]
        );
        res.status(201).json({ mensaje: "Ventana agregada", id: resultado.insertId });
    } catch (error) {
        console.log("Error al agregar la ventana:", error.message);
        res.status(500).json({ mensaje: "No se pudo agregar la ventana" });
    }
});

// Convierte el :id de la URL en un entero válido (o null)
function leerId(valor) {
    const id = Number(valor);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// UPDATE: modifica una ventana existente
app.put("/api/profesional/disponibilidad/:id", exigirRol("psicologo"), async function (req, res) {
    const id = leerId(req.params.id);
    if (!id) {
        return res.status(400).json({ mensaje: "Ventana no válida" });
    }

    const { dia, horaInicio, horaFin } = req.body;
    const errorValidacion = validarVentana(dia, horaInicio, horaFin);
    if (errorValidacion) {
        return res.status(400).json({ mensaje: errorValidacion });
    }

    try {
        const psicologoId = await obtenerPsicologoAprobado(req.session.usuario.id);
        if (!psicologoId) {
            return res.status(403).json({ mensaje: "Tu cuenta debe estar aprobada" });
        }

        // La ventana debe existir y ser de este psicólogo
        const [propias] = await conexion.execute(
            "SELECT id FROM DISPONIBILIDAD WHERE id = ? AND psicologo_id = ?",
            [id, psicologoId]
        );
        if (propias.length === 0) {
            return res.status(404).json({ mensaje: "No se encontró esa ventana" });
        }

        // No puede cruzarse con otra ventana del mismo día (sin contarse a sí misma)
        const [cruces] = await conexion.execute(
            "SELECT id FROM DISPONIBILIDAD WHERE psicologo_id = ? AND dia = ? AND id <> ? AND hora_inicio < ? AND hora_fin > ?",
            [psicologoId, dia, id, horaFin + ":00", horaInicio + ":00"]
        );
        if (cruces.length > 0) {
            return res.status(409).json({ mensaje: "Esta ventana se cruza con otra que ya tienes ese día" });
        }

        await conexion.execute(
            "UPDATE DISPONIBILIDAD SET dia = ?, hora_inicio = ?, hora_fin = ? WHERE id = ? AND psicologo_id = ?",
            [dia, horaInicio + ":00", horaFin + ":00", id, psicologoId]
        );
        res.json({ mensaje: "Ventana actualizada" });
    } catch (error) {
        console.log("Error al actualizar la ventana:", error.message);
        res.status(500).json({ mensaje: "No se pudo actualizar la ventana" });
    }
});

// DELETE: elimina una ventana
app.delete("/api/profesional/disponibilidad/:id", exigirRol("psicologo"), async function (req, res) {
    const id = leerId(req.params.id);
    if (!id) {
        return res.status(400).json({ mensaje: "Ventana no válida" });
    }

    try {
        const psicologoId = await obtenerPsicologoAprobado(req.session.usuario.id);
        if (!psicologoId) {
            return res.status(403).json({ mensaje: "Tu cuenta debe estar aprobada" });
        }

        const [resultado] = await conexion.execute(
            "DELETE FROM DISPONIBILIDAD WHERE id = ? AND psicologo_id = ?",
            [id, psicologoId]
        );
        if (resultado.affectedRows === 0) {
            return res.status(404).json({ mensaje: "No se encontró esa ventana" });
        }
        res.json({ mensaje: "Ventana eliminada" });
    } catch (error) {
        console.log("Error al eliminar la ventana:", error.message);
        res.status(500).json({ mensaje: "No se pudo eliminar la ventana" });
    }
});

// -------------------------------------------------------------------------------------------------- Rutas del Administrador
// PROVISIONAL: estas rutas todavía no verifican quién las llama; se protegen cuando existan las sesiones.

// 1. trae los documentos pendientes de revisión subidos por el prfesional
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

// 2. aprobar los documentos y aprobar al profesional
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

// 3. rechazar los docuementos y rechazar al profesional
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