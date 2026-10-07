const nodemailer = require("nodemailer");

// Configura la conexión con Gmail usando las credenciales del .env
const transportador = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Envía el correo de verificación de cuenta
async function enviarCorreoVerificacion(destinatario, nombre, token) {
    const enlace = `${process.env.APP_URL}/verificar?token=${token}`;

    await transportador.sendMail({
        from: `"Psiconecta" <${process.env.EMAIL_USER}>`,
        to: destinatario,
        subject: "Verifica tu cuenta en Psiconecta",
        html: `
            <p>Hola ${nombre},</p>
            <p>Gracias por registrarte en Psiconecta. Confirma tu cuenta haciendo clic en el siguiente enlace:</p>
            <p><a href="${enlace}">Verificar mi cuenta</a></p>
            <p>Si no creaste esta cuenta, puedes ignorar este correo.</p>
        `
    });
}

module.exports = { enviarCorreoVerificacion };