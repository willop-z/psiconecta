async function mostrarNombreUsuario() {
    try {
        const respuesta = await fetch('/api/sesion');
        if (!respuesta.ok) return;

        const usuario = await respuesta.json();
        document.querySelectorAll('.nombre-usuario').forEach(function(elemento) {
            elemento.textContent = usuario.nombre;
        });
    } catch (error) {
        console.error('No se pudo obtener la sesión:', error);
    }
}

mostrarNombreUsuario();

const botonCerrarSesion = document.querySelector('.btn-cerrar-sesion');

if (botonCerrarSesion) {
    botonCerrarSesion.addEventListener('click', async function(evento) {
        evento.preventDefault();
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (error) {
            // si el servidor no responde, igual se sale de la página
        }
        window.location.href = 'index.html';
    });
}