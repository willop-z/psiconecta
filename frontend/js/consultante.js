const formulario = document.getElementById('form-registro-consultante');
const mensaje = document.getElementById('mensaje');

formulario.addEventListener('submit', async function(evento) {
    evento.preventDefault(); // evita que la página se recargue

    // Armamos el objeto con los datos del formulario
    const datos = {
        nombre: document.getElementById('nombre').value.trim(),
        correo: document.getElementById('correo').value.trim(),
        contrasena: document.getElementById('contrasena').value,
        confirmarContrasena: document.getElementById('confirmar-contrasena').value,
        fechaNacimiento: document.getElementById('fecha-nacimiento').value
    };

    // Limpiamos el mensaje anterior y bloqueamos el botón mientras se envía
    mensaje.textContent = '';
    mensaje.className = '';
    const boton = formulario.querySelector('.btn-registrar');
    boton.disabled = true;

    try {
        // Enviamos los datos al backend
        const respuesta = await fetch('/api/registro/consultante', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const resultado = await respuesta.json();

        mensaje.textContent = resultado.mensaje;

        if (respuesta.ok) {
            mensaje.className = 'mensaje-ok';
            formulario.reset();
        } else {
            mensaje.className = 'mensaje-error';
        }
    } catch (error) {
        mensaje.textContent = 'No se pudo conectar con el servidor';
        mensaje.className = 'mensaje-error';
    } finally {
        boton.disabled = false;
    }
});